import type { Cortex } from "./cortex.js";
import { CommitInfo, FileChange, Git } from "../git/git.js";

export interface StaleChange {
  file: string;
  status: FileChange["status"];
  renamed_to?: string;
  lines?: string; // the linked range that was touched
  commits: number;
  last?: CommitInfo;
}

export interface StaleInfo {
  path: string;
  verified_at_commit: string;
  reason: "changed" | "unknown_commit";
  changes: StaleChange[];
}

const THROTTLE_MS = 3000;

// "Is this knowledge still true?" Derived from git, never written into node files (that would churn history).
// A node is stale when code it links to changed after the commit it was verified at; with a line range,
// only changes touching those lines count.
export class StalenessService {
  readonly git: Git;
  private head: string | null | undefined;
  private checkedAt = 0;
  private dirty = true;
  private stale = new Map<string, StaleInfo>();

  constructor(private c: Cortex) {
    this.git = new Git(c.project.root);
    c.events.on("change", (e: { type: string; entry?: { action: string } }) => {
      if (e.type === "reindex" || e.entry?.action.startsWith("node.") || e.entry?.action.startsWith("draft.")) this.dirty = true;
    });
  }

  enabled(): boolean {
    return this.git.available();
  }

  currentHead(): string | null {
    return this.git.head();
  }

  get(path: string): StaleInfo | undefined {
    this.refresh();
    return this.stale.get(path);
  }

  list(): StaleInfo[] {
    this.refresh();
    return [...this.stale.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  refresh(force = false): void {
    if (!this.git.available()) return;
    const now = Date.now();
    if (!force && !this.dirty && now - this.checkedAt < THROTTLE_MS) return;
    this.checkedAt = now;
    const head = this.git.head();
    if (!force && !this.dirty && head === this.head) return;
    this.head = head;
    this.dirty = false;
    this.stale = head ? this.compute(head) : new Map();
  }

  private compute(head: string): Map<string, StaleInfo> {
    const byPath = new Map<string, { file: string; lines: string | null }[]>();
    for (const l of this.c.index.nodeCodeLinks()) {
      const list = byPath.get(l.path) ?? [];
      list.push({ file: l.file, lines: l.lines });
      byPath.set(l.path, list);
    }

    // Group nodes by the commit they were verified at: one `git diff` per distinct commit.
    const byCommit = new Map<string, string[]>();
    const out = new Map<string, StaleInfo>();
    for (const path of byPath.keys()) {
      const verified = this.c.tree.read(path)?.verified_at_commit;
      if (!verified || head.startsWith(verified)) continue;
      if (!this.git.commitExists(verified)) {
        out.set(path, { path, verified_at_commit: verified, reason: "unknown_commit", changes: [] });
        continue;
      }
      byCommit.set(verified, [...(byCommit.get(verified) ?? []), path]);
    }

    for (const [commit, paths] of byCommit) {
      const files = [...new Set(paths.flatMap((p) => byPath.get(p)!.map((l) => l.file)))];
      const changed = this.git.changedFiles(commit, files) ?? [];
      if (!changed.length) continue;
      const ranges = new Map<string, [number, number][] | null>();
      const commits = new Map<string, CommitInfo[]>();

      for (const path of paths) {
        const changes: StaleChange[] = [];
        for (const link of byPath.get(path)!) {
          for (const ch of changed.filter((c) => c.file === link.file || c.file.startsWith(`${link.file}/`))) {
            const range = link.lines && ch.status === "modified" && ch.file === link.file ? parseLines(link.lines) : null;
            if (range) {
              if (!ranges.has(ch.file)) ranges.set(ch.file, this.git.touchedRanges(commit, ch.file));
              const touched = ranges.get(ch.file);
              if (touched && !touched.some(([a, b]) => a <= range[1] && b >= range[0])) continue; // changed elsewhere in the file
            }
            if (!commits.has(ch.file)) commits.set(ch.file, this.git.commitsSince(commit, ch.file));
            const list = commits.get(ch.file)!;
            changes.push({
              file: ch.file,
              status: ch.status,
              ...(ch.renamed_to ? { renamed_to: ch.renamed_to } : {}),
              ...(range ? { lines: link.lines! } : {}),
              commits: list.length,
              ...(list[0] ? { last: list[0] } : {}),
            });
          }
        }
        if (changes.length) out.set(path, { path, verified_at_commit: commit, reason: "changed", changes });
      }
    }
    return out;
  }
}

function parseLines(lines: string): [number, number] | null {
  const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(lines);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

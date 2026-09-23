import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Cortex } from "./cortex.js";
import type { CommitInfo, FileChange } from "../git/git.js";
import { Git } from "../git/git.js";

// high: the knowledge is probably wrong now (linked lines rewritten, file deleted or moved).
// medium: the file it describes changed somewhere; worth a look.
// low: only formatting changed (whitespace, re-wrapping, what the project's Prettier would rewrite); nothing
// the knowledge could describe.
export type Severity = "high" | "medium" | "low";
const RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

export interface StaleChange {
  file: string;
  status: FileChange["status"];
  severity: Severity;
  renamed_to?: string;
  lines?: string; // the linked range that was touched
  formatting_only?: boolean;
  commits: number;
  last?: CommitInfo;
}

export interface StaleInfo {
  path: string;
  verified_at_commit: string;
  reason: "changed" | "unknown_commit";
  severity: Severity;
  changes: StaleChange[];
  // Set while someone has put this off. A new commit to any of the changed files lifts it on its own.
  snoozed?: { at: string; by: string };
}

export interface CodeLink {
  file: string;
  lines?: string | null;
}

interface Snooze {
  at: string;
  by: string;
  fingerprint: string;
}

const THROTTLE_MS = 3000;

// What counts: brief, inbox and menu counters show only this; low and snoozed are informational.
export const actionable = (s: StaleInfo) => !s.snoozed && s.severity !== "low";

// "Is this knowledge still true?" Derived from git, never written into node files (that would churn history).
// A node is stale when code it links to changed after the commit it was verified at; with a line range,
// only changes touching those lines count.
export class StalenessService {
  readonly git: Git;
  private head: string | null | undefined;
  private checkedAt = 0;
  private dirty = true;
  private stale = new Map<string, StaleInfo>();
  private snoozes: SnoozeStore;
  private verdictFile: VerdictFile;
  // Git answers for "what changed in file F between commit C and HEAD" only change when HEAD does.
  // Every node/draft write marks the list dirty and recomputes it; with this, the recompute (and
  // /brief, /stale, approvals in between) re-asks git nothing it already asked at this HEAD.
  private caches = new Caches();
  private cachesHead: string | null = null;

  constructor(private c: Cortex) {
    this.git = new Git(c.project.root);
    this.snoozes = new SnoozeStore(c.project.dir);
    this.verdictFile = new VerdictFile(c.project.dir);
    this.git.verdicts = this.verdictFile.load();
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
    const s = this.stale.get(path);
    return s && this.withSnooze(s);
  }

  list(): StaleInfo[] {
    this.refresh();
    return [...this.stale.values()].map((s) => this.withSnooze(s)).sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.path.localeCompare(b.path));
  }

  actionable(): StaleInfo[] {
    return this.list().filter(actionable);
  }

  // Put a stale node off until its code changes again. Kept under .index/ (never committed): it is a
  // personal to-do state, and writing it into the tree would churn git history for nothing.
  snooze(path: string, by: string): StaleInfo {
    const s = this.get(path);
    if (!s) throw new Error(`"${path}" is not stale.`);
    this.snoozes.set(path, { at: new Date().toISOString(), by, fingerprint: fingerprint(s) });
    this.c.events.emit("change", { type: "stale", path }); // open boards update their counters
    return this.withSnooze(s);
  }

  unsnooze(path: string): void {
    this.snoozes.delete(path);
    this.c.events.emit("change", { type: "stale", path });
  }

  // Changes to `links` since `commit`, with severity. Empty when nothing the links cover moved.
  changesSince(commit: string, links: CodeLink[]): StaleChange[] | null {
    if (!this.git.available() || !this.git.commitExists(commit)) return null;
    const head = this.git.head();
    if (!head) return null;
    const caches = this.cachesFor(head);
    const files = [...new Set(links.map((l) => l.file.normalize("NFC")))];
    const changed = caches.get(caches.changed, `${commit}\0${files.join("\0")}`, () => this.git.changedFiles(commit, files));
    if (changed === null) return null;
    this.prefetchFormatting([{ commit, changed }], caches);
    return this.evaluate(commit, changed, links, caches);
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

  private withSnooze(s: StaleInfo): StaleInfo {
    const z = this.snoozes.get(s.path);
    if (!z) return s;
    // Anything new on these files (another commit, a different status) wakes it up again.
    if (z.fingerprint !== fingerprint(s)) {
      this.snoozes.delete(s.path);
      return s;
    }
    return { ...s, snoozed: { at: z.at, by: z.by } };
  }

  private cachesFor(head: string): Caches {
    if (head !== this.cachesHead) {
      this.caches = new Caches();
      this.cachesHead = head;
    }
    return this.caches;
  }

  private compute(head: string): Map<string, StaleInfo> {
    const caches = this.cachesFor(head);
    const byPath = new Map<string, CodeLink[]>();
    for (const l of this.c.index.nodeCodeLinks()) {
      const list = byPath.get(l.path) ?? [];
      list.push({ file: l.file.normalize("NFC"), lines: l.lines });
      byPath.set(l.path, list);
    }

    // Group nodes by the commit they were verified at: one `git diff` per distinct commit.
    const byCommit = new Map<string, string[]>();
    const out = new Map<string, StaleInfo>();
    for (const path of byPath.keys()) {
      const verified = this.c.tree.read(path)?.verified_at_commit;
      if (!verified || head.startsWith(verified)) continue;
      if (!caches.get(caches.exists, verified, () => this.git.commitExists(verified))) {
        // History was rewritten under it: nothing to compare against, so someone has to look.
        out.set(path, { path, verified_at_commit: verified, reason: "unknown_commit", severity: "medium", changes: [] });
        continue;
      }
      byCommit.set(verified, [...(byCommit.get(verified) ?? []), path]);
    }

    const groups = [...byCommit].map(([commit, paths]) => {
      const files = [...new Set(paths.flatMap((p) => byPath.get(p)!.map((l) => l.file)))];
      const changed = caches.get(caches.changed, `${commit}\0${files.join("\0")}`, () => this.git.changedFiles(commit, files)) ?? [];
      return { commit, paths, changed };
    });
    this.prefetchFormatting(groups, caches);
    for (const { commit, paths, changed } of groups) {
      if (!changed.length) continue;
      for (const path of paths) {
        const changes = this.evaluate(commit, changed, byPath.get(path)!, caches);
        if (changes.length) out.set(path, { path, verified_at_commit: commit, reason: "changed", severity: worst(changes), changes });
      }
    }
    return out;
  }

  // "Formatting only?" for every modified file of every commit group in one batch: at most one
  // Prettier process per recompute. Verdicts are remembered by file contents in .index/, see Git.
  private prefetchFormatting(groups: { commit: string; changed: FileChange[] }[], caches: Caches): void {
    const pairs = groups.flatMap(({ commit, changed }) =>
      changed.filter((c) => c.status === "modified" && !caches.cosmetic.has(`${commit}\0${c.file}`)).map((c) => ({ from: commit, file: c.file })),
    );
    if (!pairs.length) return;
    const known = this.git.verdicts.size;
    for (const [key, cosmetic] of this.git.formattingOnlyPairs(pairs)) caches.cosmetic.set(key, cosmetic);
    if (this.git.verdicts.size !== known) this.verdictFile.save(this.git.verdicts);
  }

  private evaluate(commit: string, changed: FileChange[], links: CodeLink[], caches: Caches): StaleChange[] {
    const changes: StaleChange[] = [];
    for (const raw of links) {
      const link = { ...raw, file: raw.file.normalize("NFC") };
      for (const ch of changed.filter((c) => c.file === link.file || c.file.startsWith(`${link.file}/`))) {
        const range = link.lines && ch.status === "modified" && ch.file === link.file ? parseLines(link.lines) : null;
        if (range) {
          const touched = caches.get(caches.ranges, `${commit}\0${ch.file}`, () => this.git.touchedRanges(commit, ch.file));
          if (touched && !touched.some(([a, b]) => a <= range[1] && b >= range[0])) continue; // changed elsewhere in the file
        }
        const cosmetic = ch.status === "modified" && caches.get(caches.cosmetic, `${commit}\0${ch.file}`, () => this.git.formattingOnly(commit, ch.file));
        const severity: Severity = ch.status !== "modified" ? "high" : cosmetic ? "low" : range ? "high" : "medium";
        const list = caches.get(caches.commits, `${commit}\0${ch.file}`, () => this.git.commitsSince(commit, ch.file));
        changes.push({
          file: ch.file,
          status: ch.status,
          severity,
          ...(ch.renamed_to ? { renamed_to: ch.renamed_to } : {}),
          ...(range ? { lines: link.lines! } : {}),
          ...(cosmetic ? { formatting_only: true } : {}),
          commits: list.length,
          ...(list[0] ? { last: list[0] } : {}),
        });
      }
    }
    return changes;
  }
}

// Keyed by "<commit>\0<file>" (or the file list); valid for one HEAD, see StalenessService.cachesFor.
class Caches {
  changed = new Map<string, FileChange[] | null>();
  exists = new Map<string, boolean>();
  ranges = new Map<string, [number, number][] | null>();
  commits = new Map<string, CommitInfo[]>();
  cosmetic = new Map<string, boolean>();
  get<T>(m: Map<string, T>, key: string, load: () => T): T {
    if (!m.has(key)) m.set(key, load());
    return m.get(key)!;
  }
}

function worst(changes: StaleChange[]): Severity {
  return changes.reduce<Severity>((w, c) => (RANK[c.severity] > RANK[w] ? c.severity : w), "low");
}

// What a snooze was given for: the changed files, how they changed, and the newest commit on each.
function fingerprint(s: StaleInfo): string {
  return (
    s.changes
      .map((c) => `${c.file}:${c.status}:${c.last?.hash ?? ""}`)
      .sort()
      .join("|") || s.reason
  );
}

// "Formatting only" verdicts by blob pair. Pure facts about two file contents, so they never go stale;
// kept in the rebuildable .index/ so a restart does not re-run Prettier over every stale file.
class VerdictFile {
  private file: string;
  constructor(cortexDir: string) {
    this.file = join(cortexDir, ".index", "formatting.json");
  }
  load(): Map<string, boolean> {
    try {
      return new Map(Object.entries(JSON.parse(readFileSync(this.file, "utf8")) as Record<string, boolean>));
    } catch {
      return new Map();
    }
  }
  save(m: Map<string, boolean>): void {
    // Newest last; past the cap the oldest are forgotten (a forgotten verdict is just asked again).
    const entries = [...m].slice(-20_000);
    try {
      if (!existsSync(dirname(this.file))) mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(Object.fromEntries(entries)), "utf8");
    } catch {
      // read-only checkout: keep them in memory only
    }
  }
}

// Re-read when the file changes on disk, so an MCP process and the board see each other's snoozes.
class SnoozeStore {
  private file: string;
  private data: Record<string, Snooze> = {};
  private mtime = -1;

  constructor(cortexDir: string) {
    this.file = join(cortexDir, ".index", "snoozes.json");
  }

  get(path: string): Snooze | undefined {
    this.load();
    return this.data[path];
  }

  set(path: string, z: Snooze): void {
    this.load();
    this.data[path] = z;
    this.save();
  }

  delete(path: string): void {
    this.load();
    if (!(path in this.data)) return;
    delete this.data[path];
    this.save();
  }

  private load(): void {
    let m = 0;
    try {
      m = statSync(this.file).mtimeMs;
    } catch {
      this.data = {};
      this.mtime = 0;
      return;
    }
    if (m === this.mtime) return;
    try {
      this.data = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, Snooze>;
    } catch {
      this.data = {}; // a broken cache file only costs the snoozes
    }
    this.mtime = m;
  }

  private save(): void {
    if (!existsSync(dirname(this.file))) mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), "utf8");
    this.mtime = statSync(this.file).mtimeMs;
  }
}

function parseLines(lines: string): [number, number] | null {
  const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(lines);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

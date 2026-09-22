import { execFileSync } from "node:child_process";

export interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface FileChange {
  file: string; // path as linked (relative to the project root)
  status: "modified" | "deleted" | "renamed";
  renamed_to?: string;
}

// Thin wrapper over the git CLI. Every call is scoped to the project root and returns paths relative to it,
// so it works when .cortex lives in a subfolder of a monorepo too. Any git failure degrades to "unknown".
export class Git {
  private ok: boolean | null = null;

  constructor(private cwd: string) {}

  private run(args: string[]): string | null {
    try {
      return execFileSync("git", args, { cwd: this.cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024, windowsHide: true });
    } catch {
      return null;
    }
  }

  // A positive answer is permanent; a negative one is re-checked now and then, so `git init` after startup is noticed.
  available(): boolean {
    if (this.ok) return true;
    if (this.ok === false && Date.now() - this.checkedAt < 30_000) return false;
    this.checkedAt = Date.now();
    this.ok = this.run(["rev-parse", "--is-inside-work-tree"])?.trim() === "true";
    return this.ok;
  }
  private checkedAt = 0;

  head(): string | null {
    if (!this.available()) return null;
    return this.run(["rev-parse", "HEAD"])?.trim() || null; // null in a repo with no commits yet
  }

  commitExists(hash: string): boolean {
    return /^[0-9a-f]{7,40}$/i.test(hash) && this.run(["cat-file", "-e", `${hash}^{commit}`]) !== null;
  }

  // Which of these paths git does not know about yet. Knowledge can link them, but staleness cannot
  // follow a file that was never committed, so the writer is told.
  untracked(paths: string[]): string[] {
    if (!paths.length || !this.available()) return [];
    const out = this.run(["ls-files", "--error-unmatch", "--", ...paths]);
    if (out === null) {
      // At least one path is unknown; ask one by one to say exactly which.
      return paths.filter((p) => this.run(["ls-files", "--error-unmatch", "--", p]) === null);
    }
    return [];
  }

  // Files among `paths` (files or directories) that differ between `from` and HEAD, in one git call.
  changedFiles(from: string, paths: string[]): FileChange[] | null {
    if (!paths.length) return [];
    const out = this.run(["diff", "--name-status", "-M", "--relative", from, "HEAD", "--", ...paths]);
    if (out === null) return null;
    const changes: FileChange[] = out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [code, a, b] = line.split("\t");
        if (code.startsWith("R")) return { file: a, status: "renamed" as const, renamed_to: b };
        if (code.startsWith("D")) return { file: a, status: "deleted" as const };
        return { file: a, status: "modified" as const };
      });
    // A pathspec hides the rename target, so git reports a move as a deletion. Look for renames repo-wide, only when needed.
    if (changes.some((c) => c.status === "deleted")) {
      const renames = new Map<string, string>();
      for (const line of (this.run(["diff", "--name-status", "-M", "--diff-filter=R", "--relative", from, "HEAD"]) ?? "").split("\n")) {
        const [code, a, b] = line.split("\t");
        if (code?.startsWith("R")) renames.set(a, b);
      }
      for (const c of changes) {
        const to = c.status === "deleted" ? renames.get(c.file) : undefined;
        if (to) Object.assign(c, { status: "renamed", renamed_to: to });
      }
    }
    return changes;
  }

  // Line ranges (in the `from` version) touched between `from` and HEAD. Insertions count as touching the line they follow.
  touchedRanges(from: string, file: string): [number, number][] | null {
    const out = this.run(["diff", "-U0", "--relative", from, "HEAD", "--", file]);
    if (out === null) return null;
    const ranges: [number, number][] = [];
    for (const m of out.matchAll(/^@@ -(\d+)(?:,(\d+))? /gm)) {
      const start = Number(m[1]);
      const len = m[2] === undefined ? 1 : Number(m[2]);
      ranges.push(len === 0 ? [start, start] : [start, start + len - 1]);
    }
    return ranges;
  }

  commitsSince(from: string, file: string, limit = 20): CommitInfo[] {
    const out = this.run(["log", `--max-count=${limit}`, "--format=%H%x09%an%x09%aI%x09%s", "--relative", `${from}..HEAD`, "--", file]);
    if (!out) return [];
    return out
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [hash, author, date, ...subject] = l.split("\t");
        return { hash, author, date, subject: subject.join("\t") };
      });
  }
}

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Activity } from "../core/types.js";

// Append-only log, one file per actor per day: activity/2026-09-22/claude-code.jsonl
// Different actors never touch the same file, so parallel work merges cleanly in git.
export class ActivityStore {
  constructor(private root: string) {}

  append(entry: Activity): void {
    const day = entry.at.slice(0, 10);
    const dir = join(this.root, day);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${entry.actor}.jsonl`), JSON.stringify(entry) + "\n", "utf8");
  }

  all(): Activity[] {
    if (!existsSync(this.root)) return [];
    const out: Activity[] = [];
    for (const day of readdirSync(this.root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
      for (const f of readdirSync(join(this.root, day)).filter((x) => x.endsWith(".jsonl"))) {
        for (const line of readFileSync(join(this.root, day, f), "utf8").split(/\r?\n/)) {
          if (!line.trim()) continue;
          try {
            out.push(JSON.parse(line) as Activity);
          } catch {
            // A merge-mangled line must not take the whole log down.
          }
        }
      }
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }
}

import { z } from "zod";
import type { Cortex } from "./cortex.js";
import { nowIso, ulid } from "../util/text.js";
import { Actor, Activity, CortexError } from "./types.js";

export const ActivityInput = z
  .object({
    action: z.string(),
    summary: z.string().min(1).max(200),
    why: z.string().max(2000).optional(),
    files: z.array(z.string().max(300)).max(100).optional(),
    commit: z.string().regex(/^[0-9a-f]{7,40}$/i, "must be a git commit hash").optional(),
    refs: z.array(z.string()).max(20).optional(),
  })
  .strict();
export type ActivityInput = z.input<typeof ActivityInput>;

const EXAMPLE = {
  action: "fix",
  summary: "Rate-limit login to 5 attempts per minute per IP",
  why: "Brute-force attempts seen in logs (issue 01J9Y...)",
  files: ["src/auth/login.ts", "src/middleware/rateLimit.ts"],
  commit: "d4e5f6a",
  refs: ["01J9YQ8K2M3N4P5Q6R7S8T9V0W", "backend/auth"],
};

export class ActivityService {
  constructor(private c: Cortex) {}

  // What an actor did and why. Humans read this feed to stay in control of what the AI changed.
  log(actor: Actor, input: ActivityInput): { id: string; message: string } {
    const schema = this.c.activitySchema();
    const parsed = ActivityInput.safeParse(input);
    const issues = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    const d = parsed.success ? parsed.data : null;
    if (d) {
      if (!schema.actions.includes(d.action)) issues.push(`action: must be one of ${schema.actions.join(", ")}`);
      if (schema.why_required_for.includes(d.action) && !d.why?.trim()) issues.push(`why: required for "${d.action}" (explain the reason, not the change)`);
      for (const r of d.refs ?? []) {
        if (!this.c.itemStore.exists(r) && !this.c.tree.exists(r)) issues.push(`refs: "${r}" is neither an item id nor a knowledge node path`);
      }
    }
    if (issues.length || !d) {
      throw new CortexError("invalid_activity", "Activity does not match the rules.", 400, {
        issues,
        rules: schema,
        example: EXAMPLE,
      });
    }
    const entry: Activity = { id: ulid(), at: nowIso(), actor: actor.id, ...d };
    this.c.activityStore.append(entry);
    this.c.index.addActivity(entry);
    return { id: entry.id, message: "Activity logged." };
  }

  // Audit trail written by Cortex itself on every write.
  system(actorId: string, action: string, summary: string, refs: string[] = []): void {
    const entry: Activity = { id: ulid(), at: nowIso(), actor: actorId, action, summary, refs, system: true };
    this.c.activityStore.append(entry);
    this.c.index.addActivity(entry);
  }

  list(q: { since?: string; actor?: string; ref?: string; include_system?: boolean; limit?: number }) {
    if (q.since && isNaN(Date.parse(q.since))) {
      throw new CortexError("invalid_query", "since must be an ISO date or datetime, e.g. 2026-09-22 or 2026-09-22T10:00:00Z", 400);
    }
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 200);
    const entries = this.c.index.queryActivity({ since: q.since, actor: q.actor, ref: q.ref, includeSystem: q.include_system ?? false, limit });
    return { entries };
  }

  get(id: string): Activity {
    const a = this.c.index.getActivity(id);
    if (!a) throw new CortexError("not_found", `No activity with id "${id}".`, 404);
    return a;
  }
}

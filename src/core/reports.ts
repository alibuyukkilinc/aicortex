import type { Cortex } from "./cortex.js";
import { Activity, ActorKind, CortexError, Item } from "./types.js";
import { addDays, dayKey, startOfDay } from "../util/time.js";

// Reports answer "what happened, what is waiting, can we trust it" from the files and the activity log.
// No LLM involved: every number is counted, so it costs nothing and is the same every time.

const DAY = 86_400_000;
const AGING_BUCKETS: [string, number, number][] = [
  ["0-3d", 0, 3],
  ["3-7d", 3, 7],
  ["7-30d", 7, 30],
  ["30d+", 30, Infinity],
];
const PLACEHOLDER = /\(not documented yet\)|summary not written yet/;
const LIST = 10;

export interface Period {
  since: string;
  until: string;
  days: number;
  timezone: string; // days are counted in this zone (cortex.config.yaml "timezone", default UTC)
}

// "7d", "2w", "2026-09-01" or a full ISO datetime; until defaults to now.
export function parsePeriod(since?: string, until?: string, now = Date.now(), tz = "UTC"): Period {
  const end = until ? parseInstant(until, "until", tz) : now;
  let start: number;
  const rel = /^(\d{1,3})\s*([dw])$/i.exec(since ?? "7d");
  // Calendar-aligned: "7d" is today plus the six days before it (in the project's zone), so the chart shows 7 columns.
  if (rel) start = startOfDay(addDays(dayKey(end, tz), -(Number(rel[1]) * (rel[2].toLowerCase() === "w" ? 7 : 1) - 1)), tz);
  else start = parseInstant(since!, "since", tz);
  if (!(start < end)) throw new CortexError("invalid_period", "since must be before until.", 400);
  if (end - start > 366 * DAY) throw new CortexError("invalid_period", "A report covers at most 366 days.", 400);
  return { since: new Date(start).toISOString(), until: new Date(end).toISOString(), days: Math.ceil((end - start) / DAY), timezone: tz };
}

// A bare date means the start of that day in the project's zone.
function parseInstant(v: string, name: string, tz: string): number {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(v) ? startOfDay(v, tz) : Date.parse(v);
  if (isNaN(t)) throw new CortexError("invalid_period", `${name} must be like 7d, 2w, 2026-09-01 or an ISO datetime.`, 400);
  return t;
}

// Older audit entries have no structured meta; their summaries end with "(from → to)".
function transition(a: Activity): { from?: string; to?: string } {
  if (a.meta?.to !== undefined || a.meta?.from !== undefined) return { from: a.meta.from, to: a.meta.to };
  const m = /\((\S+) → (\S+)\)/.exec(a.summary);
  return m ? { from: m[1], to: m[2] } : {};
}

function proposer(a: Activity): string | undefined {
  return a.meta?.proposed_by ?? /(?:Approved|Rejected) (\S+?)'s/.exec(a.summary)?.[1];
}

const hours = (from: string, to: string) => Math.round(((Date.parse(to) - Date.parse(from)) / 3_600_000) * 10) / 10;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
};
const inPeriod = (iso: string, p: Period) => iso >= p.since && iso < p.until;

export class ReportService {
  constructor(private c: Cortex) {}

  build(opts: { since?: string; until?: string } = {}) {
    const tz = this.c.project.config.timezone ?? "UTC";
    const p = parsePeriod(opts.since, opts.until, Date.now(), tz);
    const now = new Date().toISOString();
    const kindOf = (id: string): ActorKind => this.c.project.config.actors.find((a) => a.id === id)?.kind ?? "human";
    const events = this.c.index.activityBetween(p.since, p.until);
    const items = this.c.itemStore.allIds().flatMap((id) => {
      const item = this.c.itemStore.read(id);
      return item ? [item] : [];
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    const terminal = (type: string, status: string) => this.c.itemFlags(type, status).terminal;
    const openWork = (type: string, status: string) => this.c.itemFlags(type, status).open;

    // ---- daily volume, by who did it --------------------------------------------
    const daily = new Map<string, { date: string; ai: number; human: number }>();
    for (let d = dayKey(Date.parse(p.since), tz); startOfDay(d, tz) < Date.parse(p.until); d = addDays(d, 1)) {
      daily.set(d, { date: d, ai: 0, human: 0 });
    }
    for (const e of events) {
      const day = daily.get(dayKey(Date.parse(e.at), tz));
      if (day) day[kindOf(e.actor)]++;
    }

    // ---- per actor ---------------------------------------------------------------------
    type ActorRow = {
      id: string;
      kind: ActorKind;
      logged: number; // entries the actor wrote itself (what + why)
      writes: number; // everything else it did: items, replies, node edits
      drafts: { proposed: number; approved: number; rejected: number };
    };
    const actors = new Map<string, ActorRow>();
    const row = (id: string) => {
      if (!actors.has(id)) actors.set(id, { id, kind: kindOf(id), logged: 0, writes: 0, drafts: { proposed: 0, approved: 0, rejected: 0 } });
      return actors.get(id)!;
    };

    // ---- transitions -----------------------------------------------------------------
    const created: Record<string, number> = {};
    const closed: Record<string, number> = {};
    const decisions = { proposed: 0, accepted: 0, rejected: 0 };
    const decisionList: { id: string; title: string; status: string; at: string; by: string }[] = [];
    const closedIssues: { id: string; title: string; days_open: number; resolution?: string; by: string }[] = [];
    const approvals = { proposed: 0, approved: 0, rejected: 0 };
    let nodesUpdated = 0;

    for (const e of events) {
      if (!e.system) {
        row(e.actor).logged++;
        continue;
      }
      if (e.action !== "draft.approved" && e.action !== "draft.rejected") row(e.actor).writes++;
      const item = e.refs?.[0] ? byId.get(e.refs[0]) : undefined;
      const type = e.meta?.type ?? item?.type;
      const { to } = transition(e);
      switch (e.action) {
        case "item.created":
          if (type) created[type] = (created[type] ?? 0) + 1;
          if (type === "decision") decisions.proposed++;
          break;
        case "item.updated":
        case "item.replied":
          if (!type || !to) break;
          if (terminal(type, to)) {
            closed[type] = (closed[type] ?? 0) + 1;
            if (type === "issue" && item) {
              const resolution = this.c.itemStore.replies(item.id).reverse().find((r) => r.fields?.resolution)?.fields?.resolution as string | undefined;
              closedIssues.push({ id: item.id, title: item.title, days_open: Math.round((Date.parse(e.at) - Date.parse(item.created_at)) / DAY * 10) / 10, by: e.actor, ...(resolution ? { resolution } : {}) });
            }
          }
          if (type === "decision" && (to === "accepted" || to === "rejected") && item) {
            decisions[to]++;
            decisionList.push({ id: item.id, title: item.title, status: to, at: e.at, by: e.actor });
          }
          break;
        case "node.updated":
          nodesUpdated++;
          break;
        case "draft.proposed":
          approvals.proposed++;
          row(e.actor).drafts.proposed++;
          break;
        case "draft.approved":
        case "draft.rejected": {
          const verdict = e.action === "draft.approved" ? "approved" : "rejected";
          approvals[verdict]++;
          const who = proposer(e);
          if (who) row(who).drafts[verdict]++;
          if (verdict === "approved" && e.meta?.kind !== "item") nodesUpdated++;
          break;
        }
      }
    }

    // ---- questions: asked in period, answered in period, how fast ------------------
    const answerHours: number[] = [];
    const answered: { id: string; title: string; asked_by: string; answered_by: string; hours: number }[] = [];
    let asked = 0;
    for (const q of items.filter((i) => i.type === "question")) {
      if (inPeriod(q.created_at, p)) asked++;
      const first = this.c.itemStore.replies(q.id).find((r) => r.author !== q.author);
      if (first && inPeriod(first.created_at, p)) {
        const h = hours(q.created_at, first.created_at);
        answerHours.push(h);
        answered.push({ id: q.id, title: q.title, asked_by: q.author, answered_by: first.author, hours: h });
      }
    }

    // ---- what is waiting right now ----------------------------------------------------
    const openIssues = items.filter((i) => i.type === "issue" && openWork(i.type, i.status));
    const aging = AGING_BUCKETS.map(([bucket, lo, hi]) => {
      const inBucket = openIssues.filter((i) => {
        const age = (Date.now() - Date.parse(i.created_at)) / DAY;
        return age >= lo && age < hi;
      });
      const bySeverity: Record<string, number> = {};
      for (const i of inBucket) {
        const sev = String(i.fields.severity ?? "unknown");
        bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
      }
      return { bucket, count: inBucket.length, by_severity: bySeverity };
    });
    const ageDays = (iso: string) => Math.round(((Date.now() - Date.parse(iso)) / DAY) * 10) / 10;
    const blocking = items
      .filter((i: Item) => i.type === "question" && i.status === "open" && i.fields.blocking === true)
      .map((i) => ({ id: i.id, title: i.title, asked_by: i.author, assignee: i.assignee, age_days: ageDays(i.created_at) }))
      .sort((a, b) => b.age_days - a.age_days);
    const pending = this.c.drafts
      .list()
      .map((d) => ({ draft_id: d.id, kind: d.kind, target: d.target, title: d.data.title, proposed_by: d.proposed_by, age_days: ageDays(d.proposed_at) }))
      .sort((a, b) => b.age_days - a.age_days);

    // ---- knowledge health ------------------------------------------------------------
    const nodes = this.c.tree.all();
    const linked = new Set(this.c.index.nodeCodeLinks().map((l) => l.path));
    const stale = this.c.staleness.list();
    const undocumented = nodes.filter((n) => PLACEHOLDER.test(n.summary)).map((n) => n.path || "(root)");

    // ---- highlights -------------------------------------------------------------------
    const aiChanges = events
      .filter((e) => !e.system && kindOf(e.actor) === "ai")
      .reverse()
      .slice(0, LIST)
      .map((e) => ({ id: e.id, at: e.at, actor: e.actor, action: e.action, summary: e.summary, ...(e.why ? { why: e.why } : {}), ...(e.files?.length ? { files: e.files } : {}) }));
    const aiWithoutWhy = events.filter((e) => !e.system && kindOf(e.actor) === "ai" && !e.why).length;

    const actorRows = [...actors.values()]
      .map((a) => {
        const decided = a.drafts.approved + a.drafts.rejected;
        return { ...a, approval_rate: decided ? Math.round((a.drafts.approved / decided) * 100) / 100 : null };
      })
      .sort((a, b) => b.logged + b.writes - (a.logged + a.writes));

    const sum = (xs: Record<string, number>) => Object.values(xs).reduce((s, x) => s + x, 0);
    return {
      period: p,
      generated_at: now,
      totals: {
        activity: { total: events.length, ai: events.filter((e) => kindOf(e.actor) === "ai").length, human: events.filter((e) => kindOf(e.actor) === "human").length },
        ai_logged_changes: events.filter((e) => !e.system && kindOf(e.actor) === "ai").length,
        ai_changes_without_why: aiWithoutWhy,
        items_created: { total: sum(created), by_type: created },
        items_closed: { total: sum(closed), by_type: closed },
        questions: { asked, answered: answered.length, median_answer_hours: median(answerHours), open_blocking: blocking.length },
        decisions,
        approvals: { ...approvals, pending: pending.length, oldest_pending_days: pending[0]?.age_days ?? null },
      },
      daily: [...daily.values()],
      actors: actorRows,
      highlights: {
        ai_changes: aiChanges,
        decisions: decisionList.slice(-LIST).reverse(),
        closed_issues: closedIssues.slice(-LIST).reverse(),
        answered_questions: answered.sort((a, b) => b.hours - a.hours).slice(0, LIST),
      },
      attention: {
        open_issues: openIssues.length,
        issue_aging: aging,
        blocking_questions: blocking.slice(0, LIST),
        pending_approvals: pending.slice(0, LIST),
        stale_nodes: stale.slice(0, LIST).map((s) => ({ path: s.path, files: s.changes.map((c) => c.file) })),
        undocumented: undocumented.slice(0, LIST),
      },
      knowledge: {
        nodes: nodes.length,
        with_code_links: linked.size,
        stale: stale.length,
        stale_ratio: linked.size ? Math.round((stale.length / linked.size) * 100) / 100 : 0,
        undocumented: undocumented.length,
        updated_in_period: nodesUpdated,
        git: this.c.staleness.enabled(),
      },
    };
  }
}

export type Report = ReturnType<ReportService["build"]>;

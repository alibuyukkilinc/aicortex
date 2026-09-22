import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/api/server.js";
import { reportToMarkdown } from "../src/core/reportMarkdown.js";
import { parsePeriod } from "../src/core/reports.js";
import { CortexError } from "../src/core/types.js";
import { buildMcpServer } from "../src/mcp/server.js";
import { tempProject } from "./helpers.js";

test("periods: relative, absolute and invalid", () => {
  const now = Date.parse("2026-09-22T12:00:00Z");
  assert.equal(parsePeriod("7d", undefined, now).since, "2026-09-16T00:00:00.000Z");
  assert.equal(parsePeriod("2w", undefined, now).days, 14);
  assert.deepEqual(parsePeriod("2026-09-01", "2026-09-08", now), { since: "2026-09-01T00:00:00.000Z", until: "2026-09-08T00:00:00.000Z", days: 7 });
  for (const [s, u] of [["yesterday", undefined], ["2026-09-10", "2026-09-01"], ["400d", undefined]] as const) {
    assert.throws(() => parsePeriod(s, u, now), (e: CortexError) => e.code === "invalid_period");
  }
});

// A small but complete week: questions, an issue fix, a decision, drafts approved and rejected.
function busyWeek() {
  const t = tempProject();
  const { cortex: c, human, ai } = t;

  const q = c.items.create(ai, { type: "question", title: "Guest checkout?", assignee: "@humans" });
  c.items.reply(human, q.id, { body: "No." });
  c.items.update(ai, q.id, { status: "closed" });
  c.items.create(ai, { type: "question", title: "Which queue?", assignee: "@humans", fields: { blocking: true } });

  const issue = c.items.create(human, { type: "issue", title: "Double charge", category_path: "backend", fields: { severity: "critical" } });
  c.items.update(ai, issue.id, { status: "in_progress" });
  c.items.reply(ai, issue.id, { body: "Idempotency key.", fields: { resolution: "fixed", commits: ["abc1234"], files: ["pay.ts"] }, status: "review" });
  c.items.update(human, issue.id, { status: "closed" });
  c.items.create(human, { type: "issue", title: "Slow search", category_path: "frontend", fields: { severity: "low" } });

  const d = c.items.create(ai, { type: "decision", title: "Use iyzico", fields: { context: "TRY installments" } });
  c.items.update(human, d.id, { status: "accepted" });

  const good = c.putNode(ai, { path: "backend/pay", title: "Payments", summary: "iyzico, idempotent callback.", reason: "fix" });
  c.approve(human, good.draft_id!);
  const bad = c.putNode(ai, { path: "backend/cache", title: "Cache", summary: "Guessing: Redis?", reason: "guess" });
  c.reject(human, bad.draft_id!, "not verified");
  c.putNode(ai, { path: "backend/queue", title: "Queue", summary: "Pending review.", reason: "found" }); // stays pending

  c.activity.log(ai, { action: "fix", summary: "Idempotent iyzico callback", why: "Late webhooks charged twice", files: ["pay.ts"] });
  c.activity.log(ai, { action: "investigation", summary: "Read the queue code" }); // no why: allowed for investigation
  return { ...t, q, issue, d };
}

test("the report counts what happened, what waits, and how far to trust each AI", () => {
  const t = busyWeek();
  try {
    const r = t.cortex.reports.build({ since: "7d" });
    const T = r.totals;

    assert.equal(T.questions.asked, 2);
    assert.equal(T.questions.answered, 1);
    assert.ok(T.questions.median_answer_hours !== null && T.questions.median_answer_hours < 1);
    assert.equal(T.questions.open_blocking, 1);
    assert.deepEqual(T.items_closed.by_type, { question: 1, issue: 1 });
    assert.equal(T.items_created.by_type.issue, 2);
    assert.deepEqual(T.decisions, { proposed: 1, accepted: 1, rejected: 0 });
    assert.deepEqual({ ...T.approvals, oldest_pending_days: undefined }, { proposed: 3, approved: 1, rejected: 1, pending: 1, oldest_pending_days: undefined });
    assert.equal(T.ai_logged_changes, 2);
    assert.equal(T.ai_changes_without_why, 1);

    const closed = r.highlights.closed_issues[0];
    assert.equal(closed.title, "Double charge");
    assert.equal(closed.resolution, "fixed");
    assert.equal(r.highlights.decisions[0].status, "accepted");
    assert.equal(r.highlights.ai_changes[0].summary, "Read the queue code", "newest first");
    assert.equal(r.highlights.ai_changes[1].why, "Late webhooks charged twice");

    const ai = r.actors.find((a) => a.id === "ai-agent")!;
    assert.deepEqual(ai.drafts, { proposed: 3, approved: 1, rejected: 1 });
    assert.equal(ai.approval_rate, 0.5);
    assert.equal(ai.logged, 2);

    assert.equal(r.attention.open_issues, 1);
    assert.equal(r.attention.issue_aging[0].count, 1);
    assert.deepEqual(r.attention.issue_aging[0].by_severity, { low: 1 });
    assert.equal(r.attention.pending_approvals[0].target, "backend/queue");
    assert.equal(r.attention.blocking_questions[0].title, "Which queue?");

    assert.equal(r.knowledge.undocumented, 8, "root + 7 default branches still carry the placeholder");
    assert.equal(r.knowledge.updated_in_period, 1, "the approved node draft");
    assert.equal(r.daily.length, 7, "today plus the six days before it");
    assert.equal(r.daily.reduce((s, d) => s + d.ai + d.human, 0), T.activity.total);
  } finally {
    t.cleanup();
  }
});

test("events outside the period are left out", () => {
  const t = busyWeek();
  try {
    const r = t.cortex.reports.build({ since: "2020-01-01", until: "2020-01-08" });
    assert.equal(r.totals.activity.total, 0);
    assert.equal(r.totals.questions.answered, 0);
    assert.equal(r.attention.open_issues, 1, "what is waiting is always as of now");
  } finally {
    t.cleanup();
  }
});

test("old audit entries without structured meta are still understood", () => {
  const t = tempProject();
  try {
    const at = new Date().toISOString();
    const dir = join(t.root, ".cortex/activity", at.slice(0, 10));
    mkdirSync(dir, { recursive: true });
    const lines = [
      { id: "01M0000000000000000000000A", at, actor: "owner", action: "item.updated", summary: 'Updated issue "Legacy bug" (review → closed)', refs: ["01M0000000000000000000000Z"], system: true },
      { id: "01M0000000000000000000000B", at, actor: "owner", action: "draft.rejected", summary: 'Rejected ai-agent\'s change to node "backend"', refs: ["backend"], system: true },
    ];
    appendFileSync(join(dir, "owner.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    // The item file is gone, so the type comes from nowhere: the close cannot be attributed, the rejection can.
    t.cortex.reindex();
    const r = t.cortex.reports.build({ since: "1d" });
    assert.equal(r.actors.find((a) => a.id === "ai-agent")?.drafts.rejected, 1);
  } finally {
    t.cleanup();
  }
});

test("markdown in both languages, over REST and MCP", async () => {
  const t = busyWeek();
  const app = buildServer(t.cortex);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  try {
    const r = t.cortex.reports.build({ since: "7d" });
    const en = reportToMarkdown(r, "en");
    const tr = reportToMarkdown(r, "tr");
    assert.match(en, /^# Cortex report/);
    assert.match(en, /## What the AI did, and why/);
    assert.match(en, /_Late webhooks charged twice_/);
    assert.match(tr, /^# Cortex raporu/);
    assert.match(tr, /## İnsanları bekleyenler/);
    assert.match(tr, /\| ai-agent \| ai \| 2 \|/);

    // Pipes in titles must not break tables.
    t.cortex.items.create(t.human, { type: "note", title: "a | b" });
    assert.doesNotMatch(reportToMarkdown(t.cortex.reports.build({ since: "7d" }), "en"), /[^\\]\| b/);

    const h = { host: "localhost", authorization: `Bearer ${t.init.tokens.owner}` };
    const md = await app.inject({ url: "/api/report?since=7d&format=md&lang=tr", headers: h });
    assert.match(String(md.headers["content-type"]), /markdown/);
    assert.match(md.body, /Cortex raporu/);
    const json = await app.inject({ url: "/api/report?since=2w", headers: h });
    assert.equal(json.json().report.period.days, 14);
    assert.equal((await app.inject({ url: "/api/report?since=soon", headers: h })).statusCode, 400);

    const server = buildMcpServer(t.cortex, t.ai);
    await Promise.all([server.connect(a), client.connect(b)]);
    const res = (await client.callTool({ name: "cortex_report", arguments: { since: "7d", format: "markdown", lang: "en" } })) as { content: { text: string }[] };
    assert.match(JSON.parse(res.content[0].text).markdown, /# Cortex report/);
  } finally {
    await client.close();
    await app.close();
    t.cleanup();
  }
});

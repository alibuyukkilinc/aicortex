import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Cortex } from "../src/core/cortex.js";
import { loadProject } from "../src/core/project.js";
import { CortexError } from "../src/core/types.js";
import { estimateTokens } from "../src/util/text.js";
import { tempProject } from "./helpers.js";

function err(fn: () => unknown): CortexError {
  try {
    fn();
  } catch (e) {
    return e as CortexError;
  }
  throw new Error("expected an error");
}

test("init writes editable schemas for every built-in type", () => {
  const t = tempProject();
  try {
    for (const type of ["task", "issue", "question", "note", "decision", "activity"]) {
      assert.ok(existsSync(join(t.root, `.cortex/rules/${type}.schema.yaml`)), type);
    }
    assert.ok(existsSync(join(t.root, ".cortex/.gitattributes")));
    assert.deepEqual(t.cortex.itemTypes(), ["task", "issue", "question", "note", "decision"]);
  } finally {
    t.cleanup();
  }
});

test("issues are validated against their schema and explain how to fix it", () => {
  const t = tempProject();
  try {
    const e = err(() => t.cortex.items.create(t.ai, { type: "issue", title: "Login 500", fields: { colour: "red" } }));
    assert.equal(e.code, "invalid_item");
    const hint = e.hint as { issues: string[]; rules: { example: object; fields: object } };
    assert.ok(hint.issues.some((i) => i.startsWith("category_path")));
    assert.ok(hint.issues.some((i) => i.startsWith("severity: required")));
    assert.ok(hint.issues.some((i) => i.startsWith("colour: unknown field")));
    assert.ok(hint.rules.example, "the rules and an example travel with the error");

    assert.equal(err(() => t.cortex.items.create(t.ai, { type: "bug", title: "x" })).code, "unknown_type");
    assert.equal(err(() => t.cortex.items.create(t.ai, { type: "issue", title: "x", category_path: "nope", fields: { severity: "low" } })).code, "invalid_item");

    const r = t.cortex.items.create(t.ai, { type: "issue", title: "Login returns 500", category_path: "backend", fields: { severity: "high" } });
    assert.equal(r.applied, true);
    assert.equal(r.status, "open");
    const dirs = readdirSync(join(t.root, ".cortex/items")).filter((d) => d !== ".gitkeep");
    assert.deepEqual(dirs, [`${r.id}-login-returns-500`]);
  } finally {
    t.cleanup();
  }
});

test("status transitions follow the schema; humans may force", () => {
  const t = tempProject();
  try {
    const { id } = t.cortex.items.create(t.human, { type: "issue", title: "Slow page", category_path: "frontend", fields: { severity: "low" } });
    const e = err(() => t.cortex.items.update(t.ai, id, { status: "review" }));
    assert.equal(e.code, "invalid_transition");
    assert.deepEqual((e.hint as { allowed_from_here: string[] }).allowed_from_here, ["in_progress", "closed"]);
    assert.equal(err(() => t.cortex.items.update(t.ai, id, { status: "review", force: true })).code, "invalid_transition", "AIs cannot force");
    assert.equal(t.cortex.items.update(t.human, id, { status: "review", force: true }).status, "review");
    assert.equal(err(() => t.cortex.items.update(t.ai, id, { status: "wontfix" })).code, "invalid_status");
  } finally {
    t.cleanup();
  }
});

test("AI can propose a decision but only a human can accept it", () => {
  const t = tempProject();
  try {
    const d = t.cortex.items.create(t.ai, {
      type: "decision",
      title: "Use iyzico for card payments",
      category_path: "backend",
      body: "All card payments go through iyzico.",
      fields: { context: "Need installments in TRY.", alternatives: "Stripe: no installments in TR." },
    });
    assert.equal(d.status, "proposed");
    const inbox = t.cortex.items.inbox(t.human);
    assert.deepEqual(inbox.items.map((i) => [i.id, i.reason]), [[d.id, "decision_needs_review"]]);

    assert.equal(err(() => t.cortex.items.update(t.ai, d.id, { status: "accepted" })).code, "forbidden");
    assert.equal(t.cortex.items.update(t.human, d.id, { status: "accepted" }).status, "accepted");
    assert.equal(t.cortex.items.inbox(t.human).count, 0);

    // "Why did we pick iyzico?" is answered by search, not by re-reading docs.
    const hits = t.cortex.search("neden iyzico taksit", { kinds: ["item"] }).results;
    assert.equal(hits[0]?.id, d.id);
    assert.equal(t.cortex.search("installments", { type: "decision" }).results[0]?.id, d.id);
  } finally {
    t.cleanup();
  }
});

test("question round trip: AI asks humans, human answers, AI closes", () => {
  const t = tempProject();
  try {
    const low = t.cortex.items.create(t.ai, { type: "question", title: "Which log level in prod?", assignee: "@humans" });
    const q = t.cortex.items.create(t.ai, {
      type: "question",
      title: "Should guest checkout create an account?",
      assignee: "@humans",
      fields: { blocking: true },
    });
    const humanInbox = t.cortex.items.inbox(t.human);
    assert.deepEqual(humanInbox.items.map((i) => i.id), [q.id, low.id], "blocking questions come first");
    assert.equal(humanInbox.items[0].reason, "assigned_to_group");
    assert.equal(t.cortex.items.inbox(t.ai).count, 0, "the asker is not asked");

    const r = t.cortex.items.reply(t.human, q.id, { body: "No, keep it guest-only." });
    assert.equal(r.status, "answered", "answering moves the question automatically");
    assert.deepEqual(t.cortex.items.inbox(t.ai).items.map((i) => [i.id, i.reason]), [[q.id, "your_question_answered"]]);
    assert.ok(!t.cortex.items.inbox(t.human).items.some((i) => i.id === q.id), "no longer waiting on humans");

    t.cortex.items.update(t.ai, q.id, { status: "closed" });
    assert.equal(t.cortex.items.inbox(t.ai).count, 0);
    const full = t.cortex.items.get(q.id);
    assert.equal(full.replies.length, 1);
    assert.deepEqual(full.replies[0].status_change, { from: "open", to: "answered" });
  } finally {
    t.cleanup();
  }
});

test("a 'fixed' reply must carry commits and files", () => {
  const t = tempProject();
  try {
    const { id } = t.cortex.items.create(t.human, { type: "issue", title: "Crash on save", category_path: "backend", assignee: "ai-agent", fields: { severity: "critical" } });
    assert.deepEqual(t.cortex.items.inbox(t.ai).items.map((i) => i.reason), ["assigned_to_you"]);
    t.cortex.items.update(t.ai, id, { status: "in_progress" });

    const e = err(() => t.cortex.items.reply(t.ai, id, { body: "Fixed.", fields: { resolution: "fixed" }, status: "review" }));
    assert.equal(e.code, "invalid_item");
    assert.match((e.hint as { issues: string[] }).issues[0], /commits and changed files/);

    const r = t.cortex.items.reply(t.ai, id, {
      body: "Null check added.",
      fields: { resolution: "fixed", commits: ["a1b2c3d"], files: ["src/save.ts"] },
      status: "review",
    });
    assert.equal(r.status, "review");
    assert.deepEqual(t.cortex.items.inbox(t.human).items.map((i) => [i.id, i.reason]), [[id, "new_reply"]], "the human author sees the fix");
    assert.equal(err(() => t.cortex.items.reply(t.ai, id, { body: "x", fields: { resolution: "done" } })).code, "invalid_item");
  } finally {
    t.cleanup();
  }
});

test("activity: why is required for changes, refs must exist, humans can ask about any entry", () => {
  const t = tempProject();
  try {
    const bad = err(() => t.cortex.activity.log(t.ai, { action: "fix", summary: "Patched login", refs: ["backend/nope"] }));
    assert.equal(bad.code, "invalid_activity");
    const issues = (bad.hint as { issues: string[] }).issues;
    assert.ok(issues.some((i) => i.startsWith("why: required")));
    assert.ok(issues.some((i) => i.startsWith("refs:")));
    assert.equal(err(() => t.cortex.activity.log(t.ai, { action: "hack", summary: "x" })).code, "invalid_activity");

    const a = t.cortex.activity.log(t.ai, {
      action: "fix",
      summary: "Rate-limit login",
      why: "Brute-force attempts seen in logs",
      files: ["src/auth/login.ts"],
      commit: "d4e5f6a",
      refs: ["backend"],
    });
    assert.equal(t.cortex.activity.list({}).entries[0].id, a.id);
    assert.equal(t.cortex.activity.list({ ref: "backend" }).entries.length, 1);
    assert.equal(t.cortex.search("brute force").results[0]?.id, a.id, "the reason is searchable");

    const q = t.cortex.items.ask(t.human, { about: a.id, title: "Why 5 attempts and not 10?" });
    const item = t.cortex.items.get(q.id).item;
    assert.equal(item.assignee, "ai-agent", "routed to whoever did it");
    assert.deepEqual(item.links?.activity, [a.id]);
    assert.equal(item.category_path, "backend");
    assert.equal(t.cortex.items.inbox(t.ai).items[0].id, q.id);

    // Asking about your own work goes to the other side.
    t.cortex.putNode(t.human, { path: "backend/cache", title: "Cache", summary: "Redis." });
    const self = t.cortex.items.ask(t.human, { about: "backend/cache", title: "Is this still true?" });
    assert.equal(t.cortex.items.get(self.id).item.assignee, "@ai");

    assert.equal(err(() => t.cortex.items.ask(t.human, { about: "nowhere/at-all", title: "?" })).code, "not_found");

    const audit = t.cortex.activity.list({ include_system: true }).entries;
    assert.ok(audit.some((e) => e.system && e.action === "item.created"));
    assert.ok(!t.cortex.activity.list({}).entries.some((e) => e.system), "system entries are hidden by default");
  } finally {
    t.cleanup();
  }
});

test("review policy turns AI item writes into drafts", () => {
  const t = tempProject();
  try {
    t.cortex.project.config.approval.task = "review";
    const r = t.cortex.items.create(t.ai, { type: "task", title: "Refactor checkout", category_path: "backend" });
    assert.equal(r.applied, false);
    assert.equal(err(() => t.cortex.items.get(r.id)).code, "not_found");
    assert.equal(t.cortex.listDrafts()[0].kind, "item");

    t.cortex.approve(t.human, r.draft_id!);
    assert.equal(t.cortex.items.get(r.id).item.title, "Refactor checkout");

    const edit = t.cortex.items.update(t.ai, r.id, { title: "Refactor checkout flow" });
    t.cortex.items.update(t.human, r.id, { title: "Human changed it meanwhile" });
    assert.equal(err(() => t.cortex.approve(t.human, edit.draft_id!)).code, "conflict");

    t.cortex.project.config.approval.note = "human_only";
    assert.equal(err(() => t.cortex.items.create(t.ai, { type: "note", title: "x" })).code, "forbidden");
    assert.equal(t.cortex.items.create(t.human, { type: "note", title: "x" }).applied, true);
  } finally {
    t.cleanup();
  }
});

test("custom item types come from a rules file", () => {
  const t = tempProject();
  try {
    writeFileSync(
      join(t.root, ".cortex/rules/incident.schema.yaml"),
      [
        "type: incident",
        "statuses: [open, mitigated, resolved]",
        "initial: open",
        "terminal: [resolved]",
        "transitions: { open: [mitigated], mitigated: [resolved] }",
        "fields:",
        "  started_at: { type: datetime, required: true }",
        "  impact: { type: enum, values: [minor, major], required: true }",
      ].join("\n"),
    );
    assert.ok(t.cortex.itemTypes().includes("incident"));
    const e = err(() => t.cortex.items.create(t.human, { type: "incident", title: "API down", fields: { started_at: "yesterday", impact: "major" } }));
    assert.match((e.hint as { issues: string[] }).issues[0], /ISO-8601/);
    const ok = t.cortex.items.create(t.human, { type: "incident", title: "API down", fields: { started_at: "2026-09-22T08:00:00Z", impact: "major" } });
    assert.equal(ok.status, "open");
    assert.equal((t.cortex.rules("incident").rules.incident as { type: string }).type, "incident");
  } finally {
    t.cleanup();
  }
});

test("brief surfaces the inbox and open items, and stays small", () => {
  const t = tempProject();
  try {
    for (let i = 0; i < 8; i++) {
      t.cortex.items.create(t.human, { type: "issue", title: `Bug number ${i} in the payment flow`, category_path: "backend", assignee: "@ai", fields: { severity: "medium" } });
    }
    t.cortex.activity.log(t.ai, { action: "investigation", summary: "Read the payment module" });
    const brief = t.cortex.brief(t.ai);
    assert.equal(brief.attention.inbox.count, 8);
    assert.equal(brief.attention.inbox.top.length, 5);
    assert.equal(brief.branches.find((b) => b.path === "backend")?.open_items, 8);
    assert.equal(brief.recent_activity[0].summary, "Read the payment module");
    assert.ok(estimateTokens(brief) < 800, `brief is ${estimateTokens(brief)} tokens`);
    assert.equal(t.cortex.treeView("").node.children?.find((c) => c.path === "backend")?.open_items, 8);

    const page1 = t.cortex.items.list({ type: "issue", limit: 5 });
    assert.equal(page1.items.length, 5);
    assert.equal(page1.total, 8);
    const page2 = t.cortex.items.list({ type: "issue", limit: 5, cursor: page1.next_cursor! });
    assert.equal(page2.items.length, 3);
    assert.equal(page2.next_cursor, null);
    assert.equal("body" in page1.items[0], false, "lists never include bodies");
  } finally {
    t.cleanup();
  }
});

test("items, replies and activity survive an index rebuild", () => {
  const t = tempProject();
  try {
    const q = t.cortex.items.create(t.ai, { type: "question", title: "Staging URL?", assignee: "owner" });
    t.cortex.items.reply(t.human, q.id, { body: "staging.example.com" });
    t.cortex.activity.log(t.ai, { action: "docs", summary: "Documented staging" });
    t.cortex.close();
    rmSync(join(t.root, ".cortex/.index"), { recursive: true, force: true });

    const fresh = new Cortex(loadProject(t.root));
    try {
      assert.equal(fresh.items.get(q.id).replies[0].body, "staging.example.com");
      assert.equal(fresh.items.inbox(fresh.actor("ai-agent")).items[0].reason, "your_question_answered");
      assert.equal(fresh.activity.list({}).entries[0].summary, "Documented staging");
      assert.equal(fresh.search("staging example").results[0]?.id, q.id, "reply text is searchable");
    } finally {
      fresh.close();
    }
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("replies are trimmed newest-first to fit a budget", () => {
  const t = tempProject();
  try {
    const { id } = t.cortex.items.create(t.human, { type: "task", title: "Long discussion" });
    for (let i = 0; i < 20; i++) t.cortex.items.reply(i % 2 ? t.ai : t.human, id, { body: `Reply ${i} `.repeat(20) });
    const last3 = t.cortex.items.get(id, { replies: 3 });
    assert.equal(last3.replies.length, 3);
    assert.equal(last3.replies_omitted, 17);
    assert.match(last3.replies[2].body, /^Reply 19/);
    const budgeted = t.cortex.items.get(id, { budget: 400 });
    assert.ok(budgeted.replies.length < 20 && budgeted.replies.length > 0);
    assert.match(budgeted.replies[budgeted.replies.length - 1].body, /^Reply 19/);
  } finally {
    t.cleanup();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildServer } from "../src/api/server.js";
import { Cortex } from "../src/core/cortex.js";
import { initProject } from "../src/core/init.js";
import { loadProject } from "../src/core/project.js";
import { CortexError } from "../src/core/types.js";

// A real git repository with a small codebase, Cortex initialized and committed.
function gitProject() {
  const root = mkdtempSync(join(tmpdir(), "cortex-git-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const write = (file: string, text: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const commit = (msg: string) => {
    git("add", "-A");
    git("commit", "-q", "-m", msg);
    return git("rev-parse", "HEAD");
  };
  git("init", "-q");
  git("config", "user.email", "dev@example.com");
  git("config", "user.name", "Dev");
  git("config", "commit.gpgsign", "false");
  const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  write("src/auth/login.ts", lines);
  write("src/auth/token.ts", "export const ttl = 15;\n");
  write("src/pay/iyzico.ts", "export const provider = 'iyzico';\n");
  write("src/pay/refund_v2.ts", "export {};\n");
  write("README.md", "# demo\n");
  const init = initProject(root, "demo");
  const first = commit("initial");
  const cortex = new Cortex(loadProject(root), { embedder: null });
  return {
    root,
    init,
    cortex,
    git,
    write,
    commit,
    first,
    human: cortex.actor("owner"),
    ai: cortex.actor("ai-agent"),
    edit(file: string, from: string, to: string) {
      const content = execFileSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "utf8" });
      write(file, content.replace(from, to));
    },
    cleanup() {
      cortex.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const stale = (c: Cortex, path: string) => {
  c.staleness.refresh(true);
  return c.staleness.get(path);
};

test("writing a node with code links pins it to the current commit", () => {
  const p = gitProject();
  try {
    p.cortex.putNode(p.human, { path: "backend/auth", title: "Auth", summary: "Login and tokens.", links: { code: [{ file: "src/auth/login.ts" }] } });
    assert.equal(p.cortex.node("backend/auth").verified_at_commit, p.first);
    assert.equal(stale(p.cortex, "backend/auth"), undefined);

    const bad = (() => {
      try {
        p.cortex.putNode(p.human, { path: "backend/x", title: "x", summary: "x", links: { code: [{ file: "a.ts" }] }, verified_at_commit: "deadbeef" });
      } catch (e) {
        return e as CortexError;
      }
    })();
    assert.equal(bad?.code, "invalid_node");
  } finally {
    p.cleanup();
  }
});

test("a committed change to linked code makes the node stale, with the commit that did it", () => {
  const p = gitProject();
  try {
    p.cortex.putNode(p.human, { path: "backend/auth", title: "Auth", summary: "15 minute tokens.", links: { code: [{ file: "src/auth/token.ts" }] } });
    p.cortex.putNode(p.human, { path: "backend/pay", title: "Payments", summary: "iyzico.", links: { code: [{ file: "src/pay" }] } });

    p.write("README.md", "# demo\nmore\n");
    p.commit("docs only");
    assert.equal(stale(p.cortex, "backend/auth"), undefined, "unrelated commits do not matter");

    // Uncommitted edits do not count: the AI may be halfway through a change.
    p.write("src/auth/token.ts", "export const ttl = 60;\n");
    assert.equal(stale(p.cortex, "backend/auth"), undefined);
    p.commit("longer tokens");

    const s = stale(p.cortex, "backend/auth")!;
    assert.equal(s.reason, "changed");
    assert.equal(s.changes[0].file, "src/auth/token.ts");
    assert.equal(s.changes[0].commits, 1);
    assert.equal(s.changes[0].last?.subject, "longer tokens");
    assert.equal(stale(p.cortex, "backend/pay"), undefined);

    // A directory link sees changes to any file inside it.
    p.write("src/pay/iyzico.ts", "export const provider = 'iyzico-v2';\n");
    p.commit("iyzico v2");
    assert.equal(stale(p.cortex, "backend/pay")?.changes[0].file, "src/pay/iyzico.ts");

    // The tree, search and brief all surface it.
    assert.equal(p.cortex.treeView("backend").node.children?.find((c) => c.path === "backend/auth")?.status, "stale");
    const brief = p.cortex.brief(p.ai);
    assert.equal(brief.attention.stale_nodes?.count, 2);
    assert.ok(p.cortex.nodeView("backend/auth").staleness?.hint);
  } finally {
    p.cleanup();
  }
});

test("with a line range, only changes to those lines count", () => {
  const p = gitProject();
  try {
    p.cortex.putNode(p.human, { path: "backend/auth", title: "Auth", summary: "Login check.", links: { code: [{ file: "src/auth/login.ts", lines: "40-60" }] } });

    p.edit("src/auth/login.ts", "line 5\n", "line 5 changed\n");
    p.commit("touch line 5");
    assert.equal(stale(p.cortex, "backend/auth"), undefined, "outside the linked range");

    p.edit("src/auth/login.ts", "line 50\n", "line 50 changed\n");
    p.commit("touch line 50");
    const s = stale(p.cortex, "backend/auth")!;
    assert.equal(s.changes[0].lines, "40-60");
    assert.equal(s.changes[0].last?.subject, "touch line 50");
  } finally {
    p.cleanup();
  }
});

test("deleted and renamed files are reported", () => {
  const p = gitProject();
  try {
    p.cortex.putNode(p.human, { path: "backend/pay", title: "Refunds", summary: "v2 refunds.", links: { code: [{ file: "src/pay/refund_v2.ts" }, { file: "src/pay/iyzico.ts" }] } });
    unlinkSync(join(p.root, "src/pay/refund_v2.ts"));
    renameSync(join(p.root, "src/pay/iyzico.ts"), join(p.root, "src/pay/provider.ts"));
    p.commit("restructure payments");
    const s = stale(p.cortex, "backend/pay")!;
    const byFile = Object.fromEntries(s.changes.map((c) => [c.file, c]));
    assert.equal(byFile["src/pay/refund_v2.ts"].status, "deleted");
    assert.equal(byFile["src/pay/iyzico.ts"].status, "renamed");
    assert.equal(byFile["src/pay/iyzico.ts"].renamed_to, "src/pay/provider.ts");
  } finally {
    p.cleanup();
  }
});

test("verifying clears staleness; an AI's verification waits for a human", () => {
  const p = gitProject();
  try {
    p.cortex.putNode(p.human, { path: "backend/auth", title: "Auth", summary: "Tokens.", links: { code: [{ file: "src/auth/token.ts" }] } });
    p.write("src/auth/token.ts", "export const ttl = 30;\n");
    const head = p.commit("tweak ttl");
    assert.ok(stale(p.cortex, "backend/auth"));

    const byAi = p.cortex.verifyNode(p.ai, "backend/auth", "Checked: summary does not mention the ttl value");
    assert.equal(byAi.applied, false, "AI verification is a draft under the default policy");
    assert.ok(stale(p.cortex, "backend/auth"), "still stale until approved");
    p.cortex.approve(p.human, byAi.draft_id!);
    assert.equal(stale(p.cortex, "backend/auth"), undefined);
    assert.equal(p.cortex.node("backend/auth").verified_at_commit, head);

    // An unknown commit (rewritten history, shallow clone) is treated as stale, not silently trusted.
    p.cortex.close();
    const file = join(p.root, ".cortex/tree/backend/auth.md");
    writeFileSync(file, readFileSync(file, "utf8").replace(/verified_at_commit: \w+/, "verified_at_commit: 0123456789abcdef0123456789abcdef01234567"));
    const again = new Cortex(loadProject(p.root), { embedder: null });
    try {
      assert.equal(stale(again, "backend/auth")?.reason, "unknown_commit");
    } finally {
      again.close();
    }
  } finally {
    rmSync(p.root, { recursive: true, force: true });
  }
});

test("code context: what covers these files, and a nudge after logging changes", () => {
  const p = gitProject();
  try {
    p.cortex.putNode(p.human, { path: "backend/auth", title: "Auth", summary: "Login.", links: { code: [{ file: "src/auth/login.ts", lines: "1-20" }] } });
    p.cortex.putNode(p.human, { path: "backend/pay", title: "Payments", summary: "iyzico.", links: { code: [{ file: "src/pay" }] } });
    const decision = p.cortex.items.create(p.human, { type: "decision", title: "Use iyzico", category_path: "backend/pay", fields: { context: "TRY installments" } });
    const issue = p.cortex.items.create(p.human, {
      type: "issue",
      title: "Refund rounding",
      category_path: "backend",
      links: { code: [{ file: "src/pay/refund_v2.ts" }] },
      fields: { severity: "low" },
    });

    const ctx = p.cortex.codeContext(["src/pay/refund_v2.ts"]);
    assert.deepEqual(ctx.knowledge.map((k) => k.path), ["backend/pay"], "directory link covers the file");
    const ids = ctx.items.map((i) => i.id);
    assert.ok(ids.includes(decision.id), "decisions under the matched knowledge");
    assert.ok(ids.includes(issue.id), "items linking the file directly");

    // "_" must not act as a wildcard.
    assert.equal(p.cortex.codeContext(["src/pay/refundXv2.ts"]).knowledge.length, 1, "still inside src/pay");
    assert.equal(p.cortex.codeContext(["src/pay/refundXv2.ts"]).items.some((i) => i.id === issue.id && i.via === "code link"), false);

    // Asking about a directory finds links to files inside it.
    assert.deepEqual(p.cortex.codeContext(["src/auth"]).knowledge.map((k) => k.path), ["backend/auth"]);
    assert.ok(p.cortex.codeContext(["docs/none.md"]).hint);

    const logged = p.cortex.activity.log(p.ai, { action: "fix", summary: "Round refunds", why: "Off-by-one kuruş", files: ["./src/pay/refund_v2.ts"] });
    assert.deepEqual(logged.related_knowledge?.map((k) => k.path), ["backend/pay"]);
  } finally {
    p.cleanup();
  }
});

test("REST: stale list, verify and code context endpoints", async () => {
  const p = gitProject();
  const app = buildServer(p.cortex);
  const as = (who: "owner" | "ai-agent") => ({ host: "localhost", authorization: `Bearer ${p.init.tokens[who]}` });
  try {
    p.cortex.putNode(p.human, { path: "backend/auth", title: "Auth", summary: "Tokens.", links: { code: [{ file: "src/auth/token.ts" }] } });
    p.write("src/auth/token.ts", "export const ttl = 5;\n");
    p.commit("shorter tokens");
    p.cortex.staleness.refresh(true);

    const list = await app.inject({ url: "/api/stale", headers: as("owner") });
    assert.equal(list.json().enabled, true);
    assert.deepEqual(list.json().nodes.map((n: { path: string }) => n.path), ["backend/auth"]);
    assert.equal((await app.inject({ url: "/api/node/backend/auth", headers: as("ai-agent") })).json().staleness.reason, "changed");
    assert.equal((await app.inject({ url: "/api/code?files=src/auth/token.ts", headers: as("ai-agent") })).json().knowledge[0].stale, true);

    assert.equal((await app.inject({ method: "POST", url: "/api/verify/backend/auth", headers: as("ai-agent"), payload: {} })).statusCode, 202);
    const v = await app.inject({ method: "POST", url: "/api/verify/backend/auth", headers: as("owner"), payload: { note: "ttl not in text" } });
    assert.equal(v.statusCode, 200);
    p.cortex.staleness.refresh(true);
    assert.deepEqual((await app.inject({ url: "/api/stale", headers: as("owner") })).json().nodes, []);
  } finally {
    await app.close();
    p.cleanup();
  }
});

test("outside a git repository everything still works, staleness is just off", () => {
  const root = mkdtempSync(join(tmpdir(), "cortex-nogit-"));
  initProject(root, "demo");
  const c = new Cortex(loadProject(root), { embedder: null });
  try {
    const h = c.actor("owner");
    c.putNode(h, { path: "backend/auth", title: "Auth", summary: "x", links: { code: [{ file: "src/a.ts" }] } });
    assert.equal(c.node("backend/auth").verified_at_commit, undefined);
    assert.equal(c.staleness.enabled(), false);
    assert.deepEqual(c.staleness.list(), []);
    assert.equal(c.brief(h).attention.stale_nodes, undefined);
    assert.throws(() => c.verifyNode(h, "backend/auth"), (e: CortexError) => e.code === "no_git");
  } finally {
    c.close();
    rmSync(root, { recursive: true, force: true });
  }
});

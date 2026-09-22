import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/api/server.js";
import { CSRF_HEADER, SESSION_COOKIE, createLoginCode, verifyLoginCode } from "../src/api/auth.js";
import { tempProject } from "./helpers.js";

test("login codes are signed, scoped to one actor and expire", () => {
  const tokens = { owner: "ctx_a", other: "ctx_b" };
  const code = createLoginCode("owner", tokens.owner);
  assert.equal(verifyLoginCode(code, tokens), "owner");
  assert.equal(verifyLoginCode(code.replace(/.$/, (c) => (c === "A" ? "B" : "A")), tokens), null, "tampered");
  assert.equal(verifyLoginCode(code.replace(/^owner/, "other"), tokens), null, "moved to another actor");
  assert.equal(verifyLoginCode(code, tokens, Date.now() + 11 * 60 * 1000), null, "expired");
  assert.equal(verifyLoginCode("garbage", tokens), null);
});

test("board login sets an HttpOnly cookie; cookie writes need the CSRF header", async () => {
  const t = tempProject();
  const app = buildServer(t.cortex);
  const host = { host: "localhost:4747" };
  try {
    const bad = await app.inject({ url: "/login?code=nope", headers: host });
    assert.equal(bad.statusCode, 401);

    const aiCode = createLoginCode("ai-agent", t.init.tokens["ai-agent"]);
    assert.equal((await app.inject({ url: `/login?code=${aiCode}`, headers: host })).statusCode, 401, "AIs cannot open the board");

    const login = await app.inject({ url: `/login?code=${createLoginCode("owner", t.init.tokens.owner)}`, headers: host });
    assert.equal(login.statusCode, 302);
    const set = String(login.headers["set-cookie"]);
    assert.match(set, /HttpOnly/i);
    assert.match(set, /SameSite=Strict/i);
    const cookie = { ...host, cookie: `${SESSION_COOKIE}=${t.init.tokens.owner}` };

    const me = await app.inject({ url: "/api/me", headers: cookie });
    assert.equal(me.json().actor.id, "owner");
    assert.ok(me.json().item_types.includes("decision"));

    const payload = { type: "note", title: "From the board" };
    const noCsrf = await app.inject({ method: "POST", url: "/api/items", headers: cookie, payload });
    assert.equal(noCsrf.statusCode, 403);
    assert.equal(noCsrf.json().error.code, "csrf");
    const withCsrf = await app.inject({ method: "POST", url: "/api/items", headers: { ...cookie, [CSRF_HEADER]: "1" }, payload });
    assert.equal(withCsrf.statusCode, 201);

    // Bearer clients (AIs, scripts) are not affected by the CSRF rule.
    const bearer = await app.inject({ method: "POST", url: "/api/items", headers: { ...host, authorization: `Bearer ${t.init.tokens["ai-agent"]}` }, payload });
    assert.equal(bearer.statusCode, 201);

    const out = await app.inject({ method: "POST", url: "/api/logout", headers: { ...cookie, [CSRF_HEADER]: "1" } });
    assert.match(String(out.headers["set-cookie"]), new RegExp(`${SESSION_COOKIE}=;`));

    // Unknown client routes fall back to the board page; unknown API routes stay JSON 404s.
    const page = await app.inject({ url: "/some/client/route", headers: host });
    assert.equal(page.statusCode, 200);
    assert.match(String(page.headers["content-type"]), /html/);
    assert.equal((await app.inject({ url: "/api/nope", headers: { ...host, authorization: `Bearer ${t.init.tokens.owner}` } })).statusCode, 404);
  } finally {
    await app.close();
    t.cleanup();
  }
});

test("rules: humans edit YAML, invalid rules are refused, AIs cannot edit", async () => {
  const t = tempProject();
  const app = buildServer(t.cortex);
  const as = (who: "owner" | "ai-agent") => ({ host: "localhost", authorization: `Bearer ${t.init.tokens[who]}` });
  try {
    const src = await app.inject({ url: "/api/rules/issue/source", headers: as("owner") });
    assert.match(src.json().source, /^# Edited by humans only/);
    const before = src.json()._meta.rules_version;

    const broken = await app.inject({
      method: "PUT",
      url: "/api/rules/issue/source",
      headers: as("owner"),
      payload: { source: "type: issue\nstatuses: [open, closed]\ninitial: pending\nfields:\n  severity: { type: colour }\n" },
    });
    assert.equal(broken.statusCode, 400);
    const issues: string[] = broken.json().error.hint.issues;
    assert.ok(issues.some((i) => i.startsWith("initial")));
    assert.ok(issues.some((i) => i.startsWith("fields.severity.type")));
    assert.equal((await app.inject({ method: "PUT", url: "/api/rules/issue/source", headers: as("owner"), payload: { source: "a: [" } })).json().error.code, "invalid_rules");

    const edited = src.json().source.replace("severity: { type: enum", "severity: { type: enum").replace(/required: true\n/, "required: false\n");
    const aiTry = await app.inject({ method: "PUT", url: "/api/rules/issue/source", headers: as("ai-agent"), payload: { source: edited } });
    assert.equal(aiTry.statusCode, 403);

    const saved = await app.inject({ method: "PUT", url: "/api/rules/issue/source", headers: as("owner"), payload: { source: edited } });
    assert.equal(saved.statusCode, 200);
    assert.notEqual(saved.json().version, before, "AIs notice through rules_version");

    // A brand-new custom type from the board.
    const custom = "type: incident\nstatuses: [open, resolved]\ninitial: open\nterminal: [resolved]\ntransitions: any\nfields: {}\n";
    assert.equal((await app.inject({ method: "PUT", url: "/api/rules/incident/source", headers: as("owner"), payload: { source: custom } })).statusCode, 200);
    assert.ok(t.cortex.itemTypes().includes("incident"));
    assert.equal((await app.inject({ method: "PUT", url: "/api/rules/Bad..Name/source", headers: as("owner"), payload: { source: custom } })).statusCode, 400);
  } finally {
    await app.close();
    t.cleanup();
  }
});

test("events stream pushes a message when something changes", async () => {
  const t = tempProject();
  const app = buildServer(t.cortex);
  try {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const port = (app.server.address() as { port: number }).port;
    const ctrl = new AbortController();
    const res = await fetch(`http://localhost:${port}/api/events`, { headers: { authorization: `Bearer ${t.init.tokens.owner}` }, signal: ctrl.signal });
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    t.cortex.activity.log(t.ai, { action: "investigation", summary: "Looking at the cart" });
    while (!text.includes("Looking at the cart")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    assert.match(text, /"type":"activity"/);
    ctrl.abort();
  } finally {
    await app.close();
    t.cleanup();
  }
});

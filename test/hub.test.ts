import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance, InjectOptions } from "fastify";
import { initProject } from "../src/core/init.js";
import { hashPassword } from "../src/hub/crypto.js";
import { Hub, HUB_COOKIE, buildHubServer } from "../src/hub/server.js";
import { HubStore } from "../src/hub/store.js";

// A hub with two projects and an organization admin (ada@example.com / correct-horse-1).
async function setup() {
  const root = mkdtempSync(join(tmpdir(), "cortex-hub-"));
  const store = HubStore.init(join(root, "hub"), { org: "Acme", host: "127.0.0.1", port: 4747 });
  const admin = store.createUser({ email: "ada@example.com", name: "Ada", org_admin: true });
  store.setPassword(admin.id, await hashPassword("correct-horse-1"));
  for (const id of ["shop", "blog"]) {
    const dir = join(root, id);
    initProject(dir, id, { language: "en", timezone: "UTC" });
    store.addProject({ id, name: id, path: dir });
  }
  const hub = new Hub(store);
  const app = buildHubServer(hub);
  const call = (o: InjectOptions & { cookie?: string; token?: string; csrf?: boolean }) =>
    app.inject({
      ...o,
      headers: {
        ...(o.headers ?? {}),
        ...(o.cookie ? { cookie: `${HUB_COOKIE}=${o.cookie}` } : {}),
        ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
        ...(o.csrf !== false && o.cookie ? { "x-cortex-csrf": "1" } : {}),
      },
    });
  const login = async (email: string, password: string) => {
    const r = await call({ method: "POST", url: "/api/auth/login", payload: { email, password } });
    assert.equal(r.statusCode, 200, r.body);
    return r.cookies.find((c) => c.name === HUB_COOKIE)!.value;
  };
  const cleanup = async () => {
    await app.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  };
  return { root, store, hub, app: app as FastifyInstance, call, login, admin, cleanup };
}

// Admin creates a person, they accept the invite and pick a password; returns their session.
async function invite(t: Awaited<ReturnType<typeof setup>>, adminCookie: string, email: string, name: string, projects: { id: string; role: string }[] = []) {
  const r = await t.call({ method: "POST", url: "/api/admin/users", cookie: adminCookie, payload: { email, name, projects } });
  assert.equal(r.statusCode, 201, r.body);
  const token = r.json().invite_url.split("/invite/")[1];
  const accepted = await t.call({ method: "POST", url: `/api/auth/invite/${token}`, payload: { password: "long-enough-pw" } });
  assert.equal(accepted.statusCode, 200, accepted.body);
  return { id: r.json().user.id as string, cookie: accepted.cookies.find((c) => c.name === HUB_COOKIE)!.value };
}

test("hub sign-in: password, session cookie, CSRF, rate limit, invites", async () => {
  const t = await setup();
  try {
    assert.equal((await t.call({ url: "/api/hub/me" })).statusCode, 401);
    assert.equal((await t.call({ method: "POST", url: "/api/auth/login", payload: { email: "ada@example.com", password: "wrong" } })).statusCode, 401);
    const cookie = await t.login("ADA@example.com", "correct-horse-1"); // email is case-insensitive
    const me = (await t.call({ url: "/api/hub/me", cookie })).json();
    assert.equal(me.principal.org_admin, true);
    assert.deepEqual(me.projects.map((p: { id: string }) => p.id).sort(), ["blog", "shop"], "org admins see every project");

    // Cookie writes need the CSRF header.
    assert.equal((await t.call({ method: "POST", url: "/api/admin/users", cookie, csrf: false, payload: {} })).statusCode, 403);

    // Invite: weak password refused, link works once.
    const r = await t.call({ method: "POST", url: "/api/admin/users", cookie, payload: { email: "bob@example.com", name: "Bob" } });
    const token = r.json().invite_url.split("/invite/")[1];
    assert.equal((await t.call({ url: `/api/auth/invite/${token}` })).json().email, "bob@example.com");
    assert.equal((await t.call({ method: "POST", url: `/api/auth/invite/${token}`, payload: { password: "short" } })).statusCode, 400);
    assert.equal((await t.call({ method: "POST", url: `/api/auth/invite/${token}`, payload: { password: "long-enough-pw" } })).statusCode, 200);
    assert.equal((await t.call({ method: "POST", url: `/api/auth/invite/${token}`, payload: { password: "long-enough-pw" } })).statusCode, 404);
    await t.login("bob@example.com", "long-enough-pw");

    // Disabled users lose their sessions and cannot sign in.
    const bob = t.store.userByEmail("bob@example.com")!;
    const bobCookie = await t.login("bob@example.com", "long-enough-pw");
    assert.equal((await t.call({ method: "PATCH", url: `/api/admin/users/${bob.id}`, cookie, payload: { disabled: true } })).statusCode, 200);
    assert.equal((await t.call({ url: "/api/hub/me", cookie: bobCookie })).statusCode, 401);
    assert.equal((await t.call({ method: "POST", url: "/api/auth/login", payload: { email: "bob@example.com", password: "long-enough-pw" } })).statusCode, 401);

    // Ten wrong passwords, then the door closes for a while (even for the right one).
    for (let i = 0; i < 10; i++) await t.call({ method: "POST", url: "/api/auth/login", payload: { email: "ada@example.com", password: "nope" } });
    assert.equal((await t.call({ method: "POST", url: "/api/auth/login", payload: { email: "ada@example.com", password: "correct-horse-1" } })).statusCode, 429);
  } finally {
    await t.cleanup();
  }
});

test("hub roles: non-members are out, viewers read and ask, members write, only admins manage", async () => {
  const t = await setup();
  try {
    const admin = await t.login("ada@example.com", "correct-horse-1");
    const eve = await invite(t, admin, "eve@example.com", "Eve");
    assert.equal((await t.call({ url: "/api/p/shop/brief", cookie: eve.cookie })).statusCode, 403, "not a member yet");
    assert.equal((await t.call({ url: "/api/admin/users", cookie: eve.cookie })).statusCode, 403, "not an org admin");
    assert.equal((await t.call({ url: "/api/hub/me", cookie: eve.cookie })).json().projects.length, 0);

    await t.call({ method: "PUT", url: `/api/p/shop/members/${eve.id}`, cookie: admin, payload: { role: "viewer" } });
    const brief = await t.call({ url: "/api/p/shop/brief", cookie: eve.cookie });
    assert.equal(brief.statusCode, 200);
    assert.equal(brief.json().you.role, "viewer");
    assert.equal((await t.call({ method: "POST", url: "/api/p/shop/items", cookie: eve.cookie, payload: { type: "task", title: "Nope" } })).statusCode, 403);
    assert.equal((await t.call({ method: "POST", url: "/api/p/shop/items", cookie: eve.cookie, payload: { type: "question", title: "Why?" } })).statusCode, 201);
    assert.equal((await t.call({ method: "PUT", url: "/api/p/shop/node/backend", cookie: eve.cookie, payload: { title: "B", summary: "x" } })).statusCode, 403);
    assert.equal((await t.call({ url: "/api/p/blog/brief", cookie: eve.cookie })).statusCode, 403, "membership is per project");

    await t.call({ method: "PUT", url: `/api/p/shop/members/${eve.id}`, cookie: admin, payload: { role: "member" } });
    const me = (await t.call({ url: "/api/p/shop/me", cookie: eve.cookie })).json();
    assert.equal(me.role, "member");
    assert.ok(me.perms.includes("write_knowledge") && !me.perms.includes("edit_rules"));
    assert.ok(me.actors.some((a: { id: string }) => a.id === eve.id), "hub members are actors in the project");
    const put = await t.call({ method: "PUT", url: "/api/p/shop/node/backend", cookie: eve.cookie, payload: { title: "Backend", summary: "Node API." } });
    assert.equal(put.statusCode, 200, "people write knowledge directly");
    assert.equal((await t.call({ method: "PUT", url: "/api/p/shop/rules/_global/source", cookie: eve.cookie, payload: { source: "rules: []\n" } })).statusCode, 403);
    assert.equal((await t.call({ method: "PUT", url: `/api/p/shop/members/${t.admin.id}`, cookie: eve.cookie, payload: { role: "viewer" } })).statusCode, 403);

    // The last owner cannot be removed.
    assert.equal((await t.call({ method: "PUT", url: `/api/p/shop/members/${t.admin.id}`, cookie: admin, payload: { role: "owner" } })).statusCode, 200);
    assert.equal((await t.call({ method: "DELETE", url: `/api/p/shop/members/${t.admin.id}`, cookie: admin })).statusCode, 409);
  } finally {
    await t.cleanup();
  }
});

test("hub visibility: 'own' scope and branch limits hide the rest of the project", async () => {
  const t = await setup();
  try {
    const admin = await t.login("ada@example.com", "correct-horse-1");
    const fe = await invite(t, admin, "fe@example.com", "Frontend Dev", [{ id: "shop", role: "member" }]);
    const own = await invite(t, admin, "own@example.com", "Contractor", [{ id: "shop", role: "member" }]);
    await t.call({ method: "PUT", url: `/api/p/shop/members/${fe.id}`, cookie: admin, payload: { branches: ["frontend"] } });
    await t.call({ method: "PUT", url: `/api/p/shop/members/${own.id}`, cookie: admin, payload: { scope: "own" } });

    const mk = async (title: string, category_path: string, assignee?: string) =>
      (await t.call({ method: "POST", url: "/api/p/shop/items", cookie: admin, payload: { type: "task", title, category_path, ...(assignee ? { assignee } : {}) } })).json().id;
    const feTask = await mk("Fix the cart button", "frontend");
    const beTask = await mk("Speed up checkout API", "backend");
    const ownTask = await mk("Write the invoice export", "backend", own.id);

    const titles = async (cookie: string) => (await t.call({ url: "/api/p/shop/items", cookie })).json().items.map((i: { title: string }) => i.title).sort();
    assert.deepEqual(await titles(fe.cookie), ["Fix the cart button"]);
    assert.deepEqual(await titles(own.cookie), ["Write the invoice export"]);
    assert.equal((await titles(admin)).length, 3);

    assert.equal((await t.call({ url: `/api/p/shop/items/${beTask}`, cookie: fe.cookie })).statusCode, 404, "hidden, not just forbidden");
    assert.equal((await t.call({ url: `/api/p/shop/items/${feTask}`, cookie: fe.cookie })).statusCode, 200);
    assert.equal((await t.call({ url: `/api/p/shop/items/${ownTask}`, cookie: own.cookie })).statusCode, 200);

    // Branch limits apply to the tree, nodes and search.
    const tree = (await t.call({ url: "/api/p/shop/tree?depth=1", cookie: fe.cookie })).json();
    assert.deepEqual(tree.node.children.map((c: { path: string }) => c.path), ["frontend"]);
    assert.equal((await t.call({ url: "/api/p/shop/node/backend", cookie: fe.cookie })).statusCode, 404);
    const found = (await t.call({ url: "/api/p/shop/search?q=checkout", cookie: fe.cookie })).json().results;
    assert.equal(found.length, 0);
    const adminFound = (await t.call({ url: "/api/p/shop/search?q=checkout", cookie: admin })).json().results;
    assert.ok(adminFound.some((h: { id?: string }) => h.id === beTask), "the item is there; the branch limit hides it");
    assert.equal((await t.call({ method: "POST", url: "/api/p/shop/items", cookie: fe.cookie, payload: { type: "task", title: "x", category_path: "backend" } })).statusCode, 404);

    // Partial views get no project-wide report.
    assert.equal((await t.call({ url: "/api/p/shop/report", cookie: fe.cookie })).statusCode, 403);
    assert.equal((await t.call({ url: "/api/p/shop/report", cookie: admin })).statusCode, 200);
  } finally {
    await t.cleanup();
  }
});

test("hub AI agents: tokens, reader / contributor / trusted, never approve", async () => {
  const t = await setup();
  try {
    const admin = await t.login("ada@example.com", "correct-horse-1");
    const mkAgent = async (id: string, role: string) => {
      const r = await t.call({ method: "POST", url: "/api/admin/agents", cookie: admin, payload: { id, projects: [{ id: "shop", role }] } });
      assert.equal(r.statusCode, 201, r.body);
      return r.json().token as string;
    };
    const reader = await mkAgent("scout", "reader");
    const contributor = await mkAgent("claude-code", "contributor");
    const trusted = await mkAgent("docs-bot", "trusted");
    assert.equal((await t.call({ method: "POST", url: "/api/admin/agents", cookie: admin, payload: { id: "claude-code" } })).statusCode, 409);

    assert.equal((await t.call({ url: "/api/p/shop/brief", token: reader })).statusCode, 200);
    assert.equal((await t.call({ method: "POST", url: "/api/p/shop/items", token: reader, payload: { type: "task", title: "x" } })).statusCode, 403);

    const node = { title: "Queue", summary: "Redis queue, 3 retries." };
    const draft = await t.call({ method: "PUT", url: "/api/p/shop/node/backend/queue", token: contributor, payload: node });
    assert.equal(draft.statusCode, 202, "contributor knowledge writes become drafts");
    assert.equal((await t.call({ method: "PUT", url: "/api/p/shop/node/backend/cache", token: trusted, payload: { title: "Cache", summary: "5 min." } })).statusCode, 200, "trusted writes directly");

    // An AI can never approve, whatever its role.
    assert.equal((await t.call({ method: "POST", url: `/api/p/shop/approvals/${draft.json().draft_id}/approve`, token: trusted })).statusCode, 403);
    assert.equal((await t.call({ method: "POST", url: `/api/p/shop/approvals/${draft.json().draft_id}/approve`, cookie: admin })).statusCode, 200);

    // Agents are scoped to their projects; rotating the token kills the old one.
    assert.equal((await t.call({ url: "/api/p/blog/brief", token: contributor })).statusCode, 403);
    const fresh = (await t.call({ method: "POST", url: "/api/admin/agents/claude-code/token", cookie: admin })).json().token;
    assert.equal((await t.call({ url: "/api/p/shop/brief", token: contributor })).statusCode, 401);
    assert.equal((await t.call({ url: "/api/p/shop/brief", token: fresh })).statusCode, 200);
    // Agents cannot use organization admin endpoints.
    assert.equal((await t.call({ url: "/api/admin/users", token: fresh })).statusCode, 403);
  } finally {
    await t.cleanup();
  }
});

test("hub projects: register a folder, create .cortex on request, unregister without touching files", async () => {
  const t = await setup();
  try {
    const admin = await t.login("ada@example.com", "correct-horse-1");
    const folder = join(t.root, "new-app");
    (await import("node:fs")).mkdirSync(folder);
    assert.equal((await t.call({ method: "POST", url: "/api/admin/projects", cookie: admin, payload: { path: folder } })).statusCode, 400, "needs init: true");
    const r = await t.call({ method: "POST", url: "/api/admin/projects", cookie: admin, payload: { path: folder, name: "New App", init: true, language: "tr" } });
    assert.equal(r.statusCode, 201, r.body);
    assert.equal(r.json().project.id, "new-app");
    const brief = (await t.call({ url: "/api/p/new-app/brief", cookie: admin })).json();
    assert.match(brief.rules.global[0], /Turkish/);
    assert.equal((await t.call({ method: "DELETE", url: "/api/admin/projects/new-app", cookie: admin })).statusCode, 200);
    assert.equal((await t.call({ url: "/api/p/new-app/brief", cookie: admin })).statusCode, 404);
    assert.ok((await import("node:fs")).existsSync(join(folder, ".cortex", "cortex.config.yaml")));
  } finally {
    await t.cleanup();
  }
});

test("MCP over the hub: same tools, and the agent's role still decides", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { remoteApi } = await import("../src/mcp/client.js");
  const { buildMcpServer } = await import("../src/mcp/server.js");
  const t = await setup();
  const mcp: { close: () => Promise<void> }[] = [];
  try {
    const admin = await t.login("ada@example.com", "correct-horse-1");
    const token = async (id: string, role: string) =>
      (await t.call({ method: "POST", url: "/api/admin/agents", cookie: admin, payload: { id, projects: [{ id: "shop", role }] } })).json().token as string;
    const writer = await token("claude-code", "contributor");
    const reader = await token("scout", "reader");
    await t.app.listen({ port: 0, host: "127.0.0.1" });
    const url = `http://127.0.0.1:${(t.app.server.address() as { port: number }).port}`;

    const connect = async (tok: string) => {
      const server = buildMcpServer(remoteApi(url, "shop", tok));
      const [a, b] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test", version: "1" });
      await Promise.all([server.connect(a), client.connect(b)]);
      mcp.push(client);
      return client;
    };
    const call = async (c: Awaited<ReturnType<typeof connect>>, name: string, args: Record<string, unknown> = {}) => {
      const r = (await c.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
      return { error: r.isError === true, data: JSON.parse(r.content[0].text) };
    };

    const agent = await connect(writer);
    assert.equal((await agent.listTools()).tools.length, 18, "the same tool set as a local project");
    const brief = await call(agent, "cortex_brief");
    assert.equal(brief.data.you.id, "claude-code");
    assert.equal(brief.data.you.role, "contributor");

    const wrote = await call(agent, "cortex_update_node", { path: "backend/queue", title: "Kuyruk", summary: "Redis.", reason: "documenting" });
    assert.equal(wrote.data.applied, false, "a contributor's knowledge write waits for approval");
    const item = await call(agent, "cortex_create_item", { type: "task", title: "From MCP over the hub", fields: {} });
    assert.equal(item.data.applied, true);

    const scout = await connect(reader);
    const refused = await call(scout, "cortex_create_item", { type: "task", title: "Nope", fields: {} });
    assert.equal(refused.error, true);
    assert.equal(refused.data.error.code, "forbidden");
    assert.equal(refused.data.error.hint.needs, "write_items");
    assert.equal((await call(scout, "cortex_brief")).data.you.role, "reader");

    // A wrong token is refused, and an unreachable hub says so instead of hanging.
    const stranger = await connect("ctx_nope");
    assert.equal((await call(stranger, "cortex_brief")).data.error.code, "unauthorized");
  } finally {
    for (const c of mcp) await c.close();
    await t.cleanup();
  }
});

test("MCP over HTTP: an AI that is not on this machine gets the same tools and the same role", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const t = await setup();
  const clients: { close: () => Promise<void> }[] = [];
  try {
    const admin = await t.login("ada@example.com", "correct-horse-1");
    const token = (await t.call({ method: "POST", url: "/api/admin/agents", cookie: admin, payload: { id: "remote-bot", projects: [{ id: "shop", role: "contributor" }] } })).json().token;
    await t.app.listen({ port: 0, host: "127.0.0.1" });
    const url = `http://127.0.0.1:${(t.app.server.address() as { port: number }).port}`;

    const connect = async (tok: string, project = "shop") => {
      const client = new Client({ name: "remote", version: "1" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp/p/${project}`), { requestInit: { headers: { authorization: `Bearer ${tok}` } } }));
      clients.push(client);
      return client;
    };
    const call = async (c: Awaited<ReturnType<typeof connect>>, name: string, args: Record<string, unknown> = {}) => {
      const r = (await c.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
      return { error: r.isError === true, data: JSON.parse(r.content[0].text) };
    };

    const bot = await connect(token);
    assert.equal((await bot.listTools()).tools.length, 18);
    const brief = await call(bot, "cortex_brief");
    assert.equal(brief.data.you.id, "remote-bot");
    assert.equal(brief.data.you.role, "contributor");
    assert.equal((await call(bot, "cortex_update_node", { path: "backend/x", title: "X", summary: "y", reason: "test" })).data.applied, false, "still a draft");
    assert.equal((await call(bot, "cortex_create_item", { type: "task", title: "Over HTTP", fields: {} })).data.applied, true);

    // Wrong token and a project the agent is not in are refused at connect time.
    await assert.rejects(() => connect("ctx_nope"), /Unknown or disabled agent token/);
    await assert.rejects(() => connect(token, "blog"), /not a member/);
  } finally {
    for (const c of clients) await c.close();
    await t.cleanup();
  }
});

test("a project's owner can invite people and create agent tokens, without becoming an org admin", async () => {
  const t = await setup();
  try {
    const admin = await t.login("ada@example.com", "correct-horse-1");
    const lead = await invite(t, admin, "lead@example.com", "Mobil Lider", [{ id: "shop", role: "owner" }]);
    const worker = await invite(t, admin, "dev@example.com", "Geliştirici", [{ id: "shop", role: "member" }]);

    // A member cannot; the owner can.
    assert.equal((await t.call({ method: "POST", url: "/api/p/shop/members/invite", cookie: worker.cookie, payload: { email: "x@example.com", name: "X" } })).statusCode, 403);
    const r = await t.call({ method: "POST", url: "/api/p/shop/members/invite", cookie: lead.cookie, payload: { email: "yeni@example.com", name: "Yeni Kişi", role: "member", scope: "own" } });
    assert.equal(r.statusCode, 201, r.body);
    assert.match(r.json().invite_url, /\/invite\/inv_/);
    const created = t.store.userByEmail("yeni@example.com")!;
    assert.equal(created.org_admin, false, "a project owner never hands out organization admin");
    assert.deepEqual(t.store.memberships(created.id).map((m) => m.project_id), ["shop"], "only the project they run");
    assert.equal(t.store.member("shop", created.id)!.scope, "own");
    assert.equal((await t.call({ url: "/api/admin/users", cookie: lead.cookie })).statusCode, 403, "still not an org admin");

    // Inviting someone who already has an account just adds them; no new password link.
    const again = await t.call({ method: "POST", url: "/api/p/shop/members/invite", cookie: lead.cookie, payload: { email: "dev@example.com", name: "Geliştirici", role: "viewer" } });
    assert.equal(again.json().invite_url, undefined);
    assert.equal(t.store.member("shop", worker.id)!.role, "viewer");

    // Agents: created, listed and rotated by the project owner, scoped to this project.
    const agent = await t.call({ method: "POST", url: "/api/p/shop/agents", cookie: lead.cookie, payload: { id: "shop-bot", name: "Shop Bot", role: "contributor" } });
    assert.equal(agent.statusCode, 201, agent.body);
    const token = agent.json().token;
    assert.equal((await t.call({ url: "/api/p/shop/brief", token })).statusCode, 200);
    assert.equal((await t.call({ url: "/api/p/blog/brief", token })).statusCode, 403, "the new agent sees only this project");
    assert.deepEqual((await t.call({ url: "/api/p/shop/agents", cookie: lead.cookie })).json().agents.map((a: { id: string }) => a.id), ["shop-bot"]);

    const rotated = (await t.call({ method: "POST", url: "/api/p/shop/agents/shop-bot/token", cookie: lead.cookie })).json().token;
    assert.equal((await t.call({ url: "/api/p/shop/brief", token })).statusCode, 401, "the old token stopped working");
    assert.equal((await t.call({ url: "/api/p/shop/brief", token: rotated })).statusCode, 200);

    // Another project's owner cannot touch this agent's token.
    await t.call({ method: "PUT", url: `/api/p/blog/members/${lead.id}`, cookie: admin, payload: { role: "owner" } });
    assert.equal((await t.call({ method: "POST", url: "/api/p/blog/agents/shop-bot/token", cookie: lead.cookie })).statusCode, 404);
  } finally {
    await t.cleanup();
  }
});

test("usage meter: counts each call once, per person and per agent, and stays out of the projects", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const t = await setup();
  const clients: { close: () => Promise<void> }[] = [];
  try {
    const admin = await t.login("ada@example.com", "correct-horse-1");
    const token = (await t.call({ method: "POST", url: "/api/admin/agents", cookie: admin, payload: { id: "meter-bot", projects: [{ id: "shop", role: "contributor" }] } })).json().token;
    await t.app.listen({ port: 0, host: "127.0.0.1" });
    const url = `http://127.0.0.1:${(t.app.server.address() as { port: number }).port}`;

    // A person browsing, and an agent working over MCP.
    await t.call({ url: "/api/p/shop/brief", cookie: admin });
    await t.call({ url: "/api/p/shop/items", cookie: admin });
    const client = new Client({ name: "meter", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp/p/shop`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    clients.push(client);
    await client.callTool({ name: "cortex_brief", arguments: {} });
    await client.callTool({ name: "cortex_search", arguments: { q: "backend" } });

    const usage = (await t.call({ url: "/api/admin/usage?since=7d", cookie: admin })).json();
    const bot = usage.by_principal.find((r: { principal: string }) => r.principal === "meter-bot");
    const person = usage.by_principal.find((r: { principal: string }) => r.principal === t.admin.id);
    assert.equal(bot.calls, 2, "one row per tool call, not one per inner request");
    assert.equal(bot.kind, "ai");
    assert.ok(bot.tokens > 0 && bot.tokens === Math.round(bot.bytes / 4));
    assert.equal(person.calls, 2, "people are metered too");
    assert.ok(usage.by_route.some((r: { route: string }) => r.route.startsWith("MCP GET /brief")), "the route says which tool it was");
    assert.equal(usage.totals.calls, 4);
    assert.equal(usage.daily.length, 1);

    // Per project, for whoever may read that project's reports; and never mixed with another project.
    const mine = (await t.call({ url: "/api/p/shop/usage?since=7d", cookie: admin })).json();
    assert.equal(mine.totals.calls, usage.totals.calls);
    assert.equal((await t.call({ url: "/api/p/blog/usage?since=7d", cookie: admin })).json().totals.calls, 0);

    // A member without report rights cannot look, and the numbers never enter the project's files.
    const eve = await invite(t, admin, "eve@example.com", "Eve", [{ id: "shop", role: "member" }]);
    await t.call({ method: "PUT", url: `/api/p/shop/members/${eve.id}`, cookie: admin, payload: { role: "member", scope: "own" } });
    assert.equal((await t.call({ url: "/api/p/shop/usage", cookie: eve.cookie })).statusCode, 403, "partial views get no project-wide numbers");
    assert.equal((await t.call({ url: "/api/admin/usage", cookie: eve.cookie })).statusCode, 403);
    assert.equal(t.hub.cortex("shop").index.queryActivity({ includeSystem: true, limit: 100 }).filter((a) => a.summary.includes("usage")).length, 0);
  } finally {
    for (const c of clients) await c.close();
    await t.cleanup();
  }
});

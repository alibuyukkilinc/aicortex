import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/api/server.js";
import { buildMcpServer } from "../src/mcp/server.js";
import { tempProject } from "./helpers.js";

test("REST: auth, host check, brief, draft flow", async () => {
  const t = tempProject();
  const app = buildServer(t.cortex);
  const H = (token?: string, host = "localhost:4747") => ({ host, ...(token ? { authorization: `Bearer ${token}` } : {}) });
  try {
    assert.equal((await app.inject({ url: "/api/health", headers: H() })).statusCode, 200);
    assert.equal((await app.inject({ url: "/api/brief", headers: H() })).statusCode, 401);
    assert.equal((await app.inject({ url: "/api/brief", headers: H("wrong") })).statusCode, 401);
    assert.equal((await app.inject({ url: "/api/brief", headers: H(t.init.tokens.owner, "evil.com") })).statusCode, 403);

    const brief = await app.inject({ url: "/api/brief", headers: H(t.init.tokens["ai-agent"]) });
    assert.equal(brief.statusCode, 200);
    assert.equal(brief.json().you.id, "ai-agent");
    assert.match(brief.json()._meta.rules_version, /^r-[0-9a-f]{8}$/);

    const put = await app.inject({
      method: "PUT",
      url: "/api/node/backend/cache",
      headers: H(t.init.tokens["ai-agent"]),
      payload: { title: "Cache", summary: "Redis, 5 min TTL.", reason: "documenting" },
    });
    assert.equal(put.statusCode, 202);
    const draftId = put.json().draft_id;

    assert.equal((await app.inject({ method: "POST", url: `/api/approvals/${draftId}/approve`, headers: H(t.init.tokens["ai-agent"]) })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: `/api/approvals/${draftId}/approve`, headers: H(t.init.tokens.owner) })).statusCode, 200);

    const node = await app.inject({ url: "/api/node/backend/cache", headers: H(t.init.tokens.owner) });
    assert.equal(node.json().node.summary, "Redis, 5 min TTL.");

    const tree = await app.inject({ url: "/api/tree/backend?depth=1", headers: H(t.init.tokens.owner) });
    assert.equal(tree.json().node.children[0].path, "backend/cache");

    const search = await app.inject({ url: "/api/search?q=redis", headers: H(t.init.tokens.owner) });
    assert.equal(search.json().results[0].path, "backend/cache");

    const bad = await app.inject({ method: "PUT", url: "/api/node/backend/x", headers: H(t.init.tokens.owner), payload: { title: "x" } });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, "invalid_node");
    assert.ok(bad.json().error.hint.example);

    assert.equal((await app.inject({ url: "/api/rules/node", headers: H(t.init.tokens.owner) })).json().rules.node.type, "node");
  } finally {
    await app.close();
    t.cleanup();
  }
});

test("MCP: tools list and a brief -> search -> update round trip", async () => {
  const t = tempProject();
  const server = buildMcpServer(t.cortex, t.ai);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  try {
    await Promise.all([server.connect(a), client.connect(b)]);
    const tools = (await client.listTools()).tools.map((x) => x.name).sort();
    assert.deepEqual(tools, ["cortex_brief", "cortex_node", "cortex_rules", "cortex_search", "cortex_tree", "cortex_update_node"]);

    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
      return { isError: !!r.isError, data: JSON.parse(r.content[0].text) };
    };

    assert.equal((await call("cortex_brief")).data.you.id, "ai-agent");
    const up = await call("cortex_update_node", {
      path: "server/deploy",
      title: "Deploy",
      summary: "GitHub Actions to a VPS.",
      code_files: [{ file: ".github/workflows/deploy.yml" }],
      reason: "documenting deploy",
    });
    assert.equal(up.data.applied, false);
    t.cortex.approve(t.human, up.data.draft_id);
    assert.equal((await call("cortex_search", { q: "vps" })).data.results[0].path, "server/deploy");
    assert.equal((await call("cortex_node", { path: "server/deploy" })).data.node.links.code[0].file, ".github/workflows/deploy.yml");

    const missing = await call("cortex_node", { path: "server/nope" });
    assert.equal(missing.isError, true);
    assert.equal(missing.data.error.code, "not_found");
  } finally {
    await client.close();
    t.cleanup();
  }
});

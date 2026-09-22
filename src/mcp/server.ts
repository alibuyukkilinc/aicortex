import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Cortex } from "../core/cortex.js";
import { Actor, CortexError } from "../core/types.js";

// Compact JSON: every byte here is a token the AI pays for.
function result(data: object, meta: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ ...data, _meta: meta }) }] };
}

function wrap<A>(cortex: Cortex, fn: (args: A) => object) {
  return async (args: A) => {
    try {
      return result(fn(args), cortex.meta());
    } catch (e) {
      const err = e instanceof CortexError ? { code: e.code, message: e.message, hint: e.hint } : { code: "internal", message: String(e) };
      return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: err }) }] };
    }
  };
}

export function buildMcpServer(cortex: Cortex, actor: Actor): McpServer {
  const server = new McpServer(
    { name: "cortex", version: "0.1.0" },
    {
      instructions:
        "Cortex is this project's shared brain. Call cortex_brief first. Navigate with cortex_tree (summaries only), " +
        "search with cortex_search, and read full detail with cortex_node only when needed. Never try to load everything.",
    },
  );

  server.registerTool(
    "cortex_brief",
    {
      description: "Session opener (~500 tokens): project summary, top-level branches, items needing your attention, global rules. Call this first.",
      inputSchema: {},
    },
    wrap(cortex, () => cortex.brief(actor)),
  );

  server.registerTool(
    "cortex_tree",
    {
      description: "Open a branch of the knowledge tree. Returns titles and summaries only, never bodies. Use depth 1 unless you need more.",
      inputSchema: {
        path: z.string().default("").describe('Branch path, e.g. "backend/auth". Empty string = root.'),
        depth: z.number().int().min(0).max(5).default(1),
        budget: z.number().int().positive().optional().describe("Approximate max tokens for the response."),
      },
    },
    wrap(cortex, (a: { path: string; depth: number; budget?: number }) => cortex.treeView(a.path, a.depth, a.budget)),
  );

  server.registerTool(
    "cortex_node",
    {
      description: "Read one knowledge node in full (summary, body, code links). Use after tree/search told you it is relevant.",
      inputSchema: { path: z.string().describe('Node path, e.g. "backend/auth/jwt-refresh".') },
    },
    wrap(cortex, (a: { path: string }) => ({ node: cortex.node(a.path) })),
  );

  server.registerTool(
    "cortex_search",
    {
      description: "Search the knowledge tree (Turkish and English). Returns paths and summaries. Use before changing anything you don't fully understand.",
      inputSchema: {
        q: z.string().min(1),
        path: z.string().optional().describe("Limit to this branch."),
        limit: z.number().int().min(1).max(50).default(10),
        budget: z.number().int().positive().optional(),
      },
    },
    wrap(cortex, (a: { q: string; path?: string; limit: number; budget?: number }) =>
      cortex.search(a.q, { under: a.path, limit: a.limit, budget: a.budget }),
    ),
  );

  server.registerTool(
    "cortex_update_node",
    {
      description:
        "Create or update a knowledge node. Parents must exist first. Depending on project rules your write may become a draft that a human approves. Always give a reason.",
      inputSchema: {
        path: z.string(),
        title: z.string().max(120),
        summary: z.string().max(300).describe("What another AI reads first. Short and actionable."),
        body: z.string().default(""),
        tags: z.array(z.string()).optional(),
        code_files: z.array(z.object({ file: z.string(), lines: z.string().optional() })).optional(),
        verified_at_commit: z.string().optional(),
        reason: z.string().describe("Why you are making this change."),
      },
    },
    wrap(cortex, (a: { path: string; title: string; summary: string; body: string; tags?: string[]; code_files?: { file: string; lines?: string }[]; verified_at_commit?: string; reason: string }) => {
      const { code_files, ...rest } = a;
      return cortex.putNode(actor, { ...rest, links: code_files ? { code: code_files } : undefined });
    }),
  );

  server.registerTool(
    "cortex_rules",
    {
      description: "Read the project rules and schemas set by humans. Only needed when _meta.rules_version changed or a write was rejected.",
      inputSchema: { name: z.string().optional().describe('e.g. "node" or "_global". Omit for all.') },
    },
    wrap(cortex, (a: { name?: string }) => cortex.rules(a.name)),
  );

  return server;
}

export async function runMcpStdio(cortex: Cortex, actor: Actor): Promise<void> {
  const server = buildMcpServer(cortex, actor);
  await server.connect(new StdioServerTransport());
}

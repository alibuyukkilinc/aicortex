import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Cortex } from "../core/cortex.js";
import { Actor, CortexError } from "../core/types.js";
import { ActivityInput } from "../core/activity.js";
import { CreateItemInput, ReplyInput, UpdateItemInput } from "../core/items.js";
import { DocKind } from "../index/db.js";

// Compact JSON: every byte here is a token the AI pays for.
function result(data: object, meta: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ ...data, _meta: meta }) }] };
}

function wrap<A>(cortex: Cortex, fn: (args: A) => object | Promise<object>) {
  return async (args: A) => {
    try {
      return result(await fn(args), cortex.meta());
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
        "Cortex is this project's shared brain. Call cortex_brief first, then cortex_inbox. Navigate with cortex_tree (summaries only), " +
        "search with cortex_search, and read full detail with cortex_node only when needed. Never try to load everything. " +
        "Before editing files call cortex_code_context; knowledge marked stale may be wrong. " +
        "After each meaningful change call cortex_log_activity. When unsure, cortex_ask instead of guessing.",
    },
  );

  server.registerTool(
    "cortex_brief",
    {
      description: "Session opener (~600 tokens): project summary, top-level branches, your inbox, recent activity, global rules. Call this first.",
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
      description:
        "Read one knowledge node in full (summary, body, code links). If its code changed since it was written, " +
        "the response includes `staleness` with the changed files and commits: do not trust it blindly.",
      inputSchema: { path: z.string().describe('Node path, e.g. "backend/auth/jwt-refresh".') },
    },
    wrap(cortex, (a: { path: string }) => cortex.nodeView(a.path)),
  );

  server.registerTool(
    "cortex_code_context",
    {
      description:
        "Before editing files: which knowledge nodes, decisions and open items cover them. Accepts files or directories " +
        "relative to the project root. Tells you what to keep consistent and what to update afterwards.",
      inputSchema: { files: z.array(z.string()).min(1).max(50) },
    },
    wrap(cortex, (a: { files: string[] }) => cortex.codeContext(a.files)),
  );

  server.registerTool(
    "cortex_verify_node",
    {
      description:
        "Mark a knowledge node as still accurate at the current commit (clears staleness) without changing its content. " +
        "Only after you actually checked the code. May become a draft for human approval.",
      inputSchema: { path: z.string(), note: z.string().optional().describe("What you checked") },
    },
    wrap(cortex, (a: { path: string; note?: string }) => cortex.verifyNode(actor, a.path, a.note)),
  );

  server.registerTool(
    "cortex_search",
    {
      description:
        "Search knowledge nodes, items (decisions, issues, questions...) and activity in Turkish or English. Returns short summaries only. " +
        "Use before changing anything you don't fully understand, and to find out why something was done.",
      inputSchema: {
        q: z.string().min(1),
        kind: z.array(z.enum(["node", "item", "activity"])).optional().describe("Default: all. 'item' covers decisions, issues, questions, tasks, notes."),
        type: z.string().optional().describe('Item type filter, e.g. "decision" to answer "why did we do X?"'),
        path: z.string().optional().describe("Limit to this branch."),
        limit: z.number().int().min(1).max(50).default(10),
        budget: z.number().int().positive().optional(),
      },
    },
    wrap(cortex, (a: { q: string; kind?: DocKind[]; type?: string; path?: string; limit: number; budget?: number }) =>
      cortex.search(a.q, { kinds: a.kind, type: a.type, under: a.path, limit: a.limit, budget: a.budget }),
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

  // ---- items ----------------------------------------------------------------

  server.registerTool(
    "cortex_inbox",
    {
      description: "Everything waiting on you: questions and issues assigned to you or to @ai, answers to your questions, new replies on your items.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(20) },
    },
    wrap(cortex, (a: { limit: number }) => cortex.items.inbox(actor, a.limit)),
  );

  server.registerTool(
    "cortex_items",
    {
      description: "List items (task, issue, question, note, decision or custom types) without bodies. Filter to keep it small.",
      inputSchema: {
        type: z.string().optional(),
        status: z.string().optional(),
        assignee: z.string().optional().describe('Actor id, "@humans" or "@ai"'),
        author: z.string().optional(),
        path: z.string().optional().describe("Items filed under this knowledge branch"),
        open: z.boolean().optional().describe("true = not in a terminal status"),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().optional(),
      },
    },
    wrap(cortex, (a: Parameters<Cortex["items"]["list"]>[0]) => cortex.items.list(a)),
  );

  server.registerTool(
    "cortex_item",
    {
      description: "Read one item with its replies (newest kept when trimmed). The response names the rules for its type.",
      inputSchema: {
        id: z.string(),
        replies: z.number().int().min(0).max(200).optional().describe("Keep only the last N replies"),
        budget: z.number().int().positive().optional(),
      },
    },
    wrap(cortex, (a: { id: string; replies?: number; budget?: number }) => cortex.items.get(a.id, { replies: a.replies, budget: a.budget })),
  );

  server.registerTool(
    "cortex_create_item",
    {
      description:
        "Create a task, issue, question, note or decision. Type-specific fields go in `fields` and follow the rules for that type " +
        "(call cortex_rules with the type if unsure; a rejected write returns the rules and an example).",
      inputSchema: {
        type: z.string().describe("task | issue | question | note | decision | a custom type"),
        title: z.string().max(160),
        body: z.string().default(""),
        category_path: z.string().optional().describe('Knowledge tree path this belongs to, e.g. "backend/auth"'),
        assignee: z.string().optional().describe('Actor id, "@humans" or "@ai"'),
        tags: z.array(z.string()).optional(),
        links: z
          .object({
            nodes: z.array(z.string()).optional(),
            items: z.array(z.string()).optional(),
            activity: z.array(z.string()).optional(),
            code: z.array(z.object({ file: z.string(), lines: z.string().optional() })).optional(),
          })
          .optional(),
        fields: z.record(z.string(), z.unknown()).default({}),
        reason: z.string().optional(),
      },
    },
    wrap(cortex, (a: CreateItemInput) => cortex.items.create(actor, a)),
  );

  server.registerTool(
    "cortex_update_item",
    {
      description: "Change an item: status (must follow the allowed transitions), assignee, title, body, fields (merged; null removes).",
      inputSchema: {
        id: z.string(),
        status: z.string().optional(),
        title: z.string().max(160).optional(),
        body: z.string().optional(),
        assignee: z.string().nullable().optional(),
        category_path: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
        reason: z.string().optional(),
      },
    },
    wrap(cortex, ({ id, ...rest }: { id: string } & UpdateItemInput) => cortex.items.update(actor, id, rest)),
  );

  server.registerTool(
    "cortex_reply",
    {
      description: "Reply on an item. Some replies change status automatically (answering a question marks it answered). Reply fields follow the type's rules (e.g. a 'fixed' issue needs commits and files).",
      inputSchema: {
        id: z.string(),
        body: z.string().min(1),
        fields: z.record(z.string(), z.unknown()).default({}),
        status: z.string().optional().describe("Optionally move the item in the same step"),
      },
    },
    wrap(cortex, ({ id, ...rest }: { id: string } & ReplyInput) => cortex.items.reply(actor, id, rest)),
  );

  server.registerTool(
    "cortex_ask",
    {
      description:
        "Ask a question about an activity entry, an item or a knowledge node. It is routed to whoever made it. " +
        "Use this instead of guessing; set blocking=true if you cannot continue without the answer.",
      inputSchema: {
        about: z.string().describe("Activity id, item id or knowledge node path"),
        title: z.string().max(160).describe("The question itself"),
        body: z.string().optional(),
        assignee: z.string().optional().describe("Override who should answer"),
        blocking: z.boolean().optional(),
      },
    },
    wrap(cortex, (a: { about: string; title: string; body?: string; assignee?: string; blocking?: boolean }) => cortex.items.ask(actor, a)),
  );

  // ---- activity -------------------------------------------------------------

  server.registerTool(
    "cortex_log_activity",
    {
      description:
        "Record what you did and WHY, after each meaningful change. Humans read this feed to stay in control and may ask you about any entry.",
      inputSchema: {
        action: z.string().describe("code_change | fix | refactor | investigation | config | deploy | docs | other"),
        summary: z.string().max(200).describe("What changed, one line"),
        why: z.string().optional().describe("The reason. Required for code changes, fixes, refactors, config and deploys."),
        files: z.array(z.string()).optional(),
        commit: z.string().optional(),
        refs: z.array(z.string()).optional().describe("Related item ids or knowledge node paths"),
      },
    },
    wrap(cortex, (a: ActivityInput) => cortex.activity.log(actor, a)),
  );

  server.registerTool(
    "cortex_activity",
    {
      description: "Read the activity feed (newest first). Filter by actor, related item/node, or time.",
      inputSchema: {
        since: z.string().optional().describe("ISO date or datetime"),
        actor: z.string().optional(),
        ref: z.string().optional().describe("Item id or node path"),
        include_system: z.boolean().optional().describe("Include Cortex's own audit entries"),
        limit: z.number().int().min(1).max(200).default(20),
      },
    },
    wrap(cortex, (a: Parameters<Cortex["activity"]["list"]>[0]) => cortex.activity.list(a)),
  );

  return server;
}

export async function runMcpStdio(cortex: Cortex, actor: Actor): Promise<void> {
  const server = buildMcpServer(cortex, actor);
  await server.connect(new StdioServerTransport());
}

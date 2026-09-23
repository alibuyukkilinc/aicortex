import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CortexError } from "../core/types.js";
import type { ActivityInput } from "../core/activity.js";
import type { ClaimInput, CreateItemInput, ReplyInput, UpdateItemInput } from "../core/items.js";
import type { DocKind } from "../index/db.js";
import type { McpApi } from "./client.js";

// Compact JSON: every byte here is a token the AI pays for.
function result(data: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function wrap<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return result((await fn(args)) as object);
    } catch (e) {
      const err = e instanceof CortexError ? { code: e.code, message: e.message, hint: e.hint } : { code: "internal", message: String(e) };
      return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: err }) }] };
    }
  };
}

const path = (p: string) => (p ? `/${p.split("/").map(encodeURIComponent).join("/")}` : "");

export function buildMcpServer(api: McpApi): McpServer {
  const get = (p: string, q?: Record<string, unknown>) => api.call("GET", p, { query: q });
  const server = new McpServer(
    { name: "cortex", version: "0.1.0" },
    {
      instructions:
        `Cortex is the shared brain of ${api.where}. Call cortex_brief first, then cortex_inbox. Navigate with cortex_tree (summaries only), ` +
        "search with cortex_search, and read full detail with cortex_node only when needed. Never try to load everything. " +
        "Before editing files call cortex_code_context; knowledge marked stale may be wrong. " +
        "After each meaningful change call cortex_log_activity. When unsure, cortex_ask instead of guessing. " +
        "On a team server your role decides what you may write and what you can see; a refusal explains which permission is missing.",
    },
  );

  server.registerTool(
    "cortex_brief",
    {
      description: "Session opener (under 800 tokens): project summary, top-level branches, your inbox, recent activity, global rules. Call this first.",
      inputSchema: { budget: z.number().int().positive().optional().describe("Approximate max tokens; summaries and lists are trimmed to fit.") },
    },
    wrap((a: { budget?: number }) => get("/brief", { budget: a.budget })),
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
    wrap((a: { path: string; depth: number; budget?: number }) => get(`/tree${path(a.path)}`, { depth: a.depth, budget: a.budget })),
  );

  server.registerTool(
    "cortex_node",
    {
      description:
        "Read one knowledge node in full (summary, body, code links). If its code changed since it was written, " +
        "the response includes `staleness` with the changed files and commits: do not trust it blindly.",
      inputSchema: { path: z.string().describe('Node path, e.g. "backend/auth/jwt-refresh".') },
    },
    wrap((a: { path: string }) => get(`/node${path(a.path)}`)),
  );

  server.registerTool(
    "cortex_code_context",
    {
      description:
        "Before editing files: which knowledge nodes, decisions and open items cover them. Accepts files or directories " +
        "relative to the project root. Tells you what to keep consistent and what to update afterwards.",
      inputSchema: { files: z.array(z.string()).min(1).max(50) },
    },
    wrap((a: { files: string[] }) => get("/code", { files: a.files })),
  );

  server.registerTool(
    "cortex_verify_node",
    {
      description:
        "Mark a knowledge node as still accurate at the current commit (clears staleness) without changing its content. " +
        "Only after you actually checked the code. May become a draft for human approval.",
      inputSchema: { path: z.string(), note: z.string().optional().describe("What you checked") },
    },
    wrap((a: { path: string; note?: string }) => api.call("POST", `/verify${path(a.path)}`, { body: { note: a.note } })),
  );

  server.registerTool(
    "cortex_search",
    {
      description:
        "Search knowledge nodes, items (decisions, issues, questions...) and activity in Turkish or English. Returns short summaries only. " +
        "Use before changing anything you don't fully understand, and to find out why something was done.",
      inputSchema: {
        q: z.string().min(1),
        kind: z
          .array(z.enum(["node", "item", "activity"]))
          .optional()
          .describe("Default: all. 'item' covers decisions, issues, questions, tasks, notes."),
        type: z.string().optional().describe('Item type filter, e.g. "decision" to answer "why did we do X?"'),
        path: z.string().optional().describe("Limit to this branch."),
        limit: z.number().int().min(1).max(50).default(10),
        budget: z.number().int().positive().optional(),
      },
    },
    wrap((a: { q: string; kind?: DocKind[]; type?: string; path?: string; limit: number; budget?: number }) =>
      get("/search", { q: a.q, kind: a.kind, type: a.type, path: a.path, limit: a.limit, budget: a.budget }),
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
    wrap(
      (a: {
        path: string;
        title: string;
        summary: string;
        body: string;
        tags?: string[];
        code_files?: { file: string; lines?: string }[];
        verified_at_commit?: string;
        reason: string;
      }) => {
        const { code_files, path: p, ...rest } = a;
        return api.call("PUT", `/node${path(p)}`, { body: { ...rest, ...(code_files ? { links: { code: code_files } } : {}) } });
      },
    ),
  );

  server.registerTool(
    "cortex_rules",
    {
      description: "Read the project rules and schemas set by humans. Only needed when _meta.rules_version changed or a write was rejected.",
      inputSchema: { name: z.string().optional().describe('e.g. "node" or "_global". Omit for all.') },
    },
    wrap((a: { name?: string }) => get(a.name ? `/rules/${encodeURIComponent(a.name)}` : "/rules")),
  );

  // ---- items ----------------------------------------------------------------

  server.registerTool(
    "cortex_inbox",
    {
      description: "Everything waiting on you: questions and issues assigned to you or to @ai, answers to your questions, new replies on your items.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(20) },
    },
    wrap((a: { limit: number }) => get("/inbox", { limit: a.limit })),
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
    wrap((a: Record<string, unknown>) => get("/items", a)),
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
    wrap((a: { id: string; replies?: number; budget?: number }) => get(`/items/${encodeURIComponent(a.id)}`, { replies: a.replies, budget: a.budget })),
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
    wrap((a: CreateItemInput) => api.call("POST", "/items", { body: a })),
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
        if_rev: z
          .string()
          .optional()
          .describe("The _rev you last read from cortex_item. If the item changed since, this fails with a 409 conflict instead of silently overwriting."),
      },
    },
    wrap(({ id, ...rest }: { id: string } & UpdateItemInput) => api.call("PATCH", `/items/${encodeURIComponent(id)}`, { body: rest })),
  );

  server.registerTool(
    "cortex_claim",
    {
      description:
        "Claim an item to say you are actively working it right now, or release it when you stop. Separate from `assignee` " +
        "(who it belongs to): a claim is how a specific actor signals current ownership so another agent does not collide with you. " +
        "Claiming an item someone else holds fails with a 409 naming them, unless their claim is stale (2h) or you are a human using force. " +
        "Always applies directly, never becomes a draft.",
      inputSchema: {
        id: z.string(),
        action: z.enum(["claim", "release"]),
        note: z.string().max(500).optional().describe("Handoff note: where you left off, or what's left. Visible to whoever reads the item next."),
        force: z.boolean().optional().describe("Humans only: take over a claim someone else actively holds."),
      },
    },
    wrap(({ id, ...rest }: { id: string } & ClaimInput) => api.call("POST", `/items/${encodeURIComponent(id)}/claim`, { body: rest })),
  );

  server.registerTool(
    "cortex_reply",
    {
      description:
        "Reply on an item. Some replies change status automatically (answering a question marks it answered). Reply fields follow the type's rules (e.g. a 'fixed' issue needs commits and files).",
      inputSchema: {
        id: z.string(),
        body: z.string().min(1),
        fields: z.record(z.string(), z.unknown()).default({}),
        status: z.string().optional().describe("Optionally move the item in the same step"),
      },
    },
    wrap(({ id, ...rest }: { id: string } & ReplyInput) => api.call("POST", `/items/${encodeURIComponent(id)}/replies`, { body: rest })),
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
    wrap((a: { about: string; title: string; body?: string; assignee?: string; blocking?: boolean }) => api.call("POST", "/ask", { body: a })),
  );

  server.registerTool(
    "cortex_report",
    {
      description:
        "Project report for a period: what changed and why, decisions, closed issues, what is waiting on people, knowledge health, " +
        'per-actor approval rates. Counted from the files, not generated. Use it to brief a human, e.g. "what happened this week?".',
      inputSchema: {
        since: z.string().default("7d").describe("7d, 2w, 30d, a date (2026-09-01) or ISO datetime"),
        until: z.string().optional(),
        format: z.enum(["json", "markdown"]).default("json"),
        lang: z.enum(["en", "tr"]).default("en").describe("Language of the markdown output"),
      },
    },
    wrap(async (a: { since: string; until?: string; format: "json" | "markdown"; lang: "en" | "tr" }) => {
      if (a.format !== "markdown") return get("/report", { since: a.since, until: a.until });
      const markdown = await api.call("GET", "/report", { query: { since: a.since, until: a.until, format: "md", lang: a.lang }, text: true });
      return { markdown };
    }),
  );

  // ---- activity -------------------------------------------------------------

  server.registerTool(
    "cortex_log_activity",
    {
      description: "Record what you did and WHY, after each meaningful change. Humans read this feed to stay in control and may ask you about any entry.",
      inputSchema: {
        action: z.string().describe("code_change | fix | refactor | investigation | config | deploy | docs | other"),
        summary: z.string().max(200).describe("What changed, one line"),
        why: z.string().optional().describe("The reason. Required for code changes, fixes, refactors, config and deploys."),
        files: z.array(z.string()).optional(),
        commit: z.string().optional(),
        refs: z.array(z.string()).optional().describe("Related item ids or knowledge node paths"),
      },
    },
    wrap((a: ActivityInput) => api.call("POST", "/activity", { body: a })),
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
    wrap((a: Record<string, unknown>) => get("/activity", a)),
  );

  return server;
}

export async function runMcpStdio(api: McpApi): Promise<void> {
  const server = buildMcpServer(api);
  await server.connect(new StdioServerTransport());
}

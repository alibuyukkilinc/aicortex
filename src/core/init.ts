import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { randomBytes } from "node:crypto";
import YAML from "yaml";
import { CORTEX_DIR, paths } from "./project.js";
import { CortexConfig, CortexError, KnowledgeNode } from "./types.js";
import { TreeStore } from "../store/tree.js";
import { nowIso, ulid } from "../util/text.js";

export const DEFAULT_BRANCHES: [string, string, string][] = [
  ["backend", "Backend", "APIs, business logic, data access and background jobs."],
  ["frontend", "Frontend", "Web UI: pages, components, state and styling."],
  ["server", "Server & Infrastructure", "Hosting, deployment, environments, CI/CD and monitoring."],
  ["mobile", "Mobile", "Mobile apps: platforms, builds and store releases."],
  ["security", "Security", "Auth, permissions, secrets handling and threat notes."],
  ["seo", "SEO", "Metadata, sitemaps, performance and indexing rules."],
  ["code-structure", "Code Structure", "Folder layout, conventions, patterns and shared libraries."],
];

const GLOBAL_RULES = {
  rules: [
    "Start every session with cortex_brief. Do not read the whole tree.",
    "Search Cortex before changing code you do not fully understand.",
    "If search does not answer your question, ask a human instead of assuming.",
    "Keep summaries under 300 characters: they are what other AIs read first.",
    "Explain WHY in every change, not only WHAT.",
    "Never edit files under .cortex/rules. Rules belong to humans.",
  ],
};

const NODE_SCHEMA = {
  type: "node",
  fields: {
    path: { type: "tree_path", required: true, format: "lowercase-dashed segments, e.g. backend/auth/jwt-refresh" },
    title: { type: "string", required: true, max: 120 },
    summary: { type: "string", required: true, max: 300 },
    body: { type: "markdown" },
    tags: { type: "string[]", max_items: 20 },
    links: { code: "[{file, lines?}]", items: "[item id]" },
    verified_at_commit: { type: "git commit hash the knowledge was checked against" },
  },
  ai_instructions:
    "Write summaries a teammate can act on in one read. Link the code files you describe. " +
    "Parents must exist before children. Your writes become drafts until a human approves them.",
};

export interface InitResult {
  dir: string;
  tokens: Record<string, string>;
  markdownCandidates: string[];
}

export function initProject(root: string, name = basename(root)): InitResult {
  const dir = join(root, CORTEX_DIR);
  if (existsSync(join(dir, "cortex.config.yaml"))) {
    throw new CortexError("already_initialized", `Cortex is already initialized in ${dir}.`, 409);
  }
  const p = paths(dir);
  for (const d of [p.rules, p.tree, p.items, p.activity, p.drafts]) mkdirSync(d, { recursive: true });

  const config: CortexConfig = {
    project: { name },
    port: 4747,
    actors: [
      { id: "owner", kind: "human" },
      { id: "ai-agent", kind: "ai" },
    ],
    approval: { node: "review", decision: "review", note: "auto", question: "auto", task: "auto", issue: "auto", activity: "auto", rules: "human_only" },
  };
  writeFileSync(
    p.config,
    "# Cortex project settings. Safe to commit.\n# approval: auto = AI writes directly, review = AI writes become drafts, human_only = AI cannot write.\n" +
      YAML.stringify(config),
    "utf8",
  );

  const tokens = { owner: token(), "ai-agent": token() };
  writeFileSync(p.secrets, "# Actor tokens. NEVER commit this file.\n" + YAML.stringify({ tokens }), "utf8");
  writeFileSync(join(dir, ".gitignore"), ".index/\n.secrets.yaml\n", "utf8");

  writeFileSync(join(p.rules, "_global.yaml"), "# Rules every AI receives in cortex_brief. Edited by humans only.\n" + YAML.stringify(GLOBAL_RULES), "utf8");
  writeFileSync(join(p.rules, "node.schema.yaml"), YAML.stringify(NODE_SCHEMA), "utf8");
  for (const d of [p.items, p.activity, p.drafts]) writeFileSync(join(d, ".gitkeep"), "", "utf8");

  const tree = new TreeStore(p.tree);
  const make = (path: string, title: string, summary: string, body = ""): KnowledgeNode => ({
    id: ulid(),
    path,
    title,
    summary,
    body,
    status: "active",
    updated_by: "owner",
    updated_at: nowIso(),
  });
  tree.write(make("", name, `${name}: project summary not written yet. Run the bootstrap task to fill this in.`));
  for (const [path, title, summary] of DEFAULT_BRANCHES) tree.write(make(path, title, `${summary} (not documented yet)`));

  return { dir, tokens, markdownCandidates: findMarkdown(root) };
}

function token(): string {
  return "ctx_" + randomBytes(24).toString("base64url");
}

const SKIP = new Set(["node_modules", ".git", CORTEX_DIR, "vendor", "dist", "build", ".next", "coverage"]);

export function findMarkdown(root: string, limit = 50): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || out.length >= limit) return;
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const full = join(dir, name);
      const st = statSync(full, { throwIfNoEntry: false });
      if (!st) continue;
      if (st.isDirectory()) walk(full, depth + 1);
      else if (name.toLowerCase().endsWith(".md")) out.push(relative(root, full).replace(/\\/g, "/"));
      if (out.length >= limit) return;
    }
  };
  walk(root, 0);
  return out;
}

// A ready-made task the user hands to their own AI, so filling the tree costs Cortex zero tokens.
export function bootstrapPrompt(projectName: string, markdown: string[]): string {
  return `# Cortex bootstrap task

You are setting up the Cortex knowledge tree for "${projectName}".
Cortex is this project's single source of truth. Humans review everything you write.

1. Call cortex_brief to see the current branches.
2. Explore the codebase (folders, package files, entry points). Do not guess.
3. For the root node ("") write a clear project summary (<= 300 chars) and a body describing
   purpose, main components and how they talk to each other.
4. For each relevant branch (backend, frontend, server, mobile, security, seo, code-structure):
   - update its summary to describe THIS project, or leave it if the branch does not apply
   - add child nodes for important subsystems (e.g. backend/auth, backend/payments)
   - link the code files each node describes (links.code)
5. Existing markdown worth importing:
${markdown.length ? markdown.map((m) => `   - ${m}`).join("\n") : "   (none found)"}
   Move the durable knowledge into nodes. Note contradictions instead of silently picking one.
6. Always include a short "reason" with each write.

Everything you write becomes a draft until a human approves it in Cortex.
`;
}

export const AGENT_HINT = `<!-- cortex:start -->
## Project knowledge: Cortex
This project's knowledge lives in Cortex, not in markdown files.
- Session start: call \`cortex_brief\`.
- Before changing code you don't fully understand: \`cortex_search\`, then \`cortex_tree\` / \`cortex_node\`.
- After a meaningful change: update the relevant node (it becomes a draft for human review).
Do not update docs in .md files; update Cortex.
<!-- cortex:end -->`;

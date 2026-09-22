import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { randomBytes } from "node:crypto";
import YAML from "yaml";
import { CORTEX_DIR, paths } from "./project.js";
import { CortexConfig, CortexError, KnowledgeNode } from "./types.js";
import { TreeStore, normalizePath } from "../store/tree.js";
import { nowIso, ulid } from "../util/text.js";
import { ACTIVITY_SCHEMA, DEFAULT_SCHEMAS } from "./schema.js";
import { languageRule } from "./language.js";

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
    "Before editing files, call cortex_code_context to see which knowledge and decisions cover them.",
    "Knowledge marked stale may be wrong: check the code, then update the node or verify it.",
    "If search does not answer your question, ask a human instead of assuming.",
    "Keep summaries under 300 characters: they are what other AIs read first.",
    "Explain WHY in every change, not only WHAT. Log each meaningful change with cortex_log_activity.",
    "Check cortex_inbox: answer questions assigned to you before starting new work.",
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

// The machine's language ("tr" on a Turkish system) unless the user passes --lang.
export function systemLanguage(): string {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
  return locale.split("-")[0].toLowerCase() || "en";
}

// Branch names from --branches: template names keep their description, anything else gets a generic one.
export function resolveBranches(names?: string[]): [string, string, string][] {
  if (!names) return DEFAULT_BRANCHES;
  const out: [string, string, string][] = [];
  for (const raw of names) {
    const path = normalizePath(raw.trim().toLowerCase());
    if (!path || path.includes("/") || out.some(([p]) => p === path)) continue;
    const known = DEFAULT_BRANCHES.find(([p]) => p === path);
    out.push(known ?? [path, path.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), `Knowledge about ${path.replace(/-/g, " ")}.`]);
  }
  return out;
}

export function initProject(root: string, name = basename(root), opts: { language?: string; branches?: string[] } = {}): InitResult {
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
    // Decisions are auto because their schema already reserves accepted/rejected for humans.
    approval: { node: "review", task: "auto", issue: "auto", question: "auto", note: "auto", decision: "auto" },
  };
  writeFileSync(
    p.config,
    "# Cortex project settings. Safe to commit.\n" +
      "# approval (for AI actors): auto = writes directly, review = writes become drafts a human approves, human_only = AI cannot write.\n" +
      YAML.stringify(config),
    "utf8",
  );

  const tokens = { owner: token(), "ai-agent": token() };
  writeFileSync(p.secrets, "# Actor tokens. NEVER commit this file.\n" + YAML.stringify({ tokens }), "utf8");
  writeFileSync(join(dir, ".gitignore"), ".index/\n.secrets.yaml\n", "utf8");
  // Same bytes on every OS, so diffs do not flip with core.autocrlf.
  writeFileSync(join(dir, ".gitattributes"), "* text=auto eol=lf\n", "utf8");

  writeFileSync(
    join(p.rules, "_global.yaml"),
    "# Rules every AI receives in cortex_brief. Edited by humans only.\n" +
      "# language: the language AIs must write in (knowledge, items, replies, activity), e.g. tr or en.\n" +
      YAML.stringify({ language: opts.language ?? systemLanguage(), ...GLOBAL_RULES }),
    "utf8",
  );
  writeFileSync(join(p.rules, "node.schema.yaml"), YAML.stringify(NODE_SCHEMA), "utf8");
  const header = "# Edited by humans only. Cortex enforces these rules and explains violations to AIs.\n";
  for (const [type, schema] of Object.entries(DEFAULT_SCHEMAS)) {
    writeFileSync(join(p.rules, `${type}.schema.yaml`), header + YAML.stringify(schema), "utf8");
  }
  writeFileSync(join(p.rules, "activity.schema.yaml"), header + YAML.stringify(ACTIVITY_SCHEMA), "utf8");
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
  for (const [path, title, summary] of resolveBranches(opts.branches)) tree.write(make(path, title, `${summary} (not documented yet)`));

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
export function bootstrapPrompt(projectName: string, markdown: string[], language?: string | null): string {
  return `# Cortex bootstrap task

You are setting up the Cortex knowledge tree for "${projectName}".
Cortex is this project's single source of truth. Humans review everything you write.
${language ? `\n${languageRule(language)}\n` : ""}
1. Call cortex_brief to see the current branches.
2. Explore the codebase (folders, package files, entry points). Do not guess.
3. For the root node ("") write a clear project summary (<= 300 chars) and a body describing
   purpose, main components and how they talk to each other.
4. For each top-level branch in the brief:
   - update its summary to describe THIS project
   - if a branch does not apply, say so in its summary ("Does not apply: ...") and suggest in a question that a human deletes it
   - add child nodes for important subsystems (e.g. backend/auth, backend/payments)
   - link the code files each node describes (links.code)
5. Existing markdown worth importing:
${markdown.length ? markdown.map((m) => `   - ${m}`).join("\n") : "   (none found)"}
   Move the durable knowledge into nodes. Note contradictions instead of silently picking one.
6. Past decisions you find in docs or commit history: record them with cortex_create_item (type "decision").
   Open questions and contradictions: cortex_create_item (type "question", assignee "@humans").
7. Always include a short "reason" with each write.

Knowledge nodes you write become drafts until a human approves them in Cortex.
`;
}

export const AGENT_HINT = `<!-- cortex:start -->
## Project knowledge: Cortex
This project's knowledge lives in Cortex, not in markdown files.
- Session start: call \`cortex_brief\`, then \`cortex_inbox\` for questions and issues waiting on you.
- Before changing code you don't fully understand: \`cortex_search\`, then \`cortex_tree\` / \`cortex_node\`.
- Before editing files: \`cortex_code_context(files)\` shows the knowledge, decisions and open items that cover them.
- Unsure? Open a question (\`cortex_ask\` or \`cortex_create_item\` type "question") instead of assuming.
- After a meaningful change: \`cortex_log_activity\` (what, why, files, commit), and update the relevant node.
Do not update docs in .md files; update Cortex.
<!-- cortex:end -->`;

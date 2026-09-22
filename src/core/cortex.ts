import { FSWatcher, existsSync, readFileSync, readdirSync, watch } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { Index, IndexedNode } from "../index/db.js";
import { DraftStore } from "../store/drafts.js";
import { TreeStore, normalizePath } from "../store/tree.js";
import { estimateTokens, nowIso, shortHash, ulid } from "../util/text.js";
import { Project, loadTokens, paths, rulesVersion } from "./project.js";
import { Actor, CortexError, Draft, KnowledgeNode, NodeSummary } from "./types.js";

export const NodeInput = z.object({
  path: z.string(),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(300),
  body: z.string().default(""),
  tags: z.array(z.string().max(40)).max(20).optional(),
  links: z
    .object({
      code: z.array(z.object({ file: z.string(), lines: z.string().optional() })).optional(),
      items: z.array(z.string()).optional(),
    })
    .optional(),
  verified_at_commit: z.string().optional(),
  reason: z.string().max(500).optional(),
});
export type NodeInput = z.input<typeof NodeInput>;

const NODE_EXAMPLE = {
  path: "backend/auth/jwt-refresh",
  title: "JWT refresh flow",
  summary: "Access token 15 min, refresh token 30 days, rotation on every refresh.",
  body: "## Flow\n...",
  tags: ["auth", "security"],
  links: { code: [{ file: "src/auth/refresh.ts", lines: "10-80" }] },
  reason: "Documented while adding rate limiting",
};

// Content hash of a node, so conflict detection does not depend on clock resolution.
function revision(n: KnowledgeNode): string {
  return shortHash(JSON.stringify([n.title, n.summary, n.body, n.tags ?? [], n.links ?? {}, n.status, n.updated_at]));
}

export interface WriteResult {
  applied: boolean;
  path: string;
  draft_id?: string;
  message: string;
}

export class Cortex {
  readonly tree: TreeStore;
  readonly drafts: DraftStore;
  readonly index: Index;
  private p: ReturnType<typeof paths>;

  constructor(readonly project: Project) {
    this.p = paths(project.dir);
    this.tree = new TreeStore(this.p.tree);
    this.drafts = new DraftStore(this.p.drafts);
    this.index = new Index(this.p.index);
    this.reindex();
  }

  close(): void {
    this.watcher?.close();
    this.index.close();
  }

  private watcher?: FSWatcher;

  // Picks up hand edits, git pulls and writes from other Cortex processes (e.g. MCP next to the API).
  watch(onError: (e: unknown) => void = () => {}): void {
    let timer: NodeJS.Timeout | undefined;
    this.watcher = watch(this.p.tree, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          this.reindex();
        } catch (e) {
          // Usually a half-written file during git checkout; the next event retries.
          onError(e);
        }
      }, 300);
    });
  }

  reindex(): number {
    const nodes = this.tree.all();
    this.index.reindex(nodes);
    return nodes.length;
  }

  meta() {
    return { rules_version: rulesVersion(this.project.dir) };
  }

  // ---- actors -------------------------------------------------------------

  actor(id: string | undefined): Actor {
    const a = this.project.config.actors.find((x) => x.id === id);
    if (!a) {
      throw new CortexError("unknown_actor", `Unknown actor "${id ?? ""}". Actors are defined in .cortex/cortex.config.yaml.`, 401, {
        known_actors: this.project.config.actors.map((x) => x.id),
      });
    }
    return a;
  }

  actorByToken(token: string | undefined): Actor | null {
    if (!token) return null;
    const tokens = loadTokens(this.project.dir);
    const id = Object.entries(tokens).find(([, t]) => t === token)?.[0];
    return id ? this.actor(id) : null;
  }

  // ---- reading ------------------------------------------------------------

  // The session opener: small, stable, and everything an AI needs to decide where to look next.
  brief(actor: Actor) {
    const root = this.tree.read("");
    const branches = this.index.children("").map((n) => ({
      path: n.path,
      title: n.title,
      summary: n.summary,
      status: n.status,
      child_count: this.index.childCount(n.path),
    }));
    const drafts = this.drafts.list();
    const mine = actor.kind === "human" ? drafts : drafts.filter((d) => d.proposed_by === actor.id);
    const counts = this.index.countByStatus();

    return {
      project: {
        name: this.project.config.project.name,
        summary: root?.summary ?? this.project.config.project.summary ?? "",
      },
      you: actor,
      branches,
      attention: {
        pending_approvals: mine.map((d) => ({ draft_id: d.id, target: d.target, proposed_by: d.proposed_by, reason: d.reason })),
        stale_nodes: counts.stale ?? 0,
        deprecated_nodes: counts.deprecated ?? 0,
      },
      rules: { version: rulesVersion(this.project.dir), global: this.globalRules() },
      next: [
        "cortex_tree(path) to open a branch (summaries only)",
        "cortex_search(q) before changing anything you don't fully understand",
        "cortex_node(path) only when you need full detail",
      ],
    };
  }

  treeView(path: string, depth = 1, budget?: number) {
    const p = normalizePath(path);
    const self = p === "" ? this.index.get("") : this.index.get(p);
    if (!self) throw this.notFound(p);
    const d = Math.min(Math.max(depth, 0), 5);
    let used = 0;
    let truncated = false;
    const build = (n: IndexedNode, level: number): NodeSummary => {
      const s: NodeSummary = { path: n.path, title: n.title, summary: n.summary, status: n.status };
      used += estimateTokens(s);
      const kids = this.index.children(n.path);
      if (level < d && kids.length > 0) {
        s.children = [];
        for (const k of kids) {
          if (budget && used > budget) {
            truncated = true;
            break;
          }
          s.children.push(build(k, level + 1));
        }
      }
      if (!s.children || s.children.length < kids.length) s.child_count = kids.length;
      return s;
    };
    const node = build(self, 0);
    return { node, truncated, ...(truncated ? { hint: "Budget reached. Open a child path directly." } : {}) };
  }

  node(path: string): KnowledgeNode {
    const p = normalizePath(path);
    const n = this.tree.read(p);
    if (!n) throw this.notFound(p);
    return n;
  }

  search(q: string, opts: { under?: string; status?: string; limit?: number; budget?: number } = {}) {
    if (!q || !q.trim()) throw new CortexError("empty_query", "Query is empty.", 400, { example: "/api/search?q=jwt refresh" });
    const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
    const hits = this.index.search(q, { under: opts.under ? normalizePath(opts.under) : undefined, status: opts.status, limit });
    const results: { path: string; title: string; summary: string; status: string; score: number }[] = [];
    let used = 0;
    let truncated = false;
    for (const h of hits) {
      const r = { path: h.path, title: h.title, summary: h.summary, status: h.status, score: h.score };
      used += estimateTokens(r);
      if (opts.budget && used > opts.budget && results.length > 0) {
        truncated = true;
        break;
      }
      results.push(r);
    }
    return { query: q, mode: "keyword", results, truncated };
  }

  // ---- writing ------------------------------------------------------------

  putNode(actor: Actor, input: NodeInput): WriteResult {
    const parsed = NodeInput.safeParse(input);
    if (!parsed.success) {
      throw new CortexError("invalid_node", "Node does not match the schema.", 400, {
        issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
        rules: "title 1-120 chars, summary 1-300 chars (required, keep it short: it is what other AIs read first)",
        example: NODE_EXAMPLE,
      });
    }
    const { reason, ...data } = parsed.data;
    const path = normalizePath(data.path);
    const existing = this.tree.read(path);
    const node: KnowledgeNode = {
      ...data,
      path,
      id: existing?.id ?? ulid(),
      status: "active",
      updated_by: actor.id,
      updated_at: nowIso(),
    };

    const policy = this.project.config.approval.node ?? "review";
    if (actor.kind === "ai" && policy === "human_only") {
      throw new CortexError("forbidden", "Only humans may change knowledge nodes in this project.", 403);
    }
    if (actor.kind === "ai" && policy === "review") {
      // Validate the parent now, so the AI hears about a broken path immediately rather than at approval time.
      const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : path === "" ? null : "";
      if (parent !== null && !this.tree.exists(parent) && !this.drafts.list().some((d) => d.target === parent)) {
        throw new CortexError("parent_missing", `Parent "${parent}" does not exist. Create the parent branch first.`, 400, {
          create_first: parent,
        });
      }
      const draft: Draft = {
        id: ulid(),
        kind: "node",
        target: path,
        proposed_by: actor.id,
        proposed_at: node.updated_at,
        reason,
        base_rev: existing ? revision(existing) : undefined,
        node: { ...node },
      };
      this.drafts.save(draft);
      return { applied: false, path, draft_id: draft.id, message: "Saved as draft. A human must approve it before it becomes active." };
    }

    this.tree.write(node);
    this.index.upsert(node);
    return { applied: true, path, message: existing ? "Node updated." : "Node created." };
  }

  approve(actor: Actor, draftId: string, force = false): WriteResult {
    this.requireHuman(actor);
    const d = this.draftOr404(draftId);
    const current = this.tree.read(d.target);
    if (!force && current && d.base_rev !== revision(current)) {
      throw new CortexError("conflict", "The node changed after this draft was proposed. Review the diff, then approve with force.", 409, {
        current_updated_by: current.updated_by,
        current_updated_at: current.updated_at,
      });
    }
    const node: KnowledgeNode = { ...d.node, status: "active", updated_at: nowIso() };
    this.tree.write(node);
    this.index.upsert(node);
    this.drafts.remove(d.id);
    return { applied: true, path: d.target, message: `Approved draft from ${d.proposed_by}.` };
  }

  reject(actor: Actor, draftId: string): WriteResult {
    this.requireHuman(actor);
    const d = this.draftOr404(draftId);
    this.drafts.remove(d.id);
    return { applied: false, path: d.target, message: "Draft rejected." };
  }

  listDrafts() {
    return this.drafts.list().map(({ node, ...d }) => ({ ...d, title: node.title, summary: node.summary }));
  }

  getDraft(id: string) {
    const d = this.draftOr404(id);
    return { draft: d, current: this.tree.read(d.target) };
  }

  // ---- rules --------------------------------------------------------------

  globalRules(): string[] {
    const file = join(this.p.rules, "_global.yaml");
    if (!existsSync(file)) return [];
    return (YAML.parse(readFileSync(file, "utf8"))?.rules ?? []) as string[];
  }

  rules(name?: string) {
    if (!existsSync(this.p.rules)) return { version: rulesVersion(this.project.dir), rules: {} };
    const files = readdirSync(this.p.rules).filter((f) => f.endsWith(".yaml"));
    const pick = name ? files.filter((f) => f === `${name}.yaml` || f === `${name}.schema.yaml`) : files;
    if (name && pick.length === 0) {
      throw new CortexError("not_found", `No rules named "${name}".`, 404, { available: files.map((f) => f.replace(/(\.schema)?\.yaml$/, "")) });
    }
    const rules = Object.fromEntries(pick.map((f) => [f.replace(/(\.schema)?\.yaml$/, ""), YAML.parse(readFileSync(join(this.p.rules, f), "utf8"))]));
    return { version: rulesVersion(this.project.dir), rules };
  }

  // ---- helpers ------------------------------------------------------------

  private requireHuman(actor: Actor) {
    if (actor.kind !== "human") throw new CortexError("forbidden", "Only human actors can approve or reject drafts.", 403);
  }

  private draftOr404(id: string): Draft {
    const d = this.drafts.get(id);
    if (!d) throw new CortexError("not_found", `Draft ${id} not found.`, 404);
    return d;
  }

  private notFound(path: string) {
    const suggestions = path ? this.index.search(path.replace(/[/-]/g, " "), { limit: 3 }).map((h) => h.path) : [];
    return new CortexError("not_found", `No node at "${path}".`, 404, suggestions.length ? { did_you_mean: suggestions } : undefined);
  }
}

import { FSWatcher, existsSync, readFileSync, readdirSync, watch } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { DocKind, Index, IndexedNode } from "../index/db.js";
import { ActivityStore } from "../store/activity.js";
import { DraftStore } from "../store/drafts.js";
import { ItemStore } from "../store/items.js";
import { TreeStore, normalizePath } from "../store/tree.js";
import { estimateTokens, nowIso, shortHash, ulid } from "../util/text.js";
import { ActivityService } from "./activity.js";
import { ItemService, itemRevision } from "./items.js";
import { Project, loadTokens, paths, rulesVersion } from "./project.js";
import { DEFAULT_SCHEMAS, ItemSchema, describeSchema, loadActivitySchema, loadSchema } from "./schema.js";
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

const NON_ITEM_RULES = new Set(["node", "activity"]);

// Content hash of a node, so conflict detection does not depend on clock resolution.
function revision(n: KnowledgeNode): string {
  return shortHash(JSON.stringify([n.title, n.summary, n.body, n.tags ?? [], n.links ?? {}, n.status, n.updated_at]));
}

export interface WriteResult {
  applied: boolean;
  path?: string;
  id?: string;
  draft_id?: string;
  message: string;
}

export class Cortex {
  readonly tree: TreeStore;
  readonly drafts: DraftStore;
  readonly itemStore: ItemStore;
  readonly activityStore: ActivityStore;
  readonly index: Index;
  readonly items: ItemService;
  readonly activity: ActivityService;
  private p: ReturnType<typeof paths>;
  private watcher?: FSWatcher;

  constructor(readonly project: Project) {
    this.p = paths(project.dir);
    this.tree = new TreeStore(this.p.tree);
    this.drafts = new DraftStore(this.p.drafts);
    this.itemStore = new ItemStore(this.p.items);
    this.activityStore = new ActivityStore(this.p.activity);
    this.index = new Index(this.p.index);
    this.items = new ItemService(this);
    this.activity = new ActivityService(this);
    this.reindex();
  }

  close(): void {
    this.watcher?.close();
    this.index.close();
  }

  // Picks up hand edits, git pulls and writes from other Cortex processes (e.g. MCP next to the API).
  watch(onError: (e: unknown) => void = () => {}): void {
    let timer: NodeJS.Timeout | undefined;
    this.watcher = watch(this.project.dir, { recursive: true }, (_event, file) => {
      const f = String(file ?? "");
      if (f.startsWith(".index") || f === ".secrets.yaml") return;
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

  reindex(): { nodes: number; items: number; activity: number } {
    const nodes = this.tree.all();
    const memo = new Map<string, ItemSchema | null>();
    const schemaOf = (t: string) => (memo.has(t) ? memo.get(t)! : (memo.set(t, this.schema(t)), memo.get(t)!));
    const items = this.itemStore.allIds().flatMap((id) => {
      const item = this.itemStore.read(id);
      if (!item) return [];
      return [{ item, replies: this.itemStore.replies(id), terminal: schemaOf(item.type)?.terminal.includes(item.status) ?? false }];
    });
    const activity = this.activityStore.all();
    this.index.reindex({ nodes, items, activity });
    return { nodes: nodes.length, items: items.length, activity: activity.length };
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

  // ---- schemas ------------------------------------------------------------

  schema(type: string): ItemSchema | null {
    if (NON_ITEM_RULES.has(type) || !/^[a-z][a-z0-9-]{0,39}$/.test(type)) return null;
    return loadSchema(this.p.rules, type);
  }

  // Built-in types plus any custom type a human defined as rules/<type>.schema.yaml.
  itemTypes(): string[] {
    const custom = existsSync(this.p.rules)
      ? readdirSync(this.p.rules)
          .filter((f) => f.endsWith(".schema.yaml"))
          .map((f) => f.slice(0, -".schema.yaml".length))
          .filter((t) => !NON_ITEM_RULES.has(t))
      : [];
    return [...new Set([...Object.keys(DEFAULT_SCHEMAS), ...custom])];
  }

  activitySchema() {
    return loadActivitySchema(this.p.rules);
  }

  // ---- reading ------------------------------------------------------------

  // The session opener: small, stable, and everything an AI needs to decide where to look next.
  brief(actor: Actor) {
    const root = this.tree.read("");
    const branches = this.index.children("").map((n) => {
      const open = this.index.openItemsUnder(n.path);
      return {
        path: n.path,
        title: n.title,
        summary: n.summary,
        child_count: this.index.childCount(n.path),
        ...(open ? { open_items: open } : {}),
      };
    });
    const drafts = this.drafts.list();
    const mine = actor.kind === "human" ? drafts : drafts.filter((d) => d.proposed_by === actor.id);
    const counts = this.index.countNodesByStatus();
    const inbox = this.items.inbox(actor, 5);
    const recent = this.index.queryActivity({ includeSystem: false, limit: 3 }).map((a) => ({ id: a.id, actor: a.actor, at: a.at, summary: a.summary }));

    return {
      project: {
        name: this.project.config.project.name,
        summary: root?.summary ?? this.project.config.project.summary ?? "",
      },
      you: actor,
      branches,
      attention: {
        inbox: { count: inbox.count, top: inbox.items.map(({ id, type, title, reason, blocking }) => ({ id, type, title, reason, ...(blocking ? { blocking } : {}) })) },
        pending_approvals: mine.map((d) => ({ draft_id: d.id, kind: d.kind, target: d.target, proposed_by: d.proposed_by })),
        ...(counts.stale ? { stale_nodes: counts.stale } : {}),
      },
      recent_activity: recent,
      rules: { version: rulesVersion(this.project.dir), global: this.globalRules(), item_types: this.itemTypes() },
      next: [
        "cortex_inbox for everything waiting on you",
        "cortex_search(q) before changing anything you don't fully understand",
        "cortex_tree(path) / cortex_node(path) to drill down; cortex_log_activity after each change",
      ],
    };
  }

  treeView(path: string, depth = 1, budget?: number) {
    const p = normalizePath(path);
    const self = this.index.getNode(p);
    if (!self) throw this.notFound(p);
    const d = Math.min(Math.max(depth, 0), 5);
    let used = 0;
    let truncated = false;
    const build = (n: IndexedNode, level: number): NodeSummary => {
      const s: NodeSummary = { path: n.path, title: n.title, summary: n.summary, status: n.status };
      const open = this.index.openItemsUnder(n.path);
      if (open) s.open_items = open;
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

  // One search over knowledge, items (decisions, issues, questions...) and activity: "why did we do X?" lands here.
  search(q: string, opts: { kinds?: DocKind[]; under?: string; status?: string; type?: string; limit?: number; budget?: number } = {}) {
    if (!q || !q.trim()) throw new CortexError("empty_query", "Query is empty.", 400, { example: "/api/search?q=jwt refresh" });
    const badKind = opts.kinds?.find((k) => !["node", "item", "activity"].includes(k));
    if (badKind) throw new CortexError("invalid_query", `Unknown kind "${badKind}".`, 400, { kinds: ["node", "item", "activity"] });
    const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
    const hits = this.index.search(q, {
      kinds: opts.kinds,
      under: opts.under ? normalizePath(opts.under) : undefined,
      status: opts.status,
      type: opts.type,
      limit,
    });
    const results: Record<string, unknown>[] = [];
    let used = 0;
    let truncated = false;
    for (const h of hits) {
      const r = this.describeHit(h.kind, h.ref, h.score);
      if (!r) continue;
      used += estimateTokens(r);
      if (opts.budget && used > opts.budget && results.length > 0) {
        truncated = true;
        break;
      }
      results.push(r);
    }
    return { query: q, mode: "keyword", results, truncated };
  }

  private describeHit(kind: DocKind, ref: string, score: number): Record<string, unknown> | null {
    if (kind === "node") {
      const n = this.index.getNode(ref);
      return n && { kind, path: n.path, title: n.title, summary: n.summary, status: n.status, score };
    }
    if (kind === "item") {
      const i = this.index.getItem(ref);
      const full = i && this.itemStore.read(ref);
      return (
        i && {
          kind, id: i.id, type: i.type, title: i.title, status: i.status,
          ...(i.category_path ? { category_path: i.category_path } : {}),
          summary: snippet(full?.body ?? ""), score,
        }
      );
    }
    const a = this.index.getActivity(ref);
    return a && { kind, id: a.id, actor: a.actor, at: a.at, action: a.action, summary: a.summary, ...(a.why ? { why: snippet(a.why) } : {}), score };
  }

  // ---- node writes --------------------------------------------------------

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
      if (parent !== null && !this.tree.exists(parent) && !this.drafts.list().some((d) => d.kind === "node" && d.target === parent)) {
        throw new CortexError("parent_missing", `Parent "${parent}" does not exist. Create the parent branch first.`, 400, {
          create_first: parent,
        });
      }
      const draftId = this.saveDraft({
        kind: "node",
        target: path,
        proposed_by: actor.id,
        reason,
        base_rev: existing ? revision(existing) : undefined,
        data: node,
      });
      return { applied: false, path, draft_id: draftId, message: "Saved as draft. A human must approve it before it becomes active." };
    }

    this.writeNode(node);
    this.activity.system(actor.id, "node.updated", `${existing ? "Updated" : "Created"} node "${path || "(root)"}"${reason ? `: ${reason}` : ""}`, [path]);
    return { applied: true, path, message: existing ? "Node updated." : "Node created." };
  }

  private writeNode(node: KnowledgeNode): void {
    this.tree.write(node);
    this.index.upsertNode(node);
  }

  // ---- drafts & approval --------------------------------------------------

  saveDraft(d: Omit<Draft, "id" | "proposed_at">): string {
    const draft = { ...d, id: ulid(), proposed_at: nowIso() } as Draft;
    this.drafts.save(draft);
    this.activity.system(d.proposed_by, "draft.proposed", `Proposed a change to ${d.kind} "${d.kind === "node" ? d.target || "(root)" : d.data.title}"`, [d.target]);
    return draft.id;
  }

  approve(actor: Actor, draftId: string, force = false): WriteResult {
    this.requireHuman(actor);
    const d = this.draftOr404(draftId);
    if (d.kind === "node") {
      const current = this.tree.read(d.target);
      if (!force && current && d.base_rev !== revision(current)) throw this.conflict(current.updated_by, current.updated_at);
      this.writeNode({ ...d.data, status: "active", updated_at: nowIso() });
    } else {
      const current = this.itemStore.read(d.target);
      if (!force && current && d.base_rev !== itemRevision(current)) throw this.conflict(current.updated_by, current.updated_at);
      this.items.applyDraft({ ...d.data, updated_at: nowIso() });
    }
    this.drafts.remove(d.id);
    this.activity.system(actor.id, "draft.approved", `Approved ${d.proposed_by}'s change to ${d.kind} "${d.target || "(root)"}"`, [d.target]);
    return { applied: true, ...(d.kind === "node" ? { path: d.target } : { id: d.target }), message: `Approved draft from ${d.proposed_by}.` };
  }

  reject(actor: Actor, draftId: string, reason?: string): WriteResult {
    this.requireHuman(actor);
    const d = this.draftOr404(draftId);
    this.drafts.remove(d.id);
    this.activity.system(actor.id, "draft.rejected", `Rejected ${d.proposed_by}'s change to ${d.kind} "${d.target || "(root)"}"${reason ? `: ${reason}` : ""}`, [d.target]);
    return { applied: false, ...(d.kind === "node" ? { path: d.target } : { id: d.target }), message: "Draft rejected." };
  }

  listDrafts() {
    return this.drafts.list().map(({ data, ...d }) => ({
      ...d,
      title: data.title,
      summary: d.kind === "node" ? (data as KnowledgeNode).summary : snippet(data.body),
    }));
  }

  getDraft(id: string) {
    const d = this.draftOr404(id);
    return { draft: d, current: d.kind === "node" ? this.tree.read(d.target) : this.itemStore.read(d.target) };
  }

  // ---- rules --------------------------------------------------------------

  globalRules(): string[] {
    const file = join(this.p.rules, "_global.yaml");
    if (!existsSync(file)) return [];
    return (YAML.parse(readFileSync(file, "utf8"))?.rules ?? []) as string[];
  }

  rules(name?: string) {
    const version = rulesVersion(this.project.dir);
    const one = (n: string): unknown => {
      if (n === "_global") return { rules: this.globalRules() };
      if (n === "activity") return this.activitySchema();
      const s = this.schema(n);
      if (s) return describeSchema(s);
      const file = join(this.p.rules, `${n}.schema.yaml`);
      if (/^[a-z_][a-z0-9_-]*$/.test(n) && existsSync(file)) return YAML.parse(readFileSync(file, "utf8"));
      return null;
    };
    if (name) {
      const r = one(name);
      if (!r) throw new CortexError("not_found", `No rules named "${name}".`, 404, { available: ["_global", "node", "activity", ...this.itemTypes()] });
      return { version, rules: { [name]: r } };
    }
    const names = ["_global", "node", "activity", ...this.itemTypes()];
    return { version, rules: Object.fromEntries(names.map((n) => [n, one(n)]).filter(([, r]) => r)) };
  }

  // ---- helpers ------------------------------------------------------------

  private conflict(by: string, at: string) {
    return new CortexError("conflict", "The target changed after this draft was proposed. Review the diff, then approve with force.", 409, {
      current_updated_by: by,
      current_updated_at: at,
    });
  }

  private requireHuman(actor: Actor) {
    if (actor.kind !== "human") throw new CortexError("forbidden", "Only human actors can approve or reject drafts.", 403);
  }

  private draftOr404(id: string): Draft {
    const d = this.drafts.get(id);
    if (!d) throw new CortexError("not_found", `Draft ${id} not found.`, 404);
    return d;
  }

  private notFound(path: string) {
    const suggestions = path ? this.index.search(path.replace(/[/-]/g, " "), { kinds: ["node"], limit: 3 }).map((h) => h.ref) : [];
    return new CortexError("not_found", `No node at "${path}".`, 404, suggestions.length ? { did_you_mean: suggestions } : undefined);
  }
}

function snippet(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

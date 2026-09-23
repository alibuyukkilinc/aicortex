import { EventEmitter } from "node:events";
import { FSWatcher, existsSync, readFileSync, readdirSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { DocKind, Index, IndexedNode } from "../index/db.js";
import { ActivityStore } from "../store/activity.js";
import { DraftStore } from "../store/drafts.js";
import { ItemStore } from "../store/items.js";
import { TreeStore, normalizePath } from "../store/tree.js";
import { estimateTokens, nowIso, shortHash, ulid } from "../util/text.js";
import { Embedder, TransformersEmbedder } from "../search/embedder.js";
import { semanticEnabled } from "../search/runtime.js";
import { SemanticIndex } from "../search/semantic.js";
import { ActivityService } from "./activity.js";
import { StalenessService } from "./staleness.js";
import { ReportService } from "./reports.js";
import { ItemService, itemRevision } from "./items.js";
import { SyncService, SyncStats } from "./sync.js";
import { Project, loadTokens, paths, rulesVersion } from "./project.js";
import { DEFAULT_SCHEMAS, ItemSchema, describeSchema, loadActivitySchema, loadSchema } from "./schema.js";
import { Actor, CortexError, Draft, KnowledgeNode, NodeSummary } from "./types.js";
import { LANG_CODE, languageRule } from "./language.js";

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
const RRF_K = 60; // standard Reciprocal Rank Fusion constant
const BRIEF_BUDGET = 800; // tokens; the spec's promise for the session opener

// Cut to a whole word, with an ellipsis, so a trimmed summary still reads like a sentence.
function shorten(text: string, max: number): string {
  if (max === 0) return "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// Content hash of a node, so conflict detection does not depend on clock resolution.
function revision(n: KnowledgeNode): string {
  return shortHash(JSON.stringify([n.title, n.summary, n.body, n.tags ?? [], n.links ?? {}, n.status, n.updated_at]));
}

export interface WriteResult {
  applied: boolean;
  warning?: string;
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
  // "change" fires after every write and every reindex; the web board streams it to browsers.
  readonly events = new EventEmitter();
  private p: ReturnType<typeof paths>;
  private watcher?: FSWatcher;

  readonly semantic: SemanticIndex;
  readonly staleness: StalenessService;
  readonly reports: ReportService;
  private syncService: SyncService;
  private syncTimer?: NodeJS.Timeout;

  // `embedder` overrides the semantic backend (tests pass a fake; null turns semantic search off).
  constructor(
    readonly project: Project,
    opts: { embedder?: (() => Embedder) | null } = {},
  ) {
    this.p = paths(project.dir);
    this.tree = new TreeStore(this.p.tree);
    this.drafts = new DraftStore(this.p.drafts);
    this.itemStore = new ItemStore(this.p.items);
    this.activityStore = new ActivityStore(this.p.activity);
    this.index = new Index(this.p.index);
    this.items = new ItemService(this);
    this.activity = new ActivityService(this);
    const wantSemantic = project.config.search?.semantic !== false && semanticEnabled();
    const factory = opts.embedder !== undefined ? opts.embedder : wantSemantic ? () => new TransformersEmbedder() : null;
    this.semantic = new SemanticIndex(this.index, factory);
    this.staleness = new StalenessService(this);
    this.reports = new ReportService(this);
    this.syncService = new SyncService(this);
    // Every write and reindex emits "change"; batch them into one embedding pass.
    this.events.on("change", () => {
      clearTimeout(this.syncTimer);
      if (!this.closed) this.syncTimer = setTimeout(() => this.semantic.sync(), 200);
    });
    this.reindex();
    this.semantic.sync();
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.syncTimer);
    clearTimeout(this.watchTimer);
    clearInterval(this.headPoll);
    this.semantic.close();
    this.watcher?.close();
    this.index.close();
  }

  private closed = false;
  private watchTimer?: NodeJS.Timeout;
  private pending = new Set<string>();
  private pendingAll = false;

  // Picks up hand edits, git pulls and writes from other Cortex processes (e.g. MCP next to the API).
  watch(onError: (e: unknown) => void = () => {}): void {
    this.watcher = watch(this.project.dir, { recursive: true }, (_event, file) => {
      if (this.closed) return;
      // Node can report a change without naming the file; then we have no choice but to rebuild.
      if (file == null) this.pendingAll = true;
      else {
        const f = String(file).replace(/\\/g, "/");
        if (f.startsWith(".index") || f === ".secrets.yaml") return;
        this.pending.add(f);
      }
      clearTimeout(this.watchTimer);
      this.watchTimer = setTimeout(() => {
        const paths = [...this.pending];
        const all = this.pendingAll;
        this.pending.clear();
        this.pendingAll = false;
        try {
          if (all) this.reindex();
          else for (const e of this.sync(paths).errors) onError(e.error);
        } catch (e) {
          // Usually a half-written file during git checkout; the next event retries.
          this.pendingAll = true;
          onError(e);
        }
      }, 300);
    });
    // Commits happen outside .cortex; poll HEAD so staleness (and open boards) update without a restart.
    let head = this.staleness.currentHead();
    this.headPoll = setInterval(() => {
      if (this.closed) return;
      const now = this.staleness.currentHead();
      if (now !== head) {
        head = now;
        this.events.emit("change", { type: "git", head });
      }
    }, 5000);
    this.headPoll.unref();
  }

  private headPoll?: NodeJS.Timeout;

  // Index only what these paths (relative to .cortex) name. Falls back to a full rebuild when a
  // change cannot be pinned to single records — a moved branch, a vanished log, an unknown shape.
  sync(changed: string[]): SyncStats {
    const r = this.syncService.run(changed);
    if ("rescan" in r) {
      this.reindex();
      return { nodes: 0, items: 0, drafts: 0, activity: 0, reterm: 0, errors: [] };
    }
    // Same event shape as a full reindex: the board's live stream, the semantic debounce and
    // staleness all key off it. Staying quiet when nothing changed keeps them from spinning.
    if (r.nodes || r.items || r.drafts || r.activity || r.reterm) this.events.emit("change", { type: "reindex" });
    return r;
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
    this.index.reindex({ nodes, items, activity, drafts: this.drafts.list() });
    this.events.emit("change", { type: "reindex" });
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
  // It is trimmed to fit `budget` tokens: first the branch summaries get shorter, then the lists,
  // because a project with many branches or a long queue must not turn the opener into a wall of text.
  brief(actor: Actor, budget = BRIEF_BUDGET) {
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
    const stale = this.staleness.list();
    const inbox = this.items.inbox(actor, 5);
    const recent = this.index.queryActivity({ includeSystem: false, limit: 3 }).map((a) => ({ id: a.id, actor: a.actor, at: a.at, summary: a.summary }));

    const build = ([chars, rows, activity]: [number, number, number]) => ({
      project: {
        name: this.project.config.project.name,
        summary: root?.summary ?? this.project.config.project.summary ?? "",
      },
      you: actor,
      branches: branches.map((b) => ({ ...b, summary: shorten(b.summary, chars) })),
      // Says out loud that this brief was shortened (cortex_tree has the full text), in as few tokens as it costs.
      ...(chars < 300 ? { trimmed: true } : {}),
      attention: {
        inbox: { count: inbox.count, top: inbox.items.slice(0, rows).map(({ id, type, title, reason, blocking }) => ({ id, type, title, reason, ...(blocking ? { blocking } : {}) })) },
        // Count + a few: after a bootstrap there can be dozens, and the brief must stay small.
        pending_approvals: { count: mine.length, top: mine.slice(0, rows).map((d) => ({ draft_id: d.id, kind: d.kind, target: d.target, proposed_by: d.proposed_by })) },
        // Knowledge whose code changed since it was verified: fix it or verify it when you touch that area.
        ...(stale.length
          ? { stale_nodes: { count: stale.length, top: stale.slice(0, rows).map((s) => ({ path: s.path, files: s.changes.map((c) => c.file) })) } }
          : {}),
      },
      recent_activity: recent.slice(0, activity),
      search: ["ready", "indexing"].includes(this.semantic.status().state) ? "hybrid" : "keyword",
      // The language rule is the first global rule; no separate field, every token counts here.
      rules: { version: rulesVersion(this.project.dir), global: this.globalRules(), item_types: this.itemTypes() },
      next: [
        "cortex_inbox for everything waiting on you",
        "cortex_search(q) before changing anything you don't fully understand",
        "cortex_tree(path) / cortex_node(path) to drill down; cortex_log_activity after each change",
      ],
      });
    // Steps tried in order until the brief fits: shorter branch summaries, then fewer rows.
    const steps: [number, number, number][] = [
      [300, 5, 3], // full summaries
      [160, 5, 3],
      [160, 3, 2],
      [100, 3, 2],
      [60, 2, 1],
      [0, 1, 1], // last resort: titles only; cortex_tree has the summaries
    ];
    let out = build(steps[0]);
    for (const step of steps.slice(1)) {
      if (estimateTokens(out) <= budget) break;
      out = build(step);
    }
    return out;
  }

  treeView(path: string, depth = 1, budget?: number) {
    const p = normalizePath(path);
    const self = this.index.getNode(p);
    if (!self) throw this.notFound(p);
    const d = Math.min(Math.max(depth, 0), 5);
    let used = 0;
    let truncated = false;
    const build = (n: IndexedNode, level: number): NodeSummary => {
      const s: NodeSummary = { path: n.path, title: n.title, summary: n.summary, status: this.staleness.get(n.path) ? "stale" : n.status };
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

  // A node plus whether it can still be trusted: what the API and MCP return.
  nodeView(path: string) {
    const node = this.node(path);
    const stale = this.staleness.get(node.path);
    return {
      node,
      ...(stale
        ? {
            staleness: {
              ...stale,
              hint: "The linked code changed after this was written. Check the changes, then update the node or verify it (cortex_verify_node).",
            },
          }
        : {}),
    };
  }

  // Everything Cortex knows about some files: read this before editing them.
  codeContext(files: string[]) {
    if (!files.length) throw new CortexError("invalid_request", "Pass at least one file or directory path.", 400, { example: ["src/auth/login.ts"] });
    const links = this.index.linksForFiles(files);
    const nodes = new Map<string, Record<string, unknown>>();
    const items = new Map<string, Record<string, unknown>>();
    for (const l of links) {
      if (l.kind === "node") {
        const n = this.index.getNode(l.ref);
        if (!n) continue;
        const cur = (nodes.get(l.ref) ?? { path: n.path, title: n.title, summary: n.summary, files: [] as string[] }) as { files: string[] } & Record<string, unknown>;
        cur.files.push(l.lines ? `${l.file}:${l.lines}` : l.file);
        if (this.staleness.get(n.path)) cur.stale = true;
        nodes.set(l.ref, cur);
      } else {
        const i = this.index.getItem(l.ref);
        if (i) items.set(i.id, { id: i.id, type: i.type, title: i.title, status: i.status, via: "code link" });
      }
    }
    // Open items and decisions filed under the matched knowledge also concern these files.
    for (const path of nodes.keys()) {
      for (const i of this.index.queryItems({ under: path, limit: 20, offset: 0 }).items) {
        if (!items.has(i.id) && (!i.terminal || i.type === "decision")) items.set(i.id, { id: i.id, type: i.type, title: i.title, status: i.status, via: path });
      }
    }
    return {
      files,
      knowledge: [...nodes.values()],
      items: [...items.values()],
      ...(nodes.size === 0 ? { hint: "No knowledge links these files yet. After your change, link them from the relevant node (links.code)." } : {}),
    };
  }

  // "Still true" without changing content: moves the node's verification point to HEAD.
  verifyNode(actor: Actor, path: string, note?: string): WriteResult {
    const head = this.staleness.currentHead();
    if (!head) throw new CortexError("no_git", "Verification needs a git repository with at least one commit.", 400);
    const n = this.node(path);
    const { id: _id, status: _s, updated_by: _u, updated_at: _a, ...content } = n;
    return this.putNode(actor, { ...content, verified_at_commit: head, reason: note ?? `Verified still accurate at ${head.slice(0, 7)}` });
  }

  node(path: string): KnowledgeNode {
    const p = normalizePath(path);
    const n = this.tree.read(p);
    if (!n) throw this.notFound(p);
    return n;
  }

  // One search over knowledge, items (decisions, issues, questions...) and activity: "why did we do X?" lands here.
  // Hybrid when the semantic index is available: keyword and meaning rankings fused with Reciprocal Rank Fusion.
  async search(q: string, opts: { kinds?: DocKind[]; under?: string; status?: string; type?: string; limit?: number; budget?: number } = {}) {
    if (!q || !q.trim()) throw new CortexError("empty_query", "Query is empty.", 400, { example: "/api/search?q=jwt refresh" });
    const badKind = opts.kinds?.find((k) => !["node", "item", "activity"].includes(k)); // "draft" is internal
    if (badKind) throw new CortexError("invalid_query", `Unknown kind "${badKind}".`, 400, { kinds: ["node", "item", "activity"] });
    const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
    // Pending knowledge drafts are searched with nodes and come back as nodes with status "draft".
    const kinds: DocKind[] | undefined = opts.kinds && (opts.kinds.includes("node") ? [...opts.kinds, "draft"] : opts.kinds);
    const filter = { kinds, under: opts.under ? normalizePath(opts.under) : undefined, status: opts.status, type: opts.type };
    const pool = Math.max(limit * 3, 30);
    const keyword = this.index.search(q, { ...filter, limit: pool });
    const semantic = await this.semantic.search(q, filter, pool).catch(() => null);

    const fused = new Map<string, { kind: DocKind; ref: string; score: number; keyword: boolean; semantic: boolean }>();
    const add = (kind: DocKind, ref: string, rank: number, via: "keyword" | "semantic") => {
      const k = `${kind}:${ref}`;
      const cur = fused.get(k) ?? { kind, ref, score: 0, keyword: false, semantic: false };
      cur.score += 1 / (RRF_K + rank + 1);
      cur[via] = true;
      fused.set(k, cur);
    };
    keyword.forEach((h, i) => add(h.kind, h.ref, i, "keyword"));
    semantic?.forEach((h, i) => add(h.kind, h.ref, i, "semantic"));
    const ranked = [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit);

    const results: Record<string, unknown>[] = [];
    let used = 0;
    let truncated = false;
    for (const h of ranked) {
      const described = this.describeHit(h.kind, h.ref, Math.round(h.score * 10000) / 10000);
      if (!described) continue;
      const r = { ...described, match: h.keyword && h.semantic ? "both" : h.keyword ? "keyword" : "semantic" };
      used += estimateTokens(r);
      if (opts.budget && used > opts.budget && results.length > 0) {
        truncated = true;
        break;
      }
      results.push(r);
    }
    return { query: q, mode: semantic ? "hybrid" : "keyword", semantic: this.semantic.status(), results, truncated };
  }

  private describeHit(kind: DocKind, ref: string, score: number): Record<string, unknown> | null {
    if (kind === "draft") {
      const d = this.drafts.get(ref);
      if (!d || d.kind !== "node") return null;
      return {
        kind: "node", path: d.target, title: d.data.title, summary: d.data.summary, status: "draft",
        draft_id: d.id, proposed_by: d.proposed_by, score,
        note: "Not approved yet: may be wrong or change.",
      };
    }
    if (kind === "node") {
      const n = this.index.getNode(ref);
      return n && { kind, path: n.path, title: n.title, summary: n.summary, status: this.staleness.get(n.path) ? "stale" : n.status, score };
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
    if (data.links?.code?.length && this.staleness.enabled()) {
      if (data.verified_at_commit) {
        if (!this.staleness.git.commitExists(data.verified_at_commit)) {
          throw new CortexError("invalid_node", `verified_at_commit "${data.verified_at_commit}" is not a commit in this repository.`, 400);
        }
      } else {
        // Whoever writes the node vouches for it as of now.
        data.verified_at_commit = this.staleness.currentHead() ?? undefined;
      }
    }
    const node: KnowledgeNode = {
      ...data,
      path,
      id: existing?.id ?? ulid(),
      status: "active",
      updated_by: actor.id,
      updated_at: nowIso(),
    };

    const policy = actor.policy?.node ?? this.project.config.approval.node ?? "review";
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
      // Revising your own pending proposal replaces it, so reviewers see one draft per node, not a pile.
      const previous = this.drafts.list().find((d) => d.kind === "node" && d.target === path && d.proposed_by === actor.id);
      if (previous) this.removeDraft(previous.id);
      const draftId = this.saveDraft({
        kind: "node",
        target: path,
        proposed_by: actor.id,
        reason,
        base_rev: existing ? revision(existing) : undefined,
        data: node,
      });
      return {
        applied: false,
        path,
        draft_id: draftId,
        message: `${previous ? "Replaced your earlier draft." : "Saved as draft."} A human must approve it before it becomes active.`,
      };
    }

    this.writeNode(node);
    const untracked = this.staleness.enabled() ? this.staleness.git.untracked((data.links?.code ?? []).map((l) => l.file)) : [];
    this.activity.system(actor.id, "node.updated", `${existing ? "Updated" : "Created"} node "${path || "(root)"}"${reason ? `: ${reason}` : ""}`, [path]);
    return {
      applied: true,
      path,
      message: existing ? "Node updated." : "Node created.",
      // Linking code that is not committed yet is allowed, but nothing can tell when it changes.
      ...(untracked.length ? { warning: `Not in git yet, so staleness cannot follow them until they are committed: ${untracked.join(", ")}` } : {}),
    };
  }

  // Humans only. For branches that do not apply to the project, or knowledge that is simply gone.
  // Kept in git history, so it can be brought back; children and open items must be dealt with first.
  deleteNode(actor: Actor, path: string, reason?: string): WriteResult {
    if (actor.kind !== "human") {
      throw new CortexError("forbidden", "Only humans can delete knowledge. If a node is wrong, propose a fix with cortex_update_node or ask @humans.", 403);
    }
    const p = normalizePath(path);
    if (p === "") throw new CortexError("invalid_request", "The project root cannot be deleted.", 400);
    this.node(p); // 404 with suggestions
    const children = this.index.children(p).map((c) => c.path);
    if (children.length) throw new CortexError("has_children", `"${p}" still has ${children.length} child node(s). Delete or move them first.`, 409, { children });
    const open = this.index.queryItems({ under: p, open: true, limit: 20, offset: 0 }).items;
    if (open.length) {
      throw new CortexError("has_open_items", `${open.length} open item(s) are filed under "${p}". Close them or move them to another branch first.`, 409, {
        items: open.map((i) => ({ id: i.id, type: i.type, title: i.title })),
      });
    }
    this.tree.remove(p);
    this.index.deleteNode(p);
    this.activity.system(actor.id, "node.deleted", `Deleted node "${p}"${reason ? `: ${reason}` : ""}`, [p]);
    return { applied: true, path: p, message: "Node deleted. It stays in git history." };
  }

  private writeNode(node: KnowledgeNode): void {
    this.tree.write(node);
    this.index.upsertNode(node);
  }

  // ---- drafts & approval --------------------------------------------------

  saveDraft(d: Omit<Draft, "id" | "proposed_at">): string {
    const draft = { ...d, id: ulid(), proposed_at: nowIso() } as Draft;
    this.drafts.save(draft);
    this.index.upsertDraft(draft);
    this.activity.system(d.proposed_by, "draft.proposed", `Proposed a change to ${d.kind} "${d.kind === "node" ? d.target || "(root)" : d.data.title}"`, [d.target], { kind: d.kind, proposed_by: d.proposed_by });
    return draft.id;
  }

  private removeDraft(id: string): void {
    this.drafts.remove(id);
    this.index.removeDraft(id);
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
    this.removeDraft(d.id);
    this.activity.system(actor.id, "draft.approved", `Approved ${d.proposed_by}'s change to ${d.kind} "${d.target || "(root)"}"`, [d.target], { kind: d.kind, proposed_by: d.proposed_by });
    return { applied: true, ...(d.kind === "node" ? { path: d.target } : { id: d.target }), message: `Approved draft from ${d.proposed_by}.` };
  }

  reject(actor: Actor, draftId: string, reason?: string): WriteResult {
    this.requireHuman(actor);
    const d = this.draftOr404(draftId);
    this.removeDraft(d.id);
    this.activity.system(actor.id, "draft.rejected", `Rejected ${d.proposed_by}'s change to ${d.kind} "${d.target || "(root)"}"${reason ? `: ${reason}` : ""}`, [d.target], { kind: d.kind, proposed_by: d.proposed_by });
    return { applied: false, ...(d.kind === "node" ? { path: d.target } : { id: d.target }), message: "Draft rejected." };
  }

  // Bulk review after a bootstrap. Parents go before children so a new branch and its leaves can be approved together.
  // One failure (e.g. a conflict) does not stop the rest; each is reported.
  approveMany(actor: Actor, ids: string[], force = false) {
    return this.many(actor, ids, (id) => this.approve(actor, id, force));
  }

  rejectMany(actor: Actor, ids: string[], reason?: string) {
    return this.many(actor, ids, (id) => this.reject(actor, id, reason));
  }

  private many(actor: Actor, ids: string[], fn: (id: string) => WriteResult) {
    this.requireHuman(actor);
    if (!Array.isArray(ids) || !ids.length) throw new CortexError("invalid_request", "Pass the draft ids to act on.", 400, { example: { ids: ["01J9Z..."] } });
    const depth = (id: string) => {
      const d = this.drafts.get(id);
      return d?.kind === "node" ? (d.target === "" ? 0 : d.target.split("/").length) : 99;
    };
    const ordered = [...new Set(ids)].map((id) => ({ id, depth: depth(id) })).sort((a, b) => a.depth - b.depth);
    const done: string[] = [];
    const failed: { id: string; code: string; message: string }[] = [];
    for (const { id } of ordered) {
      try {
        fn(id);
        done.push(id);
      } catch (e) {
        const err = e instanceof CortexError ? e : new CortexError("internal", String(e), 500);
        failed.push({ id, code: err.code, message: err.message });
      }
    }
    return { done, failed, message: `${done.length} done${failed.length ? `, ${failed.length} failed` : ""}.` };
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

  private globalDoc(): { rules?: string[]; language?: string } {
    const file = join(this.p.rules, "_global.yaml");
    if (!existsSync(file)) return {};
    return (YAML.parse(readFileSync(file, "utf8")) ?? {}) as { rules?: string[]; language?: string };
  }

  // The language humans chose for everything written into Cortex (knowledge, items, replies, activity).
  language(): string | null {
    return this.globalDoc().language ?? null;
  }

  // The language rule goes first: it applies to every write, and AIs read the top of a list most reliably.
  globalRules(): string[] {
    const rules = this.globalDoc().rules ?? [];
    const lang = this.language();
    return lang ? [languageRule(lang), ...rules] : rules;
  }

  rules(name?: string) {
    const version = rulesVersion(this.project.dir);
    const one = (n: string): unknown => {
      if (n === "_global") return { ...(this.language() ? { language: this.language() } : {}), rules: this.globalRules() };
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

  // Raw YAML so humans edit exactly what is on disk (comments included).
  rulesSource(name: string): { name: string; file: string; source: string; exists: boolean } {
    const file = this.rulesFile(name);
    const full = join(this.p.rules, file);
    if (existsSync(full)) return { name, file, source: readFileSync(full, "utf8"), exists: true };
    const s = this.schema(name);
    return { name, file, source: s ? YAML.stringify(s) : "", exists: false };
  }

  saveRules(actor: Actor, name: string, source: string): { name: string; version: string; message: string } {
    if (actor.kind !== "human") throw new CortexError("forbidden", "Rules belong to humans. Propose a change by opening a question for @humans.", 403);
    const file = this.rulesFile(name);
    let parsed: unknown;
    try {
      parsed = YAML.parse(source);
    } catch (e) {
      throw new CortexError("invalid_rules", `YAML error: ${(e as Error).message}`, 400);
    }
    const issues = validateRulesDoc(name, parsed);
    if (issues.length) throw new CortexError("invalid_rules", `The ${name} rules are not valid.`, 400, { issues });
    writeFileSync(join(this.p.rules, file), source.endsWith("\n") ? source : `${source}\n`, "utf8");
    this.activity.system(actor.id, "rules.updated", `Updated rules "${name}"`);
    return { name, version: rulesVersion(this.project.dir), message: "Rules saved. AIs will see the new rules_version on their next call." };
  }

  private rulesFile(name: string): string {
    if (name === "_global") return "_global.yaml";
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(name)) throw new CortexError("invalid_rules", `Invalid rules name "${name}". Use lowercase letters, digits and dashes.`, 400);
    return `${name}.schema.yaml`;
  }

  // ---- helpers ------------------------------------------------------------

  // Also used by ItemService.update()'s optional if_rev check, outside the draft-approval path.
  conflict(by: string, at: string) {
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

const FIELD_TYPES = ["string", "text", "enum", "number", "boolean", "date", "datetime", "tree_path", "actor", "item_ref", "commit", "url", "list"];
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function validateFieldSpecs(prefix: string, fields: unknown, issues: string[]) {
  if (fields === undefined || fields === null) return;
  if (typeof fields !== "object" || Array.isArray(fields)) return void issues.push(`${prefix}: must be a map of field name -> spec`);
  for (const [k, spec] of Object.entries(fields as Record<string, Record<string, unknown>>)) {
    if (!spec || typeof spec !== "object") {
      issues.push(`${prefix}.${k}: must be an object like { type: string }`);
      continue;
    }
    if (!FIELD_TYPES.includes(spec.type as string)) issues.push(`${prefix}.${k}.type: must be one of ${FIELD_TYPES.join(", ")}`);
    if (spec.type === "enum" && !(isStrList(spec.values) && spec.values.length)) issues.push(`${prefix}.${k}.values: an enum needs a non-empty list of values`);
    if (spec.type === "list" && spec.of !== undefined && (!FIELD_TYPES.includes(spec.of as string) || spec.of === "list")) issues.push(`${prefix}.${k}.of: invalid element type`);
  }
}

// Structural check before a human's rules edit is written, so a typo cannot break every write.
export function validateRulesDoc(name: string, doc: unknown): string[] {
  const issues: string[] = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return ["the document must be a YAML map"];
  const d = doc as Record<string, unknown>;
  if (name === "_global") {
    if (!isStrList(d.rules)) issues.push("rules: must be a list of strings");
    if (d.language !== undefined && !(typeof d.language === "string" && LANG_CODE.test(d.language))) {
      issues.push('language: a language code such as "tr" or "en"');
    }
    return issues;
  }
  if (name === "activity") {
    if (!isStrList(d.actions) || !d.actions.length) issues.push("actions: must be a non-empty list of strings");
    if (d.why_required_for !== undefined && !isStrList(d.why_required_for)) issues.push("why_required_for: must be a list of actions");
    return issues;
  }
  if (name === "node") return issues;

  if (d.type !== name) issues.push(`type: must be "${name}" (the file name)`);
  const statuses = isStrList(d.statuses) ? d.statuses : [];
  if (!statuses.length) issues.push("statuses: must be a non-empty list of strings");
  const inStatuses = (s: unknown) => typeof s === "string" && statuses.includes(s);
  if (!inStatuses(d.initial)) issues.push("initial: must be one of statuses");
  for (const key of ["terminal", "human_only_statuses"]) {
    if (d[key] !== undefined && !(isStrList(d[key]) && (d[key] as string[]).every(inStatuses))) issues.push(`${key}: must list statuses`);
  }
  if (d.transitions !== undefined && d.transitions !== "any") {
    if (typeof d.transitions !== "object" || Array.isArray(d.transitions)) issues.push('transitions: must be "any" or a map of status -> [next statuses]');
    else
      for (const [from, to] of Object.entries(d.transitions as Record<string, unknown>)) {
        if (!inStatuses(from)) issues.push(`transitions.${from}: unknown status`);
        if (!isStrList(to) || !to.every(inStatuses)) issues.push(`transitions.${from}: must list statuses`);
      }
  }
  validateFieldSpecs("fields", d.fields, issues);
  const reply = d.reply as Record<string, unknown> | undefined;
  if (reply) {
    validateFieldSpecs("reply.fields", reply.fields, issues);
    for (const [i, r] of ((reply.on_reply as Record<string, unknown>[] | undefined) ?? []).entries()) {
      if (!inStatuses(r.from) || !inStatuses(r.to)) issues.push(`reply.on_reply[${i}]: from and to must be statuses`);
      if (!["assignee", "not_author", "author", "anyone"].includes(r.by as string)) issues.push(`reply.on_reply[${i}].by: assignee | not_author | author | anyone`);
    }
  }
  return issues;
}

function snippet(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

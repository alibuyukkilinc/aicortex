import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Activity, Draft, Item, KnowledgeNode, NodeStatus, Reply } from "../core/types.js";
import { CortexError } from "../core/types.js";
import { NODE_TOO_OLD_MESSAGE } from "../util/runtime-check.js";
import { fold, shortHash } from "../util/text.js";
import { parentPath } from "../store/tree.js";

export interface IndexedNode {
  path: string;
  parent: string | null;
  title: string;
  summary: string;
  status: NodeStatus;
  tags: string[];
  updated_at: string;
  updated_by: string;
}

// Both come from the rules, not from the item file: a rules edit changes them without any file changing.
export interface ItemFlags {
  terminal: boolean;
  open: boolean;
}

export interface IndexedItem {
  id: string;
  type: string;
  title: string;
  status: string;
  terminal: boolean; // no transition leads out of this status
  open: boolean; // still waiting for someone (see isOpenWork)
  category_path: string | null;
  author: string;
  assignee: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  blocking: boolean;
  created_at: string;
  updated_at: string;
  reply_count: number;
  last_reply_by: string | null;
}

// "draft" is internal: pending knowledge drafts, searchable so an AI can find what is waiting for review.
// The public API only knows node | item | activity; drafts come back as nodes with status "draft".
export type DocKind = "node" | "item" | "activity" | "draft";

export interface DocText {
  kind: DocKind;
  ref: string;
  scope: string;
  status: string;
  type: string;
  text: string;
  hash: string;
}

export interface SearchRow {
  kind: DocKind;
  ref: string;
  score: number;
}

export interface SearchOptions {
  kinds?: DocKind[];
  under?: string;
  status?: string;
  type?: string;
  limit: number;
}

// A WHERE fragment over the items table, with its arguments. Used for visibility: applied before
// LIMIT/OFFSET so a member who sees part of a project gets full pages and a true total.
export interface SqlFilter {
  sql: string;
  args: (string | number)[];
}

export interface ItemQuery {
  type?: string;
  status?: string;
  assignee?: string[];
  author?: string;
  under?: string;
  open?: boolean;
  visible?: SqlFilter | null;
  limit: number;
  offset: number;
}

// Folded (lowercase, no diacritics) Turkish and English filler words, skipped only in the any-term fallback.
const STOPWORDS = new Set(
  (
    "mi mu mı mü ve veya ile de da ki bu su o bir icin gibi ne neden nasil nerede hangi var yok mi daha en cok " +
    "olan olarak ama fakat ya ise diye kadar sonra once icinde uzerinde " +
    "the a an and or of to in on for with is are was were be do does did we you it this that what why how where which"
  ).split(" "),
);

// Bump when the table layout changes; an old cache is simply dropped and rebuilt from files.
const INDEX_VERSION = 6;

// The index is a disposable cache: everything here can be rebuilt from the files with reindex().
export class Index {
  private db: DatabaseSync;

  constructor(indexDir: string) {
    mkdirSync(indexDir, { recursive: true });
    this.db = new DatabaseSync(join(indexDir, "cortex.db"));
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    try {
      this.db.exec("CREATE VIRTUAL TABLE temp.fts5_probe USING fts5(x); DROP TABLE temp.fts5_probe;");
    } catch {
      this.db.close();
      throw new CortexError("node_too_old", NODE_TOO_OLD_MESSAGE(), 500);
    }
    const v = (this.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (v !== INDEX_VERSION) {
      this.db.exec(`
        DROP TABLE IF EXISTS nodes; DROP TABLE IF EXISTS nodes_fts;
        DROP TABLE IF EXISTS items; DROP TABLE IF EXISTS activity; DROP TABLE IF EXISTS docs_fts; DROP TABLE IF EXISTS doc_text; DROP TABLE IF EXISTS code_links;
        PRAGMA user_version = ${INDEX_VERSION};`);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        path TEXT PRIMARY KEY, parent TEXT, title TEXT NOT NULL, summary TEXT NOT NULL,
        status TEXT NOT NULL, tags TEXT NOT NULL, updated_at TEXT, updated_by TEXT
      );
      CREATE INDEX IF NOT EXISTS nodes_parent ON nodes(parent);
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
        terminal INTEGER NOT NULL, open_work INTEGER NOT NULL, category_path TEXT, author TEXT NOT NULL, assignee TEXT,
        claimed_by TEXT, claimed_at TEXT,
        blocking INTEGER NOT NULL, created_at TEXT, updated_at TEXT,
        reply_count INTEGER NOT NULL, last_reply_by TEXT
      );
      CREATE INDEX IF NOT EXISTS items_assignee ON items(assignee, open_work);
      CREATE INDEX IF NOT EXISTS items_category ON items(category_path);
      CREATE TABLE IF NOT EXISTS activity (
        id TEXT PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
        summary TEXT NOT NULL, refs TEXT NOT NULL, system INTEGER NOT NULL, json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS activity_at ON activity(at);
      CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
        kind UNINDEXED, ref UNINDEXED, scope UNINDEXED, status UNINDEXED, type UNINDEXED,
        title, summary, body, tags,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      -- Which knowledge nodes and items point at which code (files or directories, relative to the project root).
      CREATE TABLE IF NOT EXISTS code_links (kind TEXT NOT NULL, ref TEXT NOT NULL, file TEXT NOT NULL, lines TEXT);
      CREATE INDEX IF NOT EXISTS code_links_file ON code_links(file);
      -- Raw text of every searchable document, the input for semantic embeddings.
      CREATE TABLE IF NOT EXISTS doc_text (
        kind TEXT NOT NULL, ref TEXT NOT NULL, scope TEXT NOT NULL, status TEXT NOT NULL, type TEXT NOT NULL,
        text TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (kind, ref)
      );
      -- Embeddings survive reindexes and index upgrades: recomputing them is the expensive part.
      CREATE TABLE IF NOT EXISTS embeddings (
        kind TEXT NOT NULL, ref TEXT NOT NULL, model TEXT NOT NULL, hash TEXT NOT NULL, vec BLOB NOT NULL,
        PRIMARY KEY (kind, ref)
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  private tx(fn: () => void): void {
    this.db.exec("BEGIN");
    try {
      fn();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  reindex(data: { nodes: KnowledgeNode[]; items: { item: Item; replies: Reply[]; flags: ItemFlags }[]; activity: Activity[]; drafts?: Draft[] }): void {
    this.tx(() => {
      this.db.exec("DELETE FROM nodes; DELETE FROM items; DELETE FROM activity; DELETE FROM docs_fts; DELETE FROM doc_text; DELETE FROM code_links;");
      for (const n of data.nodes) this.insertNode(n);
      for (const i of data.items) this.insertItem(i.item, i.replies, i.flags);
      for (const a of data.activity) this.insertActivity(a);
      for (const d of data.drafts ?? []) this.insertDraft(d);
    });
  }

  // ---- drafts (search only) -------------------------------------------------

  upsertDraft(d: Draft): void {
    if (d.kind !== "node") return;
    this.tx(() => {
      this.deleteDoc("draft", d.id);
      this.insertDraft(d);
    });
  }

  removeDraft(id: string): void {
    this.deleteDoc("draft", id);
  }

  private insertDraft(d: Draft): void {
    if (d.kind !== "node") return;
    const n = d.data;
    this.insertDoc("draft", d.id, d.target, "draft", "", `${n.title} ${d.target.replace(/[/-]/g, " ")}`, n.summary, n.body, (n.tags ?? []).join(" "));
  }

  // ---- nodes --------------------------------------------------------------

  upsertNode(node: KnowledgeNode): void {
    this.tx(() => {
      this.db.prepare("DELETE FROM nodes WHERE path = ?").run(node.path);
      this.db.prepare("DELETE FROM code_links WHERE kind = 'node' AND ref = ?").run(node.path);
      this.deleteDoc("node", node.path);
      this.insertNode(node);
    });
  }

  private insertNode(n: KnowledgeNode): void {
    this.insertCodeLinks("node", n.path, n.links?.code);
    const tags = n.tags ?? [];
    this.db
      .prepare("INSERT INTO nodes VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(n.path, parentPath(n.path), n.title, n.summary, n.status, JSON.stringify(tags), n.updated_at ?? null, n.updated_by ?? null);
    // Path segments are indexed with the title so "auth" finds "backend/auth/*".
    this.insertDoc("node", n.path, n.path, n.status, "", `${n.title} ${n.path.replace(/[/-]/g, " ")}`, n.summary, n.body, tags.join(" "));
  }

  deleteNode(path: string): void {
    this.tx(() => {
      this.db.prepare("DELETE FROM nodes WHERE path = ?").run(path);
      this.db.prepare("DELETE FROM code_links WHERE kind = 'node' AND ref = ?").run(path);
      this.deleteDoc("node", path);
    });
  }

  getNode(path: string): IndexedNode | null {
    const row = this.db.prepare("SELECT * FROM nodes WHERE path = ?").get(path);
    return row ? toNode(row) : null;
  }

  children(path: string): IndexedNode[] {
    return this.db.prepare("SELECT * FROM nodes WHERE parent = ? ORDER BY path").all(path).map(toNode);
  }

  childCount(path: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM nodes WHERE parent = ?").get(path) as { c: number }).c;
  }

  // Open items filed under this node or any node below it.
  openItemsUnder(path: string): number {
    const sql =
      path === ""
        ? "SELECT COUNT(*) AS c FROM items WHERE open_work = 1"
        : "SELECT COUNT(*) AS c FROM items WHERE open_work = 1 AND (category_path = ? OR category_path LIKE ?)";
    const args = path === "" ? [] : [path, `${path}/%`];
    return (this.db.prepare(sql).get(...args) as { c: number }).c;
  }

  // ---- items --------------------------------------------------------------

  upsertItem(item: Item, replies: Reply[], flags: ItemFlags): void {
    this.tx(() => {
      this.db.prepare("DELETE FROM items WHERE id = ?").run(item.id);
      this.db.prepare("DELETE FROM code_links WHERE kind = 'item' AND ref = ?").run(item.id);
      this.deleteDoc("item", item.id);
      this.insertItem(item, replies, flags);
    });
  }

  private insertItem(i: Item, replies: Reply[], flags: ItemFlags): void {
    this.insertCodeLinks("item", i.id, i.links?.code);
    const last = replies[replies.length - 1];
    this.db
      .prepare("INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        i.id,
        i.type,
        i.title,
        i.status,
        flags.terminal ? 1 : 0,
        flags.open ? 1 : 0,
        i.category_path ?? null,
        i.author,
        i.assignee ?? null,
        i.claimed_by ?? null,
        i.claimed_at ?? null,
        i.fields?.blocking === true ? 1 : 0,
        i.created_at,
        i.updated_at,
        replies.length,
        last?.author ?? null,
      );
    const fieldText = Object.values(i.fields ?? {})
      .filter((v) => typeof v === "string")
      .join(" ");
    const replyText = replies.map((r) => r.body).join(" ");
    this.insertDoc(
      "item",
      i.id,
      i.category_path ?? "",
      i.status,
      i.type,
      i.title,
      i.body.slice(0, 300),
      `${i.body} ${fieldText} ${replyText}`,
      (i.tags ?? []).join(" "),
    );
  }

  deleteItem(id: string): void {
    this.tx(() => {
      this.db.prepare("DELETE FROM items WHERE id = ?").run(id);
      this.db.prepare("DELETE FROM code_links WHERE kind = 'item' AND ref = ?").run(id);
      this.deleteDoc("item", id);
    });
  }

  // Whether a status counts as finished comes from the rules, not from the item file, so a rules
  // edit changes it without any file changing. Recomputing the flag beats re-reading every item.
  retermItems(flagsOf: (type: string, status: string) => ItemFlags): number {
    const pairs = this.db.prepare("SELECT DISTINCT type, status FROM items").all() as { type: string; status: string }[];
    let changed = 0;
    this.tx(() => {
      const stmt = this.db.prepare("UPDATE items SET terminal = ?, open_work = ? WHERE type = ? AND status = ? AND (terminal != ? OR open_work != ?)");
      for (const p of pairs) {
        const f = flagsOf(p.type, p.status);
        const [t, o] = [f.terminal ? 1 : 0, f.open ? 1 : 0];
        changed += stmt.run(t, o, p.type, p.status, t, o).changes as number;
      }
    });
    return changed;
  }

  getItem(id: string): IndexedItem | null {
    const row = this.db.prepare("SELECT * FROM items WHERE id = ?").get(id);
    return row ? toItem(row) : null;
  }

  queryItems(q: ItemQuery): { items: IndexedItem[]; total: number } {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (q.type) (where.push("type = ?"), args.push(q.type));
    if (q.status) (where.push("status = ?"), args.push(q.status));
    if (q.author) (where.push("author = ?"), args.push(q.author));
    if (q.open !== undefined) (where.push("open_work = ?"), args.push(q.open ? 1 : 0));
    if (q.assignee?.length) (where.push(`assignee IN (${q.assignee.map(() => "?").join(",")})`), args.push(...q.assignee));
    if (q.under) (where.push("(category_path = ? OR category_path LIKE ?)"), args.push(q.under, `${q.under}/%`));
    if (q.visible) (where.push(`(${q.visible.sql})`), args.push(...q.visible.args));
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = (this.db.prepare(`SELECT COUNT(*) AS c FROM items ${w}`).get(...args) as { c: number }).c;
    const items = this.db
      .prepare(`SELECT * FROM items ${w} ORDER BY blocking DESC, updated_at DESC LIMIT ? OFFSET ?`)
      .all(...args, q.limit, q.offset)
      .map(toItem);
    return { items, total };
  }

  // ---- activity -----------------------------------------------------------

  addActivity(a: Activity): void {
    this.tx(() => this.insertActivity(a));
  }

  // The log is append-only, so a day's file is re-read whole whenever it grows. Entries already
  // indexed must be skipped rather than re-inserted: FTS5 has no primary key, and deleting by
  // (kind, ref) scans the whole table because those columns are UNINDEXED.
  hasActivity(id: string): boolean {
    return this.db.prepare("SELECT 1 FROM activity WHERE id = ?").get(id) !== undefined;
  }

  private insertActivity(a: Activity): void {
    this.db
      .prepare("INSERT OR REPLACE INTO activity VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(a.id, a.at, a.actor, a.action, a.summary, JSON.stringify(a.refs ?? []), a.system ? 1 : 0, JSON.stringify(a));
    // System entries repeat what items/nodes already say; keep them out of search to avoid noise.
    if (!a.system) {
      this.insertDoc("activity", a.id, "", "", a.action, a.summary, a.why ?? "", `${(a.files ?? []).join(" ")} ${(a.refs ?? []).join(" ")}`, a.actor);
    }
  }

  queryActivity(q: { since?: string; actor?: string; ref?: string; includeSystem: boolean; limit: number }): Activity[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (q.since) (where.push("at >= ?"), args.push(q.since));
    if (q.actor) (where.push("actor = ?"), args.push(q.actor));
    if (!q.includeSystem) where.push("system = 0");
    if (q.ref) (where.push("EXISTS (SELECT 1 FROM json_each(activity.refs) WHERE value = ?)"), args.push(q.ref));
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return this.db
      .prepare(`SELECT json FROM activity ${w} ORDER BY id DESC LIMIT ?`)
      .all(...args, q.limit)
      .map((r) => JSON.parse(r.json as string) as Activity);
  }

  // Every entry (audit entries included) in [since, until), oldest first: the raw material for reports.
  activityBetween(since: string, until: string): Activity[] {
    return this.db
      .prepare("SELECT json FROM activity WHERE at >= ? AND at < ? ORDER BY id")
      .all(since, until)
      .map((r) => JSON.parse(r.json as string) as Activity);
  }

  getActivity(id: string): Activity | null {
    const row = this.db.prepare("SELECT json FROM activity WHERE id = ?").get(id);
    return row ? (JSON.parse(row.json as string) as Activity) : null;
  }

  // ---- search -------------------------------------------------------------

  private insertDoc(kind: DocKind, ref: string, scope: string, status: string, type: string, title: string, summary: string, body: string, tags: string) {
    this.db
      .prepare("INSERT INTO docs_fts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(kind, ref, scope, status, type, fold(title), fold(summary), fold(body), fold(tags));
    // Title and summary first: the model only reads the first few hundred tokens.
    const text = [title, summary, body]
      .map((x) => x.trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000);
    this.db.prepare("INSERT OR REPLACE INTO doc_text VALUES (?, ?, ?, ?, ?, ?, ?)").run(kind, ref, scope, status, type, text, shortHash(text));
  }

  private deleteDoc(kind: DocKind, ref: string) {
    this.db.prepare("DELETE FROM docs_fts WHERE kind = ? AND ref = ?").run(kind, ref);
    this.db.prepare("DELETE FROM doc_text WHERE kind = ? AND ref = ?").run(kind, ref);
  }

  // ---- code links ---------------------------------------------------------

  private insertCodeLinks(kind: DocKind, ref: string, links: { file: string; lines?: string }[] | undefined) {
    const stmt = this.db.prepare("INSERT INTO code_links VALUES (?, ?, ?, ?)");
    for (const l of links ?? []) stmt.run(kind, ref, normalizeFile(l.file), l.lines ?? null);
  }

  nodeCodeLinks(): { path: string; file: string; lines: string | null }[] {
    return this.db.prepare("SELECT ref AS path, file, lines FROM code_links WHERE kind = 'node'").all() as {
      path: string;
      file: string;
      lines: string | null;
    }[];
  }

  // Links that cover any of the files: exact match, a linked directory containing the file, or a file inside an asked-about directory.
  linksForFiles(files: string[]): { kind: DocKind; ref: string; file: string; lines: string | null }[] {
    const out = new Map<string, { kind: DocKind; ref: string; file: string; lines: string | null }>();
    const stmt = this.db.prepare(
      // substr instead of LIKE: "_" and "%" are common in file names and must not act as wildcards.
      "SELECT kind, ref, file, lines FROM code_links WHERE file = :f " +
        "OR substr(:f, 1, length(file) + 1) = file || '/' OR substr(file, 1, length(:f) + 1) = :f || '/'",
    );
    for (const f of files.map(normalizeFile)) {
      for (const r of stmt.all({ f }) as { kind: DocKind; ref: string; file: string; lines: string | null }[]) out.set(`${r.kind}:${r.ref}:${r.file}`, r);
    }
    return [...out.values()];
  }

  // ---- semantic -----------------------------------------------------------

  docTexts(): DocText[] {
    return this.db.prepare("SELECT * FROM doc_text").all() as unknown as DocText[];
  }

  embeddings(): { kind: DocKind; ref: string; model: string; hash: string; vec: Float32Array }[] {
    return this.db
      .prepare("SELECT * FROM embeddings")
      .all()
      .map((r) => {
        const b = r.vec as Uint8Array;
        return {
          kind: r.kind as DocKind,
          ref: r.ref as string,
          model: r.model as string,
          hash: r.hash as string,
          vec: new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)),
        };
      });
  }

  putEmbeddings(rows: { kind: DocKind; ref: string; model: string; hash: string; vec: Float32Array }[]): void {
    this.tx(() => {
      const stmt = this.db.prepare("INSERT OR REPLACE INTO embeddings VALUES (?, ?, ?, ?, ?)");
      for (const r of rows) stmt.run(r.kind, r.ref, r.model, r.hash, new Uint8Array(r.vec.buffer, r.vec.byteOffset, r.vec.byteLength));
    });
  }

  deleteEmbeddings(keys: { kind: DocKind; ref: string }[]): void {
    if (!keys.length) return;
    this.tx(() => {
      const stmt = this.db.prepare("DELETE FROM embeddings WHERE kind = ? AND ref = ?");
      for (const k of keys) stmt.run(k.kind, k.ref);
    });
  }

  search(query: string, opts: SearchOptions): SearchRow[] {
    const terms = fold(query).match(/[\p{L}\p{N}]+/gu) ?? [];
    if (terms.length === 0) return [];
    const quote = (list: string[]) => list.map((t) => `"${t}"*`);
    // Prefer documents matching every term.
    const all = this.runSearch(quote(terms).join(" AND "), opts);
    if (all.length > 0 || terms.length === 1) return all;
    // Then any term, but not filler words: "mı", "ve", "the" would match half the project.
    const meaningful = terms.filter((t) => !STOPWORDS.has(t));
    if (meaningful.length === 0) return [];
    return this.runSearch(quote(meaningful).join(" OR "), opts);
  }

  private runSearch(match: string, opts: SearchOptions): SearchRow[] {
    const where: string[] = ["docs_fts MATCH ?"];
    const args: (string | number)[] = [match];
    if (opts.kinds?.length) (where.push(`kind IN (${opts.kinds.map(() => "?").join(",")})`), args.push(...opts.kinds));
    if (opts.under) (where.push("(scope = ? OR scope LIKE ?)"), args.push(opts.under, `${opts.under}/%`));
    if (opts.status) (where.push("status = ?"), args.push(opts.status));
    if (opts.type) (where.push("type = ?"), args.push(opts.type));
    args.push(opts.limit);
    const sql = `
      SELECT kind, ref, bm25(docs_fts, 0, 0, 0, 0, 0, 5.0, 3.0, 1.0, 4.0) AS rank
      FROM docs_fts WHERE ${where.join(" AND ")}
      ORDER BY rank LIMIT ?`;
    return this.db
      .prepare(sql)
      .all(...args)
      .map((r) => ({ kind: r.kind as DocKind, ref: r.ref as string, score: Math.round(-(r.rank as number) * 1000) / 1000 }));
  }
}

function toNode(r: Record<string, unknown>): IndexedNode {
  return {
    path: r.path as string,
    parent: (r.parent as string | null) ?? null,
    title: r.title as string,
    summary: r.summary as string,
    status: r.status as NodeStatus,
    tags: JSON.parse((r.tags as string) || "[]"),
    updated_at: r.updated_at as string,
    updated_by: r.updated_by as string,
  };
}

function toItem(r: Record<string, unknown>): IndexedItem {
  return {
    id: r.id as string,
    type: r.type as string,
    title: r.title as string,
    status: r.status as string,
    terminal: r.terminal === 1,
    open: r.open_work === 1,
    category_path: (r.category_path as string | null) ?? null,
    author: r.author as string,
    assignee: (r.assignee as string | null) ?? null,
    claimed_by: (r.claimed_by as string | null) ?? null,
    claimed_at: (r.claimed_at as string | null) ?? null,
    blocking: r.blocking === 1,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    reply_count: r.reply_count as number,
    last_reply_by: (r.last_reply_by as string | null) ?? null,
  };
}

export function normalizeFile(f: string): string {
  return f.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

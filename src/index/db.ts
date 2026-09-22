import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Activity, Item, KnowledgeNode, NodeStatus, Reply } from "../core/types.js";
import { fold } from "../util/text.js";
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

export interface IndexedItem {
  id: string;
  type: string;
  title: string;
  status: string;
  terminal: boolean;
  category_path: string | null;
  author: string;
  assignee: string | null;
  blocking: boolean;
  created_at: string;
  updated_at: string;
  reply_count: number;
  last_reply_by: string | null;
}

export type DocKind = "node" | "item" | "activity";

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

export interface ItemQuery {
  type?: string;
  status?: string;
  assignee?: string[];
  author?: string;
  under?: string;
  open?: boolean;
  limit: number;
  offset: number;
}

// Bump when the table layout changes; an old cache is simply dropped and rebuilt from files.
const INDEX_VERSION = 2;

// The index is a disposable cache: everything here can be rebuilt from the files with reindex().
export class Index {
  private db: DatabaseSync;

  constructor(indexDir: string) {
    mkdirSync(indexDir, { recursive: true });
    this.db = new DatabaseSync(join(indexDir, "cortex.db"));
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    const v = (this.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (v !== INDEX_VERSION) {
      this.db.exec(`
        DROP TABLE IF EXISTS nodes; DROP TABLE IF EXISTS nodes_fts;
        DROP TABLE IF EXISTS items; DROP TABLE IF EXISTS activity; DROP TABLE IF EXISTS docs_fts;
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
        terminal INTEGER NOT NULL, category_path TEXT, author TEXT NOT NULL, assignee TEXT,
        blocking INTEGER NOT NULL, created_at TEXT, updated_at TEXT,
        reply_count INTEGER NOT NULL, last_reply_by TEXT
      );
      CREATE INDEX IF NOT EXISTS items_assignee ON items(assignee, terminal);
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

  reindex(data: {
    nodes: KnowledgeNode[];
    items: { item: Item; replies: Reply[]; terminal: boolean }[];
    activity: Activity[];
  }): void {
    this.tx(() => {
      this.db.exec("DELETE FROM nodes; DELETE FROM items; DELETE FROM activity; DELETE FROM docs_fts;");
      for (const n of data.nodes) this.insertNode(n);
      for (const i of data.items) this.insertItem(i.item, i.replies, i.terminal);
      for (const a of data.activity) this.insertActivity(a);
    });
  }

  // ---- nodes --------------------------------------------------------------

  upsertNode(node: KnowledgeNode): void {
    this.tx(() => {
      this.db.prepare("DELETE FROM nodes WHERE path = ?").run(node.path);
      this.deleteDoc("node", node.path);
      this.insertNode(node);
    });
  }

  private insertNode(n: KnowledgeNode): void {
    const tags = n.tags ?? [];
    this.db
      .prepare("INSERT INTO nodes VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(n.path, parentPath(n.path), n.title, n.summary, n.status, JSON.stringify(tags), n.updated_at ?? null, n.updated_by ?? null);
    // Path segments are indexed with the title so "auth" finds "backend/auth/*".
    this.insertDoc("node", n.path, n.path, n.status, "", `${n.title} ${n.path.replace(/[/-]/g, " ")}`, n.summary, n.body, tags.join(" "));
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

  countNodesByStatus(): Record<string, number> {
    const rows = this.db.prepare("SELECT status, COUNT(*) AS c FROM nodes GROUP BY status").all() as { status: string; c: number }[];
    return Object.fromEntries(rows.map((r) => [r.status, r.c]));
  }

  // Open items filed under this node or any node below it.
  openItemsUnder(path: string): number {
    const sql =
      path === ""
        ? "SELECT COUNT(*) AS c FROM items WHERE terminal = 0"
        : "SELECT COUNT(*) AS c FROM items WHERE terminal = 0 AND (category_path = ? OR category_path LIKE ?)";
    const args = path === "" ? [] : [path, `${path}/%`];
    return (this.db.prepare(sql).get(...args) as { c: number }).c;
  }

  // ---- items --------------------------------------------------------------

  upsertItem(item: Item, replies: Reply[], terminal: boolean): void {
    this.tx(() => {
      this.db.prepare("DELETE FROM items WHERE id = ?").run(item.id);
      this.deleteDoc("item", item.id);
      this.insertItem(item, replies, terminal);
    });
  }

  private insertItem(i: Item, replies: Reply[], terminal: boolean): void {
    const last = replies[replies.length - 1];
    this.db
      .prepare("INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        i.id, i.type, i.title, i.status, terminal ? 1 : 0, i.category_path ?? null, i.author, i.assignee ?? null,
        i.fields?.blocking === true ? 1 : 0, i.created_at, i.updated_at, replies.length, last?.author ?? null,
      );
    const fieldText = Object.values(i.fields ?? {}).filter((v) => typeof v === "string").join(" ");
    const replyText = replies.map((r) => r.body).join(" ");
    this.insertDoc("item", i.id, i.category_path ?? "", i.status, i.type, i.title, i.body.slice(0, 300), `${i.body} ${fieldText} ${replyText}`, (i.tags ?? []).join(" "));
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
    if (q.open !== undefined) (where.push("terminal = ?"), args.push(q.open ? 0 : 1));
    if (q.assignee?.length) (where.push(`assignee IN (${q.assignee.map(() => "?").join(",")})`), args.push(...q.assignee));
    if (q.under) (where.push("(category_path = ? OR category_path LIKE ?)"), args.push(q.under, `${q.under}/%`));
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

  getActivity(id: string): Activity | null {
    const row = this.db.prepare("SELECT json FROM activity WHERE id = ?").get(id);
    return row ? (JSON.parse(row.json as string) as Activity) : null;
  }

  // ---- search -------------------------------------------------------------

  private insertDoc(kind: DocKind, ref: string, scope: string, status: string, type: string, title: string, summary: string, body: string, tags: string) {
    this.db
      .prepare("INSERT INTO docs_fts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(kind, ref, scope, status, type, fold(title), fold(summary), fold(body), fold(tags));
  }

  private deleteDoc(kind: DocKind, ref: string) {
    this.db.prepare("DELETE FROM docs_fts WHERE kind = ? AND ref = ?").run(kind, ref);
  }

  search(query: string, opts: SearchOptions): SearchRow[] {
    const terms = fold(query).match(/[\p{L}\p{N}]+/gu) ?? [];
    if (terms.length === 0) return [];
    const quoted = terms.map((t) => `"${t}"*`);
    // Prefer documents matching every term; fall back to any term so the AI never gets an empty answer too early.
    for (const op of [" AND ", " OR "]) {
      const hits = this.runSearch(quoted.join(op), opts);
      if (hits.length > 0 || terms.length === 1) return hits;
    }
    return [];
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
    category_path: (r.category_path as string | null) ?? null,
    author: r.author as string,
    assignee: (r.assignee as string | null) ?? null,
    blocking: r.blocking === 1,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    reply_count: r.reply_count as number,
    last_reply_by: (r.last_reply_by as string | null) ?? null,
  };
}

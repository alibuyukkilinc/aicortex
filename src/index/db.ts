import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { KnowledgeNode, NodeStatus } from "../core/types.js";
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

export interface SearchHit extends IndexedNode {
  score: number;
}

// The index is a disposable cache: everything here can be rebuilt from the files with reindex().
export class Index {
  private db: DatabaseSync;

  constructor(indexDir: string) {
    mkdirSync(indexDir, { recursive: true });
    this.db = new DatabaseSync(join(indexDir, "cortex.db"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS nodes (
        path TEXT PRIMARY KEY,
        parent TEXT,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL,
        tags TEXT NOT NULL,
        updated_at TEXT,
        updated_by TEXT
      );
      CREATE INDEX IF NOT EXISTS nodes_parent ON nodes(parent);
      CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
        path UNINDEXED, title, summary, body, tags,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  reindex(nodes: KnowledgeNode[]): void {
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM nodes; DELETE FROM nodes_fts;");
      for (const n of nodes) this.insert(n);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  upsert(node: KnowledgeNode): void {
    this.db.prepare("DELETE FROM nodes WHERE path = ?").run(node.path);
    this.db.prepare("DELETE FROM nodes_fts WHERE path = ?").run(node.path);
    this.insert(node);
  }

  private insert(n: KnowledgeNode): void {
    const tags = n.tags ?? [];
    this.db
      .prepare("INSERT INTO nodes VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(n.path, parentPath(n.path), n.title, n.summary, n.status, JSON.stringify(tags), n.updated_at ?? null, n.updated_by ?? null);
    // Path segments are indexed with the title so "auth" finds "backend/auth/*".
    this.db
      .prepare("INSERT INTO nodes_fts VALUES (?, ?, ?, ?, ?)")
      .run(n.path, fold(`${n.title} ${n.path.replace(/[/-]/g, " ")}`), fold(n.summary), fold(n.body), fold(tags.join(" ")));
  }

  get(path: string): IndexedNode | null {
    const row = this.db.prepare("SELECT * FROM nodes WHERE path = ?").get(path);
    return row ? toNode(row) : null;
  }

  children(path: string): IndexedNode[] {
    return this.db.prepare("SELECT * FROM nodes WHERE parent = ? ORDER BY path").all(path).map(toNode);
  }

  childCount(path: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS c FROM nodes WHERE parent = ?").get(path) as { c: number };
    return row.c;
  }

  countByStatus(): Record<string, number> {
    const rows = this.db.prepare("SELECT status, COUNT(*) AS c FROM nodes GROUP BY status").all() as { status: string; c: number }[];
    return Object.fromEntries(rows.map((r) => [r.status, r.c]));
  }

  search(query: string, opts: { under?: string; status?: string; limit: number }): SearchHit[] {
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

  private runSearch(match: string, opts: { under?: string; status?: string; limit: number }): SearchHit[] {
    const where: string[] = ["nodes_fts MATCH ?"];
    const args: (string | number)[] = [match];
    if (opts.under) {
      where.push("(n.path = ? OR n.path LIKE ?)");
      args.push(opts.under, `${opts.under}/%`);
    }
    if (opts.status) {
      where.push("n.status = ?");
      args.push(opts.status);
    }
    args.push(opts.limit);
    const sql = `
      SELECT n.*, bm25(nodes_fts, 0, 5.0, 3.0, 1.0, 4.0) AS rank
      FROM nodes_fts JOIN nodes n ON n.path = nodes_fts.path
      WHERE ${where.join(" AND ")}
      ORDER BY rank LIMIT ?`;
    return this.db
      .prepare(sql)
      .all(...args)
      .map((r) => ({ ...toNode(r), score: Math.round(-(r.rank as number) * 1000) / 1000 }));
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import YAML from "yaml";
import { CortexError } from "../core/types.js";
import { nowIso } from "../util/text.js";
import { newToken, tokenHash } from "./crypto.js";
import { DEFAULT_ROLE, Role, isRoleFor } from "./roles.js";

// The hub's own data: people, AI agents, projects and who may do what where. It holds password hashes and
// sessions, so it lives outside every repository (default ~/.cortex/hub) and is never committed.

export interface HubSettings {
  org: string;
  public_url?: string; // e.g. https://cortex.example.com; used for invite links and secure cookies
  host: string;
  port: number;
  allowed_hosts?: string[]; // optional Host header allowlist when exposed on a network
}

export interface User {
  id: string;
  email: string;
  name: string;
  org_admin: boolean;
  disabled: boolean;
  has_password: boolean;
  created_at: string;
}

export interface Agent {
  id: string;
  name: string;
  disabled: boolean;
  created_at: string;
  created_by: string | null;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
}

export interface Member {
  project_id: string;
  principal: string;
  kind: "human" | "ai";
  role: Role;
  scope: "all" | "own";
  branches: string[];
}

export type Principal = { kind: "human"; user: User } | { kind: "ai"; agent: Agent };

const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = 86_400_000;
export const SESSION_DAYS = 30;
export const INVITE_DAYS = 7;

export class HubStore {
  readonly db: DatabaseSync;
  settings: HubSettings;

  constructor(readonly dir: string) {
    if (!existsSync(join(dir, "hub.yaml"))) throw new CortexError("hub_not_initialized", `No hub in ${dir}. Run \`aicortex hub init\` first.`, 404);
    this.settings = YAML.parse(readFileSync(join(dir, "hub.yaml"), "utf8")) as HubSettings;
    this.db = new DatabaseSync(join(dir, "hub.db"));
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password TEXT,
        org_admin INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
        disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, created_by TEXT
      );
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS members (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, principal TEXT NOT NULL, kind TEXT NOT NULL,
        role TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'all', branches TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (project_id, principal)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invites (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL
      );
      -- One row per API or MCP call: how much reading and writing each person and agent actually does.
      -- Kept out of the projects on purpose: it is operational noise, not project knowledge.
      CREATE TABLE IF NOT EXISTS usage (
        at TEXT NOT NULL, project_id TEXT NOT NULL, principal TEXT NOT NULL, kind TEXT NOT NULL,
        route TEXT NOT NULL, bytes INTEGER NOT NULL, ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS usage_at ON usage(at);
    `);
  }

  static init(dir: string, settings: HubSettings): HubStore {
    if (existsSync(join(dir, "hub.yaml"))) throw new CortexError("already_initialized", `A hub already exists in ${dir}.`, 409);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "hub.yaml"),
      "# Cortex hub settings. The database next to this file holds password hashes: keep this folder private and backed up.\n" + YAML.stringify(settings),
      "utf8",
    );
    return new HubStore(dir);
  }

  close(): void {
    this.db.close();
  }

  // ---- users ----------------------------------------------------------------------

  private toUser(r: Record<string, unknown>): User {
    return {
      id: r.id as string, email: r.email as string, name: r.name as string, org_admin: r.org_admin === 1, disabled: r.disabled === 1,
      has_password: !!r.password, created_at: r.created_at as string,
    };
  }

  users(): User[] {
    return this.db.prepare("SELECT * FROM users ORDER BY name COLLATE NOCASE").all().map((r) => this.toUser(r));
  }

  user(id: string): User | null {
    const r = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return r ? this.toUser(r) : null;
  }

  userByEmail(email: string): (User & { password: string | null }) | null {
    const r = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim());
    return r ? { ...this.toUser(r), password: (r.password as string | null) ?? null } : null;
  }

  // Handles come from the email ("ali.veli@x.com" -> "ali-veli"), unique across users and agents,
  // because they are the actor ids that appear in every project's files.
  private freeId(base: string): string {
    const clean = base.toLowerCase().normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 32) || "user";
    let id = clean;
    for (let n = 2; this.idTaken(id); n++) id = `${clean}-${n}`;
    return id;
  }

  private idTaken(id: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM users WHERE id = ? UNION SELECT 1 FROM agents WHERE id = ?").get(id, id);
  }

  createUser(input: { email: string; name: string; org_admin?: boolean }): User {
    const email = input.email.trim();
    if (!EMAIL.test(email)) throw new CortexError("invalid_user", "A valid email address is required.", 400);
    if (!input.name?.trim()) throw new CortexError("invalid_user", "A name is required.", 400);
    if (this.userByEmail(email)) throw new CortexError("conflict", `A user with ${email} already exists.`, 409);
    const id = this.freeId(email.split("@")[0]);
    this.db.prepare("INSERT INTO users (id, email, name, org_admin, created_at) VALUES (?, ?, ?, ?, ?)").run(id, email, input.name.trim(), input.org_admin ? 1 : 0, nowIso());
    return this.user(id)!;
  }

  updateUser(id: string, patch: { name?: string; org_admin?: boolean; disabled?: boolean }): User {
    const u = this.user(id);
    if (!u) throw new CortexError("not_found", `No user "${id}".`, 404);
    if ((patch.org_admin === false || patch.disabled === true) && u.org_admin && this.adminCount() === 1) {
      throw new CortexError("last_admin", "This is the only organization admin. Make someone else admin first.", 409);
    }
    this.db
      .prepare("UPDATE users SET name = ?, org_admin = ?, disabled = ? WHERE id = ?")
      .run(patch.name?.trim() || u.name, (patch.org_admin ?? u.org_admin) ? 1 : 0, (patch.disabled ?? u.disabled) ? 1 : 0, id);
    if (patch.disabled) this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    return this.user(id)!;
  }

  private adminCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE org_admin = 1 AND disabled = 0").get() as { n: number }).n;
  }

  setPassword(id: string, hash: string): void {
    this.db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hash, id);
    // A new password ends every other session, so a reset locks out whoever had the old one.
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }

  // ---- invites and sessions -------------------------------------------------------------

  createInvite(userId: string): string {
    const token = newToken("inv");
    this.db.prepare("DELETE FROM invites WHERE user_id = ?").run(userId); // only the newest link works
    this.db.prepare("INSERT INTO invites VALUES (?, ?, ?)").run(tokenHash(token), userId, new Date(Date.now() + INVITE_DAYS * DAY).toISOString());
    return token;
  }

  inviteUser(token: string): User | null {
    const r = this.db.prepare("SELECT user_id, expires_at FROM invites WHERE token_hash = ?").get(tokenHash(token)) as { user_id: string; expires_at: string } | undefined;
    if (!r || r.expires_at < nowIso()) return null;
    const u = this.user(r.user_id);
    return u && !u.disabled ? u : null;
  }

  useInvite(token: string): void {
    this.db.prepare("DELETE FROM invites WHERE token_hash = ?").run(tokenHash(token));
  }

  createSession(userId: string): string {
    const token = newToken("ses");
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowIso());
    this.db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)").run(tokenHash(token), userId, nowIso(), new Date(Date.now() + SESSION_DAYS * DAY).toISOString());
    return token;
  }

  sessionUser(token: string | undefined): User | null {
    if (!token) return null;
    const r = this.db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").get(tokenHash(token)) as { user_id: string; expires_at: string } | undefined;
    if (!r || r.expires_at < nowIso()) return null;
    const u = this.user(r.user_id);
    return u && !u.disabled ? u : null;
  }

  endSession(token: string | undefined): void {
    if (token) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  }

  // ---- agents ---------------------------------------------------------------------------

  private toAgent(r: Record<string, unknown>): Agent {
    return { id: r.id as string, name: r.name as string, disabled: r.disabled === 1, created_at: r.created_at as string, created_by: (r.created_by as string | null) ?? null };
  }

  agents(): Agent[] {
    return this.db.prepare("SELECT * FROM agents ORDER BY id").all().map((r) => this.toAgent(r));
  }

  agent(id: string): Agent | null {
    const r = this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
    return r ? this.toAgent(r) : null;
  }

  // Returns the token once; only its hash is kept.
  createAgent(input: { id: string; name?: string }, by: string): { agent: Agent; token: string } {
    const id = (input.id ?? "").trim().toLowerCase();
    if (!ID.test(id)) throw new CortexError("invalid_agent", "Agent id: lowercase letters, digits, - or _ (e.g. claude-code).", 400);
    if (this.idTaken(id)) throw new CortexError("conflict", `"${id}" is already used by a user or agent.`, 409);
    const token = newToken("ctx");
    this.db.prepare("INSERT INTO agents VALUES (?, ?, ?, 0, ?, ?)").run(id, input.name?.trim() || id, tokenHash(token), nowIso(), by);
    return { agent: this.agent(id)!, token };
  }

  rotateAgentToken(id: string): string {
    if (!this.agent(id)) throw new CortexError("not_found", `No agent "${id}".`, 404);
    const token = newToken("ctx");
    this.db.prepare("UPDATE agents SET token_hash = ? WHERE id = ?").run(tokenHash(token), id);
    return token;
  }

  updateAgent(id: string, patch: { name?: string; disabled?: boolean }): Agent {
    const a = this.agent(id);
    if (!a) throw new CortexError("not_found", `No agent "${id}".`, 404);
    this.db.prepare("UPDATE agents SET name = ?, disabled = ? WHERE id = ?").run(patch.name?.trim() || a.name, (patch.disabled ?? a.disabled) ? 1 : 0, id);
    return this.agent(id)!;
  }

  agentByToken(token: string | undefined): Agent | null {
    if (!token) return null;
    const r = this.db.prepare("SELECT * FROM agents WHERE token_hash = ?").get(tokenHash(token));
    const a = r ? this.toAgent(r) : null;
    return a && !a.disabled ? a : null;
  }

  // ---- usage ------------------------------------------------------------------------------

  record(row: { project: string; principal: string; kind: "human" | "ai"; route: string; bytes: number; ms?: number }): void {
    this.db
      .prepare("INSERT INTO usage (at, project_id, principal, kind, route, bytes, ms) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(nowIso(), row.project, row.principal, row.kind, row.route, Math.max(0, Math.round(row.bytes)), Math.max(0, Math.round(row.ms ?? 0)));
  }

  // Old rows are not worth keeping; this is a meter, not a log.
  forgetUsageBefore(iso: string): void {
    this.db.prepare("DELETE FROM usage WHERE at < ?").run(iso);
  }

  usage(since: string, filter: { project?: string; kind?: "human" | "ai" } = {}) {
    const clauses = ["at >= ?"];
    const args: string[] = [since];
    if (filter.project) (clauses.push("project_id = ?"), args.push(filter.project));
    if (filter.kind) (clauses.push("kind = ?"), args.push(filter.kind));
    const where = clauses.join(" AND ");
    const rows = this.db
      .prepare(`SELECT principal, kind, project_id, COUNT(*) AS calls, SUM(bytes) AS bytes, MAX(at) AS last_at FROM usage WHERE ${where} GROUP BY principal, project_id ORDER BY bytes DESC`)
      .all(...args) as { principal: string; kind: string; project_id: string; calls: number; bytes: number; last_at: string }[];
    const routes = this.db
      .prepare(`SELECT principal, route, COUNT(*) AS calls, SUM(bytes) AS bytes FROM usage WHERE ${where} GROUP BY principal, route ORDER BY calls DESC`)
      .all(...args) as { principal: string; route: string; calls: number; bytes: number }[];
    // Split by kind, so a chart can show at a glance whether the people or the agents are doing the reading.
    const days = this.db
      .prepare(
        `SELECT substr(at, 1, 10) AS day,
                SUM(CASE WHEN kind = 'ai' THEN 1 ELSE 0 END) AS ai_calls,
                SUM(CASE WHEN kind = 'human' THEN 1 ELSE 0 END) AS human_calls,
                SUM(CASE WHEN kind = 'ai' THEN bytes ELSE 0 END) AS ai_bytes,
                SUM(CASE WHEN kind = 'human' THEN bytes ELSE 0 END) AS human_bytes
         FROM usage WHERE ${where} GROUP BY day ORDER BY day`,
      )
      .all(...args) as { day: string; ai_calls: number; human_calls: number; ai_bytes: number; human_bytes: number }[];
    return {
      since,
      // Roughly 4 characters per token, the same estimate the API uses for its budgets.
      by_principal: rows.map((r) => ({ ...r, name: this.user(r.principal)?.name ?? this.agent(r.principal)?.name ?? r.principal, tokens: Math.round(r.bytes / 4) })),
      by_route: routes.map((r) => ({ ...r, tokens: Math.round(r.bytes / 4) })),
      daily: fillDays(since, days).map((d) => ({
        date: d.day,
        ai: d.ai_calls,
        human: d.human_calls,
        ai_tokens: Math.round(d.ai_bytes / 4),
        human_tokens: Math.round(d.human_bytes / 4),
      })),
      totals: {
        calls: rows.reduce((n, r) => n + r.calls, 0),
        bytes: rows.reduce((n, r) => n + r.bytes, 0),
        tokens: Math.round(rows.reduce((n, r) => n + r.bytes, 0) / 4),
      },
    };
  }

  // ---- projects and members -------------------------------------------------------------

  projects(): Project[] {
    return this.db.prepare("SELECT * FROM projects ORDER BY name COLLATE NOCASE").all() as unknown as Project[];
  }

  project(id: string): Project | null {
    return (this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined) ?? null;
  }

  addProject(input: { id: string; name: string; path: string }): Project {
    if (!ID.test(input.id)) throw new CortexError("invalid_project", "Project id: lowercase letters, digits, - or _.", 400);
    if (this.project(input.id)) throw new CortexError("conflict", `A project with id "${input.id}" already exists.`, 409);
    if (this.db.prepare("SELECT 1 FROM projects WHERE path = ?").get(input.path)) throw new CortexError("conflict", "That folder is already registered.", 409);
    this.db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?)").run(input.id, input.name, input.path, nowIso());
    return this.project(input.id)!;
  }

  removeProject(id: string): void {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id); // members go with it; the folder is untouched
  }

  members(projectId: string): Member[] {
    return (this.db.prepare("SELECT * FROM members WHERE project_id = ? ORDER BY kind DESC, principal").all(projectId) as Record<string, unknown>[]).map(toMember);
  }

  member(projectId: string, principal: string): Member | null {
    const r = this.db.prepare("SELECT * FROM members WHERE project_id = ? AND principal = ?").get(projectId, principal);
    return r ? toMember(r as Record<string, unknown>) : null;
  }

  memberships(principal: string): Member[] {
    return (this.db.prepare("SELECT * FROM members WHERE principal = ?").all(principal) as Record<string, unknown>[]).map(toMember);
  }

  setMember(projectId: string, principal: string, input: { role?: string; scope?: string; branches?: string[] }): Member {
    if (!this.project(projectId)) throw new CortexError("not_found", `No project "${projectId}".`, 404);
    const kind: "human" | "ai" | null = this.user(principal) ? "human" : this.agent(principal) ? "ai" : null;
    if (!kind) throw new CortexError("not_found", `No user or agent "${principal}".`, 404);
    const role = input.role ?? this.member(projectId, principal)?.role ?? DEFAULT_ROLE[kind];
    if (!isRoleFor(kind, role)) {
      throw new CortexError("invalid_role", `"${role}" is not a ${kind === "human" ? "human" : "AI"} role.`, 400, {
        roles: kind === "human" ? ["owner", "admin", "member", "viewer"] : ["reader", "contributor", "trusted"],
      });
    }
    const scope = input.scope ?? this.member(projectId, principal)?.scope ?? "all";
    if (scope !== "all" && scope !== "own") throw new CortexError("invalid_scope", 'scope is "all" or "own".', 400);
    const branches = (input.branches ?? this.member(projectId, principal)?.branches ?? []).map((b) => b.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
    this.db
      .prepare("INSERT OR REPLACE INTO members VALUES (?, ?, ?, ?, ?, ?)")
      .run(projectId, principal, kind, role, scope, JSON.stringify([...new Set(branches)]));
    return this.member(projectId, principal)!;
  }

  removeMember(projectId: string, principal: string): void {
    this.db.prepare("DELETE FROM members WHERE project_id = ? AND principal = ?").run(projectId, principal);
  }
}

// Days with no calls still belong on the chart, otherwise a quiet week looks like a busy one.
function fillDays(since: string, rows: { day: string; ai_calls: number; human_calls: number; ai_bytes: number; human_bytes: number }[]) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: typeof rows = [];
  const start = new Date(since.slice(0, 10) + "T00:00:00Z").getTime();
  for (let t = start; t <= Date.now(); t += DAY) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, ai_calls: 0, human_calls: 0, ai_bytes: 0, human_bytes: 0 });
  }
  return out;
}

function toMember(r: Record<string, unknown>): Member {
  return {
    project_id: r.project_id as string,
    principal: r.principal as string,
    kind: r.kind as "human" | "ai",
    role: r.role as Role,
    scope: r.scope as "all" | "own",
    branches: JSON.parse((r.branches as string) || "[]"),
  };
}

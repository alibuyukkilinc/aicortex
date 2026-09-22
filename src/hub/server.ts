import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CSRF_HEADER } from "../api/auth.js";
import { baseServer, SAFE_METHODS } from "../api/server.js";
import { projectRoutes } from "../api/routes.js";
import { Cortex } from "../core/cortex.js";
import { initProject } from "../core/init.js";
import { loadProject } from "../core/project.js";
import { Actor, CortexError } from "../core/types.js";
import { buildAccess } from "./access.js";
import { PASSWORD_MIN, hashPassword, verifyPassword } from "./crypto.js";
import { ROLE_POLICY } from "./roles.js";
import { HubStore, Member, Principal, SESSION_DAYS, User } from "./store.js";

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export const HUB_COOKIE = "cortex_hub";
type Q = Record<string, string | undefined>;

// One running Cortex per registered project, opened on first use and kept watching its folder.
export class Hub {
  private open = new Map<string, { cortex: Cortex; fileActors: Actor[] }>();

  constructor(readonly store: HubStore) {}

  cortex(projectId: string): Cortex {
    const cached = this.open.get(projectId);
    if (cached) return cached.cortex;
    const p = this.store.project(projectId);
    if (!p) throw new CortexError("not_found", `No project "${projectId}".`, 404);
    const cortex = new Cortex(loadProject(p.path));
    cortex.watch((e) => console.error(`⚠ ${projectId}: reindex failed: ${(e as Error).message}`));
    this.open.set(projectId, { cortex, fileActors: [...cortex.project.config.actors] });
    this.syncActors(projectId);
    return cortex;
  }

  // The core knows actors from the project file (history: owner, ai-agent...). Hub members are added in
  // memory so assignments, mentions and reports recognise them; nothing is written to the repository.
  syncActors(projectId: string): void {
    const o = this.open.get(projectId);
    if (!o) return;
    const members = this.store.members(projectId).map((m) => ({ id: m.principal, kind: m.kind }));
    const ids = new Set(members.map((m) => m.id));
    o.cortex.project.config.actors = [...members, ...o.fileActors.filter((a) => !ids.has(a.id))];
  }

  // Organization admins act as owners everywhere, so a project can never be locked out.
  membership(projectId: string, principal: Principal): Member | null {
    const id = principal.kind === "human" ? principal.user.id : principal.agent.id;
    const m = this.store.member(projectId, id);
    if (m) return m;
    if (principal.kind === "human" && principal.user.org_admin) return { project_id: projectId, principal: id, kind: "human", role: "owner", scope: "all", branches: [] };
    return null;
  }

  close(): void {
    for (const { cortex } of this.open.values()) cortex.close();
    this.open.clear();
  }
}

// Brute-force brake: 10 failed logins per address and email in 15 minutes.
class LoginLimiter {
  private hits = new Map<string, { n: number; since: number }>();
  blocked(key: string): boolean {
    const h = this.hits.get(key);
    if (!h || Date.now() - h.since > 15 * 60_000) return false;
    return h.n >= 10;
  }
  fail(key: string): void {
    const h = this.hits.get(key);
    if (!h || Date.now() - h.since > 15 * 60_000) this.hits.set(key, { n: 1, since: Date.now() });
    else h.n++;
  }
  clear(key: string): void {
    this.hits.delete(key);
  }
}

export function buildHubServer(hub: Hub): FastifyInstance {
  const app = baseServer();
  const store = hub.store;
  const limiter = new LoginLimiter();
  const secure = () => (store.settings.public_url ?? "").startsWith("https://");
  const baseUrl = () => (store.settings.public_url ?? `http://localhost:${store.settings.port}`).replace(/\/+$/, "");
  const inviteUrl = (token: string) => `${baseUrl()}/invite/${token}`;
  const setSession = (reply: FastifyReply, token: string) =>
    reply.setCookie(HUB_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: SESSION_DAYS * 86400 });

  const PUBLIC = new Set(["/api/health", "/api/auth/login"]);

  app.addHook("onRequest", async (req, reply) => {
    const allowed = store.settings.allowed_hosts;
    if (allowed?.length) {
      const host = (req.headers.host ?? "").replace(/:\d+$/, "");
      if (!allowed.includes(host) && host !== "localhost" && host !== "127.0.0.1") {
        return reply.code(403).send({ error: { code: "forbidden_host", message: "Unknown host." } });
      }
    }
    const path = req.url.split("?")[0];
    if (!path.startsWith("/api/") || PUBLIC.has(path) || path.startsWith("/api/auth/invite/")) return;

    const auth = req.headers.authorization ?? "";
    if (auth.startsWith("Bearer ")) {
      const agent = store.agentByToken(auth.slice(7));
      if (agent) req.principal = { kind: "ai", agent };
    } else {
      const user = store.sessionUser(req.cookies[HUB_COOKIE]);
      if (user) {
        if (!SAFE_METHODS.has(req.method) && req.headers[CSRF_HEADER] !== "1") {
          return reply.code(403).send({ error: { code: "csrf", message: `Missing ${CSRF_HEADER} header.` } });
        }
        req.principal = { kind: "human", user };
      }
    }
    if (!req.principal) {
      return reply.code(401).send({ error: { code: "unauthorized", message: "Sign in on the board, or send 'Authorization: Bearer <agent token>'." } });
    }
  });

  const me = (req: FastifyRequest): User => {
    if (req.principal?.kind !== "human") throw new CortexError("forbidden", "Only people can do this.", 403);
    return req.principal.user;
  };
  const orgAdmin = (req: FastifyRequest): User => {
    const u = me(req);
    if (!u.org_admin) throw new CortexError("forbidden", "Only organization admins can do this.", 403);
    return u;
  };

  app.get("/api/health", async () => ({ ok: true, mode: "hub", org: store.settings.org }));

  // ---- sign in -------------------------------------------------------------------------------

  app.post("/api/auth/login", async (req, reply) => {
    const { email = "", password = "" } = (req.body ?? {}) as { email?: string; password?: string };
    const key = `${req.ip}|${email.trim().toLowerCase()}`;
    if (limiter.blocked(key)) throw new CortexError("rate_limited", "Too many attempts. Try again in 15 minutes.", 429);
    const user = store.userByEmail(email);
    const good = await verifyPassword(password, user?.password ?? null);
    if (!user || !good || user.disabled) {
      limiter.fail(key);
      throw new CortexError("invalid_login", "Email or password is not correct.", 401);
    }
    limiter.clear(key);
    setSession(reply, store.createSession(user.id));
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    store.endSession(req.cookies[HUB_COOKIE]);
    return reply.clearCookie(HUB_COOKIE, { path: "/" }).send({ ok: true });
  });

  // Invite links set the first password, and later serve as password resets.
  app.get("/api/auth/invite/:token", async (req) => {
    const u = store.inviteUser((req.params as Q).token!);
    if (!u) throw new CortexError("invalid_invite", "This link has expired or was already used. Ask an admin for a new one.", 404);
    return { email: u.email, name: u.name, org: store.settings.org };
  });

  app.post("/api/auth/invite/:token", async (req, reply) => {
    const token = (req.params as Q).token!;
    const u = store.inviteUser(token);
    if (!u) throw new CortexError("invalid_invite", "This link has expired or was already used. Ask an admin for a new one.", 404);
    const { password = "" } = (req.body ?? {}) as { password?: string };
    if (password.length < PASSWORD_MIN) throw new CortexError("weak_password", `Use at least ${PASSWORD_MIN} characters.`, 400);
    store.setPassword(u.id, await hashPassword(password));
    store.useInvite(token);
    setSession(reply, store.createSession(u.id));
    return { ok: true };
  });

  app.get("/api/hub/me", async (req) => {
    const p = req.principal!;
    const id = p.kind === "human" ? p.user.id : p.agent.id;
    const projects = store
      .projects()
      .map((pr) => ({ ...pr, member: hub.membership(pr.id, p) }))
      .filter((pr) => pr.member)
      .map((pr) => ({ id: pr.id, name: pr.name, role: pr.member!.role }));
    return {
      org: store.settings.org,
      principal: p.kind === "human" ? { id, kind: "human", email: p.user.email, name: p.user.name, org_admin: p.user.org_admin } : { id, kind: "ai", name: p.agent.name },
      projects,
    };
  });

  // ---- organization admin ----------------------------------------------------------------------

  app.get("/api/admin/users", async (req) => {
    orgAdmin(req);
    return { users: store.users().map((u) => ({ ...u, projects: store.memberships(u.id).map((m) => ({ id: m.project_id, role: m.role })) })) };
  });
  app.post("/api/admin/users", async (req, reply) => {
    orgAdmin(req);
    const b = (req.body ?? {}) as { email?: string; name?: string; org_admin?: boolean; projects?: { id: string; role?: string }[] };
    const user = store.createUser({ email: b.email ?? "", name: b.name ?? "", org_admin: b.org_admin });
    for (const p of b.projects ?? []) {
      store.setMember(p.id, user.id, { role: p.role });
      hub.syncActors(p.id);
    }
    return reply.code(201).send({ user, invite_url: inviteUrl(store.createInvite(user.id)) });
  });
  app.patch("/api/admin/users/:id", async (req) => {
    const admin = orgAdmin(req);
    const id = (req.params as Q).id!;
    const b = (req.body ?? {}) as { name?: string; org_admin?: boolean; disabled?: boolean };
    if (id === admin.id && (b.disabled || b.org_admin === false)) throw new CortexError("forbidden", "You cannot lock yourself out.", 403);
    return { user: store.updateUser(id, b) };
  });
  app.post("/api/admin/users/:id/invite", async (req) => {
    orgAdmin(req);
    const id = (req.params as Q).id!;
    if (!store.user(id)) throw new CortexError("not_found", `No user "${id}".`, 404);
    return { invite_url: inviteUrl(store.createInvite(id)) };
  });

  app.get("/api/admin/agents", async (req) => {
    orgAdmin(req);
    return { agents: store.agents().map((a) => ({ ...a, projects: store.memberships(a.id).map((m) => ({ id: m.project_id, role: m.role })) })) };
  });
  app.post("/api/admin/agents", async (req, reply) => {
    const admin = orgAdmin(req);
    const b = (req.body ?? {}) as { id?: string; name?: string; projects?: { id: string; role?: string }[] };
    const r = store.createAgent({ id: b.id ?? "", name: b.name }, admin.id);
    for (const p of b.projects ?? []) {
      store.setMember(p.id, r.agent.id, { role: p.role });
      hub.syncActors(p.id);
    }
    return reply.code(201).send({ ...r, note: "Copy the token now: it is shown only once." });
  });
  app.post("/api/admin/agents/:id/token", async (req) => {
    orgAdmin(req);
    return { token: store.rotateAgentToken((req.params as Q).id!), note: "The old token stopped working." };
  });
  app.patch("/api/admin/agents/:id", async (req) => {
    orgAdmin(req);
    return { agent: store.updateAgent((req.params as Q).id!, (req.body ?? {}) as { name?: string; disabled?: boolean }) };
  });

  app.get("/api/admin/projects", async (req) => {
    orgAdmin(req);
    return { projects: store.projects().map((p) => ({ ...p, members: store.members(p.id).length, exists: existsSync(join(p.path, ".cortex")) })) };
  });
  // Register an existing Cortex project by folder, or create .cortex in a folder that has none (init: true).
  app.post("/api/admin/projects", async (req, reply) => {
    const admin = orgAdmin(req);
    const b = (req.body ?? {}) as { path?: string; id?: string; name?: string; init?: boolean; language?: string };
    if (!b.path?.trim()) throw new CortexError("invalid_project", "Send the project folder as path.", 400);
    const path = resolve(b.path.trim());
    if (!existsSync(path)) throw new CortexError("invalid_project", `Folder not found: ${path}`, 400);
    const name = b.name?.trim() || basename(path);
    if (!existsSync(join(path, ".cortex", "cortex.config.yaml"))) {
      if (!b.init) throw new CortexError("not_initialized", "That folder has no .cortex yet. Send init: true to create one.", 400, { path });
      initProject(path, name, { language: b.language });
    }
    const id = (b.id?.trim() || name).toLowerCase().normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 40);
    const project = store.addProject({ id, name, path });
    store.setMember(project.id, admin.id, { role: "owner" });
    return reply.code(201).send({ project });
  });
  app.delete("/api/admin/projects/:id", async (req) => {
    orgAdmin(req);
    store.removeProject((req.params as Q).id!);
    return { ok: true, note: "Unregistered. The project folder and its .cortex are untouched." };
  });

  // ---- one project: the regular API plus members ----------------------------------------------

  app.register(
    async (scope) => {
      scope.addHook("preHandler", async (req) => {
        const projectId = (req.params as Q).project!;
        if (!store.project(projectId)) throw new CortexError("not_found", `No project "${projectId}".`, 404);
        const p = req.principal!;
        const m = hub.membership(projectId, p);
        if (!m) throw new CortexError("forbidden", "You are not a member of this project.", 403);
        req.cortex = hub.cortex(projectId);
        req.access = buildAccess(m);
        req.actor = { id: m.principal, kind: m.kind, ...(ROLE_POLICY[m.role] ? { policy: ROLE_POLICY[m.role] } : {}) };
      });

      await scope.register(projectRoutes);

      scope.get("/members", async (req) => {
        const projectId = (req.params as Q).project!;
        const describe = (m: Member) => {
          const u = m.kind === "human" ? store.user(m.principal) : null;
          const a = m.kind === "ai" ? store.agent(m.principal) : null;
          return { ...m, name: u?.name ?? a?.name ?? m.principal, ...(u && req.access!.can("manage_members") ? { email: u.email } : {}) };
        };
        return { members: store.members(projectId).map(describe) };
      });
      // People and agents in the organization who are not in this project yet.
      scope.get("/members/candidates", async (req) => {
        if (!req.access!.can("manage_members")) throw new CortexError("forbidden", "Your role cannot manage members.", 403);
        const projectId = (req.params as Q).project!;
        const taken = new Set(store.members(projectId).map((m) => m.principal));
        return {
          candidates: [
            ...store.users().filter((u) => !u.disabled && !taken.has(u.id)).map((u) => ({ id: u.id, name: u.name, kind: "human" })),
            ...store.agents().filter((a) => !a.disabled && !taken.has(a.id)).map((a) => ({ id: a.id, name: a.name, kind: "ai" })),
          ],
        };
      });
      scope.put("/members/:principal", async (req) => {
        if (!req.access!.can("manage_members")) throw new CortexError("forbidden", "Your role cannot manage members.", 403);
        const { project, principal } = req.params as Q;
        const b = (req.body ?? {}) as { role?: string; scope?: string; branches?: string[] };
        // Only owners hand out or take away ownership.
        const current = store.member(project!, principal!);
        if ((b.role === "owner" || current?.role === "owner") && req.access!.role !== "owner") {
          throw new CortexError("forbidden", "Only owners can change ownership.", 403);
        }
        const m = store.setMember(project!, principal!, b);
        hub.syncActors(project!);
        return { member: m };
      });
      scope.delete("/members/:principal", async (req) => {
        if (!req.access!.can("manage_members")) throw new CortexError("forbidden", "Your role cannot manage members.", 403);
        const { project, principal } = req.params as Q;
        const current = store.member(project!, principal!);
        if (current?.role === "owner" && req.access!.role !== "owner") throw new CortexError("forbidden", "Only owners can remove an owner.", 403);
        if (current?.role === "owner" && store.members(project!).filter((m) => m.role === "owner").length === 1) {
          throw new CortexError("last_owner", "This is the project's only owner. Add another owner first.", 409);
        }
        store.removeMember(project!, principal!);
        hub.syncActors(project!);
        return { ok: true };
      });
    },
    { prefix: "/api/p/:project" },
  );

  app.addHook("onClose", async () => hub.close());
  return app;
}

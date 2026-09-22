import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Cortex } from "../core/cortex.js";
import { loadTokens } from "../core/project.js";
import { Actor, CortexError } from "../core/types.js";
import { DocKind } from "../index/db.js";
import { CSRF_HEADER, SESSION_COOKIE, verifyLoginCode } from "./auth.js";
import { reportToMarkdown } from "../core/reportMarkdown.js";

declare module "fastify" {
  interface FastifyRequest {
    actor: Actor;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type Q = Record<string, string | undefined>;
const num = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number(v));
const bool = (v: string | undefined) => (v === "true" ? true : v === "false" ? false : undefined);
const list = (v: string | undefined) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : undefined);

// dist/api/server.js -> dist/web; when running from src/ with tsx, fall back to the last build.
function findWebDir(): string | null {
  for (const rel of ["../web", "../../dist/web"]) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(`${dir}/index.html`)) return dir;
  }
  return null;
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>Cortex</title><body style="font-family:system-ui;padding:2rem;max-width:40rem">
<h1>${title}</h1><p>${body}</p>`;

export function buildServer(cortex: Cortex): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorateRequest("actor", null as unknown as Actor);
  app.register(cookie);

  // Every response carries _meta so AIs notice rule changes without re-reading the rules.
  const ok = (data: object) => ({ ...data, _meta: cortex.meta() });

  app.addHook("onRequest", async (req, reply) => {
    // Block DNS-rebinding: a malicious page must not reach the local API through a foreign hostname.
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (!LOCAL_HOSTS.has(host)) {
      return reply.code(403).send({ error: { code: "forbidden_host", message: "Cortex only answers on localhost." } });
    }
    const path = req.url.split("?")[0];
    if (!path.startsWith("/api/") || path === "/api/health") return; // the board's static files and /login are public

    const auth = req.headers.authorization ?? "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const fromCookie = bearer ? undefined : req.cookies[SESSION_COOKIE];
    // Cookies ride along with cross-site requests; a custom header cannot be sent cross-site without CORS, which we never allow.
    if (fromCookie && !SAFE_METHODS.has(req.method) && req.headers[CSRF_HEADER] !== "1") {
      return reply.code(403).send({ error: { code: "csrf", message: `Missing ${CSRF_HEADER} header.` } });
    }
    const actor = cortex.actorByToken(bearer ?? fromCookie);
    if (!actor) {
      return reply.code(401).send({
        error: {
          code: "unauthorized",
          message: "Send 'Authorization: Bearer <token>' (tokens are in .cortex/.secrets.yaml), or open the board with a link from `cortex login`.",
        },
      });
    }
    req.actor = actor;
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof CortexError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, hint: err.hint }, _meta: cortex.meta() });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: { code: status === 500 ? "internal" : "bad_request", message: (err as Error).message } });
  });

  // ---- web board --------------------------------------------------------------

  const webDir = findWebDir();
  // wildcard: files are looked up per request, so a rebuilt board is served without restarting the server.
  if (webDir) app.register(fastifyStatic, { root: webDir, wildcard: true, index: ["index.html"] });

  app.setNotFoundHandler((req, reply) => {
    // Client routes (no file extension) get the board page; a missing file like /assets/x.js stays a 404,
    // otherwise the browser would try to run the HTML as a script and report a confusing MIME error.
    const isFile = /\.[a-z0-9]+$/i.test(req.url.split("?")[0]);
    if (req.method === "GET" && !req.url.startsWith("/api/") && !isFile) {
      return webDir
        ? reply.sendFile("index.html")
        : reply.type("text/html").send(page("Cortex API is running", "The board UI is not built. Run <code>npm run build</code> in the Cortex repository."));
    }
    return reply.code(404).send({ error: { code: "not_found", message: `No route ${req.method} ${req.url}` } });
  });

  app.get("/login", async (req, reply) => {
    const tokens = loadTokens(cortex.project.dir);
    const actorId = verifyLoginCode((req.query as Q).code ?? "", tokens);
    const actor = actorId ? cortex.project.config.actors.find((a) => a.id === actorId) : undefined;
    if (!actor || actor.kind !== "human") {
      return reply
        .code(401)
        .type("text/html")
        .send(page("Login link expired or invalid", "Run <code>npx aicortex login</code> in your project for a fresh link."));
    }
    reply.setCookie(SESSION_COOKIE, tokens[actor.id], { httpOnly: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return reply.redirect("/");
  });

  app.post("/api/logout", async (_req, reply) => reply.clearCookie(SESSION_COOKIE, { path: "/" }).send({ ok: true }));
  app.get("/api/me", async (req) =>
    ok({ actor: req.actor, project: cortex.project.config.project, actors: cortex.project.config.actors, item_types: cortex.itemTypes() }),
  );

  // Live updates for the board: every write or reindex (including other processes, via the file watcher).
  app.get("/api/events", (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    reply.raw.write(": connected\n\n");
    const onChange = (e: { type: string; entry?: unknown }) => reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 25000);
    cortex.events.on("change", onChange);
    req.raw.on("close", () => {
      clearInterval(ping);
      cortex.events.off("change", onChange);
    });
  });

  app.get("/api/rules/:name/source", async (req) => ok(cortex.rulesSource((req.params as Q).name!)));
  app.put("/api/rules/:name/source", async (req) => {
    const source = ((req.body ?? {}) as { source?: unknown }).source;
    if (typeof source !== "string") throw new CortexError("invalid_request", "Send { source: <yaml string> }.", 400);
    return ok(cortex.saveRules(req.actor, (req.params as Q).name!, source));
  });

  app.get("/api/health", async () => ({ ok: true, project: cortex.project.config.project.name, ...cortex.meta() }));

  app.get("/api/brief", async (req) => ok(cortex.brief(req.actor)));

  const treeHandler = async (req: FastifyRequest) => {
    const q = req.query as Q;
    const path = (req.params as Q)["*"] ?? q.path ?? "";
    return ok(cortex.treeView(path, num(q.depth) ?? 1, num(q.budget)));
  };
  app.get("/api/tree", treeHandler);
  app.get("/api/tree/*", treeHandler);

  const nodeGet = async (req: FastifyRequest) => ok(cortex.nodeView((req.params as Q)["*"] ?? ""));

  // ---- reports ------------------------------------------------------------------

  app.get("/api/report", async (req, reply) => {
    const q = req.query as Q;
    const report = cortex.reports.build({ since: q.since, until: q.until });
    if (q.format === "md") return reply.type("text/markdown; charset=utf-8").send(reportToMarkdown(report, q.lang === "tr" ? "tr" : "en"));
    return ok({ report });
  });

  // ---- code links & staleness ---------------------------------------------------

  app.get("/api/code", async (req) => ok(cortex.codeContext(list((req.query as Q).files) ?? [])));
  app.get("/api/stale", async () =>
    ok({ enabled: cortex.staleness.enabled(), head: cortex.staleness.currentHead(), nodes: cortex.staleness.list() }),
  );
  app.post("/api/verify/*", async (req, reply) => {
    const r = cortex.verifyNode(req.actor, (req.params as Q)["*"] ?? "", ((req.body ?? {}) as Q).note);
    return reply.code(r.applied ? 200 : 202).send(ok(r));
  });
  const nodePut = async (req: FastifyRequest, reply: FastifyReply) => {
    const path = (req.params as Q)["*"] ?? "";
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = cortex.putNode(req.actor, { ...body, path } as never);
    return reply.code(result.applied ? 200 : 202).send(ok(result));
  };
  app.get("/api/node", nodeGet);
  app.get("/api/node/*", nodeGet);
  app.put("/api/node", nodePut);
  app.put("/api/node/*", nodePut);
  app.delete("/api/node/*", async (req) => ok(cortex.deleteNode(req.actor, (req.params as Q)["*"] ?? "", (req.query as Q).reason)));

  app.get("/api/search", async (req) => {
    const q = req.query as Q;
    return ok(
      await cortex.search(q.q ?? "", {
        kinds: list(q.kind) as DocKind[] | undefined,
        under: q.path,
        status: q.status,
        type: q.type,
        limit: num(q.limit),
        budget: num(q.budget),
      }),
    );
  });

  app.get("/api/rules", async () => ok(cortex.rules()));
  app.get("/api/rules/:name", async (req) => ok(cortex.rules((req.params as Q).name)));

  app.get("/api/approvals", async () => ok({ drafts: cortex.listDrafts() }));
  app.get("/api/approvals/:id", async (req) => ok(cortex.getDraft((req.params as Q).id!)));
  // Bulk review: { ids, force? } / { ids, reason? }. Answers 200 with per-draft results even when some fail.
  app.post("/api/approvals/approve", async (req) => {
    const body = (req.body ?? {}) as { ids?: string[]; force?: boolean };
    return ok(cortex.approveMany(req.actor, body.ids ?? [], body.force === true));
  });
  app.post("/api/approvals/reject", async (req) => {
    const body = (req.body ?? {}) as { ids?: string[]; reason?: string };
    return ok(cortex.rejectMany(req.actor, body.ids ?? [], body.reason));
  });
  app.post("/api/approvals/:id/approve", async (req) => {
    const force = (req.query as Q).force === "true";
    return ok(cortex.approve(req.actor, (req.params as Q).id!, force));
  });
  app.post("/api/approvals/:id/reject", async (req) => {
    const reason = ((req.body ?? {}) as Q).reason;
    return ok(cortex.reject(req.actor, (req.params as Q).id!, reason));
  });

  // ---- items ----------------------------------------------------------------

  app.get("/api/inbox", async (req) => ok(cortex.items.inbox(req.actor, num((req.query as Q).limit) ?? 20)));

  app.get("/api/items", async (req) => {
    const q = req.query as Q;
    return ok(
      cortex.items.list({
        type: q.type,
        status: q.status,
        assignee: q.assignee,
        author: q.author,
        path: q.path,
        open: bool(q.open),
        limit: num(q.limit),
        cursor: q.cursor,
      }),
    );
  });
  app.post("/api/items", async (req, reply) => {
    const r = cortex.items.create(req.actor, (req.body ?? {}) as never);
    return reply.code(r.applied ? 201 : 202).send(ok(r));
  });
  app.get("/api/items/:id", async (req) => {
    const q = req.query as Q;
    return ok(cortex.items.get((req.params as Q).id!, { replies: num(q.replies), budget: num(q.budget) }));
  });
  app.patch("/api/items/:id", async (req, reply) => {
    const r = cortex.items.update(req.actor, (req.params as Q).id!, (req.body ?? {}) as never);
    return reply.code(r.applied ? 200 : 202).send(ok(r));
  });
  app.post("/api/items/:id/replies", async (req, reply) => {
    return reply.code(201).send(ok(cortex.items.reply(req.actor, (req.params as Q).id!, (req.body ?? {}) as never)));
  });
  app.post("/api/ask", async (req, reply) => {
    const b = (req.body ?? {}) as { about?: string; title?: string; body?: string; assignee?: string; blocking?: boolean };
    if (!b.about || !b.title) {
      throw new CortexError("invalid_request", "Send { about, title }.", 400, {
        example: { about: "01J9Z... (activity id) | 01J9Y... (item id) | backend/auth (node path)", title: "Why did you disable the cache here?", blocking: false },
      });
    }
    const r = cortex.items.ask(req.actor, { about: b.about, title: b.title, body: b.body, assignee: b.assignee, blocking: b.blocking });
    return reply.code(r.applied ? 201 : 202).send(ok(r));
  });

  // ---- activity -------------------------------------------------------------

  app.post("/api/activity", async (req, reply) => reply.code(201).send(ok(cortex.activity.log(req.actor, (req.body ?? {}) as never))));
  app.get("/api/activity", async (req) => {
    const q = req.query as Q;
    return ok(cortex.activity.list({ since: q.since, actor: q.actor, ref: q.ref, include_system: bool(q.include_system), limit: num(q.limit) }));
  });
  app.get("/api/activity/:id", async (req) => ok({ entry: cortex.activity.get((req.params as Q).id!) }));

  return app;
}

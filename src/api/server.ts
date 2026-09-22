import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Cortex } from "../core/cortex.js";
import { Actor, CortexError } from "../core/types.js";
import { DocKind } from "../index/db.js";

declare module "fastify" {
  interface FastifyRequest {
    actor: Actor;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type Q = Record<string, string | undefined>;
const num = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number(v));
const bool = (v: string | undefined) => (v === "true" ? true : v === "false" ? false : undefined);
const list = (v: string | undefined) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : undefined);

export function buildServer(cortex: Cortex): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorateRequest("actor", null as unknown as Actor);

  // Every response carries _meta so AIs notice rule changes without re-reading the rules.
  const ok = (data: object) => ({ ...data, _meta: cortex.meta() });

  app.addHook("onRequest", async (req, reply) => {
    // Block DNS-rebinding: a malicious page must not reach the local API through a foreign hostname.
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (!LOCAL_HOSTS.has(host)) {
      return reply.code(403).send({ error: { code: "forbidden_host", message: "Cortex only answers on localhost." } });
    }
    if (req.url === "/" || req.url.startsWith("/api/health")) return;
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const actor = cortex.actorByToken(token);
    if (!actor) {
      return reply.code(401).send({
        error: {
          code: "unauthorized",
          message: "Send 'Authorization: Bearer <token>'. Tokens are in .cortex/.secrets.yaml.",
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

  app.get("/", async (_req, reply) =>
    reply
      .type("text/html")
      .send(`<!doctype html><meta charset="utf-8"><title>Cortex</title><body style="font-family:system-ui;padding:2rem">
<h1>Cortex is running</h1><p>The board UI arrives in a later slice. Start with <code>GET /api/brief</code> (needs a Bearer token from .cortex/.secrets.yaml).</p>`),
  );

  app.get("/api/health", async () => ({ ok: true, project: cortex.project.config.project.name, ...cortex.meta() }));

  app.get("/api/brief", async (req) => ok(cortex.brief(req.actor)));

  const treeHandler = async (req: FastifyRequest) => {
    const q = req.query as Q;
    const path = (req.params as Q)["*"] ?? q.path ?? "";
    return ok(cortex.treeView(path, num(q.depth) ?? 1, num(q.budget)));
  };
  app.get("/api/tree", treeHandler);
  app.get("/api/tree/*", treeHandler);

  const nodeGet = async (req: FastifyRequest) => ok({ node: cortex.node((req.params as Q)["*"] ?? "") });
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

  app.get("/api/search", async (req) => {
    const q = req.query as Q;
    return ok(
      cortex.search(q.q ?? "", {
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

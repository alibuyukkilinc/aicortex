import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Cortex } from "../core/cortex.js";
import { Actor, CortexError } from "../core/types.js";

declare module "fastify" {
  interface FastifyRequest {
    actor: Actor;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type Q = Record<string, string | undefined>;
const num = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number(v));

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
    return ok(cortex.search(q.q ?? "", { under: q.path, status: q.status, limit: num(q.limit), budget: num(q.budget) }));
  });

  app.get("/api/rules", async () => ok(cortex.rules()));
  app.get("/api/rules/:name", async (req) => ok(cortex.rules((req.params as Q).name)));

  app.get("/api/approvals", async () => ok({ drafts: cortex.listDrafts() }));
  app.get("/api/approvals/:id", async (req) => ok(cortex.getDraft((req.params as Q).id!)));
  app.post("/api/approvals/:id/approve", async (req) => {
    const force = (req.query as Q).force === "true";
    return ok(cortex.approve(req.actor, (req.params as Q).id!, force));
  });
  app.post("/api/approvals/:id/reject", async (req) => ok(cortex.reject(req.actor, (req.params as Q).id!)));

  return app;
}

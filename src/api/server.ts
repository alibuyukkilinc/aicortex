import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { FastifyInstance } from "fastify";
import { Cortex } from "../core/cortex.js";
import { loadTokens } from "../core/project.js";
import { Actor, CortexError } from "../core/types.js";
import { CSRF_HEADER, SESSION_COOKIE, verifyLoginCode } from "./auth.js";
import { projectRoutes } from "./routes.js";

declare module "fastify" {
  interface FastifyRequest {
    actor: Actor;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type Q = Record<string, string | undefined>;

// dist/api/server.js -> dist/web; when running from src/ with tsx, fall back to the last build.
function findWebDir(): string | null {
  for (const rel of ["../web", "../../dist/web"]) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(`${dir}/index.html`)) return dir;
  }
  return null;
}

export const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>Cortex</title><body style="font-family:system-ui;padding:2rem;max-width:40rem">
<h1>${title}</h1><p>${body}</p>`;

// Rule violations keep their code, message and hint, so an AI can fix itself; anything else is a plain error.
export function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof CortexError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, hint: err.hint }, ...(req.cortex ? { _meta: req.cortex.meta() } : {}) });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: { code: status === 500 ? "internal" : "bad_request", message: (err as Error).message } });
  });
}

// Errors, the built board and client-side routes: shared by single-project mode and the hub.
export function baseServer(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorateRequest("actor", null as unknown as Actor);
  app.decorateRequest("cortex", null as unknown as Cortex);
  app.register(cookie);

  setErrorHandler(app);

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
  return app;
}

// Single project, localhost only (`cortex start`): actor tokens from .cortex/.secrets.yaml, board login by signed link.
export function buildServer(cortex: Cortex): FastifyInstance {
  const app = baseServer();

  app.addHook("onRequest", async (req, reply) => {
    // Block DNS-rebinding: a malicious page must not reach the local API through a foreign hostname.
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (!LOCAL_HOSTS.has(host)) {
      return reply.code(403).send({ error: { code: "forbidden_host", message: "Cortex only answers on localhost." } });
    }
    req.cortex = cortex;
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
  app.get("/api/health", async () => ({ ok: true, mode: "project", project: cortex.project.config.project.name, ...cortex.meta() }));

  app.register(projectRoutes, { prefix: "/api" });
  return app;
}

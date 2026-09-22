import Fastify from "fastify";
import { projectRoutes } from "../api/routes.js";
import { setErrorHandler } from "../api/server.js";
import type { Cortex } from "../core/cortex.js";
import { Actor, CortexError } from "../core/types.js";

// MCP tools speak the project REST API, so a local project and a hub project behave exactly the same:
// the same routes, the same rules, and on a hub the same role and visibility checks.

export interface McpApi {
  where: string; // shown in the MCP instructions: "this folder" or the hub project
  call(method: string, path: string, opts?: { query?: Record<string, unknown>; body?: unknown; text?: boolean }): Promise<unknown>;
  close(): Promise<void>;
}

function query(q: Record<string, unknown> | undefined): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(q ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    s.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : "";
}

function fail(status: number, payload: unknown): never {
  const e = (payload as { error?: { code?: string; message?: string; hint?: unknown } })?.error;
  throw new CortexError(e?.code ?? "error", e?.message ?? `Request failed (${status}).`, status, e?.hint);
}

// Same process: no network, no token. Used by `aicortex mcp` inside a project.
export async function localApi(cortex: Cortex, actor: Actor): Promise<McpApi> {
  const app = Fastify({ logger: false });
  app.decorateRequest("cortex", null as unknown as Cortex);
  app.decorateRequest("actor", null as unknown as Actor);
  app.addHook("onRequest", async (req) => {
    req.cortex = cortex;
    req.actor = actor;
  });
  setErrorHandler(app);
  await app.register(projectRoutes, { prefix: "/api" });
  await app.ready();
  return {
    where: `${cortex.project.config.project.name} (${cortex.project.root})`,
    async call(method, path, opts = {}) {
      const res = await app.inject({ method: method as "GET", url: `/api${path}${query(opts.query)}`, ...(opts.body !== undefined ? { payload: opts.body as object } : {}) });
      if (res.statusCode >= 400) fail(res.statusCode, res.json());
      return opts.text ? res.body : res.json();
    },
    close: () => app.close(),
  };
}

// A project on a team server: the agent's token decides its role and what it can see.
export function remoteApi(hub: string, project: string, token: string): McpApi {
  const base = `${hub.replace(/\/+$/, "")}/api/p/${encodeURIComponent(project)}`;
  return {
    where: `${project} @ ${hub.replace(/\/+$/, "")}`,
    async call(method, path, opts = {}) {
      const res = await fetch(`${base}${path}${query(opts.query)}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(opts.body !== undefined ? { "content-type": "application/json" } : {}) },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      }).catch((e: Error) => {
        throw new CortexError("hub_unreachable", `Cannot reach the hub at ${hub}: ${e.message}`, 503);
      });
      const text = await res.text();
      if (!res.ok) fail(res.status, text.startsWith("{") ? JSON.parse(text) : { error: { message: text.slice(0, 300) } });
      return opts.text ? text : JSON.parse(text);
    },
    close: async () => {},
  };
}

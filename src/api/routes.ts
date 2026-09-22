import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Cortex } from "../core/cortex.js";
import { reportToMarkdown } from "../core/reportMarkdown.js";
import { Activity, CortexError, NodeSummary } from "../core/types.js";
import { DocKind } from "../index/db.js";
import { Access, ItemRef, hidden, need } from "./access.js";

declare module "fastify" {
  interface FastifyRequest {
    cortex: Cortex;
    access?: Access;
  }
}

type Q = Record<string, string | undefined>;
const num = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number(v));
const bool = (v: string | undefined) => (v === "true" ? true : v === "false" ? false : undefined);
const list = (v: string | undefined) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : undefined);

// Every response carries _meta so AIs notice rule changes without re-reading the rules.
const ok = (req: FastifyRequest, data: object) => ({ ...data, _meta: req.cortex.meta() });

const itemOf = (c: Cortex) => (id: string): ItemRef | null => c.index.getItem(id);

// Visibility helpers: with no access object (single-project mode) everything is visible.
const seesNode = (req: FastifyRequest, path: string) => !req.access || req.access.seesNode(path);
const seesItem = (req: FastifyRequest, i: ItemRef | null) => !!i && (!req.access || req.access.seesItem(i));
const seesActivity = (req: FastifyRequest, a: Activity) => !req.access || req.access.seesActivity(a, itemOf(req.cortex));
const itemVisibleOr404 = (req: FastifyRequest, id: string) => {
  if (!seesItem(req, req.cortex.index.getItem(id))) throw hidden(`Item ${id}`);
};

function pruneTree(req: FastifyRequest, n: NodeSummary): NodeSummary {
  if (!n.children) return n;
  const kids = n.children.filter((k) => seesNode(req, k.path)).map((k) => pruneTree(req, k));
  return { ...n, children: kids, ...(n.child_count !== undefined ? { child_count: kids.length } : {}) };
}

// The project API, mounted at /api (single project) or /api/p/:project (hub). Handlers read the project from
// req.cortex and the caller's role from req.access, both set by the host server before the handler runs.
export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", async (req) => {
    const c = req.cortex;
    return ok(req, {
      actor: { id: req.actor.id, kind: req.actor.kind },
      project: c.project.config.project,
      actors: c.project.config.actors.map(({ id, kind }) => ({ id, kind })),
      item_types: c.itemTypes(),
      ...(req.access ? { role: req.access.role, perms: PERMS.filter((p) => req.access!.can(p)), restricted: req.access.restricted } : {}),
    });
  });

  // Live updates for the board: every write or reindex (including other processes, via the file watcher).
  app.get("/events", (req, reply) => {
    const c = req.cortex;
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    reply.raw.write(": connected\n\n");
    const onChange = (e: { type: string; entry?: Activity }) => {
      // Members who see only part of the project do not get other people's entries, just a "something changed" ping.
      const entry = e.entry && !seesActivity(req, e.entry) ? undefined : e.entry;
      reply.raw.write(`data: ${JSON.stringify({ type: e.type, ...(entry ? { entry } : {}) })}\n\n`);
    };
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 25000);
    c.events.on("change", onChange);
    req.raw.on("close", () => {
      clearInterval(ping);
      c.events.off("change", onChange);
    });
  });

  // ---- rules ----------------------------------------------------------------

  app.get("/rules", async (req) => ok(req, req.cortex.rules()));
  app.get("/rules/:name", async (req) => ok(req, req.cortex.rules((req.params as Q).name)));
  app.get("/rules/:name/source", async (req) => ok(req, req.cortex.rulesSource((req.params as Q).name!)));
  app.put("/rules/:name/source", async (req) => {
    need(req, "edit_rules");
    const source = ((req.body ?? {}) as { source?: unknown }).source;
    if (typeof source !== "string") throw new CortexError("invalid_request", "Send { source: <yaml string> }.", 400);
    return ok(req, req.cortex.saveRules(req.actor, (req.params as Q).name!, source));
  });

  // ---- knowledge --------------------------------------------------------------

  app.get("/brief", async (req) => {
    const b = req.cortex.brief(req.actor, num((req.query as Q).budget));
    if (!req.access) return ok(req, b);
    const stale = b.attention.stale_nodes;
    const staleTop = stale?.top.filter((s) => seesNode(req, s.path)) ?? [];
    return ok(req, {
      ...b,
      branches: b.branches.filter((x) => seesNode(req, x.path)),
      attention: {
        ...b.attention,
        inbox: { ...b.attention.inbox, top: b.attention.inbox.top.filter((i) => seesItem(req, req.cortex.index.getItem(i.id))) },
        ...(stale ? { stale_nodes: { count: staleTop.length, top: staleTop } } : {}),
      },
      recent_activity: b.recent_activity.filter((a) => seesActivity(req, req.cortex.index.getActivity(a.id)!)),
      you: { ...b.you, role: req.access.role },
    });
  });

  const treeHandler = async (req: FastifyRequest) => {
    const q = req.query as Q;
    const path = (req.params as Q)["*"] ?? q.path ?? "";
    if (!seesNode(req, path)) throw hidden(`Node "${path}"`);
    const t = req.cortex.treeView(path, num(q.depth) ?? 1, num(q.budget));
    return ok(req, { ...t, node: pruneTree(req, t.node) });
  };
  app.get("/tree", treeHandler);
  app.get("/tree/*", treeHandler);

  const nodeGet = async (req: FastifyRequest) => {
    const path = (req.params as Q)["*"] ?? "";
    if (!seesNode(req, path)) throw hidden(`Node "${path}"`);
    return ok(req, req.cortex.nodeView(path));
  };
  const nodePut = async (req: FastifyRequest, reply: FastifyReply) => {
    need(req, "write_knowledge");
    const path = (req.params as Q)["*"] ?? "";
    if (!seesNode(req, path)) throw hidden(`Node "${path}"`);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = req.cortex.putNode(req.actor, { ...body, path } as never);
    return reply.code(result.applied ? 200 : 202).send(ok(req, result));
  };
  app.get("/node", nodeGet);
  app.get("/node/*", nodeGet);
  app.put("/node", nodePut);
  app.put("/node/*", nodePut);
  app.delete("/node/*", async (req) => {
    need(req, "delete_knowledge");
    const path = (req.params as Q)["*"] ?? "";
    if (!seesNode(req, path)) throw hidden(`Node "${path}"`);
    return ok(req, req.cortex.deleteNode(req.actor, path, (req.query as Q).reason));
  });

  // ---- reports ----------------------------------------------------------------

  app.get("/report", async (req, reply) => {
    need(req, "reports");
    if (req.access?.restricted) throw new CortexError("forbidden", "Reports cover the whole project; your membership sees only part of it.", 403);
    const q = req.query as Q;
    const report = req.cortex.reports.build({ since: q.since, until: q.until });
    if (q.format === "md") return reply.type("text/markdown; charset=utf-8").send(reportToMarkdown(report, q.lang === "tr" ? "tr" : "en"));
    return ok(req, { report });
  });

  // ---- code links & staleness ---------------------------------------------------

  app.get("/code", async (req) => {
    const r = req.cortex.codeContext(list((req.query as Q).files) ?? []);
    if (!req.access) return ok(req, r);
    return ok(req, {
      ...r,
      knowledge: r.knowledge.filter((k) => seesNode(req, k.path as string)),
      items: r.items.filter((i) => seesItem(req, req.cortex.index.getItem(i.id as string))),
    });
  });
  app.get("/stale", async (req) => {
    const s = req.cortex.staleness;
    return ok(req, { enabled: s.enabled(), head: s.currentHead(), nodes: s.list().filter((n) => seesNode(req, n.path)) });
  });
  app.post("/verify/*", async (req, reply) => {
    need(req, "write_knowledge");
    const path = (req.params as Q)["*"] ?? "";
    if (!seesNode(req, path)) throw hidden(`Node "${path}"`);
    const r = req.cortex.verifyNode(req.actor, path, ((req.body ?? {}) as Q).note);
    return reply.code(r.applied ? 200 : 202).send(ok(req, r));
  });

  app.get("/search", async (req) => {
    const q = req.query as Q;
    const r = await req.cortex.search(q.q ?? "", {
      kinds: list(q.kind) as DocKind[] | undefined,
      under: q.path,
      status: q.status,
      type: q.type,
      limit: num(q.limit),
      budget: num(q.budget),
    });
    if (!req.access) return ok(req, r);
    const visible = r.results.filter((h) => {
      if (h.kind === "node") return seesNode(req, h.path as string);
      if (h.kind === "item") return seesItem(req, req.cortex.index.getItem(h.id as string));
      const a = req.cortex.index.getActivity(h.id as string);
      return !!a && seesActivity(req, a);
    });
    return ok(req, { ...r, results: visible });
  });

  // ---- approvals ------------------------------------------------------------------

  app.get("/approvals", async (req) => {
    let drafts = req.cortex.listDrafts();
    if (req.access) {
      // Reviewers see every draft they can see; everyone else sees the drafts they proposed.
      drafts = req.access.can("approve")
        ? drafts.filter((d) => (d.kind === "node" ? seesNode(req, d.target) : seesItem(req, req.cortex.index.getItem(d.target))))
        : drafts.filter((d) => d.proposed_by === req.actor.id);
    }
    return ok(req, { drafts });
  });
  app.get("/approvals/:id", async (req) => {
    const r = req.cortex.getDraft((req.params as Q).id!);
    if (req.access && !req.access.can("approve") && r.draft.proposed_by !== req.actor.id) throw hidden("Draft");
    return ok(req, r);
  });
  // Bulk review: { ids, force? } / { ids, reason? }. Answers 200 with per-draft results even when some fail.
  app.post("/approvals/approve", async (req) => {
    need(req, "approve");
    const body = (req.body ?? {}) as { ids?: string[]; force?: boolean };
    return ok(req, req.cortex.approveMany(req.actor, body.ids ?? [], body.force === true));
  });
  app.post("/approvals/reject", async (req) => {
    need(req, "approve");
    const body = (req.body ?? {}) as { ids?: string[]; reason?: string };
    return ok(req, req.cortex.rejectMany(req.actor, body.ids ?? [], body.reason));
  });
  app.post("/approvals/:id/approve", async (req) => {
    need(req, "approve");
    return ok(req, req.cortex.approve(req.actor, (req.params as Q).id!, (req.query as Q).force === "true"));
  });
  app.post("/approvals/:id/reject", async (req) => {
    need(req, "approve");
    return ok(req, req.cortex.reject(req.actor, (req.params as Q).id!, ((req.body ?? {}) as Q).reason));
  });

  // ---- items ----------------------------------------------------------------------

  app.get("/inbox", async (req) => {
    const r = req.cortex.items.inbox(req.actor, num((req.query as Q).limit) ?? 20);
    if (!req.access) return ok(req, r);
    const items = r.items.filter((i) => seesItem(req, i));
    return ok(req, { count: items.length, items });
  });
  app.get("/items", async (req) => {
    const q = req.query as Q;
    const r = req.cortex.items.list({
      type: q.type,
      status: q.status,
      assignee: q.assignee,
      author: q.author,
      path: q.path,
      open: bool(q.open),
      limit: num(q.limit),
      cursor: q.cursor,
    });
    if (!req.access) return ok(req, r);
    const items = r.items.filter((i) => seesItem(req, i));
    return ok(req, { ...r, items, total: r.total - (r.items.length - items.length) });
  });
  app.post("/items", async (req, reply) => {
    const body = (req.body ?? {}) as { type?: string; category_path?: string };
    need(req, body.type === "question" ? "ask" : "write_items");
    // Members limited to some branches file new items inside them.
    if (req.access?.restricted && body.category_path && !seesNode(req, body.category_path)) throw hidden(`Branch "${body.category_path}"`);
    const r = req.cortex.items.create(req.actor, body as never);
    return reply.code(r.applied ? 201 : 202).send(ok(req, r));
  });
  app.get("/items/:id", async (req) => {
    const id = (req.params as Q).id!;
    itemVisibleOr404(req, id);
    const q = req.query as Q;
    return ok(req, req.cortex.items.get(id, { replies: num(q.replies), budget: num(q.budget) }));
  });
  app.patch("/items/:id", async (req, reply) => {
    need(req, "write_items");
    const id = (req.params as Q).id!;
    itemVisibleOr404(req, id);
    const r = req.cortex.items.update(req.actor, id, (req.body ?? {}) as never);
    return reply.code(r.applied ? 200 : 202).send(ok(req, r));
  });
  app.post("/items/:id/replies", async (req, reply) => {
    const id = (req.params as Q).id!;
    itemVisibleOr404(req, id);
    // Viewers may answer and follow up on questions; everything else needs write access.
    need(req, req.cortex.index.getItem(id)?.type === "question" ? "ask" : "write_items");
    return reply.code(201).send(ok(req, req.cortex.items.reply(req.actor, id, (req.body ?? {}) as never)));
  });
  app.post("/ask", async (req, reply) => {
    need(req, "ask");
    const b = (req.body ?? {}) as { about?: string; title?: string; body?: string; assignee?: string; blocking?: boolean };
    if (!b.about || !b.title) {
      throw new CortexError("invalid_request", "Send { about, title }.", 400, {
        example: { about: "01J9Z... (activity id) | 01J9Y... (item id) | backend/auth (node path)", title: "Why did you disable the cache here?", blocking: false },
      });
    }
    const r = req.cortex.items.ask(req.actor, { about: b.about, title: b.title, body: b.body, assignee: b.assignee, blocking: b.blocking });
    return reply.code(r.applied ? 201 : 202).send(ok(req, r));
  });

  // ---- activity -------------------------------------------------------------------

  app.post("/activity", async (req, reply) => {
    need(req, "log_activity");
    return reply.code(201).send(ok(req, req.cortex.activity.log(req.actor, (req.body ?? {}) as never)));
  });
  app.get("/activity", async (req) => {
    const q = req.query as Q;
    const r = req.cortex.activity.list({ since: q.since, actor: q.actor, ref: q.ref, include_system: bool(q.include_system), limit: num(q.limit) });
    return ok(req, req.access ? { entries: r.entries.filter((a) => seesActivity(req, a)) } : r);
  });
  app.get("/activity/:id", async (req) => {
    const a = req.cortex.activity.get((req.params as Q).id!);
    if (!seesActivity(req, a)) throw hidden("Activity");
    return ok(req, { entry: a });
  });
}

export const PERMS = [
  "read", "ask", "write_items", "write_knowledge", "delete_knowledge", "approve", "edit_rules", "manage_members", "reports", "log_activity",
] as const;

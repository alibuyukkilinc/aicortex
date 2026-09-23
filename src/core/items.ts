import { z } from "zod";
import type { Cortex } from "./cortex.js";
import { IndexedItem, ItemQuery, SqlFilter } from "../index/db.js";
import { normalizePath } from "../store/tree.js";
import { estimateTokens, nowIso, shortHash, ulid } from "../util/text.js";
import { ItemSchema, ValidationContext, canTransition, describeSchema, validateFields } from "./schema.js";
import { Actor, CortexError, GROUP_ASSIGNEES, Item, ItemLinks, Reply } from "./types.js";

const Links = z
  .object({
    nodes: z.array(z.string()).max(20).optional(),
    items: z.array(z.string()).max(20).optional(),
    activity: z.array(z.string()).max(20).optional(),
    code: z.array(z.object({ file: z.string(), lines: z.string().optional() })).max(50).optional(),
  })
  .strict();

export const CreateItemInput = z
  .object({
    type: z.string(),
    title: z.string().min(1).max(160),
    body: z.string().max(20000).default(""),
    category_path: z.string().optional(),
    assignee: z.string().optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
    links: Links.optional(),
    fields: z.record(z.string(), z.unknown()).default({}),
    reason: z.string().max(500).optional(),
  })
  .strict();
export type CreateItemInput = z.input<typeof CreateItemInput>;

export const UpdateItemInput = z
  .object({
    title: z.string().min(1).max(160).optional(),
    body: z.string().max(20000).optional(),
    status: z.string().optional(),
    category_path: z.string().nullable().optional(),
    assignee: z.string().nullable().optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
    links: Links.optional(),
    fields: z.record(z.string(), z.unknown()).optional(), // merged; null removes a field
    reason: z.string().max(500).optional(),
    force: z.boolean().optional(),
    if_rev: z.string().optional(), // the _rev you last read; mismatch throws a 409 conflict
  })
  .strict();
export type UpdateItemInput = z.input<typeof UpdateItemInput>;

export const ClaimInput = z
  .object({
    action: z.enum(["claim", "release"]),
    note: z.string().max(500).optional(),
    force: z.boolean().optional(), // humans only: take over an actively held claim
  })
  .strict();
export type ClaimInput = z.input<typeof ClaimInput>;

// No background job: staleness-style, computed lazily whenever a claim is checked.
const CLAIM_TTL_MS = 2 * 60 * 60 * 1000; // 2h

export const ReplyInput = z
  .object({
    body: z.string().min(1).max(20000),
    fields: z.record(z.string(), z.unknown()).default({}),
    status: z.string().optional(),
    force: z.boolean().optional(),
  })
  .strict();
export type ReplyInput = z.input<typeof ReplyInput>;

export interface ItemWriteResult {
  applied: boolean;
  id: string;
  status?: string;
  draft_id?: string;
  message: string;
}

export type InboxReason = "assigned_to_you" | "assigned_to_group" | "your_question_answered" | "new_reply" | "decision_needs_review";

export function itemRevision(i: Item): string {
  return shortHash(JSON.stringify([i.title, i.body, i.status, i.assignee ?? null, i.category_path ?? null, i.fields, i.links ?? {}, i.updated_at]));
}

function zodIssues(e: z.ZodError): string[] {
  return e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

export class ItemService {
  constructor(private c: Cortex) {}

  // ---- schema helpers -----------------------------------------------------

  schema(type: string): ItemSchema {
    const s = this.c.schema(type);
    if (!s) {
      throw new CortexError("unknown_type", `Unknown item type "${type}".`, 400, { types: this.c.itemTypes() });
    }
    return s;
  }

  private ctx(): ValidationContext {
    return {
      actorExists: (id) => this.c.project.config.actors.some((a) => a.id === id),
      nodeExists: (p) => this.c.tree.exists(p),
      itemExists: (id) => this.c.itemStore.exists(id),
    };
  }

  private invalid(schema: ItemSchema, issues: string[], what = "Item"): CortexError {
    return new CortexError("invalid_item", `${what} does not match the "${schema.type}" rules.`, 400, {
      issues,
      rules: describeSchema(schema),
    });
  }

  private checkAssignee(assignee: string | undefined | null): string[] {
    if (assignee === undefined || assignee === null) return [];
    if (assignee in GROUP_ASSIGNEES) return [];
    return this.ctx().actorExists(assignee) ? [] : [`assignee: unknown actor "${assignee}" (use an actor id, "@humans" or "@ai")`];
  }

  private checkCategory(path: string | undefined | null, schema: ItemSchema): string[] {
    if (path === undefined || path === null || path === "") {
      return schema.category_required ? ["category_path: required for this type (a knowledge tree path, e.g. \"backend/auth\")"] : [];
    }
    return this.c.tree.exists(path) ? [] : [`category_path: no knowledge node at "${path}"`];
  }

  private checkLinks(links: ItemLinks | undefined): string[] {
    const issues: string[] = [];
    for (const p of links?.nodes ?? []) if (!this.c.tree.exists(p)) issues.push(`links.nodes: no knowledge node at "${p}"`);
    for (const id of links?.items ?? []) if (!this.c.itemStore.exists(id)) issues.push(`links.items: no item "${id}"`);
    for (const id of links?.activity ?? []) if (!this.c.index.getActivity(id)) issues.push(`links.activity: no activity "${id}"`);
    return issues;
  }

  private checkStatusChange(actor: Actor, schema: ItemSchema, from: string, to: string, force?: boolean): void {
    if (from === to) return;
    if (!schema.statuses.includes(to)) {
      throw new CortexError("invalid_status", `"${to}" is not a ${schema.type} status.`, 400, { statuses: schema.statuses });
    }
    if (actor.kind === "ai" && schema.human_only_statuses?.includes(to)) {
      throw new CortexError("forbidden", `Only humans can move a ${schema.type} to "${to}".`, 403, {
        human_only_statuses: schema.human_only_statuses,
        hint: "Ask a human: reply on the item or open a question assigned to @humans.",
      });
    }
    if (!canTransition(schema, from, to) && !(actor.kind === "human" && force)) {
      const allowed = schema.transitions === "any" ? schema.statuses : (schema.transitions[from] ?? []);
      throw new CortexError("invalid_transition", `Cannot move this ${schema.type} from "${from}" to "${to}".`, 400, {
        allowed_from_here: allowed,
        ...(actor.kind === "human" ? { note: "Humans may override with force: true." } : {}),
      });
    }
  }

  private policyGate(actor: Actor, type: string): "direct" | "draft" {
    const policy = actor.policy?.[type] ?? this.c.project.config.approval[type] ?? "auto";
    if (actor.kind !== "ai" || policy === "auto") return "direct";
    if (policy === "human_only") throw new CortexError("forbidden", `Only humans may write ${type} items in this project.`, 403);
    return "draft";
  }

  // ---- writes -------------------------------------------------------------

  create(actor: Actor, input: CreateItemInput): ItemWriteResult {
    const parsed = CreateItemInput.safeParse(input);
    const type = (input as { type?: string })?.type;
    if (!parsed.success) {
      const schema = type ? this.c.schema(type) : null;
      throw new CortexError("invalid_item", "Item does not match the common shape.", 400, {
        issues: zodIssues(parsed.error),
        ...(schema ? { rules: describeSchema(schema) } : { types: this.c.itemTypes() }),
      });
    }
    const d = parsed.data;
    const schema = this.schema(d.type);
    const category = d.category_path ? normalizePath(d.category_path) : undefined;
    const issues = [
      ...this.checkCategory(category, schema),
      ...this.checkAssignee(d.assignee),
      ...this.checkLinks(d.links),
      ...validateFields(schema.fields, d.fields, this.ctx(), schema.require_when),
    ];
    if (issues.length) throw this.invalid(schema, issues);

    const now = nowIso();
    const item: Item = {
      id: ulid(),
      type: d.type,
      title: d.title,
      status: schema.initial,
      category_path: category,
      author: actor.id,
      assignee: d.assignee,
      tags: d.tags,
      links: d.links,
      fields: d.fields,
      created_at: now,
      updated_at: now,
      updated_by: actor.id,
      body: d.body,
    };

    if (this.policyGate(actor, d.type) === "draft") {
      const draftId = this.c.saveDraft({ kind: "item", target: item.id, proposed_by: actor.id, reason: d.reason, data: item });
      return { applied: false, id: item.id, draft_id: draftId, message: "Saved as draft. A human must approve it before it becomes visible." };
    }
    this.save(item);
    this.c.activity.system(actor.id, "item.created", `Created ${item.type} "${item.title}"`, [item.id], { type: item.type, to: item.status });
    return { applied: true, id: item.id, status: item.status, message: `${item.type} created.` };
  }

  update(actor: Actor, id: string, input: UpdateItemInput): ItemWriteResult {
    const current = this.get(id).item;
    const schema = this.schema(current.type);
    const parsed = UpdateItemInput.safeParse(input);
    if (!parsed.success) throw this.invalid(schema, zodIssues(parsed.error), "Update");
    const d = parsed.data;
    if (d.if_rev !== undefined && d.if_rev !== itemRevision(current)) {
      throw this.c.conflict(current.updated_by, current.updated_at);
    }

    const next: Item = { ...current, fields: { ...current.fields } };
    if (d.title !== undefined) next.title = d.title;
    if (d.body !== undefined) next.body = d.body;
    if (d.tags !== undefined) next.tags = d.tags;
    if (d.links !== undefined) next.links = d.links;
    if (d.assignee !== undefined) next.assignee = d.assignee ?? undefined;
    if (d.category_path !== undefined) next.category_path = d.category_path ? normalizePath(d.category_path) : undefined;
    for (const [k, v] of Object.entries(d.fields ?? {})) {
      if (v === null) delete next.fields[k];
      else next.fields[k] = v;
    }
    const issues = [
      ...(d.category_path !== undefined ? this.checkCategory(next.category_path, schema) : []),
      ...(d.assignee !== undefined ? this.checkAssignee(next.assignee) : []),
      ...(d.links !== undefined ? this.checkLinks(next.links) : []),
      ...validateFields(schema.fields, next.fields, this.ctx(), schema.require_when),
    ];
    if (issues.length) throw this.invalid(schema, issues, "Update");
    if (d.status !== undefined) {
      this.checkStatusChange(actor, schema, current.status, d.status, d.force);
      next.status = d.status;
    }
    next.updated_at = nowIso();
    next.updated_by = actor.id;

    if (this.policyGate(actor, current.type) === "draft") {
      const draftId = this.c.saveDraft({
        kind: "item",
        target: id,
        proposed_by: actor.id,
        reason: d.reason,
        base_rev: itemRevision(current),
        data: next,
      });
      return { applied: false, id, draft_id: draftId, message: "Saved as draft. A human must approve it." };
    }
    this.save(next);
    const what = current.status !== next.status ? `${current.status} → ${next.status}` : "edited";
    this.c.activity.system(actor.id, "item.updated", `Updated ${next.type} "${next.title}" (${what})`, [id], { type: next.type, from: current.status, to: next.status });
    return { applied: true, id, status: next.status, message: `${next.type} updated.` };
  }

  reply(actor: Actor, id: string, input: ReplyInput): ItemWriteResult & { reply_id: string } {
    const item = this.get(id).item;
    const schema = this.schema(item.type);
    const parsed = ReplyInput.safeParse(input);
    if (!parsed.success) throw this.invalid(schema, zodIssues(parsed.error), "Reply");
    const d = parsed.data;
    const issues = validateFields(schema.reply?.fields ?? {}, d.fields, this.ctx(), schema.reply?.require_when);
    if (issues.length) throw this.invalid(schema, issues, "Reply");

    let to = d.status;
    if (to === undefined) {
      // Automatic transitions, e.g. a question becomes "answered" when someone other than the asker replies.
      const rule = schema.reply?.on_reply?.find((r) => r.from === item.status && this.replyRuleMatches(r.by, actor, item));
      to = rule?.to;
    }
    if (to !== undefined) this.checkStatusChange(actor, schema, item.status, to, d.force);

    const reply: Reply = {
      id: ulid(),
      item_id: id,
      author: actor.id,
      created_at: nowIso(),
      ...(to !== undefined && to !== item.status ? { status_change: { from: item.status, to } } : {}),
      ...(Object.keys(d.fields).length ? { fields: d.fields } : {}),
      body: d.body,
    };
    this.c.itemStore.addReply(reply);
    const next: Item = { ...item, status: to ?? item.status, updated_at: reply.created_at, updated_by: actor.id };
    this.save(next);
    this.c.activity.system(actor.id, "item.replied", `Replied on ${item.type} "${item.title}"${reply.status_change ? ` (${reply.status_change.from} → ${reply.status_change.to})` : ""}`, [id], { type: item.type, ...(reply.status_change ?? {}) });
    return { applied: true, id, reply_id: reply.id, status: next.status, message: "Reply added." };
  }

  // Claim/release: who is actively working an item right now, separate from `assignee` (who it belongs to).
  // Always writes directly (never a draft, whatever the type's approval policy) — it is coordination metadata,
  // not content to review, and queuing "I'm taking this now" as a pending draft would defeat its purpose.
  // Deliberately does not touch updated_at/updated_by/itemRevision: claim churn must never invalidate an
  // unrelated pending content draft's base_rev, or a caller's if_rev.
  claim(actor: Actor, id: string, input: ClaimInput): ItemWriteResult {
    const current = this.get(id).item;
    const parsed = ClaimInput.safeParse(input);
    if (!parsed.success) throw this.invalid(this.schema(current.type), zodIssues(parsed.error), "Claim");
    const d = parsed.data;

    if (d.action === "release") {
      if (current.claimed_by !== actor.id && !(actor.kind === "human" && d.force)) {
        throw new CortexError("forbidden", `This item is not claimed by ${actor.id}.`, 403, { claimed_by: current.claimed_by ?? null });
      }
      const next: Item = { ...current, claimed_by: undefined, claimed_at: undefined, handoff_note: d.note ?? current.handoff_note };
      this.save(next);
      this.c.activity.system(actor.id, "item.released", `Released ${next.type} "${next.title}"`, [id], { type: next.type });
      return { applied: true, id, status: next.status, message: "Claim released." };
    }

    const heldMs = current.claimed_by && current.claimed_at ? Date.now() - Date.parse(current.claimed_at) : Infinity;
    const held = current.claimed_by !== undefined && heldMs < CLAIM_TTL_MS;
    if (held && current.claimed_by !== actor.id && !(actor.kind === "human" && d.force)) {
      throw new CortexError("conflict", `Already claimed by ${current.claimed_by}.`, 409, { held_by: current.claimed_by, since: current.claimed_at });
    }
    const next: Item = { ...current, claimed_by: actor.id, claimed_at: nowIso(), handoff_note: d.note ?? current.handoff_note };
    this.save(next);
    this.c.activity.system(actor.id, "item.claimed", `Claimed ${next.type} "${next.title}"`, [id], { type: next.type });
    return { applied: true, id, status: next.status, message: "Claimed." };
  }

  private replyRuleMatches(by: string, actor: Actor, item: Item): boolean {
    switch (by) {
      case "anyone":
        return true;
      case "author":
        return actor.id === item.author;
      case "not_author":
        return actor.id !== item.author;
      case "assignee":
        return this.isAssignedTo(item.assignee ?? null, actor);
      default:
        return false;
    }
  }

  private isAssignedTo(assignee: string | null, actor: Actor): boolean {
    if (!assignee) return false;
    if (assignee === actor.id) return true;
    return GROUP_ASSIGNEES[assignee as keyof typeof GROUP_ASSIGNEES] === actor.kind;
  }

  // Ask about anything (an activity, an item or a knowledge node). The question goes to whoever made it.
  ask(
    actor: Actor,
    input: { about: string; title: string; body?: string; assignee?: string; blocking?: boolean },
  ): ItemWriteResult {
    const about = input.about.trim();
    const links: ItemLinks = {};
    let owner: string | undefined;
    let category: string | undefined;

    const activity = /^[0-9A-Z]{26}$/.test(about) ? this.c.index.getActivity(about) : null;
    const item = !activity && /^[0-9A-Z]{26}$/.test(about) ? this.c.itemStore.read(about) : null;
    if (activity) {
      links.activity = [about];
      owner = activity.actor;
      category = activity.refs?.find((r) => this.c.tree.exists(r));
    } else if (item) {
      links.items = [about];
      owner = item.author;
      category = item.category_path;
    } else {
      const path = normalizePath(about);
      const node = this.c.tree.read(path);
      if (!node) {
        throw new CortexError("not_found", `Nothing to ask about at "${about}". Use an activity id, item id or node path.`, 404);
      }
      links.nodes = [path];
      owner = node.updated_by;
      category = path === "" ? undefined : path;
    }
    let assignee = input.assignee ?? owner;
    // Asking yourself is pointless: route it to the other side instead.
    if (assignee === actor.id) assignee = actor.kind === "ai" ? "@humans" : "@ai";

    return this.create(actor, {
      type: "question",
      title: input.title,
      body: input.body ?? "",
      category_path: category,
      assignee,
      links,
      fields: input.blocking !== undefined ? { blocking: input.blocking } : {},
    });
  }

  private save(item: Item): void {
    this.c.itemStore.write(item);
    this.c.index.upsertItem(item, this.c.itemStore.replies(item.id), this.c.itemFlags(item.type, item.status));
  }

  applyDraft(item: Item): void {
    const existed = this.c.itemStore.exists(item.id);
    this.save(item);
    this.c.activity.system(item.updated_by, existed ? "item.updated" : "item.created", `${existed ? "Updated" : "Created"} ${item.type} "${item.title}" (approved draft)`, [item.id], { type: item.type, to: item.status });
  }

  // ---- reads --------------------------------------------------------------

  get(id: string, opts: { replies?: number; budget?: number } = {}) {
    const item = this.c.itemStore.read(id);
    if (!item) throw new CortexError("not_found", `No item with id "${id}".`, 404);
    let replies = this.c.itemStore.replies(id);
    const total = replies.length;
    // Newest replies matter most; trim older ones to respect the limit and the token budget.
    if (opts.replies !== undefined) replies = replies.slice(Math.max(0, replies.length - opts.replies));
    if (opts.budget) {
      let used = estimateTokens(item);
      const kept: Reply[] = [];
      for (const r of [...replies].reverse()) {
        used += estimateTokens(r);
        if (used > opts.budget && kept.length > 0) break;
        kept.unshift(r);
      }
      replies = kept;
    }
    return { item, rev: itemRevision(item), replies, replies_omitted: total - replies.length, rules_url: `/api/rules/${item.type}` };
  }

  list(q: {
    type?: string;
    status?: string;
    assignee?: string;
    author?: string;
    path?: string;
    open?: boolean;
    limit?: number;
    cursor?: string;
    visible?: SqlFilter | null;
  }) {
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 500);
    const offset = q.cursor ? Math.max(0, Number(q.cursor) || 0) : 0;
    const { items, total } = this.c.index.queryItems({
      type: q.type,
      status: q.status,
      author: q.author,
      assignee: q.assignee ? [q.assignee] : undefined,
      under: q.path ? normalizePath(q.path) : undefined,
      open: q.open,
      visible: q.visible,
      limit,
      offset,
    });
    const next = offset + items.length < total ? String(offset + items.length) : null;
    return { items: items.map(compact), total, next_cursor: next };
  }

  inbox(actor: Actor, limit = 20, visible: SqlFilter | null = null) {
    const groups = Object.entries(GROUP_ASSIGNEES)
      .filter(([, kind]) => kind === actor.kind)
      .map(([g]) => g);
    const seen = new Map<string, { item: IndexedItem; reason: InboxReason }>();
    const add = (item: IndexedItem, reason: InboxReason) => {
      if (!seen.has(item.id)) seen.set(item.id, { item, reason });
    };
    const q = (query: ItemQuery) => this.c.index.queryItems({ ...query, visible }).items;

    for (const i of q({ open: true, assignee: [actor.id], limit: 200, offset: 0 })) {
      // An answered question waits on its asker, not on the person who answered it.
      if (!(i.type === "question" && i.status === "answered")) add(i, "assigned_to_you");
    }
    for (const i of q({ open: true, type: "question", status: "answered", author: actor.id, limit: 200, offset: 0 })) add(i, "your_question_answered");
    for (const i of q({ open: true, assignee: groups, limit: 200, offset: 0 })) {
      if (!(i.type === "question" && i.status === "answered") && i.author !== actor.id) add(i, "assigned_to_group");
    }
    if (actor.kind === "human") {
      for (const i of q({ open: true, type: "decision", status: "proposed", limit: 200, offset: 0 })) add(i, "decision_needs_review");
    }
    for (const i of q({ open: true, author: actor.id, limit: 200, offset: 0 })) {
      if (i.last_reply_by && i.last_reply_by !== actor.id) add(i, "new_reply");
    }

    const all = [...seen.values()].sort((a, b) => Number(b.item.blocking) - Number(a.item.blocking) || (a.item.updated_at < b.item.updated_at ? 1 : -1));
    return {
      count: all.length,
      items: all.slice(0, limit).map(({ item, reason }) => ({ ...compact(item), reason })),
    };
  }
}

function compact(i: IndexedItem) {
  return {
    id: i.id,
    type: i.type,
    title: i.title,
    status: i.status,
    ...(i.category_path ? { category_path: i.category_path } : {}),
    author: i.author,
    ...(i.assignee ? { assignee: i.assignee } : {}),
    ...(i.claimed_by ? { claimed_by: i.claimed_by, claimed_at: i.claimed_at } : {}),
    ...(i.blocking ? { blocking: true } : {}),
    ...(i.reply_count ? { replies: i.reply_count } : {}),
    updated_at: i.updated_at,
  };
}


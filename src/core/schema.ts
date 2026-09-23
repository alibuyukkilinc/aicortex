import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

// A tiny, human-editable schema language. Humans own these files (rules/<type>.schema.yaml);
// the server enforces them and explains violations so an AI can correct itself.

export type FieldType =
  | "string" | "text" | "enum" | "number" | "boolean" | "date" | "datetime"
  | "tree_path" | "actor" | "item_ref" | "commit" | "url" | "list";

export interface FieldSpec {
  type: FieldType;
  required?: boolean;
  values?: string[]; // enum
  of?: Exclude<FieldType, "list">; // list element type
  max?: number; // string length or list size
  description?: string;
}

export interface ConditionalRule {
  when: Record<string, unknown>; // field -> value or list of values
  require: string[];
  message?: string;
}

export interface OnReplyRule {
  from: string; // current status
  by: "assignee" | "not_author" | "author" | "anyone";
  to: string;
}

export interface ItemSchema {
  type: string;
  description?: string;
  statuses: string[];
  initial: string;
  // "terminal" means no transition leads out of it. "resolved" means the work is finished even though
  // the item can still move: an accepted decision stands until something supersedes it, and it must not
  // be counted as work waiting for someone.
  terminal: string[];
  resolved?: string[];
  transitions: Record<string, string[]> | "any";
  human_only_statuses?: string[];
  category_required?: boolean;
  fields: Record<string, FieldSpec>;
  require_when?: ConditionalRule[];
  reply?: { fields?: Record<string, FieldSpec>; require_when?: ConditionalRule[]; on_reply?: OnReplyRule[] };
  ai_instructions?: string;
  example?: Record<string, unknown>;
}

export interface ValidationContext {
  actorExists(id: string): boolean;
  nodeExists(path: string): boolean;
  itemExists(id: string): boolean;
}

export const ITEM_TYPES = ["task", "issue", "question", "note", "decision"] as const;

export const DEFAULT_SCHEMAS: Record<string, ItemSchema> = {
  task: {
    type: "task",
    description: "A unit of work on the board.",
    statuses: ["backlog", "todo", "doing", "review", "done"],
    initial: "backlog",
    terminal: ["done"],
    transitions: "any",
    fields: {
      priority: { type: "enum", values: ["low", "medium", "high"] },
      due: { type: "date", description: "YYYY-MM-DD" },
      estimate: { type: "string", max: 40, description: 'Free text, e.g. "2h" or "3 points"' },
    },
    ai_instructions: "Move a task to 'doing' when you start and 'review' when you finish; humans move it to 'done'.",
    human_only_statuses: ["done"],
    example: { type: "task", title: "Add rate limiting to login", category_path: "backend", fields: { priority: "high" } },
  },
  issue: {
    type: "issue",
    description: "A bug or problem that needs fixing.",
    statuses: ["open", "in_progress", "review", "closed"],
    initial: "open",
    terminal: ["closed"],
    transitions: {
      open: ["in_progress", "closed"],
      in_progress: ["review", "open", "closed"],
      review: ["closed", "in_progress"],
      closed: ["open"],
    },
    category_required: true,
    fields: {
      severity: { type: "enum", values: ["low", "medium", "high", "critical"], required: true },
      steps: { type: "text", description: "How to reproduce" },
      expected: { type: "text" },
      actual: { type: "text" },
      environment: { type: "string", max: 200 },
    },
    reply: {
      fields: {
        resolution: { type: "enum", values: ["fixed", "wontfix", "needs_info", "duplicate", "cannot_reproduce"] },
        commits: { type: "list", of: "commit", max: 20 },
        files: { type: "list", of: "string", max: 50 },
      },
      require_when: [
        { when: { resolution: "fixed" }, require: ["commits", "files"], message: "A 'fixed' resolution must list the commits and changed files." },
      ],
    },
    ai_instructions:
      "When you fix an issue, reply with resolution 'fixed', the commit hashes and changed files, and move it to 'review'. " +
      "If you are not sure about the cause, reply with 'needs_info' or open a question instead of guessing.",
    example: {
      type: "issue",
      title: "Login returns 500 on wrong password",
      category_path: "backend",
      body: "Seen in production logs since 2026-09-20.",
      fields: { severity: "high", steps: "POST /login with a wrong password" },
    },
  },
  question: {
    type: "question",
    description: "A question between humans and AIs. Assign it to an actor, '@humans' or '@ai'.",
    statuses: ["open", "answered", "closed"],
    initial: "open",
    terminal: ["closed"],
    transitions: { open: ["answered", "closed"], answered: ["closed", "open"], closed: ["open"] },
    fields: {
      blocking: { type: "boolean", description: "true if the asker cannot continue until this is answered" },
    },
    reply: { on_reply: [{ from: "open", by: "not_author", to: "answered" }] },
    ai_instructions:
      "Ask when search does not answer you; do not assume. While a blocking question you asked is open, do not work around it. " +
      "When your question is answered, close it.",
    example: { type: "question", title: "Should guest checkout create an account?", assignee: "@humans", fields: { blocking: true } },
  },
  note: {
    type: "note",
    description: "A free-form note attached to a part of the project.",
    statuses: ["active", "archived"],
    initial: "active",
    terminal: ["archived"],
    transitions: "any",
    fields: {},
    example: { type: "note", title: "Staging DB is reset every Monday", category_path: "server" },
  },
  decision: {
    type: "decision",
    description: "What we decided, why, and what we rejected (ADR).",
    statuses: ["proposed", "accepted", "rejected", "superseded"],
    initial: "proposed",
    terminal: ["rejected", "superseded"],
    resolved: ["accepted"],
    transitions: { proposed: ["accepted", "rejected"], accepted: ["superseded"], rejected: ["proposed"], superseded: [] },
    human_only_statuses: ["accepted", "rejected"],
    fields: {
      context: { type: "text", required: true, description: "The problem and constraints" },
      alternatives: { type: "text", description: "Options considered and why they lost" },
      consequences: { type: "text", description: "What becomes easier or harder" },
      supersedes: { type: "item_ref" },
    },
    ai_instructions: "Put the decision itself in body. You may propose; only humans accept or reject.",
    example: {
      type: "decision",
      title: "Use iyzico for card payments",
      category_path: "backend",
      body: "We use iyzico for all card payments.",
      fields: { context: "Need TRY payments with installments.", alternatives: "Stripe: no installments in TR." },
    },
  },
};

export const ACTIVITY_SCHEMA = {
  actions: ["code_change", "fix", "refactor", "investigation", "config", "deploy", "docs", "other"],
  why_required_for: ["code_change", "fix", "refactor", "config", "deploy"],
  ai_instructions: "Log every meaningful change: what (summary), why, files and commit. One entry per logical change, not per file.",
};

export function loadSchema(rulesDir: string, type: string): ItemSchema | null {
  const file = join(rulesDir, `${type}.schema.yaml`);
  if (existsSync(file)) {
    const s = YAML.parse(readFileSync(file, "utf8")) as ItemSchema;
    return {
      ...s,
      fields: s.fields ?? {},
      terminal: s.terminal ?? [],
      // Schema files are written to disk at init, so projects created before "resolved" existed have no
      // such key. Falling back to the built-in default fixes them on upgrade without touching their files.
      resolved: s.resolved ?? DEFAULT_SCHEMAS[type]?.resolved ?? [],
      transitions: s.transitions ?? "any",
    };
  }
  return DEFAULT_SCHEMAS[type] ?? null;
}

// Work that still waits for someone: not finished by transition (terminal) and not settled (resolved).
export function isOpenWork(schema: ItemSchema, status: string): boolean {
  return !schema.terminal.includes(status) && !(schema.resolved ?? []).includes(status);
}

export function loadActivitySchema(rulesDir: string): typeof ACTIVITY_SCHEMA {
  const file = join(rulesDir, "activity.schema.yaml");
  if (!existsSync(file)) return ACTIVITY_SCHEMA;
  return { ...ACTIVITY_SCHEMA, ...(YAML.parse(readFileSync(file, "utf8")) ?? {}) };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT = /^[0-9a-f]{7,40}$/i;

function checkValue(name: string, spec: FieldSpec | { type: FieldType; values?: string[]; max?: number }, v: unknown, ctx: ValidationContext): string | null {
  switch (spec.type) {
    case "string":
    case "text":
      if (typeof v !== "string") return `${name}: must be a string`;
      if (spec.max && v.length > spec.max) return `${name}: at most ${spec.max} characters`;
      return null;
    case "enum":
      return spec.values?.includes(v as string) ? null : `${name}: must be one of ${spec.values?.join(", ")}`;
    case "number":
      return typeof v === "number" && Number.isFinite(v) ? null : `${name}: must be a number`;
    case "boolean":
      return typeof v === "boolean" ? null : `${name}: must be true or false`;
    case "date":
      return typeof v === "string" && DATE.test(v) && !isNaN(Date.parse(v)) ? null : `${name}: must be a date like 2026-09-22`;
    case "datetime":
      return typeof v === "string" && !isNaN(Date.parse(v)) && v.includes("T") ? null : `${name}: must be ISO-8601 UTC like 2026-09-22T10:15:00Z`;
    case "url":
      return typeof v === "string" && /^https?:\/\//.test(v) ? null : `${name}: must be an http(s) URL`;
    case "commit":
      return typeof v === "string" && COMMIT.test(v) ? null : `${name}: must be a git commit hash`;
    case "actor":
      return typeof v === "string" && ctx.actorExists(v) ? null : `${name}: unknown actor "${String(v)}"`;
    case "tree_path":
      return typeof v === "string" && ctx.nodeExists(v) ? null : `${name}: no knowledge node at "${String(v)}"`;
    case "item_ref":
      return typeof v === "string" && ctx.itemExists(v) ? null : `${name}: no item with id "${String(v)}"`;
    case "list": {
      if (!Array.isArray(v)) return `${name}: must be a list`;
      if (spec.max && v.length > spec.max) return `${name}: at most ${spec.max} entries`;
      const of = (spec as FieldSpec).of ?? "string";
      for (const [i, el] of v.entries()) {
        const err = checkValue(`${name}[${i}]`, { type: of }, el, ctx);
        if (err) return err;
      }
      return null;
    }
  }
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

function matches(record: Record<string, unknown>, when: Record<string, unknown>): boolean {
  return Object.entries(when).every(([k, want]) => (Array.isArray(want) ? want.includes(record[k]) : record[k] === want));
}

// Returns human-readable problems; empty list means valid.
export function validateFields(
  specs: Record<string, FieldSpec>,
  record: Record<string, unknown>,
  ctx: ValidationContext,
  conditional: ConditionalRule[] = [],
): string[] {
  const issues: string[] = [];
  for (const key of Object.keys(record)) {
    if (!(key in specs)) {
      const allowed = Object.keys(specs);
      issues.push(`${key}: unknown field (allowed: ${allowed.length ? allowed.join(", ") : "none"})`);
    }
  }
  for (const [name, spec] of Object.entries(specs)) {
    const v = record[name];
    if (isEmpty(v)) {
      if (spec.required) issues.push(`${name}: required`);
      continue;
    }
    const err = checkValue(name, spec, v, ctx);
    if (err) issues.push(err);
  }
  for (const rule of conditional) {
    if (!matches(record, rule.when)) continue;
    const missing = rule.require.filter((f) => isEmpty(record[f]));
    if (missing.length) issues.push(rule.message ? `${rule.message} (missing: ${missing.join(", ")})` : `required when ${JSON.stringify(rule.when)}: ${missing.join(", ")}`);
  }
  return issues;
}

export function canTransition(schema: ItemSchema, from: string, to: string): boolean {
  if (from === to) return true;
  if (!schema.statuses.includes(to)) return false;
  if (schema.transitions === "any") return true;
  return schema.transitions[from]?.includes(to) ?? false;
}

// Compact description of a schema: what an AI needs to write a valid item, nothing more.
export function describeSchema(schema: ItemSchema) {
  return {
    type: schema.type,
    description: schema.description,
    statuses: schema.statuses,
    initial: schema.initial,
    resolved: schema.resolved ?? [],
    transitions: schema.transitions,
    human_only_statuses: schema.human_only_statuses ?? [],
    category_required: !!schema.category_required,
    fields: schema.fields,
    require_when: schema.require_when ?? [],
    reply: schema.reply ?? {},
    ai_instructions: schema.ai_instructions,
    example: schema.example,
  };
}

export type ActorKind = "human" | "ai";
export interface Actor {
  id: string;
  kind: ActorKind;
}

export interface Me {
  actor: Actor;
  project: { name: string };
  actors: Actor[];
  item_types: string[];
  // Hub only: the member's role in this project and what it allows.
  role?: string;
  perms?: string[];
  restricted?: boolean;
}

export interface HubMe {
  org: string;
  principal: { id: string; kind: "human" | "ai"; email?: string; name: string; org_admin?: boolean };
  projects: { id: string; name: string; role: string }[];
}

export interface FieldSpec {
  type: string;
  required?: boolean;
  values?: string[];
  of?: string;
  max?: number;
  description?: string;
}

export interface Schema {
  type: string;
  description?: string;
  statuses: string[];
  initial: string;
  transitions: Record<string, string[]> | "any";
  human_only_statuses: string[];
  category_required: boolean;
  fields: Record<string, FieldSpec>;
  reply: { fields?: Record<string, FieldSpec> };
  reply_required?: { statuses: string[]; default: boolean };
  ai_instructions?: string;
}

export interface ItemSummary {
  id: string;
  type: string;
  title: string;
  status: string;
  category_path?: string;
  author: string;
  assignee?: string;
  claimed_by?: string;
  claimed_at?: string;
  blocking?: boolean;
  replies?: number;
  files?: number; // attachments
  cover?: string; // first picture, shown on the board card
  level?: string; // priority, or severity for issues
  due?: string; // YYYY-MM-DD
  has_body?: boolean;
  updated_at: string;
  reason?: string;
}

export interface Attachment {
  name: string;
  size: number;
  type: string;
  added_at: string;
}

export interface CodeLink {
  file: string;
  lines?: string;
}

export interface Item {
  id: string;
  type: string;
  title: string;
  status: string;
  category_path?: string;
  author: string;
  assignee?: string;
  claimed_by?: string;
  claimed_at?: string;
  handoff_note?: string;
  reply_required?: boolean;
  tags?: string[];
  links?: { nodes?: string[]; items?: string[]; activity?: string[]; code?: CodeLink[] };
  fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string;
  body: string;
}

export interface Reply {
  id: string;
  author: string;
  created_at: string;
  status_change?: { from: string; to: string };
  fields?: Record<string, unknown>;
  sealed?: boolean; // a discussion view hidden from this reader until they post theirs
  body: string;
}

export interface NodeSummary {
  path: string;
  title: string;
  summary: string;
  status: string;
  open_items?: number;
  children?: NodeSummary[];
  child_count?: number;
}

export interface KnowledgeNode {
  id: string;
  path: string;
  title: string;
  summary: string;
  body: string;
  tags?: string[];
  links?: { code?: CodeLink[]; items?: string[] };
  verified_at_commit?: string;
  status: string;
  updated_by: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  at: string;
  actor: string;
  action: string;
  summary: string;
  why?: string;
  files?: string[];
  commit?: string;
  refs?: string[];
  system?: boolean;
}

export interface Draft {
  id: string;
  kind: "node" | "item";
  target: string;
  proposed_by: string;
  proposed_at: string;
  reason?: string;
  title: string;
  summary: string;
}

export interface SearchHit {
  kind: "node" | "item" | "activity";
  path?: string;
  id?: string;
  type?: string;
  title?: string;
  summary: string;
  status?: string;
  actor?: string;
  at?: string;
  score: number;
  match?: "keyword" | "semantic" | "both";
  draft_id?: string; // a knowledge draft waiting for approval (status "draft")
  proposed_by?: string;
}

export type Severity = "high" | "medium" | "low";

export interface StaleInfo {
  path: string;
  title?: string; // only on the /api/stale list
  verified_at_commit: string;
  reason: "changed" | "unknown_commit";
  severity: Severity;
  snoozed?: { at: string; by: string };
  changes: {
    file: string;
    status: "modified" | "deleted" | "renamed";
    severity: Severity;
    formatting_only?: boolean;
    renamed_to?: string;
    lines?: string;
    commits: number;
    last?: { hash: string; author: string; date: string; subject: string };
  }[];
}

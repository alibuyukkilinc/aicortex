export type NodeStatus = "active" | "draft" | "stale" | "deprecated";
export type ActorKind = "human" | "ai";
export type ApprovalPolicy = "auto" | "review" | "human_only";

// Group assignees: anyone of that kind may pick the item up.
export const GROUP_ASSIGNEES = { "@humans": "human", "@ai": "ai" } as const;

export interface CodeLink {
  file: string;
  lines?: string;
}

export interface NodeMeta {
  id: string;
  title: string;
  summary: string;
  tags?: string[];
  links?: { code?: CodeLink[]; items?: string[] };
  verified_at_commit?: string;
  status: NodeStatus;
  updated_by: string;
  updated_at: string;
}

export interface KnowledgeNode extends NodeMeta {
  path: string; // "" is the project root
  body: string;
}

export interface NodeSummary {
  path: string;
  title: string;
  summary: string;
  status: NodeStatus;
  open_items?: number;
  children?: NodeSummary[];
  child_count?: number;
}

export interface ItemLinks {
  nodes?: string[];
  items?: string[];
  activity?: string[];
  code?: CodeLink[];
}

export interface Item {
  id: string;
  type: string;
  title: string;
  status: string;
  category_path?: string;
  author: string;
  assignee?: string; // actor id, "@humans" or "@ai"
  tags?: string[];
  links?: ItemLinks;
  fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string;
  body: string;
}

export interface Reply {
  id: string;
  item_id: string;
  author: string;
  created_at: string;
  status_change?: { from: string; to: string };
  fields?: Record<string, unknown>;
  body: string;
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
  refs?: string[]; // item ids or node paths
  system?: boolean; // written by Cortex itself (audit trail), not by the actor
}

export interface Actor {
  id: string;
  kind: ActorKind;
}

export interface CortexConfig {
  project: { name: string; summary?: string };
  port: number;
  actors: Actor[];
  approval: Record<string, ApprovalPolicy>;
  search?: { semantic?: boolean }; // false turns semantic search off for this project
}

export type Draft =
  | (DraftBase & { kind: "node"; data: KnowledgeNode })
  | (DraftBase & { kind: "item"; data: Item });

interface DraftBase {
  id: string;
  target: string; // node path or item id
  proposed_by: string;
  proposed_at: string;
  reason?: string;
  base_rev?: string; // content hash of the target when the draft was made; used to detect conflicts
}

export class CortexError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public hint?: unknown,
  ) {
    super(message);
  }
}

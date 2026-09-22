export type NodeStatus = "active" | "draft" | "stale" | "deprecated";
export type ActorKind = "human" | "ai";
export type ApprovalPolicy = "auto" | "review" | "human_only";

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
  children?: NodeSummary[];
  child_count?: number;
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
}

export interface Draft {
  id: string;
  kind: "node";
  target: string; // node path
  proposed_by: string;
  proposed_at: string;
  reason?: string;
  base_rev?: string; // content hash of the node when the draft was made; used to detect conflicts
  node: KnowledgeNode;
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

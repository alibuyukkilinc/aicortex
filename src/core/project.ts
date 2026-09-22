import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { CortexConfig, CortexError } from "./types.js";
import { shortHash } from "../util/text.js";

export const CORTEX_DIR = ".cortex";

export interface Project {
  root: string; // repository root (parent of .cortex)
  dir: string; // .cortex directory
  config: CortexConfig;
}

export function paths(dir: string) {
  return {
    config: join(dir, "cortex.config.yaml"),
    secrets: join(dir, ".secrets.yaml"),
    rules: join(dir, "rules"),
    tree: join(dir, "tree"),
    items: join(dir, "items"),
    activity: join(dir, "activity"),
    drafts: join(dir, "drafts"),
    index: join(dir, ".index"),
  };
}

// Walk up from cwd until a .cortex folder is found, like git does with .git.
export function findProjectRoot(start = process.cwd()): string | null {
  let cur = resolve(start);
  while (true) {
    if (existsSync(join(cur, CORTEX_DIR, "cortex.config.yaml"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export function loadProject(start?: string): Project {
  const root = findProjectRoot(start);
  if (!root) {
    throw new CortexError("not_initialized", "No .cortex folder found. Run `npx projcortex init` first.", 404);
  }
  const dir = join(root, CORTEX_DIR);
  const config = YAML.parse(readFileSync(paths(dir).config, "utf8")) as CortexConfig;
  config.port ??= 4747;
  config.actors ??= [];
  config.approval ??= {};
  return { root, dir, config };
}

export function loadTokens(dir: string): Record<string, string> {
  const file = paths(dir).secrets;
  if (!existsSync(file)) return {};
  return (YAML.parse(readFileSync(file, "utf8"))?.tokens ?? {}) as Record<string, string>;
}

// Rules version = hash of every file under rules/. AIs re-fetch rules only when this changes.
export function rulesVersion(dir: string): string {
  const rulesDir = paths(dir).rules;
  if (!existsSync(rulesDir)) return "r-none";
  const parts: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else parts.push(name, readFileSync(p, "utf8"));
    }
  };
  walk(rulesDir);
  return "r-" + shortHash(parts.join("\0"));
}

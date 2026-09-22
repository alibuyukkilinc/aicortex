import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";
import { Draft } from "../core/types.js";

// Drafts live next to the data (drafts/<id>.md) so pending approvals are versioned in git too.
export class DraftStore {
  constructor(private dir: string) {}

  save(draft: Draft): void {
    mkdirSync(this.dir, { recursive: true });
    const { node, ...meta } = draft;
    const { body, ...nodeMeta } = node;
    writeFileSync(join(this.dir, `${draft.id}.md`), stringifyFrontmatter({ ...meta, node: nodeMeta }, body), "utf8");
  }

  get(id: string): Draft | null {
    if (!/^[0-9A-Z]{26}$/.test(id)) return null;
    const file = join(this.dir, `${id}.md`);
    if (!existsSync(file)) return null;
    const { meta, body } = parseFrontmatter<Omit<Draft, "node"> & { node: Omit<Draft["node"], "body"> }>(
      readFileSync(file, "utf8"),
    );
    return { ...meta, node: { ...meta.node, body } };
  }

  list(): Draft[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => this.get(f.slice(0, -3)))
      .filter((d): d is Draft => d !== null);
  }

  remove(id: string): void {
    const file = join(this.dir, `${id}.md`);
    if (existsSync(file)) unlinkSync(file);
  }
}

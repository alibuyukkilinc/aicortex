import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";
import type { Item, Reply } from "../core/types.js";
import { fold } from "../util/text.js";

// Layout: items/<ID>-<slug>/item.md and items/<ID>-<slug>/replies/<REPLY_ID>.md
// One file per reply means two people answering at once never conflict in git.

const ID = /^[0-9A-Z]{26}$/;

export function slugify(title: string): string {
  return fold(title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "item";
}

export class ItemStore {
  private dirs = new Map<string, string>();
  private scannedAt = -1; // mtime of the items folder when `dirs` was last rebuilt from it
  scans = 0; // folder listings so far; tests use it to prove lookups do not scan per item

  constructor(private root: string) {}

  // id -> folder. A miss used to list the whole items folder, and a reindex looks up every item once:
  // n listings of n entries. Now the folder is listed again only when its own mtime changes (an item
  // folder was added, removed or renamed), so a full reindex lists it once.
  private dirFor(id: string): string | null {
    if (!ID.test(id)) return null;
    const cached = this.dirs.get(id);
    if (cached && existsSync(cached)) return cached;
    this.rescan();
    const dir = this.dirs.get(id);
    return dir && existsSync(dir) ? dir : null;
  }

  private rescan(): void {
    let m: number;
    try {
      m = statSync(this.root).mtimeMs;
    } catch {
      this.dirs.clear();
      this.scannedAt = -1;
      return;
    }
    if (m === this.scannedAt) return;
    this.scans++;
    this.dirs.clear();
    for (const name of readdirSync(this.root)) {
      const id = name.slice(0, 26);
      if (ID.test(id) && (name.length === 26 || name[26] === "-")) this.dirs.set(id, join(this.root, name));
    }
    this.scannedAt = m;
  }

  exists(id: string): boolean {
    return this.dirFor(id) !== null;
  }

  read(id: string): Item | null {
    const dir = this.dirFor(id);
    if (!dir || !existsSync(join(dir, "item.md"))) return null;
    const { meta, body } = parseFrontmatter<Item>(readFileSync(join(dir, "item.md"), "utf8"));
    return { ...meta, fields: meta.fields ?? {}, id, body };
  }

  write(item: Item): void {
    const dir = this.dirFor(item.id) ?? join(this.root, `${item.id}-${slugify(item.title)}`);
    mkdirSync(dir, { recursive: true });
    this.dirs.set(item.id, dir);
    const { body, ...meta } = item;
    writeFileSync(join(dir, "item.md"), stringifyFrontmatter(meta, body), "utf8");
  }

  addReply(reply: Reply): void {
    const dir = this.dirFor(reply.item_id);
    if (!dir) throw new Error(`item ${reply.item_id} not found`);
    mkdirSync(join(dir, "replies"), { recursive: true });
    const { body, item_id: _i, ...meta } = reply;
    writeFileSync(join(dir, "replies", `${reply.id}.md`), stringifyFrontmatter(meta, body), "utf8");
  }

  replies(id: string): Reply[] {
    const dir = this.dirFor(id);
    const rdir = dir && join(dir, "replies");
    if (!rdir || !existsSync(rdir)) return [];
    return readdirSync(rdir)
      .filter((f) => f.endsWith(".md"))
      .sort() // ULIDs sort by time
      .map((f) => {
        const { meta, body } = parseFrontmatter<Reply>(readFileSync(join(rdir, f), "utf8"));
        return { ...meta, id: f.slice(0, -3), item_id: id, body };
      });
  }

  allIds(): string[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root)
      .map((n) => n.slice(0, 26))
      .filter((n) => ID.test(n))
      .sort();
  }
}

// Prints one version's section of CHANGELOG.md, for the GitHub release body: `node scripts/release-notes.mjs 0.2.0`.
// Fails (exit 1) when the version has no section, so a release cannot go out without its notes.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const version = process.argv[2]?.replace(/^v/, "");
if (!version) {
  console.error("Usage: node scripts/release-notes.mjs <version>");
  process.exit(1);
}
const text = readFileSync(resolve(import.meta.dirname, "../CHANGELOG.md"), "utf8").replace(/\r\n/g, "\n");
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const m = new RegExp(`^## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|(?![\\s\\S]))`, "m").exec(text);
const body = m?.[1].trim();
if (!body) {
  console.error(`CHANGELOG.md has no section for ${version}.`);
  process.exit(1);
}
console.log(body);

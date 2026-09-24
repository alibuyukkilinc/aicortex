// node:test reporter for CI: every failing test becomes a GitHub Actions error annotation, so a red run
// shows which test failed and why on the run's page (and through the public API), not only in the log.
// Used next to the spec reporter: --test-reporter=./scripts/gh-annotations.mjs --test-reporter-destination=stdout
import { relative } from "node:path";

const escapeData = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProp = (s) => escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

export default async function* annotations(source) {
  for await (const event of source) {
    if (event.type !== "test:fail") continue;
    const { name, file, line, details, nesting } = event.data;
    const error = details?.error;
    // The file-level entry repeats its failing tests; report each test once.
    if (nesting === 0 && error?.failureType === "subtestsFailed") continue;
    const cause = error?.cause ?? error;
    const message = [
      cause?.message ?? String(cause ?? "failed"),
      cause?.expected !== undefined ? `expected: ${JSON.stringify(cause.expected)}` : "",
      cause?.actual !== undefined ? `actual: ${JSON.stringify(cause.actual)}` : "",
      String(cause?.stack ?? "")
        .split("\n")
        .slice(1, 6)
        .join("\n"),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);
    const where = file ? `file=${escapeProp(relative(process.cwd(), file.replace(/^file:\/\//, "")))},line=${line ?? 1},` : "";
    yield `::error ${where}title=${escapeProp(name)}::${escapeData(message)}\n`;
  }
}

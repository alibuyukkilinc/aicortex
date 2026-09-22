// Install smoke test: the spec's "a clean machine with only Node runs init + start in under 2 minutes".
// Packs this repo (run `npm run build` first), installs the tarball into an empty folder, then runs
// `aicortex init` through the npm bin shim and `aicortex start`, and checks the API, the brief and the board.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const LIMIT_MS = 120_000;
const repo = resolve(import.meta.dirname, "..");
const work = mkdtempSync(join(tmpdir(), "aicortex-smoke-"));
const app = join(work, "app");
const t0 = Date.now();
const step = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
// npm and npx are .cmd files on Windows, which only run through a shell.
const sh = (cmd, cwd) => execFileSync(cmd, { cwd, shell: true, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

let server;
try {
  const [packed] = JSON.parse(sh(`npm pack --json --pack-destination "${work}"`, repo));
  const tarball = join(work, packed.filename);
  step(`packed ${packed.filename} (${(packed.size / 1024).toFixed(0)} KB, ${packed.entryCount} files)`);
  if (!packed.files.some((f) => f.path === "dist/web/index.html")) throw new Error("The package does not contain the built board (dist/web/index.html).");

  execFileSync(process.execPath, ["-e", "require('fs').mkdirSync(process.argv[1])", app]);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "smoke-app", private: true }));
  sh(`npm install --no-audit --no-fund "${tarball}"`, app);
  step("installed into an empty folder");

  const init = sh("npx --no-install aicortex init --name smoke --lang en --branches backend,frontend", app);
  if (!init.includes("Cortex initialized")) throw new Error(`init did not report success:\n${init}`);
  step("aicortex init");

  const port = 4800 + Math.floor(Math.random() * 500);
  const bin = JSON.parse(readFileSync(join(app, "node_modules/aicortex/package.json"), "utf8")).bin.aicortex;
  server = spawn(process.execPath, [join(app, "node_modules/aicortex", bin), "start", "--port", String(port)], { cwd: app, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  server.stdout.on("data", (d) => (out += d));
  server.stderr.on("data", (d) => (out += d));

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      // not listening yet
    }
    if (server.exitCode !== null || i > 300) throw new Error(`The server did not come up:\n${out}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  step("aicortex start: API is up");

  const token = /owner:\s*(\S+)/.exec(readFileSync(join(app, ".cortex/.secrets.yaml"), "utf8"))[1];
  const brief = await (await fetch(`${base}/api/brief`, { headers: { authorization: `Bearer ${token}` } })).json();
  const branches = brief.branches?.map((b) => b.path).join(",");
  if (brief.project?.name !== "smoke" || branches !== "backend,frontend") throw new Error(`Unexpected brief: ${JSON.stringify(brief).slice(0, 300)}`);
  if (!/English \(en\)/.test(brief.rules?.global?.[0] ?? "")) throw new Error("The language rule is missing from the brief.");
  const board = await (await fetch(`${base}/`)).text();
  if (!board.includes('<div id="root">')) throw new Error("The board is not served.");
  step("brief, language rule and board OK");

  const elapsed = Date.now() - t0;
  console.log(`\n✔ pack + install + init + start in ${(elapsed / 1000).toFixed(1)} s (limit ${LIMIT_MS / 1000} s)`);
  if (elapsed > LIMIT_MS) {
    console.error("✖ Slower than the acceptance limit.");
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`✖ ${e.message}`);
  process.exitCode = 1;
} finally {
  server?.kill();
  // Windows keeps the SQLite files locked for a moment after the server exits.
  await new Promise((r) => setTimeout(r, 500));
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    console.warn(`(left ${work} behind)`);
  }
}

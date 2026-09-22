#!/usr/bin/env node
// node:sqlite prints an ExperimentalWarning on load; hide only that one so the CLI output stays clean.
const emit = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  if (String(warning).includes("SQLite")) return;
  return (emit as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

import { parseArgs } from "node:util";
// Safe as static imports: neither module loads node:sqlite (which must come after the warning filter above).
import { createLoginCode } from "./api/auth.js";
import { loadTokens } from "./core/project.js";

const HELP = `Cortex: shared project brain for humans and AIs

Usage: cortex <command> [options]

  init [--name <n>] [--agent-files]  Create .cortex/ in the current folder
  start [--port <n>]                 Start the API and the web board on localhost
  login [--actor <id>]               Print a 10-minute login link for the board (default: first human)
  mcp [--actor <id>]                 Run as an MCP server over stdio (default actor: ai-agent)
  bootstrap                          Print the task that lets your AI fill the tree
  reindex                            Rebuild the search index from files
  semantic [on|off|status]           Meaning-based search (one-time ~420 MB download, shared by all projects)
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: "string" },
      port: { type: "string" },
      actor: { type: "string" },
      "agent-files": { type: "boolean" },
    },
    allowPositionals: true,
  });

  const { loadProject } = await import("./core/project.js");

  switch (cmd) {
    case "init": {
      const { initProject, AGENT_HINT } = await import("./core/init.js");
      const root = process.cwd();
      const r = initProject(root, values.name);
      console.log(`✔ Cortex initialized in ${r.dir}\n`);
      console.log("Actor tokens (stored in .cortex/.secrets.yaml, git-ignored):");
      for (const [id, t] of Object.entries(r.tokens)) console.log(`  ${id.padEnd(10)} ${t}`);
      if (values["agent-files"]) {
        const { appendAgentHint } = await import("./core/agentFiles.js");
        for (const f of appendAgentHint(root, AGENT_HINT)) console.log(`✔ Added Cortex hint to ${f}`);
      }
      console.log(`
Next steps:
  1. npx projcortex start                   start the local API on http://localhost:4747
  2. Add the MCP server to your AI tool, e.g. Claude Code:
       claude mcp add cortex -- npx projcortex mcp --actor ai-agent
  3. npx projcortex bootstrap               give the printed task to your AI to fill the tree
`);
      if (r.markdownCandidates.length) {
        console.log(`Found ${r.markdownCandidates.length} markdown file(s) the bootstrap task will import.`);
      }
      break;
    }

    case "start": {
      const { Cortex } = await import("./core/cortex.js");
      const { buildServer } = await import("./api/server.js");
      const project = loadProject();
      const cortex = new Cortex(project);
      cortex.watch((e) => console.error(`⚠ reindex failed: ${(e as Error).message}`));
      const port = values.port ? Number(values.port) : project.config.port;
      const app = buildServer(cortex);
      await app.listen({ port, host: "127.0.0.1" });
      console.log(`Cortex "${project.config.project.name}" running at http://localhost:${port}`);
      const human = project.config.actors.find((a) => a.kind === "human");
      if (human) console.log(`Open the board as ${human.id}: ${loginLink(project, human.id, port)}`);
      break;
    }

    case "login": {
      const project = loadProject();
      const actor = values.actor ?? project.config.actors.find((a) => a.kind === "human")?.id;
      const found = project.config.actors.find((a) => a.id === actor);
      if (!found || found.kind !== "human") throw new Error(`"${actor ?? ""}" is not a human actor in cortex.config.yaml.`);
      const port = values.port ? Number(values.port) : project.config.port;
      console.log(loginLink(project, found.id, port));
      break;
    }

    case "mcp": {
      const { Cortex } = await import("./core/cortex.js");
      const { runMcpStdio } = await import("./mcp/server.js");
      // stdout belongs to the MCP protocol here: never console.log in this branch.
      const cortex = new Cortex(loadProject());
      cortex.watch((e) => console.error(`cortex: reindex failed: ${(e as Error).message}`)); // stderr is safe for MCP
      await runMcpStdio(cortex, cortex.actor(values.actor ?? "ai-agent"));
      break;
    }

    case "bootstrap": {
      const { bootstrapPrompt, findMarkdown } = await import("./core/init.js");
      const project = loadProject();
      console.log(bootstrapPrompt(project.config.project.name, findMarkdown(project.root)));
      break;
    }

    case "semantic": {
      const rt = await import("./search/runtime.js");
      const sub = process.argv[3] ?? "status";
      if (sub === "status") {
        console.log(`enabled:          ${rt.readSettings().semantic === true ? "yes" : "no"}`);
        console.log(`runtime:          ${rt.runtimeInstalled() ? "installed" : "not installed"}`);
        console.log(`model:            ${rt.MODEL} (${rt.modelDownloaded() ? "downloaded" : "not downloaded"})`);
        console.log(`location:         ${rt.cortexHome()}`);
        if (!rt.semanticEnabled()) console.log("\nSearch is keyword-only. Turn on meaning-based search with: npx projcortex semantic on");
        break;
      }
      if (sub === "off") {
        rt.writeSettings({ semantic: false });
        console.log("✔ Semantic search off. Files stay in place; `semantic on` re-enables it instantly.");
        break;
      }
      if (sub !== "on") throw new Error(`Unknown option "${sub}". Use on, off or status.`);

      if (!rt.runtimeInstalled()) {
        console.log(`Installing the search runtime into ${rt.cortexHome()} (one time, ~290 MB)…`);
        await rt.installRuntime((line) => console.log(`  ${line}`));
      }
      console.log(`Loading ${rt.MODEL} (one-time download, ~120 MB)…`);
      const { TransformersEmbedder } = await import("./search/embedder.js");
      let lastPct = -10;
      const embedder = new TransformersEmbedder((p) => {
        if (p.status === "progress" && p.file?.endsWith(".onnx") && p.progress !== undefined && p.progress - lastPct >= 10) {
          lastPct = Math.floor(p.progress / 10) * 10;
          console.log(`  ${lastPct}%`);
        }
      });
      // Prove it works end to end before turning it on.
      const [a, b, c] = await embedder.embed(["Ödeme sistemi iyzico", "payment provider", "karpuz fiyatları"]);
      const sim = (x: Float32Array, y: Float32Array) => x.reduce((s, v, i) => s + v * y[i], 0);
      if (!(sim(a, b) > sim(a, c))) throw new Error("The model loaded but produced unexpected results.");
      rt.writeSettings({ semantic: true });
      console.log("✔ Semantic search on. Restart `cortex start` / your MCP server; existing content is indexed in the background.");
      break;
    }

    case "reindex": {
      const { Cortex } = await import("./core/cortex.js");
      const cortex = new Cortex(loadProject());
      console.log(`✔ Indexed ${cortex.reindex()} node(s).`);
      cortex.close();
      break;
    }

    default:
      console.log(HELP);
      if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 1;
  }
}

function loginLink(project: { dir: string }, actorId: string, port: number): string {
  const token = loadTokens(project.dir)[actorId];
  if (!token) throw new Error(`No token for "${actorId}" in .cortex/.secrets.yaml.`);
  return `http://localhost:${port}/login?code=${encodeURIComponent(createLoginCode(actorId, token))}`;
}

main().catch((e) => {
  console.error(`✖ ${e?.message ?? e}`);
  process.exit(1);
});

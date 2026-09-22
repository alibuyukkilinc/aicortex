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

  init [--name <n>] [--lang tr|en] [--branches a,b,c] [--agent-files]
                                     Create .cortex/ here; --lang = language AIs write in (default: this computer's),
                                     --branches = top-level knowledge branches (asked when run in a terminal)
  start [--port <n>]                 Start the API and the web board on localhost
  login [--actor <id>]               Print a 10-minute login link for the board (default: first human)
  mcp [--actor <id>]                 Run as an MCP server over stdio (default actor: ai-agent)
  bootstrap                          Print the task that lets your AI fill the tree
  reindex                            Rebuild the search index from files
  semantic [on|off|status]           Meaning-based search (one-time ~420 MB download, shared by all projects)
  report [--since 7d] [--until <date>] [--lang en|tr] [--json] [--out <file>]
                                     What happened, what is waiting, knowledge health (markdown by default)
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
      branches: { type: "string" },
      since: { type: "string" },
      until: { type: "string" },
      lang: { type: "string" },
      json: { type: "boolean" },
      out: { type: "string" },
    },
    allowPositionals: true,
  });

  const { loadProject } = await import("./core/project.js");

  switch (cmd) {
    case "init": {
      const { initProject, AGENT_HINT, DEFAULT_BRANCHES } = await import("./core/init.js");
      const root = process.cwd();
      let branches = values.branches?.split(",").map((b) => b.trim()).filter(Boolean);
      if (!branches && process.stdin.isTTY && process.stdout.isTTY) branches = await askBranches(DEFAULT_BRANCHES);
      const r = initProject(root, values.name, { language: values.lang, branches });
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
      const { readGlobalLanguage } = await import("./core/language.js");
      console.log(bootstrapPrompt(project.config.project.name, findMarkdown(project.root), readGlobalLanguage(project.dir)));
      break;
    }

    case "report": {
      const { Cortex } = await import("./core/cortex.js");
      const { reportToMarkdown } = await import("./core/reportMarkdown.js");
      const cortex = new Cortex(loadProject(), { embedder: null }); // a report never needs the search model
      try {
        const report = cortex.reports.build({ since: values.since, until: values.until });
        const text = values.json ? JSON.stringify(report, null, 2) : reportToMarkdown(report, values.lang === "tr" ? "tr" : "en");
        if (values.out) {
          const { writeFileSync } = await import("node:fs");
          writeFileSync(values.out, text, "utf8");
          console.error(`✔ Report written to ${values.out}`);
        } else console.log(text);
      } finally {
        cortex.close();
      }
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

// "1,2,5 api-gateway" -> template branches 1, 2, 5 plus a custom one. Enter keeps them all.
async function askBranches(template: [string, string, string][]): Promise<string[] | undefined> {
  const { createInterface } = await import("node:readline/promises");
  console.log("Which top-level knowledge branches does this project need?");
  template.forEach(([path, title], i) => console.log(`  ${i + 1}. ${path.padEnd(16)} ${title}`));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("Numbers and/or new names, separated by commas or spaces [Enter = all]: ")).trim();
    if (!answer) return undefined;
    return answer.split(/[\s,]+/).filter(Boolean).map((a) => (/^\d+$/.test(a) ? template[Number(a) - 1]?.[0] : a)).filter((a): a is string => !!a);
  } finally {
    rl.close();
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

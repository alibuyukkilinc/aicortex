#!/usr/bin/env node
// node:sqlite prints an ExperimentalWarning on load; hide only that one so the CLI output stays clean.
const emit = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  if (String(warning).includes("SQLite")) return;
  return (emit as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

import { parseArgs } from "node:util";

const HELP = `Cortex: shared project brain for humans and AIs

Usage: cortex <command> [options]

  init [--name <n>] [--agent-files]  Create .cortex/ in the current folder
  start [--port <n>]                 Start the API (and later the board) on localhost
  mcp [--actor <id>]                 Run as an MCP server over stdio (default actor: ai-agent)
  bootstrap                          Print the task that lets your AI fill the tree
  reindex                            Rebuild the search index from files
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

main().catch((e) => {
  console.error(`✖ ${e?.message ?? e}`);
  process.exit(1);
});

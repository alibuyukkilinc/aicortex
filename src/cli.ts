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
import { NODE_TOO_OLD_MESSAGE, nodeTooOld } from "./util/runtime-check.js";

const HELP = `Cortex: shared project brain for humans and AIs

Usage: cortex <command> [options]

  init [--name <n>] [--lang tr|en] [--branches a,b,c] [--agent-files]
                                     Create .cortex/ here; --lang = language AIs write in (default: this computer's),
                                     --branches = top-level knowledge branches (asked when run in a terminal)
  start [--port <n>]                 Start the API and the web board on localhost
  login [--actor <id>]               Print a 10-minute login link for the board (default: first human)
  logout [--actor <id>] [--all]      End that person's board sessions on every browser (--all: everyone's)
  mcp [--actor <id>]                 Run as an MCP server over stdio for the project in this folder
  mcp --hub <url> --project <id> --token <t>
                                     Same tools against a project on a team server (env: CORTEX_HUB_URL, CORTEX_PROJECT, CORTEX_TOKEN)
  bootstrap                          Print the task that lets your AI fill the tree
  reindex                            Rebuild the search index from files
  semantic [on|off|status]           Meaning-based search (one-time ~420 MB download, shared by all projects)
  hub init --org <name> --admin-email <e> --admin-name <n> [--public-url <https://...>]
  hub start [--host 0.0.0.0] [--port 4747]    Team server: many projects, people with passwords, AI agents with tokens
  hub add-project <folder> [--id] [--name] [--init]
  hub invite <email>                 New invite / password-reset link for a user
  report [--since 7d] [--until <date>] [--lang en|tr] [--json] [--out <file>]
                                     What happened, what is waiting, knowledge health (markdown by default)
`;

async function main() {
  // Before anything touches node:sqlite: a clear message instead of "no such module: fts5".
  if (nodeTooOld()) throw new Error(NODE_TOO_OLD_MESSAGE());
  const [cmd, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
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
      org: { type: "string" },
      "admin-email": { type: "string" },
      "admin-name": { type: "string" },
      "public-url": { type: "string" },
      host: { type: "string" },
      dir: { type: "string" },
      id: { type: "string" },
      init: { type: "boolean" },
      all: { type: "boolean" },
      hub: { type: "string" },
      project: { type: "string" },
      token: { type: "string" },
    },
    allowPositionals: true,
  });

  const { loadProject } = await import("./core/project.js");

  switch (cmd) {
    case "init": {
      const { initProject, AGENT_HINT, DEFAULT_BRANCHES } = await import("./core/init.js");
      const root = process.cwd();
      let branches = values.branches
        ?.split(",")
        .map((b) => b.trim())
        .filter(Boolean);
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
  1. npx aicortex start                   start the local API on http://localhost:4747
  2. Add the MCP server to your AI tool, e.g. Claude Code:
       claude mcp add cortex -- npx aicortex mcp --actor ai-agent
  3. npx aicortex bootstrap               give the printed task to your AI to fill the tree
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

    case "logout": {
      const { SessionStore } = await import("./api/sessions.js");
      const project = loadProject();
      const actor = values.all ? undefined : (values.actor ?? project.config.actors.find((a) => a.kind === "human")?.id);
      if (!values.all && !project.config.actors.some((a) => a.id === actor && a.kind === "human")) {
        throw new Error(`"${actor ?? ""}" is not a human actor in cortex.config.yaml.`);
      }
      // A running server re-reads the session file, so this takes effect without a restart.
      const ended = new SessionStore(project.dir).revokeAll(actor);
      console.log(`✔ Ended ${ended} board session(s)${actor ? ` for ${actor}` : ""}. Open the board again with \`cortex login\`.`);
      break;
    }

    case "mcp": {
      const { runMcpStdio } = await import("./mcp/server.js");
      const { localApi, remoteApi } = await import("./mcp/client.js");
      // stdout belongs to the MCP protocol here: never console.log in this branch.
      const hub = values.hub ?? process.env.CORTEX_HUB_URL;
      if (hub) {
        // A project on a team server: the agent's token decides its role and what it sees.
        const token = values.token ?? process.env.CORTEX_TOKEN;
        const project = values.project ?? process.env.CORTEX_PROJECT;
        if (!project || !token) throw new Error("With --hub, pass --project <id> and --token <agent token> (or CORTEX_PROJECT / CORTEX_TOKEN).");
        await runMcpStdio(remoteApi(hub, project, token));
      } else {
        const { Cortex } = await import("./core/cortex.js");
        const cortex = new Cortex(loadProject());
        cortex.watch((e) => console.error(`cortex: reindex failed: ${(e as Error).message}`)); // stderr is safe for MCP
        await runMcpStdio(await localApi(cortex, cortex.actor(values.actor ?? "ai-agent")));
      }
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
        if (!rt.semanticEnabled()) console.log("\nSearch is keyword-only. Turn on meaning-based search with: npx aicortex semantic on");
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

    case "hub": {
      await hubCommand(positionals[0], positionals[1], values);
      break;
    }

    case "reindex": {
      const { Cortex } = await import("./core/cortex.js");
      const cortex = new Cortex(loadProject());
      const r = cortex.reindex();
      console.log(`✔ Indexed ${r.nodes} node(s), ${r.items} item(s), ${r.activity} activity entr(ies).`);
      cortex.close();
      break;
    }

    default:
      console.log(HELP);
      if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 1;
  }
}

// The team server: people sign in with email + password, AI agents with tokens, one board for many projects.
async function hubCommand(sub: string | undefined, arg: string | undefined, v: Record<string, string | boolean | undefined>) {
  const { join, resolve, basename } = await import("node:path");
  const { homedir } = await import("node:os");
  const { existsSync } = await import("node:fs");
  const { HubStore } = await import("./hub/store.js");
  const dir = resolve((v.dir as string | undefined) ?? process.env.CORTEX_HUB ?? join(homedir(), ".cortex", "hub"));
  const str = (k: string) => v[k] as string | undefined;

  if (sub === "init") {
    const email = str("admin-email");
    const name = str("admin-name");
    if (!email || !name)
      throw new Error('Usage: aicortex hub init --org "Acme" --admin-email you@acme.com --admin-name "Your Name" [--public-url https://cortex.acme.com]');
    const port = Number(str("port") ?? 4747);
    const store = HubStore.init(dir, {
      org: str("org") ?? "My organization",
      host: str("host") ?? "127.0.0.1",
      port,
      ...(str("public-url") ? { public_url: str("public-url")!.replace(/\/+$/, "") } : {}),
    });
    const admin = store.createUser({ email, name, org_admin: true });
    const url = `${store.settings.public_url ?? `http://localhost:${port}`}/invite/${store.createInvite(admin.id)}`;
    store.close();
    console.log(`✔ Hub created in ${dir} (keep this folder private: it holds password hashes)\n`);
    console.log(`Start it:            aicortex hub start`);
    console.log(`Then set your password (link valid 48 hours):\n  ${url}\n`);
    console.log(`Add a project:       aicortex hub add-project <folder>   (or from the board: Organization → Projects)`);
    return;
  }

  const store = new HubStore(dir);
  try {
    if (sub === "start") {
      const { Hub, buildHubServer } = await import("./hub/server.js");
      const host = str("host") ?? store.settings.host ?? "127.0.0.1";
      const port = Number(str("port") ?? store.settings.port ?? 4747);
      if (str("public-url")) store.settings.public_url = str("public-url")!.replace(/\/+$/, "");
      store.settings.port = port;
      store.settings.host = host; // the cookie's Secure default depends on where it really listens
      const app = buildHubServer(new Hub(store));
      await app.listen({ host, port });
      console.log(`Cortex hub "${store.settings.org}" running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
      if (host !== "127.0.0.1" && host !== "localhost" && !(store.settings.public_url ?? "").startsWith("https://")) {
        console.log("⚠ Listening on the network without HTTPS. Put it behind a reverse proxy with TLS and set public_url to the https address.");
        console.log("  Session cookies are Secure here, so plain-http sign-in will not stick (cookie_secure: false in hub.yaml turns that off, knowingly).");
      }
      return; // keep running
    }
    if (sub === "add-project") {
      if (!arg) throw new Error("Usage: aicortex hub add-project <folder> [--id shop] [--name Shop] [--init]");
      const path = resolve(arg);
      const name = str("name") ?? basename(path);
      if (!existsSync(join(path, ".cortex", "cortex.config.yaml"))) {
        if (!v.init) throw new Error(`${path} has no .cortex yet. Add --init to create one.`);
        const { initProject } = await import("./core/init.js");
        initProject(path, name, { language: str("lang") });
      }
      const id = (str("id") ?? name)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\w-]+/g, "-")
        .replace(/^[-_]+|[-_]+$/g, "");
      store.addProject({ id, name, path });
      console.log(`✔ Project "${name}" registered as ${id}. Organization admins can open it; add members on the board.`);
      return;
    }
    if (sub === "invite") {
      const u = arg ? store.userByEmail(arg) : null;
      if (!u) throw new Error("Usage: aicortex hub invite <email of an existing user>");
      console.log(`${store.settings.public_url ?? `http://localhost:${store.settings.port}`}/invite/${store.createInvite(u.id)}`);
      console.log("Valid 48 hours, once. Setting a password ends that user's other sessions.");
      store.close();
      return;
    }
    throw new Error("Usage: aicortex hub init | start | add-project <folder> | invite <email>");
  } catch (e) {
    store.close();
    throw e;
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
    return answer
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((a) => (/^\d+$/.test(a) ? template[Number(a) - 1]?.[0] : a))
      .filter((a): a is string => !!a);
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

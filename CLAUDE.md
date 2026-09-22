# Cortex (this repository)

This repo is Cortex itself, and it runs on its own knowledge in `.cortex/`.
The MCP server for this repo is configured in `.mcp.json` (runs from source, actor `ai-agent`).
If the cortex tools are missing, run `npm install` and restart the session; the REST API also works
(`node dist/cli.js start`, token in `.cortex/.secrets.yaml`).

Commands: `npm test` · `npm run typecheck` · `npm run build`.
Knowledge nodes you write become drafts the owner approves. Write Cortex content in the project language (see the first rule in the brief).

<!-- cortex:start -->
## Project knowledge: Cortex
This project's knowledge lives in Cortex, not in markdown files.
- Session start: call `cortex_brief`, then `cortex_inbox` for questions and issues waiting on you.
- Before changing code you don't fully understand: `cortex_search`, then `cortex_tree` / `cortex_node`.
- Before editing files: `cortex_code_context(files)` shows the knowledge, decisions and open items that cover them.
- Unsure? Open a question (`cortex_ask` or `cortex_create_item` type "question") instead of assuming.
- After a meaningful change: `cortex_log_activity` (what, why, files, commit), and update the relevant node.
Do not update docs in .md files; update Cortex.
<!-- cortex:end -->

# Cortex

**The shared brain for your project — for humans and AIs.**
Knowledge tree, decisions, questions and AI activity in one place, versioned in git, searchable without spending tokens.

> 🇹🇷 Türkçe açıklama aşağıda.

> **Status:** early (v0.1). Package name `projcortex` is provisional.

## Why

AI coding tools re-read scattered `.md` files every session. Those files go stale, contradict each other and burn tokens.
Cortex replaces them with a structured knowledge tree the AI navigates **top-down**: a small brief first, then only the branch it needs.
Humans stay in control: AI writes to knowledge become **drafts** until a human approves them.

## Quick start

Requires Node.js 22.13 or newer. Nothing else: no database, no Docker, no API key.

```bash
npx projcortex init          # creates .cortex/ in your repo
npx projcortex start         # local API on http://localhost:4747
```

Connect your AI tool over MCP (Claude Code example):

```bash
claude mcp add cortex -- npx projcortex mcp --actor ai-agent
```

Then fill the tree: `npx projcortex bootstrap` prints a task you hand to your AI.

## How an AI uses it

| Step | Tool | Cost |
|---|---|---|
| Session start | `cortex_brief` | ~500 tokens: project summary, branches, what needs attention, rules |
| Navigate | `cortex_tree(path)` | titles + summaries only |
| Understand | `cortex_search(q)` | paths + summaries (Turkish & English) |
| Detail | `cortex_node(path)` | one node, in full |
| Record | `cortex_update_node(...)` | becomes a draft for human review |

Every response carries `_meta.rules_version`; the AI re-reads rules only when it changes.
Invalid writes are rejected with the broken rule **and** a correct example, so the AI can fix itself.

## What lives in `.cortex/`

```
.cortex/
├── cortex.config.yaml   actors + approval policy (commit this)
├── .secrets.yaml        actor tokens (git-ignored)
├── rules/               rules & schemas — humans only
├── tree/                the knowledge tree, one markdown file per node
├── drafts/              AI proposals waiting for approval
└── .index/              search index cache (git-ignored, rebuildable)
```

Everything is plain markdown with YAML frontmatter: readable, diffable, mergeable.

## REST API

All endpoints need `Authorization: Bearer <token>` and answer only on localhost.

```
GET  /api/brief
GET  /api/tree/{path}?depth=1&budget=
GET  /api/node/{path}          PUT /api/node/{path}
GET  /api/search?q=&path=&limit=&budget=
GET  /api/rules[/{name}]
GET  /api/approvals[/{id}]     POST /api/approvals/{id}/approve|reject
```

## Roadmap

- [x] **Slice 1:** init, knowledge tree, keyword search (Turkish-aware), brief, drafts & approval, REST, MCP
- [ ] **Slice 2:** items (task, issue, question, note, decision), inbox, activity log, per-type schemas
- [ ] **Slice 3:** web board (kanban, tree explorer, activity feed, approvals) in TR/EN
- [ ] **Slice 4:** semantic search with a local multilingual embedding model (hybrid ranking)
- [ ] **Slice 5:** code links → stale detection from git history
- [ ] Later: reports, team server, multi-project

## Development

```bash
npm install
npm test
npm run dev -- start
```

---

## 🇹🇷 Türkçe

**Cortex, projenin insan ve AI için ortak beynidir.** Bilgi ağacı, kararlar, sorular ve AI aktivitesi tek yerde durur. Her şey git ile versiyonlanır ve token harcamadan aranabilir.

**Neden?** AI araçları her oturumda dağınık `.md` dosyalarını baştan okur. Bu dosyalar eskir, birbiriyle çelişir ve token yer. Cortex bunların yerine yukarıdan aşağı gezilen bir bilgi ağacı koyar: AI önce kısa bir özet alır, sonra yalnızca ihtiyaç duyduğu dala iner. **Kontrol sizde kalır:** AI'ın bilgiye yazdığı her şey, bir insan onaylayana kadar *taslak* olarak bekler.

**Kurulum** (yalnızca Node.js 22.13+ gerekir):

```bash
npx projcortex init
npx projcortex start
```

Ardından AI aracınızı MCP ile bağlayın ve `npx projcortex bootstrap` çıktısını AI'ınıza verin. Ağacı o doldursun, siz onaylayın.

## License

MIT

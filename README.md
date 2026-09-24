# Cortex

**The shared brain for your project — for humans and AIs.**
Knowledge tree, decisions, questions and AI activity in one place, versioned in git, searchable without spending tokens.

> 🇹🇷 Türkçe açıklama aşağıda · **Kurulum rehberi: [docs/KURULUM.md](docs/KURULUM.md)**

> **Status:** early (v0.2). Package: `aicortex` (the CLI is also available as `cortex`). MIT licensed; contributions welcome, see [CONTRIBUTING.md](CONTRIBUTING.md).

**New here? The [installation guide](docs/INSTALL.md) walks through everything from installing Node.js to connecting Claude Code, Cursor, VS Code, Claude Desktop or Codex, and explains the two setups (one project on your computer, or a team server).**

## Why

AI coding tools re-read scattered `.md` files every session. Those files go stale, contradict each other and burn tokens.
Cortex replaces them with a structured knowledge tree the AI navigates **top-down**: a small brief first, then only the branch it needs.
Humans stay in control: AI writes to knowledge become **drafts** until a human approves them.

## Quick start

Requires Node.js 22.16 or newer. Nothing else: no database, no Docker, no API key.

```bash
npx aicortex init          # creates .cortex/ in your repo; asks which knowledge branches you need
                             # (--branches backend,frontend --lang tr|en to skip the questions)
npx aicortex start         # API + web board on http://localhost:4747
```

`start` prints a one-time login link for the board (run `npx aicortex login` for a fresh one). No passwords: the link is signed with your actor token and expires in 10 minutes.

Connect your AI tool over MCP (Claude Code example; other tools and `--dir` for tools that do not start in your project: [installation guide](docs/INSTALL.md#connect-your-ai-tool)):

```bash
claude mcp add cortex -- npx aicortex mcp --actor ai-agent
```

Then fill the tree: `npx aicortex bootstrap` prints a task you hand to your AI.

### Search by meaning (optional)

Keyword search (Turkish-aware) works out of the box. To also search by **meaning** — so "why were orders confirmed twice?" finds the webhook fix even without shared words, across Turkish and English — run once per machine:

```bash
npx aicortex semantic on
```

It installs a local model runtime and a multilingual model (~420 MB, one time, under `~/.cortex`, shared by all projects). Nothing leaves your machine and no tokens are spent. Results are ranked by keyword and meaning together (Reciprocal Rank Fusion); each result says whether it matched by `keyword`, `semantic` or `both`. If the model is missing or fails, search quietly falls back to keywords. `semantic status` shows the state, `semantic off` turns it off; a project can opt out with `search: { semantic: false }` in `cortex.config.yaml`.

## The board (for humans)

- **Notifications**: everything waiting on you, counted and explained in plain words: blocking questions, items assigned to you, answers to your questions, drafts to approve, knowledge that went out of date
- **Board**: kanban per item type, columns = statuses from the rules; forbidden moves are dimmed and explained. Cards work like Trello: a cover picture, the priority as a coloured label, the due date (red when late), badges for description, replies and attachments, "Add a card" under every column, and a "Move to" menu for keyboards and touch screens
- **Attachments**: paste a screenshot while a card is open, drop files on it or pick them; pictures become thumbnails (the first is the card's cover), Markdown and text open in a preview. Descriptions are edited in place with Write / Preview, and a screenshot pasted into them is inserted where the cursor is
- **Stale knowledge**: pages whose code changed, grouped by how likely they are wrong, with Verify / Fix / Snooze
- **Knowledge**: the tree with open-item counts, markdown, code links; edit nodes, add children, delete what does not apply
- **Activity**: what each AI did and **why**, live; one click to ask about any entry
- **Approvals**: current vs proposed side by side; approve or reject AI drafts one by one or in bulk
- **Rules**: edit the YAML rules; invalid rules are refused before they are saved
- **Guide**: what Cortex is, a normal day, the exact command to connect an AI, the role table, and a glossary of the English words the board keeps (they are explained on hover)

Everything updates live (server-sent events), including changes made by an AI in another process. Turkish and English, light and dark.

## How an AI uses it

| Step | Tool | Cost |
|---|---|---|
| Session start | `cortex_brief` | ~600 tokens: project summary, branches, inbox, recent activity, rules |
| Navigate | `cortex_tree(path)` | titles + summaries only |
| Understand | `cortex_search(q)` | paths + summaries (Turkish & English); pending drafts come back labelled `draft` |
| Detail | `cortex_node(path)` | one node, in full |
| Record | `cortex_update_node(...)` | becomes a draft for human review |
| Work queue | `cortex_inbox` | questions, issues and answers waiting on you |
| Collaborate | `cortex_create_item`, `cortex_update_item`, `cortex_reply`, `cortex_items`, `cortex_item` | tasks, issues, questions, notes, decisions |
| Ask instead of guessing | `cortex_ask(about, title)` | routed to whoever made the thing you ask about |
| Leave a trail | `cortex_log_activity`, `cortex_activity` | what changed, **why**, files, commit; the reply lists knowledge describing the files you touched |
| Before editing files | `cortex_code_context(files)` | knowledge, decisions and open items that cover those files |
| Keep knowledge honest | `cortex_verify_node(path)` | mark a node still accurate at the current commit |
| Hand work over | `cortex_claim(id, claim\|release)` | say "I am on this now" so two agents do not collide; optional hand-off note |
| Read attachments | `cortex_item_file(id, name)` | a spec in Markdown as text, a screenshot as an image the AI can look at |
| Report | `cortex_report(since)` | what happened, what waits, knowledge health |

Every response carries `_meta.rules_version`; the AI re-reads rules only when it changes.
The writing language is a human rule too: `language: tr` in `.cortex/rules/_global.yaml` (set by `init --lang`, default: your computer's language). It is the first rule in every brief, so knowledge, items and activity stay in the language your team reads.
Invalid writes are rejected with the broken rule **and** a correct example, so the AI can fix itself.

## Knowledge that knows when it is out of date

Nodes link to code (`links.code`: files, directories, optional line ranges such as `src/auth/login.ts` lines `40-60`). When a node is written, Cortex pins it to the current git commit. Later commits that touch the linked code (only the linked lines, when a range is given) mark the node **stale**, with the files, commits, authors and messages that changed it. Deletions and moves are detected too.

Each change gets a severity: **high** (the linked lines were rewritten, or the file was deleted or moved), **medium** (the file changed elsewhere), **low** (formatting only: if the project has Prettier, both versions are run through it). Only high and medium count. Stale nodes show up in the AI's brief, in search results, in the tree and on the board's **Stale knowledge** page (Verify / Fix / Snooze), and the board updates by itself when new commits land. When an AI logs a change, the reply names the pages that change made stale, so it can fix them in the same turn. Nothing is written to your files for this: it is computed from git, so it adds no noise to your history. Uncommitted edits do not count. Outside a git repository the feature simply stays off.

## Items and rules

Five built-in item types, each defined by an editable file in `.cortex/rules/`:

| Type | Statuses | Built-in rules |
|---|---|---|
| task | backlog → todo → doing → review → done | only humans mark done |
| issue | open → in_progress → review → closed | needs severity + category; a `fixed` reply must list commits and files |
| question | open → answered → closed | answering flips it to answered; `blocking` questions come first |
| note | active → archived | |
| decision | proposed → accepted / rejected → superseded | AI may propose, only humans accept or reject |

Add your own type by dropping `rules/<type>.schema.yaml` next to them (fields, statuses, transitions, human-only statuses, reply rules, AI instructions).
Assign items to an actor, to `@humans` or to `@ai`.

## What lives in `.cortex/`

```
.cortex/
├── cortex.config.yaml   actors, approval policy, timezone for reports (commit this)
├── .secrets.yaml        actor tokens (git-ignored, owner-only)
├── .sessions.json       board sign-ins, hashes only (git-ignored)
├── rules/               rules & schemas — humans only
├── tree/                the knowledge tree, one markdown file per node
├── items/               one folder per item, one file per reply, attachments in files/
├── activity/            append-only log, one file per actor per day
├── drafts/              AI proposals waiting for approval
└── .index/              search index cache (git-ignored, rebuildable)
```

Everything is plain markdown with YAML frontmatter: readable, diffable, mergeable.

## Teams: one server, many projects

`cortex start` is one project on your own machine. For a team, run the **hub**: one server, many projects, people who sign in with email and password, AI agents with tokens, and roles per project.

```bash
npx aicortex hub init --org "Acme" --admin-email you@acme.com --admin-name "You" --public-url https://cortex.acme.com
npx aicortex hub start --host 0.0.0.0     # put it behind HTTPS (reverse proxy)
npx aicortex hub add-project /srv/repos/shop
```

`init` prints a link to set your password. Then, on the board (**Organization**): add people (they get a one-time invite link), add AI agents (their token is shown once), register project folders. Each project keeps its knowledge in its own repository's `.cortex/`; the hub (default `~/.cortex/hub`, never committed) holds only people, password hashes, sessions, agents and memberships.

| Role | For | Can |
|---|---|---|
| Owner, Admin | people | everything, including members and rules |
| Member | people | work on items and knowledge, approve drafts |
| Viewer | people | read, ask and answer questions |
| Reader | AI | read |
| Contributor | AI | work on items; knowledge writes wait for approval |
| Trusted | AI | like Contributor, knowledge writes apply directly |

Every membership also says what the member **sees**: everything, or only their own items (written by or assigned to them), optionally limited to some branches (e.g. only `frontend`). Hidden things answer 404, and partial views get no project-wide report. An AI can never approve, edit rules or manage members.

AI agents on a hub connect the same way as anywhere else, over MCP:

```bash
claude mcp add cortex -- npx aicortex mcp --hub https://cortex.acme.com --project shop --token <agent token>
```

The tools are identical to a local project; the agent's role and visibility apply to them. An AI that does not run on the team's machines (ChatGPT, a hosted agent) connects to the same tools over HTTP at `https://cortex.acme.com/mcp/p/<project>` with the agent token as a bearer header. Anything that cannot speak MCP can use the same REST API under `/api/p/<project>/` with `Authorization: Bearer <token>`.

## REST API

Single project: `http://localhost:<port>/api/…`, with `Authorization: Bearer <token>` (tokens in `.cortex/.secrets.yaml`), localhost only. On a hub: `/api/p/<project>/…` with an agent token or a signed-in session; roles and visibility apply.

```
GET  /api/brief
GET  /api/tree/{path}?depth=1&budget=
GET  /api/node/{path}          PUT /api/node/{path}   (GET includes staleness)
DELETE /api/node/{path}?reason=  humans only; refuses while children or open items remain
GET  /api/stale                POST /api/verify/{path}   POST /api/verify { paths }
POST /api/snooze/{path}        DELETE /api/snooze/{path}   (people only)
GET  /api/code?files=a,b
GET  /api/search?q=&kind=node,item,activity&type=&path=&limit=&budget=
GET  /api/rules[/{name}]
GET  /api/approvals[/{id}]     POST /api/approvals/{id}/approve?verify_at_head=|reject
POST /api/approvals/approve    { ids, force?, verify_at_head? }   POST /api/approvals/reject  { ids, reason? }
GET  /api/inbox
GET  /api/items?type=&status=&assignee=&author=&path=&open=&limit=&cursor=
POST /api/items                GET/PATCH /api/items/{id}
POST /api/items/{id}/replies   POST /api/items/{id}/claim  { action: claim|release, note? }
GET  /api/items/{id}/files     POST /api/items/{id}/files?name=  (body: the file itself, up to 15 MB)
GET  /api/items/{id}/files/{name}[?download]   DELETE /api/items/{id}/files/{name}
POST /api/ask                  { about, title, body?, blocking? }
POST /api/activity             GET /api/activity?since=&actor=&ref=&include_system=
GET  /api/report?since=7d&format=json|md&lang=
GET  /api/events               live updates (server-sent events)
```

## Roadmap

- [x] **Slice 1:** init, knowledge tree, keyword search (Turkish-aware), brief, drafts & approval, REST, MCP
- [x] **Slice 2:** items (task, issue, question, note, decision), inbox, ask-about-anything, activity log, per-type schemas, custom types
- [x] **Slice 3:** web board (inbox, kanban, knowledge explorer, live activity feed, approvals, rules editor) in TR/EN
- [x] **Slice 4:** opt-in semantic search with a local multilingual model, hybrid ranking, incremental background indexing
- [x] **Slice 5:** code links, stale detection from git history (line-range aware, renames and deletions), verify, code context, live updates on new commits
- [x] **Slice 6:** reports (period summary, AI trust, knowledge health) on the board, REST, MCP and CLI; days are counted in the project's `timezone` (set by `init` from your computer, default UTC)
- [x] **Hub:** team server with many projects, people (email + password), AI agents (tokens), roles and visibility per project
- [x] **MCP everywhere:** the same MCP tools against a local project or a hub project
- [x] **0.2:** honest numbers, stale knowledge you can clear (severity, snooze, a work-list page), board sessions instead of tokens in cookies, a hardened hub, tests for the protocol and parallel merges, lint, accessibility, Trello-style cards with attachments. See [CHANGELOG.md](CHANGELOG.md)
- [ ] Later: SSO, invite emails, webhooks, GitHub sync

## Development

Contributions are welcome: [CONTRIBUTING.md](CONTRIBUTING.md) explains the layout, the tests and the habits this project keeps. Security reports: [SECURITY.md](SECURITY.md).

```bash
npm install
npm test
npm run build          # server + board
npm run dev -- start   # API from source (serves the last board build)
npm run dev:web        # board with hot reload on :5173, proxied to :4747
```

---

## 🇹🇷 Türkçe

**Cortex, projenin insan ve AI için ortak beynidir.** Bilgi ağacı, kararlar, sorular ve AI aktivitesi tek yerde durur. Her şey git ile versiyonlanır ve token harcamadan aranabilir.

**Neden?** AI araçları her oturumda dağınık `.md` dosyalarını baştan okur. Bu dosyalar eskir, birbiriyle çelişir ve token yer. Cortex bunların yerine yukarıdan aşağı gezilen bir bilgi ağacı koyar: AI önce kısa bir özet alır, sonra yalnızca ihtiyaç duyduğu dala iner. **Kontrol sizde kalır:** AI'ın bilgiye yazdığı her şey, bir insan onaylayana kadar *taslak* olarak bekler.

**Kurulum** (yalnızca Node.js 22.16+ gerekir; adım adım rehber, kurulum türleri ve AI araçlarının bağlanması: **[docs/KURULUM.md](docs/KURULUM.md)**):

```bash
npx aicortex init
npx aicortex start
```

`start` komutu panoya giriş için tek kullanımlık bir bağlantı yazdırır; şifre yoktur. `init --lang tr` ile AI'ların Cortex'e hangi dilde yazacağını belirlersiniz (verilmezse bilgisayarın dili); bu bir kuraldır ve Kurallar sayfasından değiştirilebilir. Anlamla arama isteğe bağlıdır: makine başına bir kez `npx aicortex semantic on` çalıştırın (yerel model, ~420 MB, token harcamaz). Ardından AI aracınızı MCP ile bağlayın ve `npx aicortex bootstrap` çıktısını AI'ınıza verin. Ağacı o doldursun, siz onaylayın.

**Ekip için:** `npx aicortex hub init` ile tek sunucuda birden çok proje yönetilir. Kişiler e-posta ve şifreyle, AI ajanları token ile girer; her projede rol (Sahip, Yönetici, Üye, İzleyici; AI için Okuyucu, Katkıcı, Güvenilir) ve görünürlük (her şey / yalnızca kendi kayıtları, isteğe bağlı dal kısıtı) ayrı ayrı verilir. Proje bilgisi yine kendi reposundaki `.cortex/` klasöründe kalır.

**Eskiyen bilgi:** Bilgi düğümleri koda bağlanır. Bağlı kod (satır aralığı verildiyse yalnızca o satırlar) sonradan bir commit ile değişirse düğüm "eskimiş olabilir" diye işaretlenir; hangi dosyanın, hangi commit ile, kim tarafından değiştiği gösterilir. Bu bilgi git geçmişinden hesaplanır, dosyalarınıza hiçbir şey yazılmaz.

## License

MIT

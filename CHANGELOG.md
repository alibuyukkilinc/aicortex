# Changelog

All notable changes to `cortexboard`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/) (while it is 0.x, a minor version may change behaviour).

## [Unreleased]

Memory that stays lean (archive), and three decisions reached in discussions, put to work: a project reads the projects it links to, the hub
keeps its checkouts current by pulling, and the first round of the design work (the same look, applied
with one system on every screen).

### Added

- **Archive: memory that stays lean.** Knowledge and records that no longer apply (a one-off server
  problem solved for good, a superseded decision, a branch for code that is gone) leave search, the
  brief, the tree, code context, item lists and staleness, so they stop crowding out what still applies
  and stop costing tokens. The file stays and git keeps it: an archived record is readable by id or path,
  searchable with `archived: true` ("was this solved before?"), and a person can bring it back or, once
  archived, delete it for good. Cortex suggests candidates (finished items untouched for 30 days that no
  open item cites, knowledge marked deprecated; `archive.after_days` in the project config); only finished
  items can go, never open work or an accepted decision. AI agents propose with `cortex_archive` and a
  reason, which becomes a draft a person approves. Activity older than 90 days (`archive.activity_days`)
  leaves default search but is never archived or deleted: it is the audit trail. New **Archive** page
  under Memory.
- **Linked projects.** A mobile app's agent can read its backend's knowledge through its own MCP
  connection: `linked: [backend]` in the project's config, then `project: "backend"` on `cortex_search`,
  `cortex_tree`, `cortex_node`, `cortex_items` and `cortex_item`. The brief lists the links and whether
  the caller may read them. A link is not access: the caller must be a member of the linked project, whose
  branch and scope limits apply, and linked reads are read-only whatever the role there. Before this an
  agent needed a second MCP entry per project, loading all 23 tools again (decision
  `01M3AM8C6VZ0WB1MA2SMANEQJH`).
- **The hub keeps its checkouts current by pulling.** `pull_minutes` in `hub.yaml` fast-forwards every
  project from its upstream on a timer; `cortexboard hub pull [project]` and **Pull** on Organization →
  Projects do it now. It never commits or pushes: knowledge the hub wrote is counted on the Projects page
  ("3 to commit") until a person commits it, and a diverged branch or a clashing local edit stops the pull
  with the reason instead of being merged or reset (decision `01M3AM8C7QZG19TBK055EJYWXA`).

### Changed

- **One type scale and one spacing scale.** `styles.css` used 14 different font sizes, two of them below
  the 11px floor. Every size is now one of eight `--text-*` steps (11 to 26px), with `--space-1..6` (4px
  steps) for new spacing. Colors that were written out (toasts, diff highlights, board labels, text on a
  colored fill) became theme tokens, so each can differ between light and dark. Breakpoints are down to
  three widths (600 / 860 / 1100px).
- **Loading shows the shape of what is coming.** Pages showed a line of "Loading…"; they now show pulsing
  placeholder rows (still announced as loading to screen readers, still for reduced motion).
- **Empty pages say what to do.** Notifications, Discussions, Search, Activity, Approvals and Stale
  knowledge show an icon, what the emptiness means and, where there is one, the next step (Discussions
  offers "New discussion").
- **The menu is grouped** into Work (notifications, board, discussions, approvals), Memory (knowledge, stale
  knowledge, activity) and Project (reports, rules, members, guide). On a phone it stays one strip.
- **The board's title and its main action sit apart from the filters**, which have a row of their own.
- **Fewer inline styles:** 45 of 142 became shared classes (`.grow`, `.w-auto`, `.text-xs`…); the inline
  font sizes left use the scale.

### Fixed

- **Deciding a discussion for the option the majority proposed accepts that proposal.** It used to reject
  the proposal and create a second, identical decision, leaving a rejected copy next to the accepted one.

## [0.3.0] - 2026-09-24

Discussions: a question put to people and AI agents together, argued out on its own screen and settled
by a person, with the views and votes kept next to the decision they produced.

### Added

- **Discussions.** A question put to people and AI agents together ("MySQL instead of PostgreSQL?"), on its
  own screen next to the board. The one who opens it lists 2 to 8 options and who is invited; each
  participant reads the project and posts a view that backs one option, with a confidence and evidence
  (`file:lines`, a knowledge path, an item). The first round is blind by default: a participant sees the
  others' views only after posting, so an agent does not just repeat the first answer it reads; blind views
  also stay out of search and list previews. Once the views are opened, participants answer each other and a
  new stance changes their vote. Counting the votes turns a clear majority into a proposed decision whose
  alternatives are filled from the views; a person accepts it, or picks another option, and the discussion
  is decided. It is an item type (`discussion`) with views as replies, so it lives in git like the rest.
  New MCP tools: `cortex_discussions`, `cortex_discuss`, `cortex_close_vote`; invited agents find open
  discussions in `cortex_inbox`. REST: `GET /discussions`, `POST /discussions/:id/close-vote`,
  `POST /discussions/:id/decide` (people only).

### Changed

- **The hub's own screens use the window.** Projects, Organization and Usage sat in a 1080px column,
  a narrow strip next to a project board that fills the screen. They now take the width they are given
  (up to 1900px) with the board's side padding; paragraphs keep their own reading measure.

## [0.2.4] - 2026-09-24

Connecting an AI agent to a team server, without the board getting in the way: access can be granted from
a terminal, a refusal says who was refused, and the board stops re-reading lists it only wanted to count.

### Fixed

- **The install smoke test measures two things apart.** It failed a release on a Windows CI runner for
  being 3 seconds over two minutes, almost all of it `npm install` downloading. Cortex's own init + start
  now has its own budget (45 s, not adjustable); the whole-run limit stays 120 s on a developer machine
  and is raised in CI through `SMOKE_LIMIT_MS`, where the download is the runner's, not ours. Measured
  here: 15.7 s total, 6.5 s of it Cortex.
- **Two records written in the same millisecond keep their order.** Ids are ULIDs, but the random part was
  redrawn on every call, so entries sharing a millisecond sorted at random: a report's "newest first" came
  out differently on different machines, and CI caught it on one leg of the matrix. The random part is now
  incremented inside a millisecond, the way the ULID spec describes.

### Added

- **`cortexboard hub member <project> <who>`** gives a person or an AI agent access to a project from the
  machine that runs the hub, with `--role`, `--scope`, `--branches` and `--remove`. Until now the only way
  to grant an agent a project was the board, which left a working token failing with "not a member" and
  no way to fix it from a terminal. A membership granted this way is live on the next request: the row
  decides access, and the project's actor list catches up in the same moment, so no restart is needed.

### Changed

- **A refusal names who was refused and where.** `You are not a member of this project.` became
  `opencode is not a member of "arsa-back".`: an agent's error is read in someone else's log, where
  "this project" means nothing. The MCP endpoint already said it this way.

### Fixed

- **The MCP server announces the version it ships as.** Its `serverInfo` was pinned to `0.1.0` in the
  code, so every client (and every MCP log) saw the wrong number. The CLI's `--version` and the MCP
  handshake now read the same `package.json`.

### Performance

- **The sidebar badges cost one small request.** The three numbers next to Notifications, Approvals and
  Stale knowledge were fed by three separate requests, two of which pulled a whole list only to count it,
  on every live event and from whatever page was open. `GET /counts` now answers all three, with the same
  visibility rules. Measured with 14 pending drafts: **5,856 bytes over 3 requests → 75 bytes in 1** (-99%).
  On a real week, `/approvals` alone was 5.2 MB of 8.7 MB of board traffic.

## [0.2.3] - 2026-09-24

A board that stays usable when it fills up, and a bootstrap task that cannot leak what git hides.

### Security

- **The bootstrap task no longer lists files git ignores.** The markdown it asks the AI to import came
  from a plain folder walk, so a git-ignored `docs/ai/infra.local.md` holding real server keys was listed
  on a real project, and anything imported lands in the committed `.cortex/`. In a git repository the
  list now comes from `git ls-files` (tracked, and untracked but not ignored); outside git, `*.local.md`
  is skipped. The task text also tells the AI never to copy secrets into Cortex.

### Fixed

- **A full board column scrolls again.** Cards are flex children, so a column that ran out of room
  squeezed them instead of showing a scrollbar: ten cards were flattened into the height of three, with
  their text clipped. Cards keep their own height now, and the board page fills the window, so every
  column caps itself against the visible area, scrolls inside, and keeps "Add a card" at the bottom.
- **Moving an item no longer needs a sentence.** Under the reply box, picking a status with nothing
  written moves the item (the same request a board card makes) instead of leaving the button disabled.
  The button says which move it will make.
- **Large docs folders are listed whole.** The markdown list stopped at 50 files, so a disaster-recovery
  runbook was left out on a project with 51; the limit is now 200.
- **`init --agent-files` adds the hint once.** A `CLAUDE.md` that only imports `AGENTS.md` (`@AGENTS.md`)
  is left alone; the hint goes to `AGENTS.md`, instead of Claude reading it twice.

### Changed

- **Text is slightly smaller** everywhere on the board: the base size goes from 14px to 13.5px and each
  step of the scale follows it down, with the smallest labels left at 11px.

## [0.2.2] - 2026-09-24

For a team setting up a project that never used Cortex, and for agents that read the queue: the first
AI finds its task, reading open work takes fewer calls, and keyword search reaches other forms of a word.

### Added

- **A new project tells its first AI what to do.** `init` (also `hub add-project --init` and "Add project"
  on the hub) opens a task for `@ai`, "Fill the knowledge tree from the code (first setup)", with the
  bootstrap instructions as its body, in the project's language. Until the root summary is written, the
  brief's `next` holds only that step. An agent connecting through a hub used to find an empty tree and
  no instructions; now it finds the task in its inbox. `cortexboard bootstrap` still prints the text.
- **`hub add-project --init --branches a,b`** (and `branches` on `POST /api/admin/projects`): pick the
  top-level branches when registering a new project on the hub, as `init --branches` does.
- **Fewer calls to read the queue.** `cortex_items(preview: true)` (REST `GET /items?preview=true`) adds a
  short gist of each item's body and its last reply (who, when, which status change) to every row, and
  `cortex_item` takes `ids` to read up to 10 related items in one call; a missing or hidden one only fails
  its own row. The brief gains `open_elsewhere`: open work waiting on someone other than you, never
  repeating the inbox and left out when empty. In an A/B run agents answered the same five questions with
  12 tool calls instead of 20, 19% faster, at the same accuracy.

### Fixed

- **Keyword search finds other forms of a word.** When no record has every word as written, search
  tries each word's stem too ("ertelemek" finds "erteleme" and "ertelenebilir"), and records matching
  any word fill the rest of the page as before. Exact matches are never displaced: stems are only the
  fallback, and words of five letters or fewer are never cut.
- **A Turkish project no longer opens on an English tree.** `init --lang tr` now seeds the branch
  titles and summaries, and the root node's placeholder, in Turkish; a language with no seed still
  gets English, and the bootstrap task rewrites all of it anyway. Reports keep counting a seeded
  branch as undocumented in every language (the check reads the seed table, not one hard-coded phrase).

## [0.2.1] - 2026-09-24

### Changed

- **One command: `cortexboard`.** The short `cortex` alias is gone; it was a name common enough to
  collide with another tool in a global install. Every example, message and document uses the full name.

## [0.2.0] - 2026-09-24

The theme of this release is making what 0.1 already had trustworthy: honest numbers, stale knowledge
you can clear, a board session that is not an API key, a hub that is safe to invite people to, and tests
for the parts that had none. Every entry below comes from one commit, and says what changed and, where it
was measured, by how much.

### Changed

- **Accepted decisions no longer count as open work.** They were settled but kept showing up in open-item
  counts, branch counters, the inbox and reports. A schema can now mark statuses as `resolved`
  (decisions: `accepted`); `accepted → superseded` stays allowed. On this repository: open items 19 → 6,
  the backend branch counter 15 → 3.
- **The report's activity headline counts logged work, not the audit trail.** `totals.activity` is now
  `{ logged, system }`; audit entries are a context series on the chart, so they no longer flatten the
  real work into the axis. On this repository (30 days): 328 → 20 logged entries, plus 308 audit entries.
- **Staleness has severity.** High (the linked lines were rewritten, or the file was deleted or moved),
  medium (the file changed elsewhere), low (formatting only). Only high and medium count in the brief,
  the inbox, the tree and the menu.
- **Formatting sweeps are recognised as formatting.** If the project has Prettier, both versions of a
  changed file are formatted with the project's own config and compared, in one child process; the verdict
  is kept per file-content pair in `.cortex/.index/`. Measured on this repository's own formatting sweep:
  22 of 22 affected nodes are low (they were all medium or high with a whitespace-only check).
- **Knowledge approved from a draft is pinned to the current commit** when its linked files did not change
  since the draft was proposed. Before, every approved draft kept the commit it was proposed at and could
  be stale on arrival. If the files did change, the old pin stays and the approval returns
  `stale_after_approval`; the approver can choose "verify at HEAD".
- **Hub invites live 48 hours**, not 7 days.
- **Hub session cookie `Secure` flag**: an explicit `cookie_secure` setting wins; otherwise it is on unless
  the hub listens on loopback only. With `trust_proxy: true`, an `X-Forwarded-Proto: https` request also
  gets it. It used to be guessed from `public_url`, which missed hubs reached over plain LAN addresses.
- **Hub `allowed_hosts` is the whole list**: the silent `localhost`/`127.0.0.1` exception is gone (behind a
  proxy, any request can claim it). Add `localhost` to the list if you want it.

### Added

- **Stale knowledge page** on the board: grouped by severity, with Verify / Fix / Snooze on every row and
  "verify all formatting-only". Snoozes are for people only, live in `.cortex/.index/` (never in git), and
  lift themselves when the same files change again.
- **`cortex_log_activity` names the knowledge your change made stale** and asks the AI to update or verify
  it in the same turn (still a draft a person approves). The brief lists them under
  `stale_nodes.from_your_changes`.
- **`cortexboard logout [--actor <id>] [--all]`** ends board sessions, also on a running server.
- **Board**: a "Move to" menu on every card (keyboards and touch screens), announced to screen readers.
- **Lint and format**: `npm run lint` (oxlint with type information: floating and misused promises,
  `await` on non-promises, type-only imports, React hooks rules, and four jsx-a11y rules) and
  `npm run format:check` (Prettier). Both run in CI.
- **Attachments on items, Trello-style.** Paste a screenshot anywhere while a card is open (or in the
  new-item dialog), drop files on it, or pick them. Files live next to the item in
  `.cortex/items/<id>-<slug>/files/` (versioned in git; a file put there by hand is attached too), up to
  15 MB each. Pictures show as thumbnails and the first becomes the card's cover; Markdown and text open
  in a preview. `files/<name>` in Markdown points at an attachment of the same item, and pasting into a
  description or reply inserts that reference at the cursor. REST: `GET|POST /items/:id/files`,
  `GET|DELETE /items/:id/files/:name`. Anything that could run in the page (SVG, HTML, PDF) is served as a
  download, never inline.
- **`cortex_item_file` (MCP):** an AI reads an attached spec as text and a screenshot as an image.
- **Board cards:** the priority (or severity) as a coloured label, the due date (red when late), badges
  for description, replies and attachments, and "Add a card" at the bottom of every column.
- **Descriptions are edited in place** on the card, with Write / Preview tabs.
- **Installation guide** for people new to all of it, in English and Turkish ([docs/INSTALL.md](docs/INSTALL.md),
  [docs/KURULUM.md](docs/KURULUM.md)): what to install, the two setups and how they differ, connecting
  Claude Code, Cursor, VS Code, Claude Desktop and Codex, running a hub behind HTTPS, upgrading and
  troubleshooting.
- **`--dir <project folder>`** (or `CORTEX_DIR`) on every project command, for MCP clients that do not start
  servers in the project folder (Claude Desktop, Codex). `init --dir` creates the project there.
- **`cortexboard --version`**.
- **Tests** for the CLI, git, frontmatter, agent files, the full AI protocol over MCP, a two-clone
  parallel merge and attachments. 89 → 137 tests.

### Fixed

- **Parallel work no longer conflicts in the activity log.** The same actor writing on two machines on the
  same day (one AI id on two laptops) produced an add/add conflict on every merge.
  `.cortex/.gitattributes` now merges `activity/**/*.jsonl` by union; existing projects get the line added
  the first time Cortex opens them.
- **Code-linked files with non-ASCII names were never reported stale** (for example `src/ödeme.ts`): git
  printed them quoted and escaped. Git now runs with `core.quotepath=false`, and paths are compared in NFC,
  so decomposed macOS names match too.
- **An AI that logs its change right after committing** now sees what that commit made stale (staleness was
  throttled for 3 s and still saw the old HEAD).
- **Members who see part of a project got short pages and a wrong total** (visibility was filtered after
  `LIMIT`). It is now part of the SQL query. 60 items, member sees 24, `limit=10`: pages of 10, 10, 4 and a
  total of 24.
- **Two async form handlers** in the hub screens were passed where a void handler was expected (found by
  the new lint rules).
- Escape closed every open window at once (a preview opened from a card took the card with it); it now
  closes only the top one.

### Security

- **The board cookie is a session, not the API token.** A copied cookie used to be a copied API key, and
  logging out ended nothing. Sessions are random keys stored only as SHA-256 hashes in
  `.cortex/.sessions.json` (owner-only, git-ignored), valid 30 days, revocable. A cookie that still holds
  a raw token is accepted once and swapped for a session, so nobody is logged out by the upgrade.
- **`.secrets.yaml` is owner-only (0600)**; an older, looser file is tightened on first read (POSIX).
- **Token checks** no longer read the secrets file on every request (cached by mtime) and compare hashes in
  constant time over every entry: 763 µs → 31 µs per request.
- **Hub rate limits on every door**: 10 wrong passwords per address and email, 10 bad agent tokens per
  address (REST and MCP together), 20 dead invite links per address, per 15 minutes. The limiter's memory
  is bounded.
- **At most 50 live board streams per project** (`CORTEX_SSE_LIMIT`), then `503` with `Retry-After`.

### Performance

- Looking up items no longer lists the whole items folder on every miss: reading 2,000 items went from
  5.1 s to 2.0 s (it was quadratic, now linear).
- Staleness asks git once per HEAD: writes that force a recompute at the same HEAD re-ask git nothing.

### Known limitations

- The hub keeps every project it has opened in memory until it restarts. That only matters for a hosted
  hub with more projects than memory; there is none today, and evicting a project under an in-flight
  request is riskier than the leak.
- The first staleness check after new code arrives can take a few seconds on Windows (every git call
  starts a process, ~45 ms each); later checks at the same commit are cached.
- The raw-token board cookie is accepted once for the upgrade; this compatibility path will be removed
  after 0.2.x.

## 0.1.0 - 2026-09-22 (never published)

First version: knowledge tree, items and rules, the web board, optional semantic search, git-based
staleness, reports, the team server (hub) with roles, and MCP tools for AIs.

[Unreleased]: https://github.com/alibuyukkilinc/cortexboard/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/alibuyukkilinc/cortexboard/releases/tag/v0.3.0
[0.2.4]: https://github.com/alibuyukkilinc/cortexboard/releases/tag/v0.2.4
[0.2.3]: https://github.com/alibuyukkilinc/cortexboard/releases/tag/v0.2.3
[0.2.2]: https://github.com/alibuyukkilinc/cortexboard/releases/tag/v0.2.2
[0.2.1]: https://github.com/alibuyukkilinc/cortexboard/releases/tag/v0.2.1
[0.2.0]: https://github.com/alibuyukkilinc/cortexboard/releases/tag/v0.2.0

# Changelog

All notable changes to `cortexboard`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/) (while it is 0.x, a minor version may change behaviour).

## [Unreleased]

## [0.2.0] - 2026-09-24

The theme of this release is making what 0.1 already had trustworthy: honest numbers, stale knowledge
you can clear, a board session that is not an API key, a hub that is safe to invite people to, and tests
for the parts that had none. Every entry below comes from one commit, and says what changed and, where it
was measured, by how much.

### Changed

- **The package is published as `cortexboard`.** The working name `aicortex` (never published) is
  refused by the registry: npm compares names with punctuation removed, and `ai-cortex` already exists.
  The command is still `cortex`, and `cortexboard` runs the same binary.
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
- **`cortex logout [--actor <id>] [--all]`** ends board sessions, also on a running server.
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
- **`cortex --version`**.
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

[Unreleased]: https://github.com/alibuyukkilinc/aicortex/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/alibuyukkilinc/aicortex/releases/tag/v0.2.0

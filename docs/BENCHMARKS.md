# Benchmarks: does Cortex help an AI agent?

These are A/B runs of AI coding agents on this repository, which runs on its own Cortex knowledge
(`.cortex/`). Each run is recorded as it happened, so later changes can be measured against it.
Numbers are not polished: where a result went against Cortex, it is written down as such.

## How a run works

- **Agents.** Claude Code sub-agents (same model, same prompt apart from the tool rules), started in
  parallel on the same commit.
- **Control (A, "no Cortex").** May read everything in the repo (code, tests, README, CHANGELOG,
  CORTEX_SPEC.md, git history) except `.cortex/`, and may not call the Cortex MCP tools.
- **Cortex (B).** Starts with `cortex_brief`, then uses the Cortex MCP tools; may read code to confirm.
  May not read `.cortex/` files directly (only through the tools). Read-only: writes nothing.
- **Grading.** Before the agents run, the answer key is taken from Cortex and the code. Each answer is
  scored 0–1 (partial credit for partly right; "not found" is 0, a wrong claim is 0).
- **Measured.** Tokens and wall time as reported by the agent runtime (`subagent_tokens`,
  `duration_ms`), and tool calls. Tokens include each agent's fixed start-up context (system prompt, tool
  definitions), which is the same for both groups and is a large share of every total.
- **Repository size at the time:** about 8.3k lines in `src/`, 20k with tests and the web board, 94 files
  in `.cortex/`. Small, and well commented: a good case for the control group.

## Results at a glance

| Round | Date | Question type | Agents | Accuracy A → B | Tokens A → B | Calls A → B | Time A → B |
|---|---|---|---|---|---|---|---|
| 1 | 2026-09-24 | 5 facts that are also in code/CHANGELOG | 1+1 | 4.75 → **5.0** | **63.1K** → 67.1K | 9 → 13 | 39 s → **26 s** |
| 2 | 2026-09-24 | 5 "why / who decided / what is open" | 3+3 | 2.5 → **4.9** | **62.5K** → 68.3K | 7 → 20 | 41 s → 43 s |
| 3 | 2026-09-24 | Round 2 again, after tool changes (`be7ccd7`) | 3 (B only) | 2.5 → **4.97** | **62.5K** → 69.4K | 7 → 12 | 41 s → **35 s** |
| 4 | 2026-09-24 | One large design task (outgoing webhooks) | 3+3 | 11.5 → 11.6 / 12 | **88.1K** → 90.1K | 9 → 27 | **82 s** → 91 s |
| 5 | 2026-09-24 | Search only: keyword vs. hybrid (semantic on) | 2+2 | 6 → 6 / 6 | 68.2K → 66.3K | 11.5 → 11 | 19 s → 19 s |

Accuracy per 1K tokens, rounds 2–3: A 0.040, B 0.072 (+80%); in other words about 24.7K tokens per
correct answer without Cortex and 14.0K with it.

## Round 1: facts that also live in the code

Questions: why oxlint instead of typescript-eslint (and the decision id), Turkish file names and git on
macOS, why an approved draft is stale right away, the brief's token limit, the minimum Node version.

- Both groups answered almost everything. The control found the reasons in commit messages and the
  CHANGELOG, which in this repo repeat much of what Cortex holds.
- Only Cortex returned the decision id, its status ("proposed") and the rejected alternatives, and it
  noticed that an older decision still said "Node 22.13+" (out of date).
- **Takeaway:** when the code and changelog already say it, Cortex is faster (−33%) but not cheaper.

## Round 2: knowledge that is not in the code

Questions: which timezone reports use *and who decided it*; how a mobile team joins (the decision and
whether it is final); what work is open and on whom; what to keep consistent before editing
`src/git/git.ts` and what to update afterwards; why Cortex never calls an LLM and which alternatives were
weighed.

| Question | A | B |
|---|---|---|
| Timezone, who decided, what triggered it | 0.6 | 1 |
| Mobile team decision | 0.4 | 1 |
| Open work and who it waits on | **0.1** | 1 |
| Before editing `git.ts` | 0.8 | 0.95 |
| No LLM: reasons, alternatives | 0.65 | 1 |

- The control said "not found" for decisions, open items and alternatives, which was honest. Two
  control agents also flagged an already-closed item as "outdated": a wrong claim made from indirect
  evidence (the git status).
- The Cortex agents found four stale records in Cortex itself (a publish task still in backlog after
  0.2.1 shipped, a decision whose text still said "proposal", an answered question never closed).
- **Cost:** about 20 tool calls per Cortex agent. They listed items, then opened them one by one.

## Round 3: fewer calls (commit `be7ccd7`)

Changes made from round 2's traces:

- `cortex_items(preview: true)`: each row carries a short gist of the body and the last reply.
- `cortex_item(ids: [...])`: up to 10 related items in one call.
- The brief lists open work waiting on others (`open_elsewhere`), never repeating the inbox.

Same prompt, same questions, three new Cortex agents: **20 → 12 tool calls, 43 s → 35 s, accuracy
4.9 → 4.97**. Total tokens did not move (68.3K → 69.4K): the same content is read, in fewer and larger
responses. Fewer round trips still matter in practice, because every turn re-processes the context.

## Round 4: one large task that needs a feel for the whole system

Task: write the implementation plan for outgoing webhooks (item created or status changed, reply,
draft proposed or approved, node became stale), in single-project mode and on the hub. Graded against
12 points, among them:

- hook into the audit trail (`ActivityService.system`), not into REST routes;
- **the two-process trap:** `cortexboard mcp` writes from its own process, so the board server only sees
  a bare `reindex`; dispatch needs a persisted cursor, not the in-memory event;
- no replay on `git pull` or `reindex`;
- secrets in `.secrets.yaml` or `hub.db`, never in the committed `cortex.config.yaml`;
- humans only (no AI role, no MCP tool); restricted members and visibility on the hub;
- lazily opened hub projects; draft semantics; `item.updated` counts as a status change only when
  `from !== to`; HMAC, retries, SSRF guard; tests and what else to update.

| | A (no Cortex) | B (Cortex) |
|---|---|---|
| Score (of 12) | 11.5 | 11.6 |
| Tokens | **88.1K** | 90.1K |
| Tool calls | **9** | 27 |
| Time | **82 s** | 91 s |

- **All six plans were strong,** and all six found the two-process trap. In a codebase this size, with
  this many code comments, an agent that reads the core files gets the architecture right.
- Only the Cortex agents named the exact knowledge nodes to update and recalled project gotchas
  (no `console.log` on the MCP path, no numbered `node:sqlite` parameters, the 800-token brief). Only the
  control agents noticed that `SECURITY.md` says Cortex "never sends project data anywhere", a line
  webhooks make false.
- The Cortex agents did both: read Cortex *and* the same code. That is where the extra calls went.
- **Takeaway:** the "deeper context" hypothesis did not show up at this size. Cortex's edge here is
  decisions, history and open work (round 2), not architecture that the code already explains.

## Round 5: semantic search

Six questions worded in English with no words in common with the Turkish knowledge (for example "What
stops a copied browser cookie from being as powerful as an API key?", "Can someone temporarily postpone
dealing with outdated knowledge?").

**Keyword search (FTS5), the default:**

- Direct hit rate, the English question as the query, right record in the top 3: **2 of 6**. The misses
  still returned five plausible-looking but wrong results.
- Agents limited to `cortex_search` (then opening what it returned): **6 of 6 correct**, 6 searches,
  66–70K tokens, 19 s. The agents rewrote the queries in Turkish and found everything.

**Hybrid search** (`cortexboard semantic on`: local `paraphrase-multilingual-MiniLM-L12-v2`, fused with
keyword results by RRF), same six questions:

- Agents limited to search: **6 of 6 again**, 6 searches, 66–67K tokens, 18–19 s. No measurable gain.
- Rank of the right record in the top 10, by query language (a dash means not in the top 10):

| Question | EN keyword | EN semantic only | EN hybrid | TR keyword | TR semantic only | TR hybrid |
|---|---|---|---|---|---|---|
| Late-night work, previous day | – | **1** | 2 | 1 | 1 | 1 |
| Copied cookie vs. API key | 6 | – | 6 | 1 | 3 | 1 |
| Linter vs. new compiler | 3 | – | 5 | 1 | 1 | 1 |
| Accented file names on macOS | – | – | – | 3 | – | 5 |
| Half-empty pages for restricted members | **1** | 2 | **–** | 1 | 1 | 1 |
| Postponing outdated knowledge | – | – | – | – | – | – |
| **Found in top 10** | 3 | 2 | 3 | 5 | 4 | 5 |

What this shows:

- **Semantic search helped once:** the English "late-night work" question, which shares no words with the
  Turkish record, went from not found to rank 1 (rank 2 in hybrid).
- **Hybrid also lost a hit.** Keyword search ranked the "half-empty pages" answer first, and hybrid
  dropped it out of the top 10. With RRF, a record that only one list finds scores 1/61, and ten mediocre
  records that both lists find weakly (common words, loose similarity) all score higher. A strong hit
  from one list should not vanish.
- **Turkish word forms defeat both.** "ertelemek" (to postpone) does not match "erteleme" or
  "ertelenebilir" in the keyword index (no stemming), and the semantic vector of a long node, cut at
  2,000 characters, is too diluted to rank the one line about snoozing.
- **Agents do not depend on either.** They rewrote English questions into Turkish project vocabulary
  and got 6 of 6 either way. For an AI caller, the search mode matters less than it seems; for a person
  typing into the board's search box, it matters more.

### Follow-up: keyword stems (semantic search set aside)

Semantic search was turned off again: it added a 420 MB download for no measured gain. Keyword search
got the one fix the round pointed at: when no record has every word as written, each word's stem is
tried too (at most three letters dropped, never below five). Measured on 20 queries (the 12 above plus
8 more in both languages), rank of the right record in the top 10:

| | Before | After |
|---|---|---|
| Found in top 10 | 17 / 20 | **18 / 20** |
| At rank 1 | 11 | 11 |
| Worse by one rank | | 1 ("onaylanan taslak…": 7 → 8) |
| Newly found | | "eskimiş bilgiyi ertelemek": – → 3 |

Using stems from the start, or in the "any word" fallback, was tried first and measured worse (it
widened matches that were already right), so stems are only a middle step.

## What we learned so far

1. Cortex pays off where the answer is not in the code: why something was decided, by whom, what was
   rejected, what is open and on whom, and what is out of date. There it roughly doubles accuracy for
   the same tokens.
2. Where the code already says it, reading the code is as good and slightly cheaper.
3. Tool shape matters more than it looks: two small API changes cut Cortex tool calls by 41%.
4. Total tokens did not drop in any round. On a larger or less commented codebase this is expected to
   change; that is the next thing to measure.
5. The larger design task (round 4) did not widen the gap: on a codebase this size, reading the code
   gives an agent the architecture. Cortex's edge stays with what the code cannot say.
6. Semantic search, as built today, gave no measurable gain to agents and lost one keyword hit in
   hybrid ranking. It stays optional and off; keyword search got stem matching instead.

## Next runs

- Search: English questions against Turkish knowledge are still the gap keyword search cannot close.
  Agents close it themselves by rewriting the query, so it matters mostly for people using the board.

- A larger, less commented codebase, where reading the code costs more.
- A real implementation task with tests as the grader, not a written plan.
- The same rounds on each release, to follow the trend.

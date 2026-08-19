# Feature: Mirror every build-plan feature as a GitHub issue

**From build-plan:** feature 22
**Status:** not started

## Goal

Give the project a clean, browsable GitHub Issues history that mirrors the
project's real build history - `blueprint/build-plan.md` **and**
`blueprint/history/fixes/` - exactly as it really happened: one issue per
top-level build-plan item (1-21), a native GitHub sub-issue per lettered
sub-item, one standalone issue per archived ad hoc fix, correct open/closed
state throughout, and a link back to the archived spec and the real
squash-merge commit. Then wire `/feature`, `/fix`, and `/complete` so every
feature or fix spec'd from now on gets the same treatment automatically,
without a second backfill ever being needed - a coherent, continuously
up-to-date record of the project's life, not a one-time snapshot.

`gh` is authenticated against `origin` (`guillaumegd/legirag`, `repo` scope).
The repo currently has zero issues.

## Design reference

None - this is a data/workflow feature, not a visual one.

## In scope

- A one-time backfill script that creates one GitHub issue per build-plan item
  1-21, with a native sub-issue (`gh issue create --parent`) per lettered
  sub-item, using the **exact** historical mapping verified below (not a
  generic/regenerated one) - including its irregularities.
- The same backfill also creates one standalone issue per archived ad hoc fix
  in `blueprint/history/fixes/` (2 today: `secure-api-mcp-access.md`,
  `simplify-deploy-automation.md`) - not nested under any build-plan parent,
  since fixes aren't build-plan items.
- Correct open/closed state per item, matching today's `- [x]` / `- [ ]`
  checkboxes exactly, at every level (a parent whose sub-items aren't all done
  stays open even if some children are closed - see item 6).
- Each closed issue links to its archived spec (`blueprint/history/features/
  NN[x]-name.md` or `blueprint/history/fixes/name.md`) and its real
  squash-merge commit (hash + message) - never a fabricated or approximate
  commit.
- A `build-plan` label on the 64 feature/sub-feature issues and a `fix` label
  on the 2 fix issues, so both stay identifiable against any future organic
  issue.
- Updating `.claude/skills/feature/SKILL.md` (Step 1) so spec'ing a build-plan
  item opens the matching GitHub issue if none exists yet, or reuses it if one
  already does.
- Updating `.claude/skills/fix/SKILL.md` (its equivalent target-identification
  step) the same way, for ad hoc fixes going forward.
- Updating `.claude/skills/complete/SKILL.md` (Step 1, logging) so finishing a
  feature or fix closes its issue with a comment linking the real
  squash-merge commit - generalized to match by build-plan number for
  features and by `Fix: <title>` for fixes, since `/complete` already branches
  on `Type: Fix` vs. a numbered feature internally.

## Out of scope

- **Ad hoc chore/fix commits that never went through `/fix`** (e.g.
  `4cfca8a`/`7c286b3`/`e9c540a` and similar small drive-by commits) - these
  have no archived spec to link an issue to, and mirroring every raw commit
  (rather than every *documented* unit of work) would be noise, not history.
  Confirmed with the user 2026-08-19: "fixes" means the `/fix`-archived ones
  in `blueprint/history/fixes/`, which now **are** in scope (see above).
- **`blueprint/history/rollbacks/`** - empty today (no rollback has ever run),
  so there is nothing to backfill and no real example to build the mechanism
  against. `/rollback` is not wired in this feature; add it the same way, on
  the same pattern, whenever the first real rollback happens.
- **`.agents/skills/feature/SKILL.md`, `.agents/skills/fix/SKILL.md`,
  `.agents/skills/complete/SKILL.md`** - item 22's original build-plan text
  says to update "both adapters," but this repo's `.agents/skills/` only
  contains `supabase*` skills today (no core Blueprint skills at all -
  `.claude/skills/` is the only adapter with real content). Confirmed with the
  user 2026-08-19: update wherever the skills actually live, so `.claude/`
  only. Nothing to touch on the Codex side.
- Item 22 (this feature) does not get its own GitHub issue via the backfill -
  the build-plan text explicitly bounds the backfill to items "1-21 at time of
  writing." Once Part 2 ships, it naturally won't retroactively create #22
  either, since this spec already exists. Not worth special-casing.
- No GitHub Projects board, milestones, or custom issue types - just issues,
  sub-issues, and two labels.
- Re-running the backfill is made *safe* (idempotent, skips existing titles)
  but a second full run is not expected or needed after this feature ships.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.

Step 2 below (running the backfill) is a real write to a shared, external
system (GitHub) and is hard to reverse in bulk - it gets an explicit go/no-go
confirmation in chat before any `gh issue create` call runs for real, separate
from the normal diff-review gate for Step 1's script.

## Build steps

- [x] **Step 1 - Backfill script and verified mapping data** - write
  `scripts/backfill-github-issues.sh`: a `gh`-based bash script (matching the
  existing convention of `infra/push-secrets.sh`-style one-off scripts) that
  reads the mapping table below, creates the `build-plan` and `fix` labels if
  missing, creates one parent issue per build-plan item 1-21 (title `"<N>.
  <Title>"`, body = the build-plan bullet text + spec/commit links), creates
  each sub-item as a native sub-issue (`--parent <parent-issue-number>`),
  creates one standalone issue per archived fix (title `"Fix: <Title>"`,
  title pulled from the fix spec's `## Title` section when present or its `#
  Fix: ...` H1 otherwise - both forms exist in the two current archives), and
  closes every issue that should start closed with a comment naming its
  squash-merge commit. Idempotent: before creating, checks `gh issue list
  --search "in:title \"<title>\""` for an existing match and skips it.
  Dry-run by default (`--apply` flag required to actually write) so Step 1's
  review is the script text and a `--dry-run` printout, not real GitHub state.
  *Done when:* `./scripts/backfill-github-issues.sh` (no `--apply`) prints the
  full plan - 66 issues, 21 parents + 43 sub-issues + 2 fixes, 53 to be closed
  / 13 left open - and it matches the table below exactly.
- [x] **Step 2 - Run the backfill for real** - run
  `./scripts/backfill-github-issues.sh --apply` after explicit go-ahead in
  chat. *Done when:* `gh issue list --repo guillaumegd/legirag --state all |
  wc -l` is 66, `--state open` is 13, `--state closed` is 53, and a spot check
  confirms: issue "6." stays open while its "6a"/"6b"/"6c" sub-issues are
  closed and "6d" stays open; issues "8a"-"8d" all reference the same commit
  `d4d4cc5`; issue "13a" references `23585f4` while "13b"-"13d" reference
  `6caa6e9`; issue "21." (parent) is closed and its body notes it was split
  immediately into 21a/21b with no standalone spec of its own; both fix
  issues are closed, labeled `fix`, and reference `af36851`/`c5ad909`
  respectively.
- [x] **Step 3 - Wire `/feature` to open-or-reuse the matching issue** - in
  `.claude/skills/feature/SKILL.md` **Step 3 ("write the spec")**, not Step 1
  as originally sketched - moved during implementation because the target
  build-plan item isn't final until after Step 2's sizing/split decision (a
  parent that gets split specs its first newly-created sub-item, which
  doesn't exist as a build-plan line - or a GitHub issue - until this point).
  Added: search `gh issue list --state all --json number,title` for `"<N>.
  <Title>"` (or `"<N><letter>. <Title>"` for a sub-item); if found, reuse it
  (`gh issue reopen` if closed and re-spec'ing); if not found, create it (as a
  sub-issue of its parent, creating the parent first if that's also missing)
  with the `build-plan` label. State the issue number when announcing which
  feature is being built. Skips cleanly with no GitHub remote or `gh` auth.
  *Done when:* the skill file's diff reads correctly end to end. **Met.**
- [x] **Step 4 - Wire `/fix` the same way** - in `.claude/skills/fix/SKILL.md`
  Step 1, right after the fix spec's Title/Type/etc. fields are decided, added
  the same open-or-reuse search/create logic, keyed on `"Fix: <Title>"` and
  labeled `fix` instead of `build-plan` (no parent - fixes are standalone).
  *Done when:* the skill file's diff reads correctly end to end. **Met.**
- [x] **Step 5 - Wire `/complete` to close the matching issue** - in
  `.claude/skills/complete/SKILL.md` **Step 3 ("merge"), not Step 1** as
  originally sketched - moved during implementation because the real
  squash-merge commit hash does not exist until *after* the squash-merge runs
  in Step 3 (Step 1 only archives the spec; Step 2's branch commit gets a
  *different* hash once squashed onto `main`). Added, right after branch
  deletion: close the matching GitHub issue - found by title the same way
  `/feature`/`/fix` do - with a comment naming the real commit
  (`git rev-parse HEAD` on `main` post-merge) and the archive path. Applies to
  features and fixes, not rollbacks. Skips silently if no matching issue
  exists or there's no GitHub remote/auth, so a rollback completion or any
  never-backfilled item doesn't break. *Done when:* the skill file's diff
  reads correctly end to end for both branches. **Met** - real end-to-end
  proof (does it actually fire and close the right issue) arrives at the next
  genuine `/feature` -> `/complete` or `/fix` -> `/complete` cycle, deferred
  by design, not skipped.

**Correction applied after review of the backfilled issues (2026-08-19):**
the user flagged, on the live backfill output, that (a) a body which is just
a link to a repo file isn't actually useful on GitHub - an issue should be
self-contained - and (b) pasting a build-plan bullet's `- [ ]`/`- [x]` prefix
verbatim renders as a real, clickable-looking task-list checkbox that
duplicates the issue's own Open/Closed badge. Both fixes were made in
`scripts/backfill-github-issues.sh` (see its `build_body`/`build_plan_own_text`
for the working pattern: full content, not a link; strip the checkbox marker
and dedent by the list-nesting depth so continuation text doesn't get
misread as an indented code block) and carried into the Step 3/4/5 wiring
above so newly-created issues are correct by construction: `/feature`/`/fix`
compose the initial body from the spec's own Goal/Problem/Fix sections (never
copy build-plan checkbox syntax into a title or body), and `/complete`
overwrites that draft body with the finished archive's full content - using
`--body-file`, not `--body`, so backticks/`$`/quotes in the archive are never
re-parsed by the shell - before closing. Per the user: this doesn't need
retrofitting onto the backfilled issues beyond what's already fixed there;
it just has to be right going forward, since it's populated live from the
real spec rather than reconstructed after the fact.

## Files / areas

- `scripts/backfill-github-issues.sh` (new)
- `.claude/skills/feature/SKILL.md` (Step 1 addition)
- `.claude/skills/fix/SKILL.md` (target-identification addition)
- `.claude/skills/complete/SKILL.md` (Step 1 addition, generalized to features
  and fixes)
- GitHub Issues on `guillaumegd/legirag` (66 new issues, 2 new labels) - not a
  repo file, but the actual deliverable of Steps 1-2

## Data / contracts

**Verified mapping (git log on `main`, cross-checked against
`blueprint/history/features/*.md` and `blueprint/build-plan.md`'s checkboxes
on 2026-08-19).** This table is the source of truth for Step 1's script -
implementation must use it as-is, not re-derive it by pattern-matching commit
messages (message formats aren't uniform: `(4a)`, `(item 8, 8a-8d)`, `(feature
2a)` all appear).

| Item | Title | Sub-items | Closed? | Archive | Commit |
|---|---|---|---|---|---|
| 1 | Repo foundations and shared contracts | - | yes | `01-repo-foundations-shared-contracts.md` | `6fac846` |
| 2 | Legal corpus in the database | 2a-2d | yes (all children closed) | - (split immediately) | - |
| 2a | COLD corpus acquisition and filtering | | yes | `02a-cold-corpus-acquisition-and-filtering.md` | `17bdacc` |
| 2b | Hierarchical path parser | | yes | `02b-hierarchical-path-parser.md` | `bc18af4` |
| 2c | Subdivision extractor | | yes | `02c-subdivision-extractor.md` | `d7a14aa` |
| 2d | Supabase schema and load | | yes | `02d-supabase-schema-and-load.md` | `fa6e69d` |
| 3 | Cross-reference graph | 3a-3b | yes | - (split immediately) | - |
| 3a | Renvoi extractor | | yes | `03a-renvoi-extractor.md` | `1ba13c5` |
| 3b | Renvois table and load | | yes | `03b-renvois-table-and-load.md` | `1103d70` |
| 4 | Search index and access-control policies | 4a-4d | yes | - (split immediately) | - |
| 4a | Contextual chunking | | yes | `04a-contextual-chunking.md` | `3afb750` |
| 4b | Chunks table, embeddings, and indexes | | yes | `04b-chunks-table-embeddings-and-indexes.md` | `127e56c` |
| 4c | Access-control policies (RLS) | | yes | `04c-access-control-policies-rls.md` | `80baa5d` |
| 4d | Hybrid Retriever implementation | | yes | `04d-hybrid-retriever-implementation.md` | `746c641` |
| 5 | Evaluation question set and harness | - | yes | `05-evaluation-question-set-and-harness.md` | `6952462` |
| 6 | Retrieval quality improvements | 6a-6d | **no** (6d open) | - | - |
| 6a | Naive baseline | | yes | `06a-naive-baseline.md` | `babac7b` |
| 6b | Contextual chunking, isolated | | yes | `06b-contextual-chunking-isolated.md` | `0b10bf6` |
| 6c | Hybrid search, isolated | | yes | `06c-hybrid-search-isolated.md` | `c8a5494` |
| 6d | Re-ranking | | **no** - on hold, not merged (abandoned `feature/re-ranking` branch, commit `b070658`, never reached `main`) | - | - |
| 7 | Tool server | 7a-7d | yes | - (split immediately) | - |
| 7a | MCP server skeleton and `chercher_droit` | | yes | `07a-mcp-server-chercher-droit.md` | `2c5b8cf` |
| 7b | `suivre_renvoi` | | yes | `07b-suivre-renvoi.md` | `aed0313` |
| 7c | `router_question`, `calculer`, `demander_a_l_humain` | | yes | `07c-router-question-calculer-demander-a-l-humain.md` | `7897a37` |
| 7d | Stub tools and third-party client verification | | yes | `07d-stub-tools-and-third-party-client-verification.md` | `aee0fa8` |
| 8 | Reasoning agent | 8a-8d | yes | - (split immediately) | - |
| 8a | Agent foundations and fixed-chain baseline | | yes | `08a-agent-foundations-fixed-chain.md` | `d4d4cc5` (shared with 8b-8d) |
| 8b | Routing node | | yes | `08b-routing-node.md` | `d4d4cc5` (shared) |
| 8c | Bounded cross-reference-following loop | | yes | `08c-cross-reference-loop.md` | `d4d4cc5` (shared) |
| 8d | Verification and abstention | | yes | `08d-verification-and-abstention.md` | `d4d4cc5` (shared) |
| 9 | Agent quality evaluation | 9a-9c | yes | - (split immediately) | - |
| 9a | Agent-level eval harness, routing, abstention | | yes | `09a-agent-eval-harness.md` | `3137ac8` (shared with 9b-9c) |
| 9b | Cross-ref coverage, loop-stop, cost | | yes | `09b-cross-ref-coverage-cost.md` | `3137ac8` (shared) |
| 9c | Failure-injection recovery, stop-criteria tuning | | yes | `09c-failure-injection-tuning.md` | `3137ac8` (shared) |
| 10 | Historical versions, time travel, abstention | 10a-10d | no | - | - |
| 10a-10d | (all four sub-items) | | no - not started, no archive | - | - |
| 11 | Public API | 11a-11d | yes | - (split immediately) | - |
| 11a | NestJS foundations and streamed question endpoint | | yes | `11a-nestjs-question-endpoint.md` | `f9a996f` |
| 11b | Trace and article read endpoints | | yes | `11b-trace-article-endpoints.md` | `87f59f1` |
| 11c | Cost caps, rate limiting, structured errors | | yes | `11c-cost-rate-error-guards.md` | `a0860a7` |
| 11d | Containerization and end-to-end validation | | yes | `11d-containerize-api.md` | `48789f8` |
| 12 | Observability and infrastructure automation | 12a-12d | yes | - (split immediately) | - |
| 12a | Per-tool and per-model-call tracing | | yes | `12a-per-call-tracing.md` | `f9bd2e5` |
| 12b | Evaluation suite as a blocking CI regression check | | yes | `12b-eval-regression-gate.md` | `8bd9e4b` |
| 12c | Event-driven reindexing on text updates | | yes | `12c-event-driven-reindexing.md` | `5df2e2b` |
| 12d | Terraform provisioning the stack from scratch | | yes | `12d-terraform-provisioning.md` | `7b53488` |
| 13 | Front end and reliability case study | 13a-13d | yes | - (split immediately) | - |
| 13a | Next.js scaffold and the question/answer screen | | yes | `13a-question-answer-screen.md` | `23585f4` |
| 13b | Agent-trace view | | yes | `13b-agent-trace-view.md` | `6caa6e9` (shared with 13c-13d) |
| 13c | End-to-end smoke test | | yes | `13c-end-to-end-smoke-test.md` | `6caa6e9` (shared) |
| 13d | Reliability case study write-up | | yes | `13d-reliability-case-study.md` | `6caa6e9` (shared) |
| 14 | Item 8 deep-dive exploration | - | no - not started, no archive | - | - |
| 15 | Restyle front-end (design handoff) | - | yes | `15-restyle-front-end.md` | `5994e5a` |
| 16 | Restore valid Bedrock credentials in prod | - | no - not started, no archive | - | - |
| 17 | Separate paid and free-route quotas | - | no - not started, no archive | - | - |
| 18 | Client-side local history | - | no - not started, no archive | - | - |
| 19 | Surface the real error behind generic abstention | - | no - not started, no archive | - | - |
| 20 | Upgrade to Node 24 | - | no - not started, no archive | - | - |
| 21 | Wire up release-please, enforce conventional commits | 21a-21b | yes | - (split immediately) | - |
| 21a | release-please workflow and config | | yes | `21a-release-please-workflow.md` | `5a27e8a` |
| 21b | Commitlint enforcement | | yes | `21b-commitlint-enforcement.md` | `0c82c1d` |

**Fixes** (standalone, no parent, `fix` label, title taken from the archive
itself - see note below on the two different header shapes):

| Title (issue) | Closed? | Archive | Commit |
|---|---|---|---|
| Fix: Sécuriser l'API et le MCP : token d'accès partagé + rate-limit persistant | yes | `secure-api-mcp-access.md` | `af36851` |
| Fix: Simplify Terraform state and automate the Lambda image deploy | yes | `simplify-deploy-automation.md` | `c5ad909` |

Totals: 21 parent issues (13 closed / 8 open) + 43 sub-issues (38 closed / 5
open) + 2 fix issues (2 closed) = **66 issues, 53 closed / 13 open**.

Issue title format: `"<N>. <Title>"` for build-plan parents (e.g. `"6.
Retrieval quality improvements, each measured in isolation"`), `"<N><letter>.
<Title>"` for build-plan sub-items (e.g. `"6d. Re-ranking"`), `"Fix: <Title>"`
for fixes - these exact prefixes are what Steps 3-5's search matches on, so
they must stay exact and stable. Fix titles aren't stored uniformly today:
`secure-api-mcp-access.md` keeps a leftover `# Current Feature` H1 from the
spec template with the real title in a separate `## Title` section (French);
`simplify-deploy-automation.md` puts the real title directly in a `# Fix:
...` H1 (English). The script must handle both when reading the title, not
assume one shape.

## Testing

No unit-testable logic here - `scripts/backfill-github-issues.sh` is a thin
`gh`/GitHub-API integration script (data table + API calls, no parsing or
branching logic worth a Vitest test), and the `/feature`/`/complete` skill
edits are workflow markdown, not code. Verification is behavioral:

- Step 1: the script's `--dry-run` printout, read against the mapping table
  above.
- Step 2: `gh issue list` counts and the spot checks listed in Step 2's
  done-when, run against the real repo after `--apply`.
- Steps 3-5: diff review now; end-to-end proof arrives naturally the next time
  a real `/feature` -> `/complete` or `/fix` -> `/complete` cycle runs
  (flagged as deferred, not skipped).

## Notes for the AI

- Treat the mapping table above as ground truth. If anything about the real
  repo state has changed since 2026-08-19 (a new commit, a checkbox flipped),
  re-verify against `git log --oneline main` and `blueprint/build-plan.md`
  before writing the script, and flag any discrepancy rather than silently
  trusting the table.
- Preserve the real irregularities instead of normalizing them away: item 6
  and its 6d sub-issue stay open; items 8, 9, and 13b-13d each point multiple
  sub-issues at one shared commit because that's genuinely what the squash
  history shows; item 21's parent has no standalone commit or archive; the two
  fix archives store their titles in different places (see the fixes table's
  note) - read each correctly rather than assuming one shape.
- Step 2 is a real, hard-to-reverse write to shared GitHub state - confirm
  explicitly before running `--apply`, separate from the normal step-diff
  approval.
- `gh issue create --parent` requires the parent to already exist and returns
  its number - create every parent issue before any of its children.

## Findings

Raised by `/audit` after the initial implementation, repaired, then re-audited
and closed before merge - see `blueprint/context/findings.md`'s history for
the full pass-by-pass detail; final state below.

### 22/F-12 [P1] closed - `archive_content()` blindly strips the whole "## Build loop" section, silently deleting real, feature-specific content when it isn't the generic boilerplate

**File:** scripts/backfill-github-issues.sh:179-186
**Found:** 2026-08-19 by /audit (scope: current)
**Why it matters:** `archive_content()` drops every line between `## Build loop` and the next `## ` heading unconditionally, on the assumption that section is always the identical 4-line Blueprint-workflow boilerplate. It isn't always: `blueprint/history/features/04b-chunks-table-embeddings-and-indexes.md` appends a safety-critical paragraph under that same heading - "**Step 1 is destructive against the live Supabase project (deletes ~95% of `articles`/`subdivisions`/`renvois` rows).**" - which the stripping silently removes. Confirmed live: GitHub issue #32 ("4b. Chunks table, embeddings, and indexes") did not contain that warning anywhere in its body, even though the archive file on disk still had it.
**Suggested fix:** Only strip the section when its content exactly matches the known generic boilerplate; otherwise leave it untouched.
**Resolution:** `archive_content()` now extracts the `## Build loop` section separately, compares it against a `BUILD_LOOP_BOILERPLATE` constant, and only strips on an exact match; otherwise it `cat`s the whole file untouched. Caught and fixed a self-introduced bug while verifying: a single-line `local dir="$1" file="$2" path="$REPO_ROOT/blueprint/$dir/$file"` doesn't see its own earlier assignments in bash, which had silently blanked every archive-backed issue body - split into two `local` statements. Re-ran `--apply` twice; all 66 issues repaired and verified live (#32 now carries the destructive-migration warning, 66 total / 53 closed / 13 open, unchanged). Closed after a fresh re-read of the current code (not just the diff) and a repeat grep for the same `local` anti-pattern elsewhere in the file (none found).

### 22/F-13 [P1] closed - `/feature`'s GitHub-issue title-matching rule doesn't match the titles the backfill actually created, so resuming an already-backfilled item (e.g. `/feature 6d`) would create a duplicate issue instead of reusing the existing one

**File:** .claude/skills/feature/SKILL.md:120-133
**Found:** 2026-08-19 by /audit (scope: current)
**Why it matters:** The instruction said to copy the build-plan bullet "verbatim," which literally read would keep the `**bold**` markers and the full trailing description - but the real backfilled titles are short (e.g. issue #38 is `6d. Re-ranking`, not the full bullet). Item 6d is explicitly flagged in `build-plan.md` as the next thing to resume, so this was likely to be hit for real, not a theoretical edge case.
**Suggested fix:** State the exact derivation rule: bold text only, nothing after the first ` - `.
**Resolution:** Rewrote the instruction with the precise rule and the `6d` example spelled out, plus a warning that an inexact title silently creates a duplicate. Closed after a fresh re-read confirmed the rule is now unambiguous and consistent with `/fix`'s (unaffected) title convention.

### 22/F-14 [P2] closed - `/complete`'s issue-close instruction was internally contradictory about how the replacement body is written

**File:** .claude/skills/complete/SKILL.md:129-140
**Found:** 2026-08-19 by /audit (scope: current)
**Why it matters:** The instruction showed `gh issue edit <number> --body-file <archive path>` (raw archive file) right next to prose requiring a composed header + archive content - a future agent following the code-shaped example literally would have skipped the status/commit header.
**Suggested fix:** Remove the misleading example or replace it with the correct compose-then-write shape.
**Resolution:** Rewrote the instruction to compose the body in a temp file first (header + `---` + archive content, with the same Build-loop exact-match caveat as F-12) and only then `--body-file` it. Closed after a fresh re-read found no remaining contradiction.

### 22/F-15 [P3] closed - `scripts/backfill-github-issues.sh`'s header comment overstated what re-running it repairs: open/closed state drift isn't resynced, only body and label are

**File:** scripts/backfill-github-issues.sh:6-9
**Found:** 2026-08-19 by /audit (scope: current)
**Why it matters:** The header said re-running was "repairable" without qualification; the existing-issue code path only resyncs body and label, never open/closed state.
**Suggested fix:** Either add state-sync logic or narrow the doc claim.
**Resolution:** Chose the doc fix (low real-world likelihood for a one-time backfill tool). Header now says explicitly that state isn't resynced. Closed after a fresh re-read confirmed the comment matches the code.

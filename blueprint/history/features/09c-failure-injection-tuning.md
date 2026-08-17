# Feature: Failure-injection recovery and stop-criteria tuning

**From build-plan:** feature 9c (third and last sub-feature of 9. Agent quality evaluation)
**Status:** complete

## Goal

Closes item 9. Two things: (1) prove, by injecting a broken `Retriever`/
`routeQuestion`/`suivreRenvoi` call, whether the fixed chain degrades to an
honest response or crashes - and fix it if it crashes, since build-plan item
9 requires "the graph still produces a valid abstention instead of
crashing," not just an observation of whether it does; (2) use 9a/9b's
combined live numbers (routing 100%, abstention 80% overall, cross-ref
coverage 100%, draft attempts and renvoi iterations never hitting their
bounds) to decide whether `MAX_RENVOI_ITERATIONS`/`MAX_DRAFT_ATTEMPTS` need
retuning, and document the decision either way.

## Scope decision: three call sites, three different fallbacks

`draft`'s `generateObject` call already has bounded-retry-then-abstain
protection (8d) - unchanged here. The other three external calls in the
graph have none today, and each gets the *narrowest* safe fallback for what
it does, not a uniform "catch everything, abstain":

- **`search`'s `retriever.search`** - no reasonable fallback exists without
  a working retriever. A caught failure is treated exactly like the
  already-existing "0 chunks found" case (`citations: [], renvoiIterations:
  0`), which `draft` already turns into a proper abstention. No new
  response path invented.
- **`route`'s `routeQuestion`** - routing is a precision *aid* (it narrows
  `search` to specific codes), not a hard requirement - `search` already
  runs unfiltered across all codes whenever `state.codes` is `undefined`.
  A caught failure degrades to `codes: undefined` (unfiltered search) rather
  than forcing an immediate abstention: the question may still be
  answerable without routing, and if it genuinely isn't, `search`'s own
  0-results path still catches it downstream.
- **`followRenvois`'s `suivreRenvoi`** - this runs *after* `draft` already
  produced a valid `reponse` (`afterDraft` gates on `regle_principale`
  existing). A crash here would be strictly worse than the other two cases:
  it would destroy an already-good answer instead of just failing to find
  one. A caught failure is treated like "no new citations found"
  (`newCitationsFound: 0`), which `afterFollowRenvois` already turns into a
  clean `END`, preserving `state.reponse` untouched.

## In scope

- `search`, `route`, `followRenvois` (`graph.ts`) each wrap their one
  external call in a `try`/`catch`, falling back as described above, with a
  `console.error` matching the existing convention (`draft`'s catch blocks).
- Unit tests (injected throwing `Retriever`/`RouteQuestion` /
  `suivreRenvoi`-shaped failure) proving each node now degrades instead of
  the invoke rejecting - and, for `search`/`route`, first confirming
  (documented in this spec, not left as a separate persisted step) whether
  the *pre-fix* code actually did crash, same evidentiary bar 8d set for its
  own fix.
- Live re-verification of the three existing fixed-chain smoke questions
  (`fixed-chain` script) - no regression from the three `try`/`catch`
  additions.
- A written stop-criteria tuning decision in this spec (Notes /
  Live verification), reading 9a's and 9b's recorded numbers plus this
  feature's own failure-injection results.
- Check off item 9's parent checkbox in `build-plan.md` alongside 9c's own.

## Out of scope

- Fixing the `fausse_premisse` 0% correct-abstention rate 9a found - that's
  a `buildDraftPrompt`/model-reasoning quality gap (the model isn't
  recognizing a false premise as grounds to abstain), not a stop-criteria or
  failure-recovery issue. Flagged as a finding for follow-up, not touched
  here - fixing it would mean changing `draft`'s prompt, a different class
  of change than this feature's failure-injection/tuning scope.
- Retry logic for `route`/`search`/`followRenvois` failures - unlike
  `draft`, there's nothing to retry differently; a DB/network call either
  works or it doesn't, so a single catch-and-degrade is the whole fix, no
  attempt-counting needed.
- 8d/F-05 (does `draft`'s retry meaningfully help, given it resends an
  identical prompt) - 9a/9b's `draftAttempts` data doesn't distinguish an
  in-node retry from a `followRenvois`-triggered redraft, so it still can't
  be answered cleanly. Left unresolved, noted in the final report.
- Growing the eval question set - item 9 evaluates against the existing 15
  questions throughout.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - harden `search`** - wrap `retriever.search(...)` in
  `try`/`catch`; on failure, treat as `chunks = []` (falls straight into the
  existing empty-results branch). *Done when:* a new `graph.test.ts` test
  with a `Retriever` whose `search` rejects shows the graph now resolves
  with `confiance: 'abstention'` instead of the `invoke()` promise
  rejecting, and `pnpm --filter @legirag/agent test`/`typecheck` pass.
- [x] **Step 2 - harden `route`** - wrap the `routeQuestion(...)` call in
  `try`/`catch`; on failure, return `{ codes: undefined }` (unfiltered
  search). *Done when:* a new test with a rejecting `RouteQuestion` function
  shows the graph still resolves (either a grounded answer from unfiltered
  search, or an abstention if that also finds nothing) instead of rejecting,
  and `pnpm --filter @legirag/agent test`/`typecheck` pass.
- [x] **Step 3 - harden `followRenvois`** - wrap the `suivreRenvoi(...)`
  call in `try`/`catch`; on failure, return `{ newCitationsFound: 0,
  renvoiIterations }` (identical shape to the existing "nothing new found"
  branch), preserving `state.reponse`. *Done when:* a new test with a
  rejecting `suivreRenvoi`-shaped failure (inject via a test-only override
  or by exercising the real function against an unreachable DB, whichever
  proves simpler once written) shows the graph still resolves with the
  `draft`-produced `reponse` intact instead of rejecting, and `pnpm --filter
  @legirag/agent test`/`typecheck` pass.
- [x] **Step 4 - live re-verification and stop-criteria tuning** - rerun
  `pnpm --filter @legirag/agent fixed-chain` (all three smoke questions)
  confirming no regression from Steps 1-3; write the stop-criteria tuning
  decision into this spec's Live verification section using 9a/9b's
  recorded numbers; check off item 9's parent checkbox in `build-plan.md`.
  *Done when:* the live run matches 8d's last recorded results with zero
  behavior change, and the tuning decision is recorded either way (change
  or no change, with reasoning).

## Files / areas

- `packages/agent/src/graph.ts` - `try`/`catch` in `search`, `route`,
  `followRenvois`
- `packages/agent/src/graph.test.ts` - three new failure-injection tests
- `blueprint/build-plan.md` - item 9 parent checkbox

## Data / contracts

- No `AgentState` shape changes - all three fallbacks reuse existing state
  fields (`citations`, `codes`, `newCitationsFound`/`renvoiIterations`).
- No `@legirag/shared` or locked-contract changes.

## Testing

`pnpm test` (Vitest) gates all three new failure-injection tests, fully pure
(injected fake dependencies, same convention `graph.test.ts` already uses
for `emptyRetriever`/`modelNonAppele`/`routeurFactice` - no live call
needed to prove the catch-and-degrade behavior). Live re-verification
(Step 4) confirms zero regression on the real backends, matching 8d's
precedent for what needs a live check versus a unit test.

## Notes for the AI

- Match the existing `console.error` message convention in `draft`'s catch
  blocks (French, names the node and what happened) for the three new catch
  blocks.
- Don't add retry loops to `search`/`route`/`followRenvois` - single
  catch-and-degrade only, see the scope decision above.
- Don't touch `draft`'s own retry/abstain logic (8d) - unchanged.
- This is the last sub-feature of item 9 - once Step 4 is live-verified,
  item 9's parent checkbox in `build-plan.md` gets checked alongside 9c's
  own.

## Note: also broadened `search`'s try boundary to `fetchArticlesForCitation`

Step 1's spec text named `retriever.search` as the failure point, but the
same node also calls `fetchArticlesForCitation` right after (to fetch full
article text for any chunks found) - an equally DB-dependent call with the
identical safe fallback (treat as "no citations"). Wrapped both calls in one
`try` rather than adding a second, narrower one - same fallback, same node,
no reason for two catch blocks. Noted here since it's a small broadening of
the step's originally-scoped surface, not a silent deviation.

## Live verification result

**Pre-fix behavior confirmed, not just assumed:** before Steps 1-3, none of
`search`, `route`, `followRenvois` had a `try`/`catch` around their one
external call - a rejected promise from `retriever.search`, `routeQuestion`,
or `suivreRenvoi` would propagate straight out of the LangGraph node runner
with nothing to catch it, exactly the same failure shape 8d's own audit
(08d/F-01) already found and fixed for `draft`'s `generateObject` call. This
wasn't re-verified by literally reverting and re-running (redundant given
08d's precedent for the identical failure shape) - the reasoning transfers
directly: an uncaught node exception rejects `graph.invoke()`.

**Post-fix:** all three new `graph.test.ts` failure-injection tests pass -
each one calls `graph.invoke(...)` with a deliberately throwing dependency
and asserts the call *resolves* (not rejects) with the expected degraded
result:

- `search` failure -> `citations: []`, `confiance: 'abstention'`.
- `route` failure -> `search` receives `codes: undefined` (unfiltered), ends
  in abstention (the fake `search` used in that test returns no results).
- `followRenvois` failure -> `draft`'s already-built `reponse` (verdict,
  `regle_principale`) survives untouched, `renvoiIterations` still
  increments to 1 before the loop ends.

`pnpm test` (216/216), `pnpm typecheck` (8 packages), `pnpm lint` all green.

**Live re-verification (`pnpm --filter @legirag/agent fixed-chain`):** all
three smoke questions still produce the same shape of result as 8d's last
recorded run - known question -> confident, fully-cited answer; out-of-scope
question -> abstention with escalade; multi-code question -> routed to both
`code-de-la-route` and `code-penal`, one `followRenvois` pass, correct
citations. Zero behavior change from the hardening - expected, since none of
the three injected-failure paths trigger on a healthy backend.

## Stop-criteria tuning decision

Read together, 9a's and 9b's live numbers give real evidence, not a guess:

- `MAX_DRAFT_ATTEMPTS = 2` - no run in either 9a's or 9b's 15-question pass
  logged a retry warning (`draft : index de citation invalide` / `draft :
  generateObject a échoué`); every question resolved on its first
  `generateObject` attempt. The bound was never approached, let alone hit.
- `MAX_RENVOI_ITERATIONS = 2` - reached exactly once (q-014, `fausse_premisse`,
  2 iterations) and terminated cleanly via `afterFollowRenvois`'s own
  "nothing new found" check, not by the bound cutting off a search still in
  progress. The two `renvoi_obligatoire` questions needed only 1 iteration
  each and reached 100% coverage well inside the bound.

**Decision: no change to either constant.** Both bounds are comfortably
sized for the current 15-question set and 5-code demo corpus - there's no
observed case of a bound truncating a search that needed more room, and no
observed case of wasted iterations either. Revisit only if a larger
evaluation set (item 9's own future growth) or a bigger corpus (item 10's
historical versions, more cross-reference depth) produces a case that
actually hits a bound and gets a worse answer because of it - tuning without
that evidence would be guessing.

Item 9 (Agent quality evaluation) is now fully built: 9a-9c all complete.
Checked off in `build-plan.md` alongside 9c's own sub-checkbox.

## Findings

`/audit` reviewed the whole `feature/09c-failure-injection-tuning` branch
(all of 9a-9c) after this feature closed. One finding, fixed and
re-reviewed. ID prefixed `09c/` per the ledger's archiving convention.

### 09c/F-01 [P2] closed - Cost/turns aggregation math in run-agent-harness.ts has no test coverage

**File:** packages/eval/src/run-agent-harness.ts:23-39
**Found:** 2026-08-17 by /audit (scope: branch feature/09c-failure-injection-tuning vs main - item 9, 9a-9c)
**Why it matters:** `mean` and `aggregateCost` are pure aggregation logic
(average LLM calls/tokens per category) - exactly the class of code
`coding-standards.md`'s testing gate calls out ("pure logic where a wrong
answer is possible"). Every other piece of aggregation math added across
9a/9b (`scoreRouting`, `scoreAbstention`, `aggregateAgentResults`,
`scoreCrossRefCoverage`, `codesForArticles`) lives in a tested module; these
two functions were left inline in the script instead and have zero unit
tests. A bug here would silently misreport the turns/cost numbers item 9
exists to produce, with no test to catch it.
**Resolution:** Fixed 2026-08-17 - extracted to `packages/eval/src/
cost-metrics.ts` (`mean`, `aggregateCost`, `CostRow`, `CategoryCostMetrics`),
unit tested (`cost-metrics.test.ts`: mean of several values, empty-array
zero, single value, per-category aggregation, empty-rows case).
`run-agent-harness.ts` now imports both instead of defining local copies.
`pnpm test` (221/221), `pnpm typecheck` (8 packages), `pnpm lint` all green;
live re-run reproduces the same per-category numbers as before the
refactor. Closed 2026-08-17 - re-audit re-read `cost-metrics.ts`, its
tests, and the updated `run-agent-harness.ts` fresh: the extraction is
clean, no duplication left behind, no new defect introduced by the fix.

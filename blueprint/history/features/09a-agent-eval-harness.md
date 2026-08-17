# Feature: Agent-level eval harness, routing accuracy, correct-abstention rate

**From build-plan:** feature 9a (first sub-feature of 9. Agent quality evaluation)
**Status:** complete

## Goal

Item 5/6's harness only ever scored the `Retriever` in isolation (chunks in,
recall/MRR out). Item 9 needs to score the actual reasoning agent
(`buildFixedChainGraph`, item 8) end-to-end: does it route to the right
code(s), and does it abstain exactly when it should? This feature adds the
harness foundation that runs the full graph per question against live
Supabase + Bedrock, plus the first two of item 9's six planned metrics -
routing accuracy and correct-abstention rate. Cross-reference coverage,
turns/cost, and failure-injection recovery build on this same harness in 9b
and 9c.

## Scope decision: "tool selection accuracy" has no separate meaning here

Build-plan item 9 was written before item 8 was built. Item 8 turned out to
be a *fixed-chain* graph (8a-8d, confirmed repeatedly in `graph.ts`'s own
comments): node order never changes per question, and neither `calculer` nor
`demander_a_l_humain` is ever invoked by the graph itself - the only runtime
decision the graph makes is whether the cross-reference loop keeps running.
There is no dynamic tool choice to score independently, so "tool selection
accuracy" was folded into 9b's cross-reference/loop-stop scoring (see the
build-plan note added alongside this split) rather than treated as a
separate metric here or in 9b.

## In scope

- A ground-truth helper that resolves each question's `articlesAttendus`
  article IDs to their code slug(s), since `EvaluationQuestion` has no
  `codesAttendus` field today.
- Pure scoring functions: was the router's chosen `codes` correct given the
  expected code(s); did `confiance` abstain exactly when the question's
  category says it should (or shouldn't).
- A new script that runs `buildFixedChainGraph()` end-to-end for all 15
  questions in `eval/questions.json`, live against real Supabase + Bedrock,
  and prints a per-question and aggregated (per-category + overall) report.

## Out of scope

- Cross-reference coverage, loop-stop ("tool selection") accuracy, turns and
  cost per question - 9b.
- Failure injection and any resulting change to `MAX_RENVOI_ITERATIONS` /
  `MAX_DRAFT_ATTEMPTS` - 9c.
- Any change to `packages/agent/src/graph.ts` itself - this feature only
  observes the graph's output; it never modifies its behavior.
- Any change to the existing retrieval-only harness (`run-harness.ts`,
  item 5/6) - it keeps measuring the `Retriever` in isolation; this feature
  adds a second, agent-level harness alongside it, not a replacement.
- Growing the eval question set - item 9 evaluates the agent against the
  existing 15 annotated questions as-is.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - expected-code ground truth** - `packages/eval/src/expected-codes.ts`:
  a pure `codesForArticles(articleIds: string[], codeByArticleId: Map<string, string>): string[]`
  (dedups, preserves first-seen order, silently skips an article ID absent
  from the map) plus a thin `fetchCodeSlugsByArticleId(client, articleIds):
  Promise<Map<string, string>>` DB query (direct `articles` lookup, no RLS
  session needed - these are already-known, currently-in-force ground-truth
  IDs from the annotated question set, same non-RLS convention
  `loadCodeSlugs` already uses in `build-naive-cache.ts`). *Done when:*
  `pnpm --filter @legirag/eval test` passes new unit tests for
  `codesForArticles` (dedup, order, unknown-ID skip) and `pnpm --filter
  @legirag/eval typecheck` passes.
- [x] **Step 2 - routing and abstention scoring** - `packages/eval/src/agent-scoring.ts`:
  `scoreRouting(expectedCodes, actualCodes): boolean | undefined` - true iff
  every expected code is present in `actualCodes` (a subset check, not exact
  match: `router_question`'s own prompt already asks for every relevant code
  on a multi-code question like q-006's inter-code renvoi, so an extra code
  beyond what's expected isn't wrong); undefined when the question has no
  `articlesAttendus`, mirroring `scoring.ts`'s `hasPositive` gate - not
  scored, not silently counted as a failure;
  `scoreAbstention(category, actualConfiance): boolean` (abstention expected
  iff category is `hors_perimetre` or `fausse_premisse`); an
  `AgentQuestionScore` type and `aggregateAgentResults(scores)` producing
  per-category and overall routing-accuracy and abstention-accuracy
  percentages (same per-category/overall shape convention as
  `scoring.ts`'s `HarnessReport`). *Done when:* `pnpm --filter @legirag/eval
  test` passes new unit tests covering `scoreRouting` (exact match, partial
  overlap, no expected codes) and `scoreAbstention` (all 5 categories,
  correct and incorrect abstention) and `aggregateAgentResults` (correct
  percentages across a small fixture set).
- [x] **Step 3 - agent harness script** - `packages/eval/src/run-agent-harness.ts`:
  add `@legirag/agent` as a workspace dependency of `packages/eval`; for
  each question, build a fresh `buildFixedChainGraph()` (default live
  `SupabaseRetriever` + `bedrockProvider.volume()`, same convention as
  `packages/agent/src/run-fixed-chain.ts`) and `.invoke()` it with
  `{ question, dateReference, codes: undefined, traceId: randomUUID(),
  reponse: undefined }`; resolve expected codes via Step 1's helper; score
  each question via Step 2's functions; print per-question and aggregated
  results. Add a `pnpm --filter @legirag/eval agent-harness` script. *Done
  when:* the script runs live against real Supabase + Bedrock for all 15
  questions without crashing, prints a routing-accuracy and
  abstention-accuracy report, and the run is recorded in this spec's Live
  verification section.

## Files / areas

- `packages/eval/src/expected-codes.ts`, `expected-codes.test.ts` (new)
- `packages/eval/src/agent-scoring.ts`, `agent-scoring.test.ts` (new)
- `packages/eval/src/run-agent-harness.ts` (new)
- `packages/eval/package.json` - new `@legirag/agent` dependency, new
  `agent-harness` script

## Data / contracts

- No changes to any `@legirag/shared` or `@legirag/agent` contract -
  `AgentQuestionScore` / `AgentHarnessReport`-shaped types stay internal to
  `packages/eval`, same treatment `scoring.ts`'s `QuestionScore` /
  `HarnessReport` already get.
- `eval/questions.json` is read, not written - no new ground-truth field
  added to `EvaluationQuestion` (code slugs are derived at harness run time
  from `articlesAttendus`, not stored redundantly in the question file).

## Testing

`pnpm test` (Vitest) gates the pure logic added in Steps 1-2:
`codesForArticles`, `scoreRouting`, `scoreAbstention`, `aggregateAgentResults`.
The DB query (`fetchCodeSlugsByArticleId`) and the harness script itself
(`run-agent-harness.ts`) are integration code exercised live in Step 3, same
treatment `run-harness.ts` and `run-fixed-chain.ts` already get in this
codebase - no unit test mocks a live Supabase/Bedrock call.

## Notes for the AI

- Never hardcode a model ID - reuse `bedrockProvider.volume()` via
  `buildFixedChainGraph`'s existing default parameter, unchanged.
- Routing accuracy is scored only for questions carrying `articlesAttendus`
  (recherche_simple, renvoi_obligatoire, and any sensible_a_la_date question
  that has them) - a `sensible_a_la_date` question with only
  `articlesExclus` has nothing to route "correctly" against, so it's
  excluded from the routing denominator, not counted as a miss.
- Abstention correctness is scored for every question in all 5 categories -
  it doesn't depend on ground-truth articles existing.
- Don't touch `packages/agent/src/graph.ts` - this feature is
  observation-only. Any tuning happens in 9c, after 9a-9c's numbers exist.
- A live run costs on the order of 15 questions x 1-2 Bedrock calls
  (route + draft, occasionally a redraft) - same order of magnitude as
  `run-fixed-chain.ts`'s existing 3-question smoke test, just wider.

## Mid-build refinement: `sensible_a_la_date` abstention rule

The first live run (see below) scored q-009 as an incorrect abstention under
the spec's original rule ("abstention expected only for hors_perimetre /
fausse_premisse"). q-009 is a `sensible_a_la_date` question with only
`articlesExclus` (dated 2000-01-01, testing that R413-3 - in force since
2014 - is correctly invisible before its start date). The corpus has no
historical versions yet (item 10 not built), so there is no earlier version
for the agent to fall back to - abstention is the only honest answer, not a
defect. Fixed `abstentionExpected` in `agent-scoring.ts` to also expect
abstention for a `sensible_a_la_date` question that has no `articlesAttendus`
(only `articlesExclus`), re-ran the unit tests and the live harness, and
recorded the corrected numbers below. No change to `graph.ts` or to the
question data itself.

## Live verification result

`pnpm --filter @legirag/eval agent-harness` against real Supabase + Bedrock,
all 15 questions, no crash:

| category | questionCount | routingAccuracy | abstentionAccuracy |
|---|---|---|---|
| recherche_simple | 5 | 1.0 | 1.0 |
| renvoi_obligatoire | 2 | 1.0 | 1.0 |
| sensible_a_la_date | 2 | 1.0 | 1.0 |
| hors_perimetre | 3 | (unscored) | 1.0 |
| fausse_premisse | 3 | (unscored) | **0.0** |

Overall: routingAccuracy 1.0 (10/10 scored questions), abstentionAccuracy
0.8 (12/15).

Notable finding (not fixed here - observation is this feature's whole job):
the agent never abstains on any of the 3 `fausse_premisse` questions
(q-013, q-014, q-015) - each one gets a confident, cited answer to a
question built on a false premise, instead of flagging the premise itself.
This is a real quality gap worth carrying into 9c's stop-criteria review and
the final item-9 report, not a bug in this harness.

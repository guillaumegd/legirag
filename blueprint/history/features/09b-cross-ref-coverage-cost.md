# Feature: Cross-reference coverage, turns, and cost per question

**From build-plan:** feature 9b (second sub-feature of 9. Agent quality evaluation)
**Status:** complete

## Goal

Extends 9a's agent-level harness with two more of item 9's planned metrics:
whether `followRenvois` actually pulls in the supplementary article(s) a
`renvoi_obligatoire` question needs (cross-reference coverage), and how many
LLM calls / tokens each question costs (turns and cost per question). Unlike
9a, this touches production code (`packages/agent/src/graph.ts`,
`state.ts`) - not to change behavior, only to expose counters the graph
already has the information for but doesn't currently record.

## Scope decision: router call excluded from token cost

`routerQuestion` (`router-question.ts`) returns `RouterQuestionOutput` - a
**locked** contract (cahier des charges technique §5.3), reused as-is by the
MCP `router_question` tool. Adding a `usage` field to it (even an optional
one) to thread the router's own token cost back to the harness isn't worth
touching a locked, externally-consumed contract for. The router's prompt is
a short list of code slugs; `draft`'s prompt carries full retrieved article
texts and its completion is the entire structured response - the dominant
cost by a wide margin. "Cost per question" in this feature's report is
`draft`'s token usage only (all attempts, including a failed/retried one
where the SDK still reports `usage`), explicitly excluding the router call.
"Turns" (LLM call count) doesn't have this gap: `routerQuestion` never
retries internally, so it's always exactly one call - the harness adds a
constant `+1` for it without needing the router to report anything.

## In scope

- `AgentState` (`state.ts`) gains `draftAttempts: number` and
  `tokenUsage: TokenUsage | undefined` (`TokenUsage = { promptTokens:
  number; completionTokens: number }`, new exported type).
- `draft` (`graph.ts`) accumulates both across every `generateObject`
  attempt it makes in a single node invocation, including a caught
  `NoObjectGeneratedError` (the AI SDK error 8d's own audit already found
  this code path handles - it carries a `usage` field when available).
  Pure exported helper `addUsage(a, b)` for the accumulation, unit tested.
- `packages/eval/src/cross-ref-coverage.ts`: pure
  `scoreCrossRefCoverage(articlesAttendus, finalCitations): number`
  (fraction of expected article IDs present in the final citation pool),
  unit tested.
- `run-agent-harness.ts` (9a) extended to report, per question: `llmCalls`
  (`1 + result.draftAttempts`), `tokenUsage`, `renvoiIterations`, and - for
  `renvoi_obligatoire` questions only - cross-reference coverage. Aggregated
  report gains average turns/tokens per category and overall, plus the
  per-question coverage list.

## Out of scope

- The router's own token cost (see scope decision above).
- Failure injection, recovery, and any change to `MAX_RENVOI_ITERATIONS` /
  `MAX_DRAFT_ATTEMPTS` - 9c.
- A separate pass/fail "loop-stop accuracy" metric for categories that don't
  need cross-referencing (recherche_simple, sensible_a_la_date,
  hors_perimetre, fausse_premisse) - there's no ground truth for "the loop
  should not have run" (a pass that finds nothing new is allowed by
  `afterFollowRenvois` and isn't wrong), so only `renvoi_obligatoire`
  coverage is scored; `renvoiIterations` is still reported for every
  question for visibility, not judged.
- Any change to `draft`'s retry *behavior* - only observing it (8d/F-05, the
  audit lead about retry prompts carrying no rejection feedback, stays
  unresolved; this feature doesn't touch the prompt).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - instrument `draft` for attempts and token usage** -
  `packages/agent/src/state.ts`: export `TokenUsage` type, add
  `draftAttempts: Annotation<number>()` and `tokenUsage:
  Annotation<TokenUsage | undefined>()` to `AgentStateAnnotation`.
  `packages/agent/src/graph.ts`: exported pure `addUsage(a: TokenUsage |
  undefined, b: TokenUsage | undefined): TokenUsage`; `draft` captures
  `usage` from every `generateObject` call (success) and from a caught
  `NoObjectGeneratedError`'s own `usage` field (via
  `NoObjectGeneratedError.isInstance`, imported from `ai`) when present,
  accumulating into `draftAttempts`/`tokenUsage` starting from
  `state.draftAttempts ?? 0` / `state.tokenUsage`, and returns both in every
  branch (success, retry-then-fallback, retry-then-abstain). *Done when:*
  `pnpm --filter @legirag/agent test` passes new unit tests for `addUsage`
  (both defined, one undefined, both undefined) and `pnpm --filter
  @legirag/agent typecheck` passes.
- [x] **Step 2 - cross-reference coverage scoring** -
  `packages/eval/src/cross-ref-coverage.ts`: `scoreCrossRefCoverage(
  articlesAttendus: string[], citations: Citation[]): number`. *Done when:*
  `pnpm --filter @legirag/eval test` passes new unit tests (full coverage,
  partial coverage, zero coverage, empty `articlesAttendus`).
- [x] **Step 3 - report turns, cost, and coverage** -
  `run-agent-harness.ts`: log `llmCalls`, `tokenUsage`, `renvoiIterations`
  per question, and coverage for `renvoi_obligatoire` questions; aggregate
  report gains mean `llmCalls`/`tokenUsage` per category and overall, plus
  the coverage list. *Done when:* the script runs live against real
  Supabase + Bedrock for all 15 questions without crashing, the two
  `renvoi_obligatoire` questions (q-006, q-007) show their coverage score,
  and the run is recorded in this spec's Live verification section.

## Files / areas

- `packages/agent/src/state.ts` - `TokenUsage` type, two new state fields
- `packages/agent/src/graph.ts` - `addUsage`, `draft` instrumentation
- `packages/agent/src/graph.test.ts` - new unit tests for `addUsage`
- `packages/eval/src/cross-ref-coverage.ts`, `cross-ref-coverage.test.ts` (new)
- `packages/eval/src/run-agent-harness.ts` - extended reporting

## Data / contracts

- `AgentState` gains two fields - still internal to `packages/agent`, not a
  cross-package contract (same status as `citations`/`renvoiIterations`
  already have).
- `RouterQuestionOutput` (`@legirag/agent`, locked per cahier des charges
  technique §5.3) is untouched - see the scope decision above.
- No `@legirag/shared` schema changes.

## Testing

`pnpm test` (Vitest) gates the pure logic: `addUsage`
(`packages/agent`), `scoreCrossRefCoverage` (`packages/eval`). The
instrumented `draft` node's live token/attempt counts and the harness script
itself are integration code, verified live in Step 3 - same treatment 9a's
`run-agent-harness.ts` and 8a-8d's `run-fixed-chain.ts` already get.

## Notes for the AI

- Don't touch `router-question.ts` or `RouterQuestionOutput` - locked
  contract, see the scope decision above.
- `addUsage` must treat `undefined` on either side as "nothing to add yet",
  not throw - the very first `draft` attempt starts from
  `state.tokenUsage === undefined`.
- Import `NoObjectGeneratedError` from `ai` (already a dependency of
  `packages/agent`) to type-narrow the catch block before reading
  `error.usage` - don't assume every caught error has a `usage` field.
- Don't change `MAX_RENVOI_ITERATIONS` / `MAX_DRAFT_ATTEMPTS` or any control
  flow in `draft`/`followRenvois` - this feature only adds return-value
  bookkeeping to existing branches.
- Cross-reference coverage is scored only for `renvoi_obligatoire`
  questions - `recherche_simple` questions have a single expected article by
  construction, so "coverage" there is redundant with 9a's routing/citation
  presence, not a new signal.

## Live verification result

`pnpm --filter @legirag/eval agent-harness` against real Supabase + Bedrock,
all 15 questions, no crash. `pnpm test` (213/213), `pnpm typecheck` (8
packages), `pnpm lint` all green.

Cross-reference coverage - both `renvoi_obligatoire` questions at 1.0:
`followRenvois` successfully pulled in every expected supplementary article
(q-006: code-de-la-route -> code-penal; q-007 similarly) - the mechanism
this metric exists to check is working.

Turns and cost (mean per category):

| category | questionCount | llmCalls | promptTokens | completionTokens |
|---|---|---|---|---|
| recherche_simple | 5 | 2.4 | 9192.8 | 512 |
| renvoi_obligatoire | 2 | 3.0 | 7465.5 | 722.5 |
| sensible_a_la_date | 2 | 1.5 | 1375.5 | 163.5 |
| hors_perimetre | 3 | 1.67 | 1949.7 | 252.7 |
| fausse_premisse | 3 | 2.33 | 4571.3 | 477.0 |

Overall: 2.2 LLM calls, ~5547 prompt tokens, ~435 completion tokens per
question. `renvoi_obligatoire` costs the most turns (3, expected - it's the
only category that always needs a `followRenvois` redraft pass).
`recherche_simple`'s prompt-token average is inflated by q-005 (impôt sur le
revenu, code général des impôts) pulling in a much longer article than the
other four - a single-question outlier, not a per-category pattern with only
5 samples.

One data point worth carrying forward, not fixed here: q-009 (0 citations
found, correct abstention) shows `llmCalls=1, tokens=0/0` - confirms the
"no citations -> abstain without calling the model" branch never reaches
`generateObject`, exactly as `graph.ts` intends.

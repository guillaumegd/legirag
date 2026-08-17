# Feature: Per-tool and per-model-call tracing (cost, latency)

**From build-plan:** feature 12a (first sub-item of 12, "Observability and
infrastructure automation")
**Status:** complete

## Goal

Today's execution trace (11b) records one summary per graph-node execution
(route/search/draft/followRenvois) with a wall-clock `durationMs` guessed
from the delta between LangGraph stream events. It cannot show *which*
individual model or tool call inside a node was slow or expensive - most
visibly, `draft` can silently retry `generateObject` up to twice
(`MAX_DRAFT_ATTEMPTS`) and today only the final attempt's outcome is
visible; the failed attempts and their cost disappear. This feature breaks
each node's trace step down into the individual model/tool calls it made,
each with its own duration and (for model calls) token usage, so the
agent-trace screen (item 13) and `GET /trace/:trace_id` can show real
per-call cost and latency instead of a per-node guess.

## In scope

- A `calls` breakdown on each `ExecutionTraceStep`: one entry per individual
  model call (`route`'s `routeQuestion` call, each `draft` `generateObject`
  attempt including failed ones) and per tool/DB call (`search`'s
  `retriever.search` + `fetchArticlesForCitation`, `followRenvois`'s
  `suivreRenvoiFn` + `fetchArticlesForCitation`), each with its own
  `durationMs` and, for model calls, token usage.
- Recording the router's own token usage for tracing purposes (see decision
  below - this does not change the `MAX_DAILY_TOKENS` cost cap itself).
- Updating `buildExecutionTrace` to attach each node's calls to its step.

## Out of scope

- Converting token counts to a dollar figure. This codebase's cost
  convention is token-based (`cost-guard.service.ts`'s `MAX_DAILY_TOKENS`),
  and no per-model $ pricing table exists. Stays token-based here too.
- Changing `CostGuardService`/`DailyTokenBudget`'s daily budget math - it
  keeps using the final aggregate `state.tokenUsage`, unaffected by this
  feature.
- The agent-trace UI screen itself (item 13) - this only makes the data
  available via the existing `GET /trace/:trace_id` endpoint.
- 12b/12c/12d (CI regression gate, event-driven reindexing, Terraform).

## Decision: router usage now counted for tracing

9b deliberately excluded the router's token usage from `state.tokenUsage`
("draft carries the bulk of the cost, excluding the router doesn't
meaningfully skew the total"). That decision was about the **cost cap**,
which this feature leaves untouched. But "per-model-call tracing" (this
item's own wording) is a different concern from cost-capping - a trace that
silently omits one of only two model calls in the chain would misrepresent
the run to anyone reading it. So `route`'s call gets its own `calls` entry
with its own token usage here, recorded only in the new `calls` array, never
folded into `state.tokenUsage` or the daily budget.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Lock the `calls` contract** - extend `ExecutionTraceStep`
  in `packages/shared/src/schema.ts` with an optional `calls` array
  (`kind: 'model' | 'tool'`, `name: string`, `durationMs`, optional
  `tokenUsage` for `kind: 'model'` entries). Optional/absent-safe so
  existing persisted traces without it still parse. *Done when:* the schema
  compiles, a new test in `schema.test.ts` confirms both an
  `ExecutionTrace` payload with `calls` and one without it (today's shape)
  parse successfully.
- [x] **Step 2 - Instrument `route` and `draft`** - wrap the `routeQuestion`
  call in `route` and each `generateObject` attempt in `draft`
  (`packages/agent/src/graph.ts`) with timing, and have each node return
  `calls: [...(state.calls ?? []), ...thisNode'sNewCalls]` - accumulated
  across the run, same manual-merge pattern already used for `citations`
  and `tokenUsage` in this graph (nodes aren't individually unit-testable
  here - `route`/`search`/`draft`/`followRenvois` are closures private to
  `buildFixedChainGraph`, only reachable via a full `graph.invoke(...)`, per
  the existing tests in `graph.test.ts` - so the final invoked state must
  carry the complete list, not just the last node's delta). Add the
  matching `calls` field to `AgentStateAnnotation` (`state.ts`) so the
  return type checks. *Done when:* invoking the graph end-to-end shows
  `state.calls` containing one entry for `route` (with the router's own
  token usage) followed by two entries for `draft` when the first
  `generateObject` attempt returns an invalid citation index and the second
  succeeds.
- [x] **Step 3 - Instrument `search` and `followRenvois`** - same
  accumulating pattern for `retriever.search`/`fetchArticlesForCitation`
  (`search`) and `suivreRenvoiFn`/`fetchArticlesForCitation`
  (`followRenvois`), each as its own timed `kind: 'tool'` entry (no token
  usage). *Done when:* invoking the graph end-to-end for a normal run and
  for the zero-results/zero-renvois branches shows the expected number and
  names of entries appended to `state.calls`.
- [x] **Step 4 - Wire `calls` into `buildExecutionTrace`** - each
  `TraceEvent.partialState.calls` (in
  `packages/api/src/question/build-execution-trace.ts`) now holds the *full*
  accumulated list up to that point (same accumulation as Steps 2-3), so
  attribute only the newly-added slice to each step the same way
  `durationMs` already tracks a running `previousTimestampMs` - track a
  running `previousCallsCount` and slice from there. *Done when:* a unit
  test confirms a built `ExecutionTrace`'s steps each carry only their own
  new `calls` (not the ones already attributed to an earlier step) for a
  multi-node run, and the existing `POST /question` -> `GET
  /trace/:trace_id` flow still round-trips (existing 11a/11b tests stay
  green).

## Files / areas

- `packages/shared/src/schema.ts` - `ExecutionTraceStep`/`ExecutionTrace`.
- `packages/agent/src/state.ts` - `AgentStateAnnotation`.
- `packages/agent/src/graph.ts` - `route`, `draft`, `search`, `followRenvois`.
- `packages/api/src/question/build-execution-trace.ts`.
- No changes expected to `stream-question.ts` (it already forwards each
  node's full `partialState`, `calls` included, into `TraceEvent`), the
  `traces` table/migration (jsonb `steps` column already stores whatever
  shape `ExecutionTrace` produces), or `CostGuardService`.

## Data / contracts

- `ExecutionTraceStep.calls?: { kind: 'model' | 'tool'; name: string;
  durationMs: number; tokenUsage?: { promptTokens: number; completionTokens:
  number } }[]` - new, optional (backward compatible with traces persisted
  before this feature). Consumed later by item 13's agent-trace screen.
- No change to `ReponseStructuree`, `Citation`, or any other locked contract.

## Testing

- `pnpm test` (Vitest) gate applies throughout - every step above is pure
  logic (schema validation, node functions, trace building) with real edge
  cases (retry-then-succeed, zero-results branch, missing `calls` on old
  data) and ships its test in the same step, following the existing
  patterns in `graph.test.ts`/`build-execution-trace.test.ts`/`schema.test.ts`.
- No new integration/UI surface - nothing here needs browser or build
  evidence beyond the existing `POST /question`/`GET /trace/:trace_id` tests
  staying green.

## Notes for the AI

- **Corrected during implementation (was written the other way in the
  original draft):** `calls` accumulates on `AgentState`, exactly like
  `citations`/`tokenUsage` - not a per-node-execution-only delta. The
  reason: `route`/`search`/`draft`/`followRenvois` are closures private to
  `buildFixedChainGraph`, unreachable except via a full `graph.invoke(...)`
  (confirmed against `graph.test.ts`'s existing patterns), so a delta-only
  design would be untestable without switching to stream-based tests. The
  accumulation duplicates a small array across a few `updates` events in
  memory for the duration of one request - the same cost `citations`
  already pays - which is negligible.
- `NoObjectGeneratedError`'s recovered `usage` (already handled for
  `state.tokenUsage` in `draft`'s catch block) must also produce its own
  `calls` entry - a failed attempt with usage is exactly the kind of call
  this feature exists to stop hiding.
- Keep English keys for the new fields (`durationMs`, `tokenUsage`, `kind`,
  `name`), matching the existing `ExecutionTraceStep` shape - French stays
  for actual domain vocabulary (`etat`, `regle_principale`, ...), not
  generic tracing plumbing.
- Don't touch `MAX_DAILY_TOKENS`/`CostGuardService` - router usage recorded
  here is for the trace only, per the "Decision" section above.

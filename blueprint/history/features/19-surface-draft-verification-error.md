# Feature: Surface the real error behind the generic verification-failure abstention

**From build-plan:** feature 19
**Status:** built, pending review/complete
**GitHub issue:** [#20](https://github.com/guillaumegd/legirag/issues/20)

## Goal

Today, when `packages/agent/src/graph.ts`'s `route`, `search`, `draft`, or
`followRenvois` nodes hit a failure (bad credentials, Bedrock throttling, a DB
outage, or a genuine citation-verification failure), the node degrades
gracefully and the real error is only ever written to `console.error` - never
recorded on the `AgentCall`/`ExecutionTrace` record that gets persisted to the
`traces` table and served by `GET /trace/:traceId`. A failure like item 16's
(invalid Bedrock credentials, indistinguishable from throttling or an actual
"no source matches" verdict) is diagnosable today only through an ad hoc
CloudWatch log dig. This feature records the error's type and message (never
the full stack) on the specific `AgentCall` that failed, threads it through
the `ExecutionTrace` schema so it survives persistence and read-back, and
renders it in the existing agent-trace view so an advanced user (or the
developer) can see exactly what went wrong from the trace alone.

## In scope

- A small, testable `serializeError` helper in `packages/agent` that turns a
  caught `unknown` into a safe `{ name, message }` shape.
- An optional `error` field on `AgentCall` (`packages/agent/src/state.ts`),
  populated at every point in `graph.ts` where a node currently only
  `console.error`s and degrades: `route`'s `routeQuestion` failure, `search`'s
  retriever/DB failure, `draft`'s `generateObject` failure, `draft`'s
  "citation index invalid" branch (a genuine verification failure, not a
  caught exception, but one of the three cases the build-plan item calls out
  as currently indistinguishable), and `followRenvois`'s `suivreRenvoi`
  failure.
- Two of these paths (`search`, `followRenvois`) currently append no
  `AgentCall` at all on failure - they must start appending one so the error
  has somewhere to live.
- Mirroring the `error` field on `ExecutionTraceCall`
  (`packages/shared/src/schema.ts`) so it round-trips through
  `buildExecutionTrace` -> `persistTrace` -> `fetchTrace` -> `GET
  /trace/:traceId` without being stripped by the re-validating `.parse()` on
  either side.
- Rendering `call.error` in `packages/web/src/components/trace-timeline.tsx`,
  visually distinct (the `--trace-fail` CSS variable already exists in
  `globals.css`, defined but currently unused - this is exactly what it was
  for).

## Out of scope

- Changing any node's degrade-and-continue behavior (still abstain / degrade
  gracefully - only the diagnostic record changes, not the control flow).
- Alerting, automatic retries beyond the existing `MAX_DRAFT_ATTEMPTS`, or any
  new monitoring/paging on top of the trace record.
- Recording the full stack trace (explicitly excluded by the build-plan item -
  type/message only).
- A dedicated "failed traces" list/search UI - `GET /trace/:traceId` and the
  existing trace view are the only surfaces touched.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `ErrorInfo` type and `serializeError` helper** - add
  `ErrorInfo { name: string; message: string }` and an optional `error?:
  ErrorInfo` field to `AgentCall` in `packages/agent/src/state.ts`; add an
  exported `serializeError(error: unknown): ErrorInfo` helper in
  `packages/agent/src/graph.ts` (next to the other small exported pure
  helpers like `citationsIndicesValides`) that reads `.name`/`.message` off an
  `Error` instance and falls back to `{ name: 'UnknownError', message:
  String(error) }` otherwise. *Done when:* a new unit test in
  `packages/agent/src/graph.test.ts` covers both branches (real `Error`,
  non-`Error` thrown value) and `pnpm --filter @legirag/agent test` passes.
- [x] **Step 2 - wire `serializeError` into `route` and `draft`'s existing
  `AgentCall` appends** (the two nodes item 16 was actually caught failing in)
  - `route`'s catch: add `error: serializeError(error)` to the `AgentCall` it
    already appends.
  - `draft`'s `generateObject` catch: add `error: serializeError(error)` to
    the per-attempt `AgentCall` it already appends.
  - `draft`'s citation-index-invalid branch (no exception thrown): attach a
    manually-built `ErrorInfo` (e.g. `{ name: 'IndexDeCitationInvalide',
    message: ... }`) to that attempt's `AgentCall` instead of only
    `console.error`-ing, so it's distinguishable in the trace from a genuine
    `generateObject` failure.
  *Done when:* `graph.test.ts` asserts, for both the `route` failure and the
  `draft`/`generateObject` failure cases, that the resulting `AgentCall`
  carries the expected `error`, and `pnpm --filter @legirag/agent test`
  passes.
- [x] **Step 3 - `search` and `followRenvois` start recording a failed call**
  - `search`'s catch: today it appends no `AgentCall` at all on failure -
    start appending one (`kind: 'tool', name: 'search'`, timed from the top
    of the function) carrying `serializeError(error)`.
  - `followRenvois`'s catch: same gap - start appending an `AgentCall`
    (`kind: 'tool', name: 'followRenvois'`) carrying the error.
  *Done when:* `graph.test.ts` asserts that a `search` failure and a
  `followRenvois` failure each now produce an `AgentCall` with the expected
  `error`, and `pnpm --filter @legirag/agent test` passes.
- [x] **Step 4 - thread `error` through `ExecutionTraceCall`** - add the
  matching optional `error: z.object({ name: z.string().min(1), message:
  z.string().min(1) }).optional()` field to `ExecutionTraceCall` in
  `packages/shared/src/schema.ts`. *Done when:* a case in
  `packages/api/src/question/build-execution-trace.test.ts` feeds an
  `AgentCall` with an `error` through `buildExecutionTrace` and asserts the
  resulting `ExecutionTrace` still carries it (proving the zod schema doesn't
  strip it), and `pnpm --filter @legirag/shared test && pnpm --filter
  @legirag/api test` pass.
- [x] **Step 5 - render the error in the trace view** - in
  `packages/web/src/components/trace-timeline.tsx`, when `call.error` is
  present, render its `message` distinctly (using the existing but currently
  unused `--trace-fail` variable from `globals.css`) instead of the normal
  call row styling. *Done when:* `pnpm build` succeeds and a screenshot of the
  trace panel, given a trace step whose `calls` include an `error`, shows the
  message rendered in the error style (force one locally, e.g. a temporarily
  broken model/env var, or a crafted trace fixture through the dev server).

## Files / areas

- `packages/agent/src/state.ts` - `AgentCall.error` / `ErrorInfo` type
- `packages/agent/src/graph.ts` - `serializeError` helper, wiring in
  route/search/draft/followRenvois
- `packages/agent/src/graph.test.ts` - new/extended unit tests
- `packages/shared/src/schema.ts` - `ExecutionTraceCall.error`
- `packages/api/src/question/build-execution-trace.test.ts` - round-trip
  assertion
- `packages/web/src/components/trace-timeline.tsx` - error rendering
- `packages/web/src/app/trace/trace.css` - error styling (reuses
  `--trace-fail`, already defined in `globals.css`)

## Data / contracts

- `ErrorInfo { name: string; message: string }` - new, load-bearing across
  `packages/agent` and `packages/shared` (mirrored, not shared as a single
  type, matching the existing `AgentCall`/`ExecutionTraceCall` split).
- `AgentCall.error?: ErrorInfo` (`packages/agent/src/state.ts`)
- `ExecutionTraceCall.error?: { name: string; message: string }`
  (`packages/shared/src/schema.ts`) - additive, optional field; no migration
  needed since `traces.steps` is `jsonb`.

## Testing

`pnpm test` (Vitest) is configured and the gate is on for logic-bearing steps
(`AGENTS.md` Commands). Steps 1-3 are pure logic (a serializer, node-level
state transitions, a zod schema round-trip) and each ships a test in the same
diff, per the plan above. Step 4 is a UI rendering change with no existing
component-test setup for `trace-timeline.tsx` - it rides on `pnpm build` and a
screenshot per the project's UI/integration testing exemption.

## Notes for the AI

- Keep the control flow identical - every node still degrades to the same
  abstention/undefined-codes/empty-citations behavior it does today. Only add
  the `error` field; don't change what gets returned otherwise.
- `error.message` must stay a short message, not the stack - don't pass
  `error.stack` anywhere in this feature.
- `ExecutionTrace.parse()` runs on both write (`buildExecutionTrace`) and
  read-back (`fetchTrace` in `packages/retrieval/src/traces.ts`) - the schema
  change in Step 3 is what keeps `error` from being silently dropped on
  either side; don't skip re-checking the read path.
- Match the existing helper style in `graph.ts` (small exported pure
  functions like `citationsIndicesValides`, `appendCall`) rather than
  inlining the serialization logic at each call site.

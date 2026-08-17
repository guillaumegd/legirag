# Feature: NestJS foundations and streamed question endpoint

**From build-plan:** feature 11a
**Status:** complete

## Goal

Turn `packages/api` from a stub into a real NestJS app with one working
endpoint: `POST /question`, which runs a legal question through the existing
reasoning-agent graph (`packages/agent`) and streams the agent's progress to
the client as it works, ending with the schema-validated `ReponseStructuree`.
This is the first slice of item 11 (Public API) - the other three endpoints,
guardrails, and containerization follow in 11b-11d once this foundation
exists.

## In scope

- NestJS app bootstrap in `packages/api` (module, controller, `main.ts`),
  replacing the current placeholder `src/index.ts`.
- `POST /question` accepting `{ question: string, dateReference?: string,
  codes?: string[] }`, validated with a Zod-backed DTO (matches the project's
  "no unvalidated payload" rule in `coding-standards.md`).
- The endpoint invokes `buildFixedChainGraph()` from `@legirag/agent` via its
  LangGraph `.stream()` method (not `.invoke()`), so intermediate node
  transitions (route -> search -> draft -> followRenvois -> verify) are
  observable as they happen, not just the final answer.
- Response streamed to the client as Server-Sent Events (`text/event-stream`):
  one event per graph node transition (event name = node name, e.g.
  `route`, `search`, `draft`, `followRenvois`), and a final `done` event
  carrying the completed, Zod-validated `ReponseStructuree`.
- `GET /health` returning `{ status: 'ok' }` - the health check path
  project-overview.md left open for this item to name.
- Structured 400 response when the request body fails validation (message
  says which field, no stack trace leaked).

## Out of scope

- `GET /trace/:trace_id` and `GET /article/:article_identifier` (11b).
- Cost caps, daily circuit breaker, per-IP rate limiting (11c) - this step
  is not yet safe to expose publicly.
- Dockerfile / containerization / standalone run (11d).
- Token-by-token streaming of the drafted answer's prose. The `draft` node
  uses `generateObject` (structured JSON, not free text) and stays a single
  blocking call within its own node - only node-level progress streams here.
  Streaming the model's own token output would require switching `draft` to
  `streamObject`, which is out of scope for this step (agent internals,
  not the API layer) and isn't needed for the UI's planned "agent activity
  in plain language" view (project-overview.md's Q&A screen description).
- Auth / accounts (project has none planned for v1).
- CORS configuration beyond what local `/check` needs (revisit once the
  front end's origin is known, item 13).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - NestJS app skeleton** - add `@nestjs/core`, `@nestjs/common`,
  `@nestjs/platform-express`, `reflect-metadata`, `rxjs` to `packages/api`;
  create `AppModule`, `main.ts` (bootstraps on `PORT` env var, default
  `3000`), and a health controller. *Done when:* `pnpm --filter @legirag/api
  build` succeeds and running the app responds `200 { status: 'ok' }` on
  `GET /health`.
- [x] **Step 2 - question DTO and validation** - a Zod schema for the
  request body (`question` required non-empty string, `dateReference`
  optional ISO date string, `codes` optional string array) in
  `packages/api/src/question/question.dto.ts`, wired into the controller via
  a validation pipe that returns a structured 400 on failure. *Done when:* a
  malformed request (missing `question`, or an invalid `dateReference`)
  returns 400 with a field-specific message; a valid request passes through
  to the handler.
- [x] **Step 3 - stream graph progress over SSE** - `POST /question` builds
  the fixed-chain graph, calls `.stream()` with the validated input
  (`traceId` generated via `randomUUID()`, `dateReference` defaulting to
  `new Date()` when omitted), and pipes each yielded state update to the
  client as a named SSE event, ending with a
  `done` event containing the final `ReponseStructuree` parsed through
  `ReponseStructuree` (the Zod schema) before sending. *Done when:* calling
  the endpoint with a known question (e.g. "vitesse maximale autorisée en
  agglomération") against live Supabase + Bedrock streams at least the
  `route`, `search`, `draft` events in order, and the final `done` event's
  payload passes `ReponseStructuree.safeParse` with `success: true`.
- [x] **Step 4 - error path** - a model/DB failure mid-stream (e.g. Supabase
  unreachable) closes the SSE stream with a structured `error` event
  instead of hanging or crashing the process, reusing the graph's existing
  degrade-to-unfiltered-search / abstention behavior where the graph itself
  already recovers (9c), and only emitting a hard `error` event for the
  failures the graph can't recover from itself. *Done when:* a forced
  retriever failure (constructor injected with a throwing `Retriever`,
  mirroring the pattern in `graph.test.ts`) still produces either a valid
  `abstention` `done` event or a structured `error` event - never an
  unhandled exception or a hung connection.
- [x] **Repair F-01** - move `buildFixedChainGraph()` construction inside
  `streamQuestionToSink`'s try boundary (accept a graph factory instead of a
  pre-built graph) so a synchronous construction failure (e.g. missing
  `MODEL_VOLUME`/`MODEL_ESCALADE`) produces a structured `error` SSE event
  instead of an unhandled crash after headers are already sent.
- [x] **Repair F-02** - wrap `sink.end()` in a `finally` block in
  `streamQuestionToSink` so it always runs, even if the catch handler's own
  `sink.write()` call throws (e.g. client disconnected mid-stream).

## Files / areas

- `packages/api/package.json` - add NestJS deps.
- `packages/api/src/main.ts`, `packages/api/src/app.module.ts` - new.
- `packages/api/src/health/health.controller.ts` - new.
- `packages/api/src/question/` - controller, DTO, module - new.
- `packages/api/src/index.ts` - removed (replaced by `main.ts` as the real
  entrypoint) or repurposed to re-export types if something outside the
  package needs them (check before deleting).
- No changes expected in `packages/agent` - this step consumes
  `buildFixedChainGraph` as-is.

## Data / contracts

- Request DTO (new, local to `packages/api`, not cross-package): `{
  question: string; dateReference?: string; codes?: string[] }`.
- Response: SSE stream of `{ event: <node name>, data: <partial AgentState
  fields relevant to that node> }`, final `{ event: 'done', data:
  ReponseStructuree }`. This SSE event shape is new and becomes load-bearing
  for the front end's agent-trace view (item 13) - keep the event names
  aligned with the graph's actual node names so a later feature doesn't have
  to guess at a mapping.
- Reuses the locked `ReponseStructuree` schema from `@legirag/shared` -
  no changes to it here.

## Testing

- `pnpm test` (Vitest) covers DTO validation (Step 2: valid/invalid payload
  cases) as pure logic - in scope per the testing gate (`test` command is
  already declared in `AGENTS.md`).
- The SSE streaming behavior (Step 3, 4) is an integration surface (NestJS
  HTTP layer, real graph, real Supabase/Bedrock calls) - verify with a
  manual request (`curl -N` or the `run-fixed-chain.ts`-style verification
  script) against live backends, not a unit test, per the UI/integration
  exemption in `coding-standards.md`.
- `/check` after Step 4 should confirm: known question -> real citations
  streamed then `done`; out-of-scope question -> `abstention` `done` event;
  forced retriever failure -> recovered `done` or structured `error`, no
  crash.

## Notes for the AI

- `buildFixedChainGraph()` already accepts injectable `retriever`, `model`,
  `routeQuestion`, `suivreRenvoiFn` (see `packages/agent/src/graph.ts`) -
  reuse that injection for the Step 4 failure test instead of adding new
  seams.
- Keep `packages/api` ESM + NodeNext like every other package
  (`tsconfig.base.json`); NestJS supports this, but double-check decorator
  metadata (`experimentalDecorators`, `emitDecoratorMetadata`) is added to
  `packages/api/tsconfig.json` without weakening the shared strict settings.
- Don't add auth, rate limiting, or cost caps here even though they sit right
  next to this code - they're 11c, and bundling them would blow past a
  reviewable diff.
- French domain vocabulary stays French in shared types
  (`coding-standards.md`); the DTO field names here are new HTTP-layer
  contract, not domain vocabulary, so plain English (`question`,
  `dateReference`, `codes`) matching the existing `RequeteRecherche` shape's
  intent is fine and mirrors what `graph.ts` already calls its state fields.

## Findings

### 11a/F-01 [P1] closed - Graph construction can crash the request outside the SSE error boundary

**File:** packages/api/src/question/question.controller.ts:20
**Found:** 2026-08-17 by /audit (scope: current)
**Why it matters:** `buildFixedChainGraph()` is called after `res.flushHeaders()` has
already sent the SSE response headers, but it is not covered by the try/catch in
`streamQuestionToSink` (that only wraps `graph.stream()` and the read loop, not the
construction call passed into it). `buildFixedChainGraph()`'s default parameters
evaluate `bedrockProvider.volume()` / `.escalade()`, which call `requireEnv()` and
throw synchronously the moment a required env var (`MODEL_VOLUME`, `MODEL_ESCALADE`)
is missing - a real, project-documented fail-fast path
(`packages/shared/src/providers/bedrock.ts`, `packages/shared/src/env.ts`). A
misconfigured environment turns every request into an unhandled rejection with no
structured `error` SSE event and no clean connection close - exactly the failure
mode 11a step 4 was built to rule out.
**Suggested fix:** move graph construction inside the protected boundary, e.g. change
`streamQuestionToSink` to accept a graph factory (`() => StreamableGraph`) and call
it inside its existing try block, so a construction failure is caught the same way
as a streaming failure.
**Resolution:** `streamQuestionToSink` now takes a graph factory
(`buildGraph: () => StreamableGraph`) and calls it inside the try block; the
controller passes `() => buildFixedChainGraph()`. Covered by a new test
("F-01 : une construction de graphe qui échoue...") asserting an `error` event is
emitted and the promise resolves instead of rejecting. Re-reviewed 2026-08-17 by
/audit (scope: current): `question.controller.ts` and `stream-question.ts` read
fresh, construction now runs inside the try boundary, no new defect introduced.

### 11a/F-02 [P1] closed - sink.end() is not guaranteed to run on a broken sink

**File:** packages/api/src/question/stream-question.ts:47-51
**Why it matters:** `sink.end()` sits after the try/catch, not in a `finally`. If the
catch block's own `sink.write(...)` call throws - a realistic case: the client
disconnected mid-stream, so writing to the already-closed response throws - `sink.end()`
is never reached. That leaves the connection un-terminated, the exact "hung
connection" outcome the step 4 done-when says must never happen.
**Found:** 2026-08-17 by /audit (scope: current)
**Suggested fix:** wrap `sink.end()` in a `finally` block, and guard the catch
handler's own `sink.write()` call with its own try so a broken sink can never
prevent cleanup.
**Resolution:** `sink.end()` moved into a `finally` block; the catch handler's
own `sink.write()` call is now wrapped in its own try/catch that only logs on
failure. Covered by a new test ("F-02 : end() est toujours appelé...") using a
sink that throws on every write, asserting `end()` still runs and the promise
resolves. Re-reviewed 2026-08-17 by /audit (scope: current): `end()` now sits in
a `finally` block, the inner write is guarded by its own try/catch, no new
defect introduced.

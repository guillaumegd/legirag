# Feature: Trace and article read endpoints

**From build-plan:** feature 11b
**Status:** complete

## Goal

Add the two read endpoints item 11 still owes: `GET /article/:article_identifier`
(fetch one article, respecting the same legal-visibility rules as search) and
`GET /trace/:trace_id` (fetch a minimal execution-trace record - routing
decision, per-node timing, token cost - captured while `POST /question` ran
the reasoning graph). Every `ReponseStructuree` already carries a `trace_id`;
this feature is what makes that id actually resolve to something.

## In scope

- `fetchArticleByIdentifier` (`packages/retrieval`): RLS-scoped lookup of one
  article plus its subdivisions, reusing the `SET LOCAL ROLE anon` +
  `app.date_reference` session-variable pattern already used by
  `fetchArticlesForCitation`/`suivreRenvoi`. A hidden article (wrong state,
  outside the date window) comes back as "not found", exactly like search -
  never a partial or unfiltered row.
- `GET /article/:article_identifier` (`packages/api`): optional
  `?dateReference=` query param (same ISO-8601 contract as `POST /question`'s
  body field, factored into one shared Zod piece instead of duplicated),
  returns `{ article: Article, subdivisions: Subdivision[] }` or 404.
- `ExecutionTrace` contract (`packages/shared/src/schema.ts`, Zod + inferred
  type): `traceId`, `question`, `dateReference`, `codes` (routing decision),
  `steps` (one entry per graph node actually executed - `route`, `search`,
  `draft`, `followRenvois` - each with `durationMs` and a small node-specific
  `summary`), `tokenUsage`, `totalDurationMs`, `createdAt`.
- `traces` table + migration (`supabase/migrations/`): RLS enabled, public
  `select` policy (trace lookup has no user scoping per project-overview.md -
  the unguessable `trace_id` UUID is the only gate, same trust model as
  `ReponseStructuree.trace_id` itself). No insert policy needed: the API
  writes through the same privileged `DATABASE_URL` connection every other
  write in this project uses, which bypasses RLS as table owner.
- `buildExecutionTrace` (`packages/api`): pure function turning the sequence
  of `{ node, timestamp, partialState }` events `stream-question.ts` already
  sees via LangGraph's `'updates'` stream mode into one `ExecutionTrace`
  record - unit tested in isolation, no DB or graph involved.
- Wiring `buildExecutionTrace`'s output into `streamQuestionToSink`: timestamp
  each `'updates'` event as it arrives, build the trace once the stream ends,
  persist it via a new `persistTrace` (`packages/retrieval`) before emitting
  `done`. Persistence is best-effort: a failed write is logged and does not
  block or alter the `done` event the client receives.
- `fetchTrace` (`packages/retrieval`) + `GET /trace/:trace_id`
  (`packages/api`): 200 with the `ExecutionTrace`-shaped record (re-validated
  with `ExecutionTrace.safeParse` after reading back from the `jsonb`
  columns) or 404 when the id is unknown.

## Out of scope

- Cost caps, daily circuit breaker, per-IP rate limiting (11c) - both new
  endpoints stay unguarded like `POST /question` does today.
- Dockerfile / containerization / standalone run (11d).
- Full historical version listing or time-travel across a text's past
  versions (item 10, not built) - `GET /article` returns whatever single
  version is visible for the given `dateReference` under today's RLS rule,
  nothing more.
- Any UI for either endpoint (item 13).
- Trace listing, search, or deletion - single get-by-id only, matching
  project-overview.md's "inspectable by any holder of that id" design.
- Per-tool-call granularity inside a node. The fixed chain (item 9's note)
  has no dynamic tool selection - a "tool call" in this trace is one graph
  node's execution, not a finer-grained instrumentation of what happens
  inside `search`/`draft`/`followRenvois`.
- A persisted trace for a run that hits `stream-question.ts`'s existing outer
  catch block (11a, F-01/F-02 - the rare, unrecoverable-failure path, not the
  graph's own internal degrade-to-abstention behavior). That path emits an
  `error` SSE event and never reaches this feature's trace-building step, so
  its `trace_id` will 404 at `GET /trace/:trace_id`. Extending trace capture
  to cover that path is a reasonable future step, not required for 11b.
- Structured error responses for infrastructure failures (DB unreachable,
  etc.) on the two new endpoints - they fall through to NestJS's default
  error response for now, same as `POST /question` does today. Consistent
  structured error formatting across all three endpoints is 11c's explicit
  job per the build plan.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `GET /article/:article_identifier`** - `fetchArticleByIdentifier`
  in `packages/retrieval` (RLS-scoped transaction: `set_config('app.date_reference', ...)`
  + `SET LOCAL ROLE anon`, mirroring `fetchArticlesForCitation`; subdivisions
  query casts `id::int` the same way `SupabaseRetriever`'s chunk query already
  does, per the F-02/7b bigint-as-string precedent - `Subdivision.id: number`
  would otherwise silently receive a string). Extract the `dateReference`
  ISO-8601 refine into one shared Zod piece reused by `question.dto.ts` and
  the new `article.dto.ts`. New `ArticleController`/`ArticleModule`,
  registered in `AppModule`. *Done when:* a known, currently-visible article
  identifier returns `200` with its full `Article` + `Subdivision[]` against
  live Supabase; an unknown or `ABROGE`-hidden identifier returns `404`; an
  invalid `dateReference` query param returns `400`.
- [x] **Step 2 - `ExecutionTrace` contract and `traces` table** - the Zod
  schema (+ inferred type) in `packages/shared/src/schema.ts`, unit tested
  for valid/invalid shapes the same way `question.dto.test.ts` covers
  `QuestionRequestSchema`; the `create table traces (...)` migration with RLS
  and a public `select` policy, applied to the linked Supabase project.
  *Done when:* `pnpm typecheck`/`pnpm test` are green and the migration
  applies cleanly with no error.
- [x] **Step 3 - capture and persist the trace during `POST /question`** -
  `buildExecutionTrace` (pure, unit tested: given a sequence of timestamped
  node events plus start/end times, returns the exact `ExecutionTrace` shape
  Step 2 locked in - covering the `route`/`search`/`draft`/`followRenvois`
  summaries, an interrupted/partial event sequence, and a run with zero
  `followRenvois` iterations); `persistTrace` in `packages/retrieval`; wire
  both into `streamQuestionToSink` so every `POST /question` run persists its
  trace right before the `done` event, without changing the event stream the
  client already sees. *Done when:* unit tests pass, and a live manual run
  against Supabase + Bedrock produces the same `route`/`search`/`draft`/`done`
  SSE sequence as before Step 3, plus a new row in `traces` keyed by that
  run's `trace_id`.
- [x] **Step 4 - `GET /trace/:trace_id`** - `fetchTrace` in
  `packages/retrieval`; new `TraceController`/`TraceModule`, registered in
  `AppModule`. *Done when:* calling the endpoint with the `trace_id` from
  Step 3's manual run returns `200` with a payload that passes
  `ExecutionTrace.safeParse` with `success: true`; an unknown `trace_id`
  returns `404`.

## Files / areas

- `packages/shared/src/schema.ts` - `ExecutionTrace`, `ExecutionTraceStep` Zod
  schemas and inferred types.
- `supabase/migrations/` - new `..._create_traces.sql`.
- `packages/retrieval/src/fetch-article-by-identifier.ts`,
  `packages/retrieval/src/traces.ts` (`persistTrace`, `fetchTrace`),
  `packages/retrieval/src/index.ts` (new exports).
- `packages/api/src/article/` - `article.controller.ts`, `article.module.ts`,
  `article.dto.ts`.
- `packages/api/src/trace/` - `trace.controller.ts`, `trace.module.ts`.
- `packages/api/src/common/date-reference.schema.ts` - the shared
  `dateReference` refine, extracted from `question.dto.ts`.
- `packages/api/src/question/build-execution-trace.ts` (+ `.test.ts`) and an
  edit to `stream-question.ts` to call it and `persistTrace`.
- `packages/api/src/app.module.ts` - register the two new modules.

## Data / contracts

- `ExecutionTrace` (new, locked here): `{ traceId, question, dateReference,
  codes?, steps: { node, durationMs, summary }[], tokenUsage?, totalDurationMs,
  createdAt }` - the Zod schema in `schema.ts` is the source of truth; the
  `traces` table's `steps`/`token_usage`/`codes` columns are `jsonb`/`text[]`,
  read back and re-validated through the same schema, never trusted as typed
  on the way out of Postgres.
- `Article`/`Subdivision` (`packages/shared/src/types.ts`) - already locked,
  reused as-is for `GET /article`'s response body.
- `traces` table: `trace_id text primary key, question text not null,
  date_reference date not null, codes text[], steps jsonb not null,
  token_usage jsonb, total_duration_ms integer not null, created_at timestamptz
  not null default now()`.

## Testing

- `ExecutionTrace`/`ExecutionTraceStep` schema: valid and invalid-shape unit
  tests (`schema.test.ts`), mirroring the existing `ReponseStructuree` tests.
- `buildExecutionTrace`: unit tested as pure logic (no DB, no graph, no
  network) - this is the one piece of real logic this feature adds, so it
  gets the same treatment `stream-question.ts`'s error-path logic got in 11a.
- The shared `dateReference` Zod piece: covered by the existing
  `question.dto.test.ts` cases plus new cases in `article.dto.test.ts`.
- `fetchArticleByIdentifier`, `persistTrace`, `fetchTrace` - DB-integration
  code, following the existing project precedent (`fetchArticlesForCitation`,
  `SupabaseRetriever`, `suivreRenvoi` have no unit tests either): verified by
  live manual runs against Supabase per step, not unit tests.
- Both new controllers are thin - no logic beyond DTO validation (already
  tested) and delegating to the retrieval functions above - so they ride on
  the manual `curl` verification named in each step's done-when, not a
  separate controller test.

## Notes for the AI

- Reuse the `SET LOCAL ROLE anon` + `set_config('app.date_reference', ...)`
  transaction pattern exactly as `fetch-articles-for-citation.ts` does it -
  do not invent a second way to scope a query under the search RLS rules.
  Leave `app.codes`/`app.idcc` unset for the article lookup, same reasoning
  `fetchArticlesForCitation` already documents (a direct lookup or citation
  isn't narrowed by the router's code list).
- Bigint columns come back from `pg` as strings unless cast - `subdivisions.id`
  needs the same `::int` cast `SupabaseRetriever`'s `chunks.id` query already
  applies (F-02, 7b). Don't rediscover that bug.
- `streamQuestionToSink`'s existing try/catch/finally shape (11a, F-01/F-02)
  stays intact - trace persistence is one more step inside the existing try
  block, not a new error-handling path. A persistence failure logs and falls
  through to the existing `done` event, it never becomes a new `error` event
  (the question answer itself did not fail).
- Keep the `traces` write on the same privileged connection
  `createDatabaseClient()` already gives every other write in this project -
  do not add a service-role key or a second connection path for this.

## Findings

### 11b/F-01 [P2] closed - Trace-persistence failure path has no test, unlike its sibling error boundaries

**File:** packages/api/src/question/stream-question.ts:64-79
**Found:** 2026-08-17 by /audit (scope: current)
**Why it matters:** `streamQuestionToSink`'s outer try/catch/finally shape got two real bugs (F-01/F-02) caught by dedicated tests during 11a's audit - a graph-construction throw outside the boundary, and `end()` not running in `finally`. 11b adds a new failure point in the same function (`persistTraceFn` can throw) and wraps it in its own inner try/catch, placed so `sink.write(formatSseEvent('done', reponse))` runs unconditionally afterward. Reading the code confirms this is correct, but it is exactly the class of error-boundary logic this file's own history shows is easy to get subtly wrong, and it currently has no test proving a thrown `persistTraceFn` still yields a `done` event (never an `error` event, never an unhandled rejection).
**Suggested fix:** Add a case to `stream-question.test.ts` mirroring the existing F-01/F-02 style: inject a `persistTraceFn` that rejects, assert the run still ends with a `done` event carrying the valid `ReponseStructuree`, no `error` event, and `sink.ended === true`.
**Resolution:** Added `11b/F-01` test in `stream-question.test.ts` - injects a rejecting `persistTraceFn` alongside a broken retriever (abstention path), asserts `done` still fires with `confiance: abstention`, no `error` event, `sink.ended === true`. Re-reviewed 2026-08-17 by /audit: full diff re-read fresh (not just the changed file), typecheck/lint/test/build all green (251 tests), repair is purely additive test code with no change to production logic - closed.

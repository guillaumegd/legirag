# Feature: Cost caps, rate limiting, structured errors

**From build-plan:** feature 11c
**Status:** complete

## Goal

Make the three existing read/write endpoints (`POST /question`, `GET /article`,
`GET /trace`) safe to leave running unattended before item 11d containerizes
them: a consistent, non-leaking error envelope on every response, per-IP rate
limiting, and two independent cost guards on the only endpoint that actually
calls a model (`POST /question`) - a per-request bound on the worst case a
single call can cost, and a daily circuit breaker that stops accepting new
questions once a budget is spent.

## Design decision: token budget, not a dollar figure

The build-plan calls this "cost caps," but nowhere in this codebase is there a
$/token pricing table for Bedrock models (checked `packages/shared/src/
providers/bedrock.ts`, `packages/eval/src/cost-metrics.ts` - both track token
counts, never currency). Hardcoding per-model USD rates would violate this
project's own env-var/no-hardcoded-model-value convention (`bedrockProvider`,
`requireEnv`) and go stale the moment pricing changes or the deployer swaps
`MODEL_VOLUME`/`MODEL_ESCALADE`. Both caps in this feature are therefore
expressed in **tokens** - the actual quantity the graph already measures via
`AgentState.tokenUsage` - which bounds spend just as effectively without
inventing fragile pricing data. Flagging this explicitly since it reads the
build-plan line's intent rather than its literal wording.

## In scope

- **Structured error envelope** (`packages/api/src/common/all-exceptions.filter.ts`):
  a global `ExceptionFilter` that passes a thrown `HttpException` through with
  its own status/body unchanged (400s/404s already look like this today), and
  for anything else - an unexpected `Error`, a raw `pg` failure bubbling out
  of `fetchArticleByIdentifier`/`fetchTrace` - logs the real error server-side
  and returns a sanitized `{ statusCode: 500, error: 'Internal Server Error',
  message: 'Une erreur interne est survenue.' }` body, in French like every
  other message in this codebase, never the original error text or a stack
  trace. Wired via `app.useGlobalFilters(...)` in `main.ts`.
- **Per-IP rate limiting**: `@nestjs/throttler`'s `ThrottlerModule` +
  `ThrottlerGuard` applied globally (`APP_GUARD`), one fixed sane default
  (20 requests/minute per IP), `GET /health` exempted via `@SkipThrottle()`
  so monitoring probes are never limited. A limited request already produces
  `ThrottlerException` (a normal `HttpException`), so it automatically gets
  the same envelope as everything else once the filter above exists - no
  separate error-shaping code needed here.
- **Per-request bound**: a `.max()` length constraint added to
  `QuestionRequestSchema.question` (`packages/api/src/question/question.dto.ts`),
  rejecting an oversized question with `400` before it ever reaches a model
  call. This is deliberately the only *new* per-request guard - the other
  half of "per request" cost (how many model calls one question can trigger)
  is already bounded by `MAX_RENVOI_ITERATIONS`/`MAX_DRAFT_ATTEMPTS`
  (`packages/agent/src/graph.ts`, tuned in item 9c); this feature does not
  touch those.
- **Daily circuit breaker**: an in-memory `CostGuardService`
  (`packages/api/src/question/cost-guard.service.ts`) tracking tokens spent
  since the last UTC day boundary, reset lazily when the stored day changes.
  A `DailyCostCapGuard` on `POST /question` rejects new requests with `429`
  and a clear French message once the day's `MAX_DAILY_TOKENS` (env-optional,
  sane default, not `requireEnv` - same "optional with fallback" precedent as
  `PORT` in `main.ts`) is spent. `streamQuestionToSink` gains one more
  injected callback, `recordUsageFn`, called with the run's final
  `tokenUsage` right after the trace is built - parallel to `persistTraceFn`,
  same reasoning: real usage by default, a no-op fake in unit tests.

## Out of scope

- Any real USD cost tracking or display - see the design decision above.
- Distributed or shared rate-limit/cost state across multiple instances - both
  guards are in-memory, correct only for the single-process deployment 11d
  containerizes ("runnable standalone", not horizontally scaled - nothing in
  project-overview.md's deployment section asks for multi-instance yet).
- Per-user or per-API-key limiting - this project has no accounts (v1 is
  anonymous and public per project-overview.md's Users section).
- Configurable rate-limit thresholds via env vars - one fixed constant,
  matching how `MAX_RENVOI_ITERATIONS`/`TOP_K` are already plain constants in
  `packages/agent`, not env-var knobs.
- Retrying or queuing a request rejected by either cap - it fails immediately
  with a clear message; the client decides whether to retry later.
- Any change to `GET /article` or `GET /trace` beyond automatically inheriting
  the new global filter and rate limiter - neither endpoint calls a model, so
  neither needs a cost guard.
- Containerization / Dockerfile / standalone smoke test (11d).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - global structured error filter** - `AllExceptionsFilter`
  (unit tested directly: call `.catch()` with a mock `ArgumentsHost` for both
  an `HttpException` - passed through unchanged - and a plain `Error` -
  sanitized, original message never present in the response body), wired via
  `app.useGlobalFilters(new AllExceptionsFilter())` in `main.ts`. *Done when:*
  unit tests pass; a live request that triggers `NotFoundException` on
  `GET /article/:id` still returns its existing `404` body unchanged; a
  forced unexpected error (temporarily throw inside a controller in a local
  test run) returns a French, detail-free `500`.
- [x] **Step 2 - per-IP rate limiting** - add `@nestjs/throttler`, wire
  `ThrottlerModule.forRoot(...)` + `{ provide: APP_GUARD, useClass:
  ThrottlerGuard }` in `AppModule`, `@SkipThrottle()` on `HealthController`.
  *Done when:* a live manual run firing more than the configured per-minute
  limit of rapid requests at `GET /article/:id` in a tight loop trips a `429`
  with the standard error envelope from Step 1, while the same volume against
  `GET /health` never trips.
- [x] **Step 3 - per-request question-length bound** - add `.max(...)` to
  `QuestionRequestSchema.question`, one new case in `question.dto.test.ts`.
  *Done when:* a question longer than the limit returns `400` with a
  field-specific message; existing valid-length cases still pass.
- [x] **Step 4 - daily token circuit breaker** - `CostGuardService` (unit
  tested: records usage, reports remaining budget, resets on a day-key
  change - inject a fake clock/day-key rather than relying on real time
  passing); `DailyCostCapGuard` (unit tested: allows under budget, rejects
  over budget with `429`); wire `recordUsageFn` into `streamQuestionToSink`
  and the guard onto `QuestionController`. *Done when:* unit tests pass; a
  live manual run against Supabase + Bedrock still streams normally under
  budget; temporarily setting `MAX_DAILY_TOKENS` to an already-exceeded value
  makes the next `POST /question` return `429` before any model call happens.

## Files / areas

- `packages/api/src/common/all-exceptions.filter.ts` (+ `.test.ts`).
- `packages/api/src/main.ts` - `useGlobalFilters`.
- `packages/api/src/app.module.ts` - `ThrottlerModule`, `APP_GUARD`.
- `packages/api/src/health/health.controller.ts` - `@SkipThrottle()`.
- `packages/api/src/question/question.dto.ts` (+ test case) - length bound.
- `packages/api/src/question/cost-guard.service.ts` (+ `.test.ts`),
  `packages/api/src/question/daily-cost-cap.guard.ts` (+ `.test.ts`).
- `packages/api/src/question/stream-question.ts` - new `recordUsageFn` param.
- `packages/api/src/question/question.controller.ts` - wire the guard +
  `recordUsageFn`.
- `packages/api/package.json` - add `@nestjs/throttler`.

## Data / contracts

- No new cross-package types. `CostGuardService`'s in-memory state
  (`tokensUsedToday`, `dayKey`) is internal to `packages/api`, never
  persisted - a restart legitimately resets the daily budget, acceptable for
  a single-process demo deployment.
- `recordUsageFn: (tokenUsage: TokenUsage | undefined) => void` on
  `streamQuestionToSink` - synchronous and non-throwing by contract (it only
  updates an in-memory counter), so it does not need the try/catch
  `persistTraceFn` gets.

## Testing

- `AllExceptionsFilter`: unit tested directly (HttpException passthrough,
  generic-error sanitization) - this is the one piece of genuinely new logic
  in Step 1.
- `CostGuardService`/`DailyCostCapGuard`: unit tested with an injected
  fake clock/day-key, no real time delay and no real HTTP layer.
- `question.dto.test.ts`: one new case for the length bound.
- `@nestjs/throttler` wiring and the filter's live wiring in `main.ts`: no
  unit test (framework configuration, not logic) - verified by the live
  manual runs named in each step's done-when, consistent with how 11a/11b
  treated NestJS wiring itself as integration surface.

## Notes for the AI

- Keep `streamQuestionToSink` framework-agnostic - `recordUsageFn` is a plain
  callback type, not a NestJS-aware import, same reasoning `persistTraceFn`
  already follows (11b).
- `recordUsageFn` runs after `buildExecutionTrace`/`persistTraceFn` in the
  success path, using the same `derniereValeur?.tokenUsage` value already
  available there - don't recompute it a second way.
- The daily guard only gates `POST /question`. Do not apply
  `DailyCostCapGuard` to `GET /article` or `GET /trace` - neither calls a
  model, so neither has a cost to guard.
- `ThrottlerGuard` and `DailyCostCapGuard` are independent and both apply to
  `POST /question` - a request can be rejected by either, always through the
  same envelope from Step 1.
- **Discovered live during Step 4, worth remembering for any future NestJS
  constructor injection in this package:** plain constructor-parameter
  injection (`constructor(private readonly x: SomeService) {}`, no explicit
  `@Inject()`) silently resolves to `undefined` at runtime under this
  project's `dev` script (`tsx`, esbuild-based) - `tsconfig.base.json`'s
  `isolatedModules: true` combined with esbuild's limited
  `emitDecoratorMetadata` support means `design:paramtypes` reflection isn't
  reliable for cross-file constructor types. `DailyCostCapGuard` and
  `QuestionController` both hit this (a `TypeError: Cannot read properties
  of undefined` at request time, not at startup) before being fixed with
  explicit `@Inject(Token)`. `packages/api` had no constructor-injected
  classes before this feature, so nothing surfaced it earlier. Always use
  `@Inject(Token)` explicitly for constructor DI in `packages/api`.

Note: this feature's audit raised `F-01` (unverified lead on rate-limiting's
IP tracking under a future reverse proxy) - it stays in the live findings
ledger (not archived here) per the `unverified` status, to surface again
when 11d/12 introduce real deployment infra.

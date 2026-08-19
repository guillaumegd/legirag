# Feature: Separate paid and free-route quotas

**From build-plan:** feature 17
**GitHub issue:** #18 (reused, already open)
**Status:** all build steps done, ready for `/complete`

## Goal

`PersistentRateLimitGuard` (`packages/api/src/common/persistent-rate-limit.guard.ts`)
is wired globally via `APP_GUARD` and applies the same strict per-IP budget
(`RATE_LIMIT_PER_MINUTE_PER_IP` default **1 request per minute**,
`RATE_LIMIT_PER_DAY_PER_IP` default 10, `RATE_LIMIT_PER_DAY_GLOBAL` default
50) to every route that isn't `@Public()`. Today only `HealthController` is
`@Public()`, so `GET /trace/:traceId` and `GET /article/:articleIdentifier` -
plain Postgres reads with no Bedrock call and no cost - share the exact same
one-per-minute budget as `POST /question`, the one route that actually costs
money. Effect: asking one question exhausts the minute's quota, so clicking
into the trace view or expanding a cited article right after gets rejected
with 429.

**Revision note (2026-08-19, pre-implementation):** the first draft of this
spec removed the quota entirely for free routes. The user flagged a real
risk that draft missed: an unbounded route is still a route a script can
hammer forever, running up Lambda invocation cost and Postgres load even
though it never touches Bedrock - exactly the kind of exposure
`project-overview.md`'s "Guardrails required before any public API
exposure" section calls out. Revised design: free routes get their own
quota - much looser than the paid one, generous enough that normal
interactive use (a question, then its trace and a few cited articles) never
trips it, but present, so a script can't call them without limit.

## In scope

- Extend `rate_limit_requests` (Postgres) with a `kind` column (`'paid'` |
  `'free'`, default `'paid'`) so free-route counts and paid-route counts
  are tracked and capped independently
- Generalize `checkRateLimit` (`packages/retrieval/src/rate-limit.ts`) to
  take a `kind`, with a separate, looser set of limits for `'free'`
  (`RATE_LIMIT_FREE_PER_MINUTE_PER_IP`, `RATE_LIMIT_FREE_PER_DAY_PER_IP`,
  `RATE_LIMIT_FREE_PER_DAY_GLOBAL` - new env vars, sensible defaults,
  same undocumented-but-overridable pattern as the existing paid ones)
- A new `@FreeRead()` route decorator, consulted only by
  `PersistentRateLimitGuard` (not `AccessTokenGuard` - free routes stay
  authenticated, just under the looser quota, never unmetered)
- Apply `@FreeRead()` to `GET /trace/:traceId` and
  `GET /article/:articleIdentifier`, routing them to the free quota
  instead of the paid one
- Opportunistic purge of `rate_limit_requests` rows older than 7 days
  (`RATE_LIMIT_RETENTION_DAYS`, default 7) inside `checkRateLimit`, so the
  table doesn't grow forever now that the free quota can generate far more
  rows/day than the paid one - kept well past the 1-day window the quota
  logic itself ever reads, specifically so a week of history survives for
  manual inspection after an incident (a DDoS attempt, unexpected traffic,
  etc.)
- Redeploy to prod and confirm live: light use of the free routes right
  after a question never 429s; hammering them past the free limit still
  eventually 429s; `POST /question`'s existing quota is untouched

## Out of scope

- Any change to `POST /question`'s quota, `DailyCostCapGuard`, or the
  existing paid `RATE_LIMIT_*` values - those stay exactly as they are for
  the one route that actually costs money.
- `packages/mcp` - its `checkRateLimit(ip)` call
  (`packages/mcp/src/server.ts:150`) guards actual tool invocations
  (`chercher_droit`, `suivre_renvoi`, `router_question`, ...), all
  cost-bearing (Bedrock/search) - calling `checkRateLimit(ip)` with no
  `kind` argument defaults to `'paid'`, so MCP's behavior is unchanged by
  this feature with zero code changes needed there.
- Choosing the exact free-quota numbers as a tuned, final answer - the
  defaults below are a reasonable starting point (generous for a human,
  tight enough to bound worst-case cost), adjustable later via env vars
  without a code change if real usage shows they're off.
- Item 19 (surfacing the real error behind the generic abstention) and
  item 18 (client-side local history) - unrelated, separate build-plan
  items.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

## Build steps

- [x] **Step 1 - Migration: add `kind` to `rate_limit_requests`** - new
  file under `supabase/migrations/` (timestamp-prefixed, following the
  existing `20260819120000_create_rate_limit_requests.sql` convention),
  adding `kind text not null default 'paid' check (kind in ('paid',
  'free'))` and replacing the existing `(ip, created_at)` index with
  `(kind, ip, created_at)` so the per-kind window queries stay indexed.
  Real schema change on the live Supabase project - stop and get an
  explicit, separate "yes" in chat before applying it. *Done when:* the
  migration is applied and `rate_limit_requests` has the new column with
  every existing row defaulted to `'paid'` (verify with a read-only
  `select kind, count(*) from rate_limit_requests group by kind`).
- [x] **Step 2 - Parameterize `checkRateLimit` by kind** -
  `packages/retrieval/src/rate-limit.ts`: `checkRateLimit(ip: string,
  kind: 'paid' | 'free' = 'paid')`, `readLimits(kind)` picks
  `RATE_LIMIT_*` vs `RATE_LIMIT_FREE_*` env vars (defaults:
  `RATE_LIMIT_FREE_PER_MINUTE_PER_IP` 20,
  `RATE_LIMIT_FREE_PER_DAY_PER_IP` 500,
  `RATE_LIMIT_FREE_PER_DAY_GLOBAL` 5000), and the counting query/insert
  both filter/tag by `kind = $2`. Also make the advisory lock key
  kind-specific (`hashtext(GLOBAL_LOCK_KEY || ':' || kind)` instead of the
  current single fixed key) - free-route traffic (up to 20/min/IP vs the
  paid path's 1/min/IP) must serialize against itself, not queue behind
  paid-route checks; otherwise a free-route burst adds latency to
  `POST /question`, which is exactly the coupling this feature removes.
  No existing call site needs to change (`checkRateLimit(ip)` alone still
  means `'paid'`, same lock key as today) - `packages/mcp/src/server.ts`
  and any other current caller keep working unmodified. Also add the
  opportunistic purge: after the main transaction commits (own statement,
  own connection already open - not inside the advisory-lock-guarded
  transaction, so a slow delete never extends how long that lock is
  held), with roughly 1% probability
  (`if (Math.random() < 0.01)`, a plain constant - not worth an env var)
  run `delete from rate_limit_requests where created_at < now() -
  interval '<RATE_LIMIT_RETENTION_DAYS> days'` (`RATE_LIMIT_RETENTION_DAYS`
  read via `readPositiveNumberEnv`, default 7). Best-effort: catch and
  `console.error` on failure, never throw - a missed purge is not worth
  failing a real rate-limit check over. At current worst-case volume
  (~50 paid + up to 5000 free per day = ~5050/day), a 1% chance per call
  means roughly 50 purge attempts/day, plenty to keep the table trimmed
  to ~7 days without adding a query to every single request. *Done when:*
  `pnpm typecheck` passes; this file has no unit test today (DB
  integration code, same as `fetchTrace`/`fetchArticleByIdentifier` -
  consistent with `coding-standards.md`'s testing scope), so no new test
  is expected here.
- [x] **Step 3 - `@FreeRead()` decorator, guard wiring, and the two
  routes** - new `packages/api/src/common/free-read.decorator.ts`
  (mirrors `public.decorator.ts`: an `IS_FREE_READ_KEY` metadata key and
  a `FreeRead()` method/class decorator). In
  `persistent-rate-limit.guard.ts`: keep the existing `@Public()` bypass
  first (unchanged, via `isPublicRoute`), then check `@FreeRead()`
  (inline `reflector.getAllAndOverride` - not a shared helper, since only
  this guard consults it) and call `checkRateLimit(ip, 'free')` instead
  of `checkRateLimit(ip)` when present. Apply `@FreeRead()` to
  `TraceController.getById` and `ArticleController.getByIdentifier` -
  neither gets `@Public()`, `AccessTokenGuard` still requires the bearer
  token on both. Extend `persistent-rate-limit.guard.test.ts` with a case
  proving a `@FreeRead()` route calls `checkRateLimit` with `'free'`
  (mock assertion on the call args), and update its `fakeReflector` test
  helper so it can return different values per metadata key (today it
  returns one fixed value regardless of key, which can't express
  "public: no, free-read: yes" in the same test). *Done when:* `pnpm test`
  is green including the new case, and `pnpm typecheck`/`pnpm build`
  pass.
- [x] **Step 4 - Redeploy and confirm live** - run `pnpm deploy:images`
  (real prod deploy - stop and get an explicit, separate "yes" in chat,
  same pattern as feature 16's deploy steps). Then: `POST /question`
  once, immediately `GET /trace/:traceId` and `GET /article/:articleIdentifier`
  for one of the cited articles - both must return 200, not 429. Then
  call one of the free routes in a tight loop past
  `RATE_LIMIT_FREE_PER_MINUTE_PER_IP` (20) - confirm it eventually
  returns 429. Then `POST /question` again within the same minute -
  confirm it still 429s per the existing paid quota (proves the two
  quotas are genuinely independent, not accidentally sharing counts).
  *Done when:* all three observations hold against the live prod API.
- [x] **Repair F-12 - Index the purge's `created_at` filter** - the
  opportunistic purge (`purgeOldRequests`, Step 2) deletes by `created_at`
  alone with no `kind` filter, so it can't use the `(kind, ip, created_at)`
  index and forces a full table scan (`Seq Scan`, confirmed live via
  `EXPLAIN`) - in the request path, on the table whose size is driven by
  the new free-route traffic. New migration adding
  `create index rate_limit_requests_created_at_idx on
  rate_limit_requests (created_at)`. Real schema change on the live
  Supabase project - applied with explicit approval. *Done when:* the new
  index is usable by the purge query - confirmed with `set local
  enable_seqscan = off; explain delete ...`, which now plans an `Index
  Scan using rate_limit_requests_created_at_idx`. (At the table's current
  near-empty size Postgres's cost-based planner correctly prefers a seq
  scan on its own - that's expected, not a regression; the index kicks in
  automatically once the table is actually large enough to matter, which
  is the scenario this fix targets.)

## Files / areas

- `supabase/migrations/<timestamp>_add_kind_to_rate_limit_requests.sql` - new
- `packages/retrieval/src/rate-limit.ts` - `kind` parameter, per-kind limits
- `packages/api/src/common/free-read.decorator.ts` - new
- `packages/api/src/common/persistent-rate-limit.guard.ts` - free-read
  branch calling `checkRateLimit(ip, 'free')`
- `packages/api/src/common/persistent-rate-limit.guard.test.ts` - new
  test case, updated `fakeReflector` helper
- `packages/api/src/trace/trace.controller.ts` - `@FreeRead()`
- `packages/api/src/article/article.controller.ts` - `@FreeRead()`

## Data / contracts

- `rate_limit_requests.kind` (`text`, default `'paid'`, check-constrained
  to `'paid' | 'free'`) - new column, additive and backward-compatible
  (every existing row and every unmodified call site defaults to
  `'paid'`, so nothing about today's paid-route behavior changes).
- `checkRateLimit(ip: string, kind: 'paid' | 'free' = 'paid')` - the
  function's public signature gains an optional parameter; existing
  single-argument call sites are unaffected.
- `rate_limit_requests` rows now have a rough 7-day maximum lifetime
  (opportunistic, not a hard guarantee at exactly 7 days - see Step 2).
  Anyone querying this table for incident forensics (e.g. after a
  suspected DDoS) should expect roughly a week of history, not less, and
  should not assume anything older than that still exists.

## Testing

No single `Verify` command is declared in `AGENTS.md`, so the fallback
gate is `typecheck` -> `test` -> `build` (`coding-standards.md`). The
guard's routing decision (public bypass / free-read branch / paid branch)
is pure, already-mocked logic with an existing test file - Step 3 extends
it, matching the testing gate's scope rule. `rate-limit.ts` stays
untested at the unit level, consistent with how the rest of that
DB-integration file (and its sibling `fetchTrace`/`fetchArticleByIdentifier`)
is already treated - Step 2's correctness rides on Step 4's live
verification instead (the three concrete before/after observations against
the real database).

## Notes for the AI

- Steps 1 and 4 are the two risky actions here (a live schema change and a
  real prod deploy) - each needs its own explicit, separate "yes" in
  chat, not covered by the other's approval or by any earlier feature's
  approval.
- Don't touch `is-public-route.ts` or `AccessTokenGuard` - free routes
  must keep requiring the bearer token, only the quota check changes.
- The web front end already sends `Authorization: Bearer <LEGIRAG_ACCESS_TOKEN>`
  on every call to `/trace` and `/article`, proxied server-side
  (`packages/web/src/lib/api-proxy.ts`) - nothing changes there.
- To fetch `LEGIRAG_ACCESS_TOKEN` for Step 4's live checks, read it from
  the `legirag/app-env` Secrets Manager secret at check time (same
  approach as feature 16's Step 6) - don't print the full token value or
  persist it to a file.
- `pnpm --filter @legirag/retrieval reset-rate-limits` clears
  `rate_limit_requests` entirely (both kinds - matches the script's own
  existing rationale, no change needed to it) if Step 4's checks need a
  clean slate, or to undo the deliberate over-limit hammering once it's
  confirmed. It coexists fine with the new opportunistic purge - one is a
  manual full wipe, the other an automatic rolling 7-day trim; neither
  depends on the other.
- Pick the migration's timestamp prefix at implementation time (must sort
  after `20260819120000_...`), not hardcoded here.
- The 7-day retention is deliberate, not a placeholder to be tuned down:
  the user specifically wants a week of history to inspect in the
  database after an incident (DDoS attempt or otherwise), not just the
  1-day window the quota logic itself reads. Don't shorten it to "match
  what the code actually needs."
- The purge's 1% probability is a plain constant in code, not an env var
  - deliberately not exposed as a knob, unlike the `RATE_LIMIT_*` numbers
  (which genuinely need tuning per deployment). Don't add
  `RATE_LIMIT_PURGE_PROBABILITY` or similar.
- The purge is best-effort and probabilistic by design - Step 4's live
  verification doesn't need to observe it directly (unreliable to trigger
  deterministically in one check); typecheck plus code review are the
  evidence for this part of Step 2.

## Findings

### 17/F-12 [P1] closed - The opportunistic retention purge forces a full table scan, in the request path, on the exact table sized by attack volume

**File:** packages/retrieval/src/rate-limit.ts:49-51
**Found:** 2026-08-19 by /audit (scope: current)
**Why it matters:** `purgeOldRequests` runs `delete from rate_limit_requests where created_at < now() - make_interval(days => $1)` with no `kind` filter. The only index on this table is the new composite `rate_limit_requests_kind_ip_created_at_idx` (`kind, ip, created_at`) - a B-tree index needs an equality condition on its leading column(s) to be usable, and this query fixes none of them, so Postgres cannot use it. Confirmed live against the actual prod table: `explain delete from rate_limit_requests where created_at < now() - make_interval(days => 7)` returns `Seq Scan on rate_limit_requests ... Filter: (created_at < (now() - '7 days'::interval))` - a full sequential scan, not an index scan. This query is awaited synchronously inside `checkRateLimit` (`rate-limit.ts:108-110`), in the hot path of every guarded API/MCP request, with ~1% probability per call (`PURGE_PROBABILITY`). The table's size is now driven by the new free-route quota (up to 5000 rows/day by default) and by definition grows fastest exactly during the high-traffic/attack scenario item 17 was built to survive - so the mechanism meant to keep the table bounded gets slower precisely when the table is largest, and 1% of user-facing requests pay for a full scan of it. At current near-zero production volume this is invisible; it stops being invisible exactly when the free quota's higher ceiling is actually exercised.
**Suggested fix:** Add a plain index the purge can use, e.g. `create index rate_limit_requests_created_at_idx on rate_limit_requests (created_at)` (a small follow-up migration) - the simplest fix, no application code change needed. Alternative: issue two `kind`-scoped deletes (`kind = 'paid' and created_at < ...` / `kind = 'free' and created_at < ...`) so the existing composite index applies, avoiding a second index at the cost of enumerating kinds in code.
**Resolution:** Added `rate_limit_requests_created_at_idx` (plain index on `created_at`) via migration `20260819170000_add_created_at_index_to_rate_limit_requests.sql`, applied to prod. At the table's current near-empty size Postgres's planner still picks a seq scan on its own (correct, cost-based - not a bug), so verified instead with `set local enable_seqscan = off; explain delete ...`, which now plans `Index Scan using rate_limit_requests_created_at_idx` - confirms the index is exactly what the purge query needs and will be picked up automatically once the table is large enough to matter. Re-reviewed 2026-08-19 by /audit (scope: current): `rate-limit.ts` re-read in full, the repair introduced no new defect (a plain single-column index on a small table has no meaningful downside), the three live indexes on `rate_limit_requests` (`pkey`, `kind_ip_created_at`, `created_at`) don't overlap redundantly. Closed.

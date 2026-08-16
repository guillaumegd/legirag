# Feature: Access-control policies (RLS)

**From build-plan:** feature 4c (sub-feature of 4 - Search index and access-control policies)
**Status:** complete

## Goal

Move `etat`/date/code filtering out of application code and into Postgres
itself, on every table the search path touches (`articles`, `subdivisions`,
`chunks`). Today all four tables (including `renvois`) carry a temporary
`using (true)` public-read policy from earlier migrations. This feature
replaces the three search-path policies with session-variable-driven ones, so
a repealed article can never come back from the database - even if a future
bug in the agent or API asks for it by number explicitly. This is the
project's most safety-critical database change and the build plan calls out
its proof directly: an `ABROGE` article named explicitly must never be
returned.

## In scope

- A `stable` SQL helper function `article_visible(a articles) returns boolean`
  reading two session GUCs (`app.date_reference`, `app.codes`) via
  `current_setting(..., true)`, encoding: `etat <> 'ABROGE'`, `date_debut`/
  `date_fin` bracket the reference date (default `current_date` when the GUC
  is unset or empty), and `code_slug` matches the comma-separated `app.codes`
  list when set (no filter when unset).
- Replacing `articles_public_read`, `subdivisions_public_read`, and
  `chunks_public_read` with new `_search_read` policies:
  `articles` uses `article_visible(articles)` directly; `subdivisions` and
  `chunks` use `exists (select 1 from articles a where a.article_identifier =
  ...)` - the inner `select` is itself subject to `articles`' own RLS policy,
  so the same predicate applies without duplicating it.
- A validation script proving the filtering end-to-end as the `anon` role
  (the role a public-facing client actually queries as - `postgres`, the
  loader role, owns the tables and bypasses RLS by design, same as it already
  does for every existing load script).

## Out of scope

- The real `Retriever` implementation that sets these session variables per
  search query (4d) - this feature only defines and proves the GUC contract
  it will call.
- Reranking and the abstention threshold (item 6).
- `renvois` - deferred to item 8 (cross-reference following). Its visibility
  semantics differ (a renvoi's source and target articles can each be visible
  or hidden independently) and belong with the feature that actually walks
  the graph, not bolted on here.
- Full historical-version time travel (item 10). Today `etat` is only ever
  `VIGUEUR` or `null->VIGUEUR` in the real corpus (confirmed in 02d's notes -
  `MODIFIE`/`ABROGE` don't exist in loaded data yet), so `article_visible`
  hides `ABROGE` unconditionally rather than allowing it back for a past
  `app.date_reference`. That's the correct interim rule (nothing depends on
  the nuance today) but item 10 will need to loosen it once real historical
  rows with real repeal dates exist.
- Granting the `codes` GUC any validation beyond a Postgres cast error (e.g. a
  malformed `app.date_reference` throws loudly) - matches the project's
  existing fail-fast convention, not a gap.
- `idcc`/collective-bargaining-agreement filtering. Descoped mid-implementation
  (confirmed with the user): no KALI data exists yet (`idcc` is `null` on
  every article today), so an `app.idcc` RLS clause would be speculative
  wiring for a branch that isn't built. The `idcc` column and its planned
  partial index stay out of this feature entirely - whichever feature builds
  the KALI branch adds the RLS clause back then (a `create or replace
  function` migration, same shape as this feature's). Noted in
  `project-overview.md`'s "Collective bargaining agreement" section.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - RLS migration** - `npx supabase migration new add_search_rls`
  containing:
  ```sql
  create or replace function public.article_visible(a public.articles)
  returns boolean
  language sql
  stable
  security invoker
  set search_path = ''
  as $$
    select
      a.etat <> 'ABROGE'
      and a.date_debut <= (select coalesce(nullif(current_setting('app.date_reference', true), '')::date, current_date))
      and a.date_fin    >= (select coalesce(nullif(current_setting('app.date_reference', true), '')::date, current_date))
      and (
        (select nullif(current_setting('app.codes', true), '')) is null
        or a.code_slug = any(string_to_array((select current_setting('app.codes', true)), ','))
      );
  $$;

  drop policy if exists articles_public_read on articles;
  create policy articles_search_read on articles
    for select using (article_visible(articles));

  drop policy if exists subdivisions_public_read on subdivisions;
  create policy subdivisions_search_read on subdivisions
    for select using (
      exists (select 1 from public.articles a where a.article_identifier = subdivisions.article_identifier)
    );

  drop policy if exists chunks_public_read on chunks;
  create policy chunks_search_read on chunks
    for select using (
      exists (select 1 from public.articles a where a.article_identifier = chunks.article_identifier)
    );
  ```
  `current_setting(...)` calls are wrapped in `(select ...)` so Postgres
  caches them once per query instead of once per row (the RLS perf pattern
  from the `supabase-postgres-best-practices` skill). `set search_path = ''`
  is deliberate defense-in-depth against search-path hijacking of the
  built-in functions the predicate calls, even though it costs this function
  Postgres's automatic SQL-function inlining - a real cost only at a row
  count far past this table's size. Applied with `npx supabase db push`.
  **Implementation note:** the function originally also took an `app.idcc`
  GUC and this step also added a partial `idx_articles_idcc` index; both were
  descoped mid-step (see Out of scope) and removed via a second migration,
  `20260816001712_remove_idcc_rls_filter.sql`, applied the same way -
  following this project's established pattern of fixing an already-applied
  migration forward (see `make_renvois_resolu_generated.sql`) rather than
  hand-editing it. The SQL above reflects the final, corrected state.
  *Done when:* `mcp__supabase__list_migrations` lists the new migration;
  `mcp__supabase__execute_sql` against `pg_policies` shows `articles_search_read`,
  `subdivisions_search_read`, `chunks_search_read` and no leftover
  `*_public_read` rows for those three tables; `renvois_public_read` is
  unchanged; `mcp__supabase__get_advisors` (security) reports no new warning.
  Confirmed - see the two migrations above.
- [x] **Step 2 - Validation script proving the filtering** - add
  `packages/ingest/src/cold/validate-rls.ts` (`tsx --env-file=../../.env`,
  wired as `pnpm --filter @legirag/ingest validate:rls`), using
  `createDatabaseClient()` like every other `validate-*.ts` script. Runs a
  single transaction (`BEGIN` ... `ROLLBACK`, never committed, so it can
  never leave synthetic data in the real project) that:
  1. Inserts four synthetic fixture articles as the connecting (`postgres`,
     RLS-bypassing) role, all with clearly fake identifiers
     (`TEST-RLS-*`)/`article_num`s (`TEST-*`), never colliding with real
     corpus rows: one in-force control (`code-civil`), one `ABROGE` control
     whose date range *would* otherwise cover today (the headline scenario),
     one not-yet-in-force control (`date_debut` in the future), one on a
     different `code_slug`. Adds one `chunks` row each for the in-force and
     `ABROGE` controls, and one `subdivisions` row for the `ABROGE` control.
  2. `SET LOCAL ROLE anon;` (RLS is not enforced for `postgres`, the table
     owner - this switches to the role a real client is actually restricted
     as, still inside the same transaction so it still sees the just-inserted
     fixtures).
  3. Runs each scenario as a named assertion and collects pass/fail:
     - **Headline:** `select ... from articles where article_num = 'TEST-ABROGE'`
       with no session vars set returns zero rows.
     - In-force control is visible by default; its chunk row is visible;
       the `ABROGE` control's chunk and subdivision rows are not.
     - Not-yet-in-force control is invisible by default, visible once
       `select set_config('app.date_reference', '<a date inside its range>', true)`
       is run.
     - Different-`code_slug` control is visible by default, invisible once
       `app.codes` is set to `code-civil` only, visible again once `app.codes`
       includes it.
  4. `ROLLBACK` unconditionally in a `finally`, regardless of pass/fail.
  Logs each scenario's name and pass/fail, a final summary line, and sets
  `process.exitCode = 1` if any scenario failed.
  *Done when:* run against the real Supabase project, exit code 0, every
  scenario logged as passed - most importantly the headline `ABROGE`-by-number
  scenario; a follow-up `select count(*) from articles where article_num like
  'TEST-%'` (as `postgres`, outside the script) returns 0, proving the
  rollback left no trace.
  Confirmed - `pnpm --filter @legirag/ingest validate:rls` against the live
  project: 10/10 filtering scenarios plus the trace-check passed (11/11
  total), including the headline scenario. Independent follow-up
  `select count(*) from articles where article_num like 'TEST-RLS%'` (outside
  the script) returned 0. `pnpm --filter @legirag/ingest typecheck` and
  `pnpm lint` both clean.

## Files / areas

- `supabase/migrations/20260816000815_add_search_rls.sql` (new)
- `supabase/migrations/20260816001712_remove_idcc_rls_filter.sql` (new)
- `packages/ingest/src/cold/validate-rls.ts` (new)
- `packages/ingest/package.json` (edit - add `validate:rls` script)

## Data / contracts

- **Locks the session-variable contract 4d's `Retriever` must fill in before
  every search query, in the same transaction as the query itself** (these
  are `SET LOCAL`-scoped, so they only apply for the current transaction):
  - `app.date_reference` - `'YYYY-MM-DD'` string, or unset for "today".
  - `app.codes` - comma-separated `code_slug` values (e.g.
    `'code-civil,code-penal'`, no spaces), or unset for "every code".
  Set each with `select set_config('app.name', $1, true)` (parameterized,
  not string-interpolated `SET`) to avoid injection.
- No changes to the `Article`, `Subdivision`, `Chunk`, or `RequeteRecherche`
  TypeScript types - this is a database-only enforcement layer underneath
  the existing locked shapes.

## Testing

- This is database-only, integration-level work against the real Supabase
  project - no unit-testable pure logic is introduced. Per the testing gate's
  own scope rule (and matching every existing `validate-*.ts` script, none of
  which have Vitest coverage), it's verified by actually running
  `validate:rls` against the live project, not a Vitest test.
- `pnpm typecheck`/`pnpm lint` still run and must stay green for the new
  script (plain TypeScript, no new runtime logic worth a unit test).

## Notes for the AI

- `postgres` (the role `DATABASE_URL` connects as, and the owner of every
  table here) bypasses RLS by default - this is relied on deliberately, the
  same way every existing `load-*.ts` script already relies on it. Do not add
  `force row level security`; that would also restrict the owner and break
  every existing loader, which is out of scope for this feature to fix.
- Confirm `SET LOCAL ROLE anon;` succeeds for the connecting role before
  building out the rest of Step 2 - Supabase-hosted Postgres grants `anon`/
  `authenticated`/`service_role` membership to `postgres` by default, but if
  the connected project differs, surface the real Postgres error rather than
  working around it silently.
- Keep fixture identifiers unmistakably fake (`TEST-RLS-*` prefix) and the
  whole scenario inside one rolled-back transaction, matching this project's
  existing "no cleanup logic needed, just make failure unable to leave a
  trace" pattern (see 02d's recovery notes).

## Findings

- **04c/F-01** [P2] closed - `verifier()` in `validate-rls.ts` called
  `client.query(sql, params)` with no result-row type argument, leaving
  `rows` as `pg`'s default `any[]` - a violation of `coding-standards.md`'s
  "No `any` types" and a deviation from every sibling `validate-*.ts`
  script's established pattern of typing `client.query<T>()`. Found
  2026-08-16 by `/audit`. Fixed by typing the call as
  `client.query<Record<string, unknown>>(sql, params)`. Closed 2026-08-16
  after a fresh `/audit` pass re-reviewed the file, confirmed the `any` leak
  gone at all 10 call sites, and reconfirmed typecheck/lint/test/live
  `validate:rls` all green.

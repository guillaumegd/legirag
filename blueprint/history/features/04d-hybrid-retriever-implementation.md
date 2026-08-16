# Feature: Hybrid Retriever implementation

**From build-plan:** feature 4d (sub-feature of 4 - Search index and access-control policies)
**Status:** complete

## Goal

Ship the first concrete `Retriever`: given a `RequeteRecherche`, embed the query
text, run keyword search (Postgres full-text, the project's practical
BM25-equivalent) and vector search (HNSW cosine) in parallel top-50 lists,
fuse them with Reciprocal Rank Fusion, and return the top results - all while
setting 4c's RLS session variables so a repealed or out-of-scope article can
never come back, even through the real search path this time (4c only proved
the database-level guarantee with raw SQL and a superuser role; this feature
proves the actual `Retriever` engages it).

## In scope

- `SupabaseRetriever`, a class implementing `Retriever.search()` from
  `packages/shared/src/interfaces.ts`, in the (currently empty) `retrieval`
  package.
- Query embedding via the existing `embedTexts(texts, 'search_query')`
  (`packages/shared/src/providers/embedding.ts` - already built in item 1).
- Keyword search: `ts_rank_cd` over the `tsv`/GIN index already built in 4b,
  top 50.
- Vector search: cosine distance over the `embedding`/HNSW index already
  built in 4b, top 50.
- Reciprocal Rank Fusion (RRF, k = 60, a standard unweighted constant - not
  tuned here) combining both lists into one ranked set, returned as the top
  `RequeteRecherche.topK` chunks.
- Setting `app.date_reference` and `app.codes` (4c's locked GUC contract) and
  switching to the `anon` role, all inside one transaction per search call -
  the exact pattern 4c's `validate-rls.ts` already proved works.
- A validation script proving the search path end-to-end against the live
  Supabase project: coherent results on real smoke questions (for a human to
  judge, per the build-plan's own done-when) plus two automated checks that
  the `codes` and `date_reference` filters are actually wired through.

## Out of scope

- Reranking (Cohere) and the abstention threshold - item 6.
- `idcc`/collective-bargaining-agreement filtering - `RequeteRecherche.idcc`
  stays accepted but unenforced, matching 4c's own descope (no `app.idcc` GUC
  exists in the database yet; nothing to call). Whichever feature builds the
  KALI branch wires this, per `project-overview.md`.
- Historical-version / time-travel semantics for `ABROGE` articles - item 10.
  This feature calls into `article_visible()` exactly as 4c left it
  (unconditionally hides `ABROGE`); it does not touch that predicate.
- The evaluation harness and any quantified retrieval-quality scoring - items
  5 and 6. This feature's own validation is a coherence smoke test plus two
  mechanical filter checks, not a scored benchmark.
- Connection pooling or any concurrency/perf tuning for the search path -
  left to item 11 (API layer) if it turns out to matter; this feature uses
  one `Client` per `search()` call, matching every existing script in the
  codebase (`embedTexts`, every `ingest` loader).
- Refactoring `packages/ingest/src/cold/pg-client.ts` into `shared` - this
  feature duplicates the same ~15-line file into `retrieval` instead, so it
  doesn't have to touch already-completed 4b/4c files. See Notes for the AI.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Database client and package config** - add
  `packages/retrieval/src/pg-client.ts`, a copy of
  `packages/ingest/src/cold/pg-client.ts` (`createDatabaseClient()` reading
  `DATABASE_URL` via `requireEnv`, plus the date/timestamp type-parser
  overrides so `Article`-shaped rows stay ISO strings, not `Date` objects).
  Add `pg` and `@types/pg` to `packages/retrieval/package.json` dependencies/
  devDependencies (versions matching `packages/ingest/package.json`), plus
  `tsx` as a devDependency for step 4's script.
  *Done when:* `pnpm --filter @legirag/retrieval typecheck` passes with the
  new file compiling against the new deps.

- [x] **Step 2 - Pure query-param helpers, unit tested** -
  `packages/retrieval/src/query-params.ts` exporting:
  - `formatDateReference(date: Date): string` - `'YYYY-MM-DD'`, for the
    `app.date_reference` GUC.
  - `formatCodesFilter(codes?: string[]): string` - comma-joined `code_slug`
    list, or `''` when `codes` is `undefined` or empty (4c's contract: empty
    string means "no filter" via `nullif(..., '')`).

  `packages/retrieval/src/query-params.test.ts` covering: a normal date, an
  undefined `codes`, an empty `codes` array, and a multi-code array.
  *Done when:* `pnpm test` runs these and they pass.

- [x] **Step 3 - `SupabaseRetriever`** - `packages/retrieval/src/supabase-retriever.ts`:

  ```ts
  const RRF_K = 60; // constante standard (Cormack et al.), non ajustée ici - item 6
  const PRE_FUSION_LIMIT = 50; // top 50 de chaque liste avant fusion, indépendant de topK

  export class SupabaseRetriever implements Retriever {
    async search(q: RequeteRecherche): Promise<Chunk[]> {
      const [embedding] = await embedTexts([q.texte], 'search_query');
      if (!embedding) throw new Error('embedTexts a renvoyé un résultat vide pour la requête.');

      const client = createDatabaseClient();
      await client.connect();
      try {
        await client.query('BEGIN');
        await client.query(`select set_config('app.date_reference', $1, true)`, [formatDateReference(q.dateReference)]);
        await client.query(`select set_config('app.codes', $1, true)`, [formatCodesFilter(q.codes)]);
        await client.query('SET LOCAL ROLE anon');

        const { rows } = await client.query<HybridRow>(HYBRID_SEARCH_SQL, [
          toPgVector(embedding),
          q.texte,
          q.topK,
        ]);

        await client.query('COMMIT');
        return rows.map(toChunk);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        await client.end();
      }
    }
  }
  ```

  `HYBRID_SEARCH_SQL`:

  ```sql
  with vector_search as (
    select id, row_number() over (order by embedding <=> $1::extensions.vector) as rank
    from chunks
    where embedding is not null
    order by embedding <=> $1::extensions.vector
    limit 50
  ),
  keyword_search as (
    select id, row_number() over (order by ts_rank_cd(tsv, websearch_to_tsquery('french', $2)) desc) as rank
    from chunks
    where tsv @@ websearch_to_tsquery('french', $2)
    limit 50
  ),
  fused as (
    select
      coalesce(v.id, k.id) as id,
      coalesce(1.0 / (60 + v.rank), 0.0) + coalesce(1.0 / (60 + k.rank), 0.0) as score
    from vector_search v
    full outer join keyword_search k on v.id = k.id
  )
  select c.id, c.article_identifier, c.subdivision_label, c.contenu, fused.score
  from fused join chunks c on c.id = fused.id
  order by fused.score desc
  limit $3
  ```

  (`50` and `60` are literals matching `PRE_FUSION_LIMIT`/`RRF_K` above - keep
  them in sync, or interpolate the constants into the query string since `pg`
  doesn't parameterize `LIMIT`/arithmetic cleanly here.)

  `toPgVector(embedding: number[]): string` mirrors `load-chunks.ts`'s helper
  (`[0.1,0.2,...]`) - small enough to duplicate rather than import across
  packages. `toChunk(row: HybridRow): Chunk` maps snake_case columns to the
  locked `Chunk` shape (`subdivisionLabel: row.subdivision_label ?? undefined`),
  and deliberately drops `score` and `embedding` from the returned object -
  `Chunk` is not changed by this feature (see Data / contracts); the RRF
  score is only used to order the array, which is already the ranking signal
  a caller needs.

  Export `SupabaseRetriever` from `packages/retrieval/src/index.ts`.

  *Done when:* `pnpm --filter @legirag/retrieval typecheck` passes;
  `const r: Retriever = new SupabaseRetriever();` typechecks, proving the
  interface is satisfied. (Live-behavior proof is step 4's job - a DB round
  trip can't be proven by typecheck alone.)

- [x] **Step 4 - Validation script** -
  `packages/retrieval/src/validate-search.ts` (`tsx --env-file=../../.env`,
  wired as `pnpm --filter @legirag/retrieval validate:search`), instantiating
  `SupabaseRetriever` and running:
  1. At least three real French legal smoke questions spanning at least two
     of the five demo codes (`code-de-la-route`, `code-penal`,
     `code-de-la-consommation`, `code-civil`, `code-general-des-impots`) -
     e.g. "vitesse maximale autorisée en agglomération", "délai de
     rétractation pour un achat en ligne", "peine encourue pour un vol
     simple". Logs each question's ranked results (`articleIdentifier`,
     `subdivisionLabel`, a ~150-char `contenu` preview) for a human to judge
     topical coherence - this is the build-plan's own done-when for 4d and is
     not itself scored (item 5/6's job).
  2. **Automated - `codes` filter:** a query restricted to `codes:
     ['code-civil']` returns zero chunks from any other `code_slug` (join
     back to `articles` to check). Logged pass/fail.
  3. **Automated - `dateReference` filter:** the same query with `codes`
     unset returns > 0 chunks by default, and returns exactly 0 chunks when
     `dateReference` is set to a date before every demo article's
     `date_debut` (e.g. `1900-01-01`) - proving `SupabaseRetriever` actually
     sets `app.date_reference` and switches to `anon`, not just that the
     database-level policy exists (4c already proved that part). Logged
     pass/fail.

  `process.exitCode = 1` if either automated check fails; the smoke-question
  output prints regardless, for manual review.

  *Done when:* run against the real Supabase project, both automated checks
  pass, and the smoke-question output is reviewed and judged coherent
  (results are on-topic for their code and query, not the wrong code or
  clearly unrelated articles).

- [x] **Repair F-01 - `formatDateReference` uses UTC day, not local "today"** -
  `packages/retrieval/src/query-params.ts`: derive the calendar day from a
  fixed `Europe/Paris` timezone (via `Intl.DateTimeFormat`) instead of
  `toISOString()`'s UTC day, so a caller passing `new Date()` near local
  midnight gets the correct French calendar day rather than one that can be a
  day behind. Add a regression test in `query-params.test.ts` using a
  local-time `Date` construction near a UTC day boundary (the kind of input
  the existing UTC-ISO-string test cases didn't exercise).
  *Done when:* `pnpm test` passes including the new boundary case; a manual
  repro with `TZ=Europe/Paris node -e "..."` at a time past local midnight but
  before UTC midnight returns the correct (later) local day.

- [x] **Repair F-02 - ROLLBACK/`end()` failures can mask the original error** -
  `packages/retrieval/src/supabase-retriever.ts`: wrap the `ROLLBACK` call
  (and `client.end()`) in the error path with their own try/catch, logging
  and swallowing a secondary failure there instead of letting it override the
  original thrown error.
  *Done when:* `pnpm typecheck`/`pnpm lint` stay green; the original error is
  still the one rethrown even if cleanup itself fails (reasoned through the
  code, no live connection-drop simulation needed for this edge case).

## Files / areas

- `packages/retrieval/src/pg-client.ts` (new)
- `packages/retrieval/src/query-params.ts` (new)
- `packages/retrieval/src/query-params.test.ts` (new)
- `packages/retrieval/src/supabase-retriever.ts` (new)
- `packages/retrieval/src/validate-search.ts` (new)
- `packages/retrieval/src/index.ts` (edit - export `SupabaseRetriever`)
- `packages/retrieval/package.json` (edit - add `pg`, `@types/pg`, `tsx`,
  `validate:search` script)

## Data / contracts

- No changes to `Retriever`, `Chunk`, or `RequeteRecherche`
  (`packages/shared/src/types.ts` / `interfaces.ts`) - all locked in item 1
  and used as-is.
- Locks retrieval-internal conventions other code may come to depend on:
  RRF `k = 60`; pre-fusion breadth fixed at top 50 for each list,
  independent of `topK`; final result count is `RequeteRecherche.topK`, not
  a hardcoded number; one `Client` per `search()` call, no pooling.
- Reuses 4c's GUC contract verbatim (`app.date_reference` `'YYYY-MM-DD'` or
  unset, `app.codes` comma-separated `code_slug` list or unset, both set via
  parameterized `select set_config(...)` inside the same transaction as the
  query, then `SET LOCAL ROLE anon` before the query runs).

## Testing

- `query-params.ts` is pure logic (date/string formatting) with real edge
  cases (undefined vs. empty `codes`) - gets Vitest coverage per the testing
  gate's scope rule, run via `pnpm test`.
- `SupabaseRetriever` itself is DB- and Bedrock-integration code (a real
  Postgres round trip plus a real embedding call), matching every other
  DB-touching script in this project (4b, 4c) - no unit-testable pure logic
  to mock, so it's verified by actually running `validate:search` against
  the live project, not a Vitest test.
- `pnpm typecheck` / `pnpm lint` stay green throughout.

## Notes for the AI

- Duplicate `pg-client.ts` into `retrieval` rather than moving
  `createDatabaseClient` into `shared`. The project already tolerates this
  kind of small duplication across `ingest`'s own `validate-*.ts` scripts;
  refactoring a completed package (`ingest`) to share it isn't this
  feature's job and isn't asked for.
- `extensions.vector` needs the schema prefix in casts (`$1::extensions.vector`)
  because the `vector` extension was installed `with schema extensions`
  (see `supabase/migrations/20260815135748_create_chunks.sql`) - matching
  the column's real type, not bare `vector`.
- Confirm `SET LOCAL ROLE anon` still succeeds for the `DATABASE_URL`
  connection before building the rest of step 3 - 4c already confirmed this
  for the same connection/role, but re-verify rather than assuming.
- Keep fixture-free: unlike 4c's `validate-rls.ts`, this script's checks
  (steps 4.2 and 4.3) run entirely against real demo-corpus data - no
  synthetic rows are inserted, nothing to roll back or clean up.
- If `websearch_to_tsquery('french', q.texte)` produces an empty tsquery
  (e.g. a stopword-only question), `keyword_search` legitimately returns
  zero rows and RRF falls back to the vector list alone - this is correct
  behavior, not a bug to special-case.

## Findings

### 04d/F-01 [P1] closed - formatDateReference uses UTC day, not local "today"

**File:** packages/retrieval/src/query-params.ts:5
**Found:** 2026-08-16 by /audit (scope: current)
**Why it matters:** `formatDateReference(date)` does `date.toISOString().slice(0, 10)`,
which reads the UTC calendar day. Every current caller (including
`validate-search.ts`) passes `new Date()` for "today." Reproduced with
`TZ=Europe/Paris node -e "..."`: at 2026-08-17 00:30 local time (Paris,
UTC+2 in August), `new Date()` -> `toISOString()` gives
`2026-08-16T22:30:00.000Z`, so `formatDateReference` returns `2026-08-16`,
one calendar day behind the caller's actual local "today." Fed into 4c's RLS
predicate (`article_visible`), an article whose `date_debut` is `2026-08-17`
would be wrongly hidden as not-yet-in-force during that window, and the
mirror case understates repeal timing. This lands squarely on the project's
central guarantee (project-overview.md's Problem section: "a stale citation
looks identical to a current one"). No demo-corpus row has a transition date
today, so it can't yet produce an observably wrong search result - the bug is
real and reproducible in isolation but currently dormant, and will start
mattering as soon as item 10 adds real historical/repeal dates.
`query-params.test.ts` doesn't catch it because its cases build `Date` from
UTC ISO strings, never from a local-time construction like `new Date()`.
**Suggested fix:** Derive the calendar day from the date the caller means as
"today" in a defined timezone (e.g. explicit `Europe/Paris` formatting via
`Intl.DateTimeFormat` with a fixed `timeZone`, since the server process's own
local timezone isn't guaranteed to be Paris), rather than UTC. Add a test that
mocks a local-time `Date` construction near a UTC day boundary to lock the
fix in.
**Resolution:** Fixed 2026-08-16 - `formatDateReference` now uses
`Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', ... })` instead of
`toISOString().slice(0, 10)`. Existing UTC-boundary test updated (its old
expectation encoded the bug - `2026-01-05T23:45:00.000Z` is already
`2026-01-06` in Paris) and a new regression test added reproducing the exact
F-01 scenario (`2026-08-17T00:30:00+02:00` -> `'2026-08-17'`, not `'2026-08-16'`).
Re-confirmed live with `TZ=Europe/Paris`. `pnpm test` (99/99), `pnpm typecheck`,
`pnpm lint` all green. Closed 2026-08-16 - re-reviewed the repaired
`query-params.ts`/`query-params.test.ts` fresh: `Intl.DateTimeFormat` pinned
to `Europe/Paris` is deterministic regardless of host/server timezone, the
regression test reproduces the exact original failure and passes, and the
old UTC-based test's stale expectation was corrected rather than left
inconsistent. No new defect introduced by the repair.

### 04d/F-02 [P3] closed - ROLLBACK/end failures in the catch/finally chain can mask the original error

**File:** packages/retrieval/src/supabase-retriever.ts:94-99
**Found:** 2026-08-16 by /audit (scope: current)
**Why it matters:** If the query inside the transaction fails due to a broken
connection (not a normal SQL error - Postgres still accepts `ROLLBACK` in an
aborted-but-connected transaction), the `catch` block's own
`client.query('ROLLBACK')` can throw a second error, and if `client.end()` in
`finally` also throws, JS `finally`-throws-override-catch-throws semantics
mean the original, more informative error is silently replaced. Narrow
window (connection loss specifically, not query errors in general), and no
data-correctness impact - only error-message quality in an already-rare
failure mode.
**Suggested fix:** Wrap the `ROLLBACK` (and optionally `client.end()`) in their
own try/catch inside the error path, log-and-swallow secondary failures, and
always rethrow the original `error`.
**Resolution:** Fixed 2026-08-16 - both `client.query('ROLLBACK')` in the
`catch` block and `client.end()` in `finally` are now wrapped in their own
try/catch, logging a secondary failure via `console.error` instead of letting
it override the original `error`, which is still always the one rethrown.
Verified by reading the resulting control flow (no live connection-drop
simulation - matches the finding's own suggested verification). `pnpm test`
(99/99), `pnpm typecheck`, `pnpm lint` all green. Closed 2026-08-16 -
re-traced the control flow in the repaired `supabase-retriever.ts` fresh:
`throw error` in the outer `catch` sits outside both inner try/catch blocks,
so it always propagates regardless of whether `ROLLBACK` or `client.end()`
themselves fail. No new defect introduced by the repair.

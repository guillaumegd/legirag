# Feature: Renvois table and load

**From build-plan:** feature 3b (sub-feature of 3 - Cross-reference graph)
**Status:** complete

## Goal

Create the `renvois` table in the connected Supabase project, resolve every
reference 3a's `extractRenvois` finds against the already-loaded `articles`
table (setting `cibleArticleId`/`resolu` where a target exists in this
corpus), and load the full extracted graph - so a query for any article
returns the other articles it references, with cross-code references
resolved just as reliably as same-code ones. This closes build-plan item 3
and is what item 4's `Retriever` and item 8's cross-reference-following loop
build on.

## In scope

- The `renvois` table, its indexes, foreign keys to `articles`, and RLS
  enabled with a public-read policy, applied as a tracked Supabase CLI
  migration (same flow 2d's Notes standardized on: `supabase migration new`,
  edit, `supabase db push` - not the MCP `apply_migration` tool)
- An in-memory resolution index built from the local corpus
  (`code_slug::normalized_article_num -> article_identifier`), and a pure
  `resolveRenvoi` function that looks up an `ExtractedRenvoi` in it - same-code
  references resolve against the source article's own `code_slug`, inter-code
  references resolve by slugifying the written `cibleCode` text with 2d's
  `slugifyCode` and looking that code up instead
- A load script that streams the local corpus twice (pass 1 builds the
  resolution index via `toArticle`, pass 2 re-derives each row's source
  article and calls `extractRenvois` on `article_contenu_text`, resolves each
  result, and writes `renvois` rows in batches), re-runnable without
  duplicating rows (idempotent delete-then-insert per batch, same pattern as
  2d's subdivisions load)
- A validation script proving the acceptance bar against the real database:
  total renvois loaded, resolved vs. unresolved counts and the resolution
  rate by `forme`, and a known real cross-reference example round-tripped
  correctly (source article -> its renvois -> each resolved target's own
  `article_num`/`code`)

## Out of scope

- Resolving what a target's `cibleSubdivision` text (e.g. `"sixième alinéa"`)
  points to inside the target article's own `subdivisions` rows - 3a already
  deferred this, and `Renvoi.cibleSubdivision` is stored as free text with no
  `subdivision_id` slot in the locked data model, so there is nothing for 3b
  to resolve it into
- Renvoi targets outside this corpus (a loi, ordonnance, décret, EU text, or a
  code genuinely absent from the ~77 loaded titles) - captured as best-effort
  text, left permanently `resolu: false` by design, not a defect to chase here
- The hybrid `Retriever` implementation and any query-time cross-reference
  traversal (item 4/8's job) - this feature only populates the table
- Re-running or improving 3a's extraction accuracy - that thresholded
  scorer already passed; 3b consumes `extractRenvois` as-is
- Historical versions (`palier: 'profondeur'`, item 10) - unaffected, every
  row here is `palier: 'largeur'` same as 2d
- KALI/`idcc`-sourced articles - COLD-only, same as every prior sub-feature

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Create the migration** - `supabase migration new
  create_renvois`, edit the generated file with the exact DDL in Data /
  contracts below (table, indexes, RLS enabled, public-read policy), then
  `supabase db push` against the connected project.
  *Done when:* `mcp__supabase__list_tables` (verbose) shows `renvois` with
  the documented columns, primary key, and both foreign keys (`source_article
  -> articles`, `cible_article_id -> articles`); `mcp__supabase__list_migrations`
  lists the new migration; `mcp__supabase__get_advisors` (security) reports no
  new RLS-related warning for the table.
- [x] **Step 2 - Resolution index and pure resolver, unit tested** - add
  `packages/ingest/src/cold/resolve-renvoi.ts` exporting
  `buildArticleIndex(rows: Iterable<{ articleIdentifier: string; articleNum: string; codeSlug: string }>): Map<string, string>`
  (key: `` `${codeSlug}::${normalizeArticleNum(articleNum)}` `` from 3a,
  value: `articleIdentifier`; a later row silently overwrites an earlier one
  on a duplicate key - not expected in practice per 2d's Notes, not worth
  guarding) and
  `resolveRenvoi(extracted: ExtractedRenvoi, sourceCodeSlug: string, index: Map<string, string>): { cibleArticleId?: string; resolu: boolean }`
  (target code slug is `sourceCodeSlug` when `extracted.cibleCode` is
  `undefined`, otherwise `slugifyCode(extracted.cibleCode)`; looks up
  `` `${targetCodeSlug}::${normalizeArticleNum(extracted.cibleArticleNum)}` ``
  in `index`; found -> `{ cibleArticleId, resolu: true }`, not found ->
  `{ cibleArticleId: undefined, resolu: false }`). Export both from
  `packages/ingest/src/index.ts`.
  *Done when:* `pnpm test` passes new cases in `resolve-renvoi.test.ts`: a
  same-code reference (`cibleCode: undefined`) resolves using
  `sourceCodeSlug`; a cross-code reference resolves by slugifying `cibleCode`
  to a different index entry; a reference whose normalized number isn't in
  the index returns `resolu: false` and `cibleArticleId: undefined`; a
  reference that matches a different code's `article_num` but not the
  intended `codeSlug` also returns unresolved (proving the lookup is
  code-scoped, not number-only).
- [x] **Step 3 - Load script** - add `packages/ingest/src/cold/load-renvois.ts`
  (`tsx --env-file=../../.env`, wired as
  `pnpm --filter @legirag/ingest load:renvois`): pass 1 streams
  `cold-corpus.ndjson` once, calling `toArticle` per row and feeding
  non-null results into `buildArticleIndex`; pass 2 streams the same file
  again, calling `toArticle` then, for non-null rows, `extractRenvois` on
  `article_contenu_text`, resolving each result with `resolveRenvoi` against
  the index built in pass 1, and writing in batches of 500 inside a
  transaction per batch: `delete from renvois where source_article =
  any($1)` for that batch's source article identifiers, followed by a bulk
  insert of the batch's freshly resolved renvoi rows (mirrors 2d's
  subdivisions delete-then-insert idempotency). Logs progress every 10,000
  rows in pass 2 and a final summary: articles processed, renvois extracted,
  renvois resolved, renvois unresolved.
  *Done when:* running it against the full local corpus completes with exit
  code 0, and the printed summary's resolved/unresolved split is in the same
  ballpark as 3a's Step 6 full-corpus validation (most same-code and
  well-formed cross-code references resolve; the confirmed ~18% loi/
  ordonnance/décret/convention share never reached extraction at all, so
  isn't counted here as unresolved).
- [x] **Step 4 - Validate the acceptance bar against the real database** - add
  `packages/ingest/src/cold/validate-renvois-load.ts`
  (`tsx --env-file=../../.env`, wired as
  `pnpm --filter @legirag/ingest validate:renvois-load`): runs one query for
  total `renvois` row count and resolved-vs-unresolved counts, one query for
  the resolution rate grouped by `forme`, and a targeted lookup for the real
  `LEGIARTI000031747801` example from 3a's sample (Code de l'énergie R142-11,
  the combined range+enumeration case) joining `renvois` to `articles` on
  `cible_article_id` and printing each resolved target's own `article_num`
  and `code` next to what `cible_article_num`/`cible_code` say was written.
  *Done when:* running it against the real Supabase project completes with
  exit code 0, the totals and by-`forme` breakdown are printed and consistent
  with Step 3's summary, and the `LEGIARTI000031747801` example prints all
  expected target rows correctly resolved (each resolved target's real
  `article_num` matches what was written) on manual read.
- [x] **Repair F-01 - `resolu` as a generated column** - new migration:
  `alter table renvois drop column resolu; alter table renvois add column
  resolu boolean not null generated always as (cible_article_id is not null)
  stored;`, applied via `supabase db push`. Update `load-renvois.ts` to stop
  passing `resolu` in its insert (generated columns reject explicit values).
  *Done when:* `mcp__supabase__list_tables` (verbose) shows `resolu` as a
  generated column; a query against the real table shows `resolu` still
  correct for the already-loaded 367,997 rows (recomputed from
  `cible_article_id` by the `ALTER TABLE`, no reload needed).
- [x] **Repair F-02 - shared corpus streaming helper** - add
  `packages/ingest/src/cold/corpus-stream.ts` exporting
  `streamColdCorpus(): AsyncGenerator<{ row: ColdArticleRow; article:
  MappedArticle | null }>` (reads `cold-corpus.ndjson`, parses each line,
  calls `toArticle`); update `load-corpus.ts` and both passes of
  `load-renvois.ts` to iterate it instead of each re-deriving the same
  read/parse/map sequence.
  *Done when:* `pnpm typecheck`/`pnpm test`/`pnpm lint` stay clean; a fresh
  `load:renvois` run against the real corpus reproduces the same totals as
  Step 3 (157,171 articles, 367,997 renvois).
- [x] **Repair F-03 - shared `placeholders()` helper** - add
  `packages/ingest/src/cold/sql-batch.ts` exporting `placeholders(rowCount,
  columnCount): string`; update `load-corpus.ts` and `load-renvois.ts` to
  import it instead of each defining their own copy.
  *Done when:* `rg "function placeholders"` finds exactly one definition;
  `pnpm typecheck`/`pnpm test`/`pnpm lint` stay clean.
- [x] **Repair F-04 - `RenvoiRow.forme` reuses `ExtractedRenvoi`'s union** -
  change `RenvoiRow.forme: string` to `forme: ExtractedRenvoi['forme']` in
  `load-renvois.ts`.
  *Done when:* `pnpm typecheck` stays clean (proving the narrower type still
  fits every call site).

## Files / areas

- `supabase/migrations/20260815004752_create_renvois.sql` (new)
- `supabase/migrations/20260815010743_make_renvois_resolu_generated.sql` (new,
  F-01 repair)
- `packages/ingest/src/cold/resolve-renvoi.ts` + `.test.ts` (new)
- `packages/ingest/src/cold/load-renvois.ts` (new)
- `packages/ingest/src/cold/validate-renvois-load.ts` (new)
- `packages/ingest/src/cold/corpus-stream.ts` (new, F-02 repair)
- `packages/ingest/src/cold/sql-batch.ts` (new, F-03 repair)
- `packages/ingest/src/cold/load-corpus.ts` (edit, F-02/F-03 repair: uses the
  new shared helpers)
- `packages/ingest/src/index.ts` - export `buildArticleIndex`, `resolveRenvoi` (edit)
- `packages/ingest/package.json` - add `load:renvois`, `validate:renvois-load`
  scripts (edit)

## Data / contracts

**New, load-bearing - the `renvois` table.** Item 4's `Retriever` and item 8's
cross-reference-following loop read from it. Exact DDL, snake_case columns,
same convention as 2d's `articles`/`subdivisions` DDL:

```sql
create table if not exists renvois (
  id bigint generated always as identity primary key,
  source_article text not null references articles (article_identifier) on delete cascade,
  cible_article_num text not null,
  cible_code text,
  cible_article_id text references articles (article_identifier) on delete set null,
  cible_subdivision text,
  forme text not null check (forme in ('simple', 'enumeration', 'plage')),
  inter_code boolean not null,
  offset_debut integer,
  offset_fin integer,
  resolu boolean not null generated always as (cible_article_id is not null) stored
);

create index if not exists idx_renvois_source_article on renvois (source_article);
create index if not exists idx_renvois_cible_article_id
  on renvois (cible_article_id) where cible_article_id is not null;

alter table renvois enable row level security;
create policy renvois_public_read on renvois for select using (true);
```

`cible_article_id` uses `on delete set null` rather than `cascade` - a target
article being removed later (item 10's historical-version work could in
principle repoint identifiers) should degrade the renvoi to unresolved, not
silently delete a real reference row whose `source_article` is still valid.
`resolu` is a generated column (added by the Repair F-01 migration, after the
initial migration shipped it as an independent stored boolean) rather than a
value the loader writes - this makes "degrade to unresolved" actually happen
automatically on that future `on delete set null`, instead of depending on
the loader to keep two columns in sync.

- **New, load-bearing:** `buildArticleIndex(...): Map<string, string>` and
  `resolveRenvoi(...): { cibleArticleId?: string; resolu: boolean }`
  (`packages/ingest/src/cold/resolve-renvoi.ts`) - reuses 3a's
  `normalizeArticleNum` and 2d's `slugifyCode` so resolution can never drift
  from either feature's normalization rules.
- No changes to `packages/shared`'s locked `Renvoi` type - this feature loads
  that exact shape (minus the `id` Postgres assigns).

## Testing

- `buildArticleIndex` and `resolveRenvoi` are pure logic with real edge cases
  (same-code vs. cross-code resolution, an unresolvable target, a
  code-scoped near-miss) - covered by unit tests per the project's testing
  gate (`pnpm test`, declared in `AGENTS.md`).
- The migration (Step 1), load script (Step 3), and validation script
  (Step 4) run against the real corpus and the real connected Supabase
  project - not unit-tested, verified by their actual run's exit code, the
  MCP tool checks named in Step 1's done-when, and Step 4's printed output,
  same pattern as 2d.

## Notes for the AI

- **Why the resolution index is built from the local corpus, not queried
  from Supabase per lookup:** 157,174 articles is small enough to hold
  in-memory as a `Map`, and 3a already streams the same local
  `cold-corpus.ndjson` twice-equivalent cost (Step 6's full-corpus
  validation) without issue. A per-renvoi network round trip against
  Supabase would be far slower for no accuracy benefit, since the local file
  and the loaded table are the same data (2d loaded it verbatim).
- **Why pass 1 and pass 2 both call `toArticle`, not a cached array:**
  keeping two independent streaming passes (same pattern already proven safe
  by 3a's Step 6 and 2d's Step 3) avoids holding the full parsed corpus in
  memory twice - only the compact index (`Map<string, string>`) needs to
  survive from pass 1 into pass 2.
- **`cible_article_num`/`cible_code` stay stored as written even when
  resolved:** matches the locked `Renvoi` type's framing (`cibleArticleNum`:
  "tel qu'écrit") - `cible_article_id` is the resolved pointer,
  `cible_article_num`/`cible_code` remain the audit trail of what the source
  text actually said, useful if `slugifyCode` or normalization rules change
  later and resolution needs re-running without re-extracting.
- **Recovery from a failed or interrupted load run:** same as 2d - no retry
  logic needed. Because Step 3 deletes-then-inserts per batch of source
  articles, re-running the script to completion after any failure converges
  to the correct end state.
- Never `Read` `cold-corpus.ndjson` in full (157k lines, ~420MB) while
  building or reviewing this - use `wc -l`, `grep`, small `head`/sample
  reads, or a script's own streaming pass, same rule every prior COLD
  sub-feature followed.
- Match `packages/ingest/src/cold/`'s existing comment convention: French for
  files describing French legal-text ingestion decisions (`resolve-renvoi.ts`,
  `load-renvois.ts`, `validate-renvois-load.ts`), English exported names.
- Follow the `tsx --env-file=../../.env` precedent (2d) for both new scripts
  that need `DATABASE_URL` - no `dotenv` dependency.
- Migration tooling: use the Supabase CLI flow directly (`supabase migration
  new`, edit, `supabase db push`) - 2d's Notes record that the MCP
  `apply_migration` path was tried first and explicitly replaced with the CLI
  flow; don't reintroduce it here.

## Findings

- **03b/F-01** [P2] closed - `resolu` was stored independently of
  `cible_article_id` even though `resolveRenvoi` guarantees they're always in
  sync at write time. A future target-article delete (`on delete set null`)
  would leave a stale `resolu = true` pointing at nothing. Found 2026-08-15 by
  `/audit`. Fixed by migration `20260815010743_make_renvois_resolu_generated.sql`
  (drop + re-add `resolu` as `generated always as (cible_article_id is not
  null) stored`); `load-renvois.ts` no longer passes `resolu` in its insert.
  Applied to the real project; the `ALTER TABLE` recomputed all 367,997
  existing rows with no reload needed. Closed 2026-08-15 after a fresh
  `/audit` pass independently queried the live table
  (`count(*) filter (where resolu and cible_article_id is null) = 0` across
  all rows), confirmed `resolu` is `generated` via `list_tables`, and
  `get_advisors` (security) reported zero new warnings.
- **03b/F-02** [P2] closed - the corpus streaming + row-mapping loop (read
  `cold-corpus.ndjson`, parse with `ColdArticleRow.parse`, map with
  `toArticle`, skip `null`) was duplicated three times: once in
  `load-corpus.ts`, twice more across `load-renvois.ts`'s two passes - and had
  already drifted once (pass 1 kept only three fields, pass 2 the full
  object). Found 2026-08-15 by `/audit`. Fixed by adding
  `packages/ingest/src/cold/corpus-stream.ts` (`streamColdCorpus()`); both
  load scripts now iterate it instead of re-deriving the sequence, each
  keeping its own skip decision. Verified with a fresh `load:renvois` run
  against the real corpus reproducing the exact original totals (157,171
  articles, 367,997 renvois, 294,594 resolved). Closed 2026-08-15 after a
  fresh `/audit` pass confirmed exactly one `streamColdCorpus` implementation
  with no leftover inline loop in either load script.
- **03b/F-03** [P3] closed - the `placeholders()` SQL-batch helper was
  duplicated verbatim between `load-corpus.ts` and `load-renvois.ts`. Found
  2026-08-15 by `/audit`. Fixed by adding
  `packages/ingest/src/cold/sql-batch.ts`; both load scripts import it now.
  Closed 2026-08-15 after a fresh `/audit` pass confirmed
  `rg "function placeholders"` finds exactly one definition.
- **03b/F-04** [P3] closed - `RenvoiRow.forme` was typed `string` instead of
  reusing `ExtractedRenvoi`'s locked `'simple' | 'enumeration' | 'plage'`
  union, discarding a compile-time guarantee for no benefit. Found 2026-08-15
  by `/audit`. Fixed by changing the field to `forme: ExtractedRenvoi['forme']`.
  Closed 2026-08-15 after a fresh `/audit` pass re-confirmed the narrower type
  with a clean `pnpm typecheck`.

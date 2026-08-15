# Feature: Chunks table, embeddings, and indexes

**From build-plan:** feature 4b (sub-feature of 4 - Search index and access-control policies)
**Status:** complete

## Goal

Give the corpus a searchable, embedded index: prune the Supabase project down
to a demo-sized set of codes (the free-tier database is at 499/500 Mo with
zero headroom, and embedding the full 157k-article corpus would need
2-3 Go), then create the `chunks` table, embed every chunk with Cohere
embed-v4 via Bedrock, and add the HNSW/GIN/B-tree indexes. This is what 4c's
RLS policies and 4d's hybrid `Retriever` are built on top of.

## Scope decision (confirmed this session)

Demo corpus: **Code de la route, Code pénal, Code de la consommation, Code
civil, Code général des impôts** (`code-de-la-route`, `code-penal`,
`code-de-la-consommation`, `code-civil`, `code-general-des-impots`) - 9 708
articles, an estimated ≈21 300 chunks, ≈228 Mo total database size after
pruning + embedding. Confirmed against real row counts and chunk estimates
from the connected Supabase project, not guessed.

Pruning the other 68 codes is not a permanent narrowing of the product: every
deleted row is reproducible from the local `cold-corpus.ndjson` via the
already-built `load-corpus.ts`/`load-renvois.ts` (deterministic, no LLM
cost), so widening the demo scope later is a re-run, not a rebuild.

## In scope

- **Prune the corpus to the 5 demo codes** - delete every `articles` row
  whose `code_slug` isn't in the demo set (cascades to `subdivisions` and
  `renvois` via existing foreign keys - `on delete cascade` for
  `subdivisions.article_identifier` and `renvois.source_article`, `on delete
  set null` for `renvois.cible_article_id`, which correctly flips the
  generated `resolu` column to `false` for renvois that pointed outside the
  kept scope), then `VACUUM FULL` the three tables to actually reclaim the
  freed disk space (a plain `DELETE` doesn't shrink a table's file size on
  its own)
- The `chunks` table (`packages/shared`'s locked `Chunk` type: `id`,
  `article_identifier`, `subdivision_label?`, `contenu`, `embedding
  vector(1024)`), with a generated `tsv tsvector` column (French
  configuration) for keyword search
- An embedding helper in `packages/shared` wrapping Cohere embed-v4 via
  Bedrock (env-var-driven model id, same pattern as `bedrockProvider`)
- A load script that reads the (now-pruned) `articles`/`subdivisions`,
  chunks them with 4a's `chunkArticle`, embeds each batch, and inserts into
  `chunks` - resumable (skips articles that already have chunk rows, so a
  rerun after a failure doesn't re-pay embedding cost for completed work)
- HNSW (`chunks.embedding`), GIN (`chunks.tsv`), and B-tree
  (`articles.etat`, `articles(code_slug, date_debut, date_fin)`) indexes,
  added after the data is loaded (building HNSW before a bulk load is a
  known pitfall - slow and pointless to maintain incrementally per insert)
- A validation script: chunk count, zero missing embeddings, indexes present,
  final database size, and one manual raw-SQL nearest-neighbor sanity query

## Out of scope

- RLS policies enforcing `etat`/date/code/`idcc` filtering (4c) - `chunks`
  gets RLS enabled with the same temporary `using (true)` public-read policy
  `articles`/`subdivisions`/`renvois` already carry, exactly as permissive as
  the rest of the schema is today
- The hybrid `Retriever` implementation, RRF fusion, and any `RequeteRecherche`-shaped
  querying (4d)
- Reranking and the abstention threshold (item 6)
- Widening the demo scope beyond the 5 confirmed codes, or the KALI/`idcc`
  branch
- Further splitting a chunk by token/character length (4a already fixed the
  chunk unit at subdivision-or-article, nothing smaller)
- Precise USD cost accounting - the load script logs chunk/character counts
  as a proxy; actual Bedrock billing is checked in the AWS console after the
  run (feeds item 12's observability work later, not built now)

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

**Step 1 is destructive against the live Supabase project (deletes ~95% of
`articles`/`subdivisions`/`renvois` rows).** It gets an explicit before/after
report and a fresh go-ahead at implement time, on top of the scope already
confirmed in this session - not just a diff review.

## Build steps

- [x] **Step 1 - Prune the corpus to the demo scope** - add
  `packages/ingest/src/cold/demo-scope.ts` exporting
  `DEMO_CODE_SLUGS = ['code-de-la-route', 'code-penal', 'code-de-la-consommation', 'code-civil', 'code-general-des-impots']`
  (single source of truth - nothing else in this feature hardcodes the list).
  Add `packages/ingest/src/cold/prune-corpus.ts`
  (`tsx --env-file=../../.env`, wired as `pnpm --filter @legirag/ingest
  prune:corpus`): prints current row counts and `pg_database_size` first,
  runs `delete from articles where code_slug != all($1)` with
  `DEMO_CODE_SLUGS`, then `VACUUM FULL articles; VACUUM FULL subdivisions;
  VACUUM FULL renvois;` as separate statements (not inside the delete's
  transaction - `VACUUM` cannot run inside a transaction block), then prints
  the after counts and size. If `VACUUM FULL` fails for lack of temp space,
  the already-installed `pg_repack` extension is the documented fallback
  (needs less peak space) - not built preemptively, only if the plain path
  fails.
  *Done when:* run against the real Supabase project, exit code 0; before
  counts match today's real numbers (157 171 articles, 196 349 subdivisions,
  367 997 renvois); after counts match the confirmed scope exactly (9 708
  articles, 13 627 subdivisions, 23 893 renvois - real numbers from the
  connected project, not estimates); `pg_database_size` drops from ≈499 Mo to
  roughly 20-30 Mo.
- [x] **Step 2 - `chunks` table migration** - `supabase migration new
  create_chunks`, containing `create extension if not exists vector with
  schema extensions;` (already installed, kept for reproducibility), the
  `chunks` table (`id bigint generated always as identity primary key`,
  `article_identifier text not null references articles (article_identifier)
  on delete cascade`, `subdivision_label text`, `contenu text not null`,
  `embedding vector(1024)`, `tsv tsvector generated always as
  (to_tsvector('french', contenu)) stored`), a plain B-tree index on
  `article_identifier`, RLS enabled, and a `chunks_public_read` policy
  (`using (true)`, same temporary shape as the other three tables). Apply
  with `supabase db push` (the project's established migration flow, not the
  MCP `apply_migration` tool - see 2d/3b's Notes).
  *Done when:* `mcp__supabase__list_tables` (verbose) shows `chunks` with the
  documented columns, PK, FK to `articles`, and RLS enabled;
  `mcp__supabase__list_migrations` lists the new migration;
  `mcp__supabase__get_advisors` (security) reports no new warning.
- [x] **Step 3 - Embedding helper + resumable load script** - the installed
  `@ai-sdk/amazon-bedrock` (2.2.12) only implements Amazon Titan's embedding
  request shape internally (`inputText`/`dimensions`/`normalize`) regardless
  of which model id is passed - it lists Cohere model ids in its TypeScript
  types but never builds Cohere's real request body
  (`texts`/`input_type`/`output_dimension`), and its default `output_dimension`
  for Cohere on Bedrock is 1536 (not this schema's locked 1024) with a hard
  96-texts-per-call limit the SDK doesn't enforce for this model
  (`maxEmbeddingsPerCall` is unset). So this step calls Bedrock's
  `InvokeModel` directly instead of going through `ai`/`bedrock.embedding()`.
  Add `@aws-sdk/client-bedrock-runtime` as a `packages/shared` dependency
  (does not touch `bedrockProvider`/`ModelProvider` - separate client,
  separate file). Add `packages/shared/src/providers/embedding.ts` exporting
  `async function embedTexts(texts: string[], inputType: 'search_document' | 'search_query'): Promise<number[][]>`:
  batches internally at 96 texts per call, sends
  `{ texts, input_type: inputType, output_dimension: 1024 }` to
  `requireEnv('MODEL_EMBEDDING')` via `InvokeModelCommand`, validates the
  response with a Zod schema (`{ embeddings: number[][] }`) per the external-payload
  rule in `coding-standards.md`. This feature only ever calls it with
  `'search_document'` (indexing) - `'search_query'` is for item 8's future
  query-time embedding, not used here, but the parameter is explicit now so
  it's never silently defaulted to the wrong one later (Cohere's docs are
  explicit that mismatching the two degrades retrieval quality). Export
  `embedTexts` from `packages/shared/src/index.ts`. Add
  `packages/shared/src/providers/embedding.test.ts` (mock
  `BedrockRuntimeClient`/`InvokeModelCommand`; assert it throws
  `"Variable d'environnement manquante : MODEL_EMBEDDING"` when unset, sends
  the right `input_type`/`output_dimension`, and splits a >96-text input into
  multiple calls). Add `MODEL_EMBEDDING=` to `.env.example` next to
  `MODEL_VOLUME`/`MODEL_ESCALADE`, commented as Cohere embed-v4 via Bedrock
  (distinct from `COHERE_API_KEY`, which stays reranking-only per the
  existing comment).
  Add `packages/ingest/src/cold/load-chunks.ts` (`tsx --env-file=../../.env`,
  wired as `pnpm --filter @legirag/ingest load:chunks`): queries
  `article_identifier`s already present in `chunks` to build a skip-set,
  reads the remaining pruned `articles` + their `subdivisions` from Supabase,
  batches by **whole articles** (never splitting one article's chunks across
  two batches - a batch is a fixed number of articles, not a fixed chunk
  count, so a crash mid-run never leaves an article half-loaded; `embedTexts`
  handles the 96-per-call Bedrock limit internally regardless of batch size),
  calls `chunkArticle` per article, embeds the batch's chunk texts with
  `embedTexts(texts, 'search_document')`, formats each embedding as a pgvector literal
  (`` `[${embedding.join(',')}]` ``, no extra dependency needed), and bulk
  inserts the batch's rows (`sql-batch.ts`'s `placeholders()`, same pattern
  as `load-renvois.ts`). Logs progress per batch and a final summary: articles
  processed, chunks inserted, total characters submitted for embedding.
  *Done when:* run against the real Supabase project, exit code 0; a second
  run immediately after processes zero additional articles (idempotent);
  final summary's chunk count is in the same ballpark as the ≈21 300 estimate.
- [x] **Step 4 - HNSW/GIN/B-tree indexes migration** - `supabase migration
  new add_chunks_indexes`, containing `create index ... on chunks using hnsw
  (embedding vector_cosine_ops)`, `create index ... on chunks using gin
  (tsv)`, `create index ... on articles (etat)`, and `create index ... on
  articles (code_slug, date_debut, date_fin)`. The B-tree is keyed on
  `code_slug`, not the literal `code` name text from the cahier des charges
  snippet - deliberate, for consistency with every other filter/index in
  this schema already keyed on `code_slug` (`idx_articles_code_slug_article_num`,
  `RequeteRecherche.codes`, `codeSlug` throughout `packages/ingest`). Applied
  with `supabase db push`, run only after Step 3's load completes (index-after-bulk-load,
  not the reverse - noted pitfall in the roadmap).
  *Done when:* `mcp__supabase__list_migrations` lists it;
  `mcp__supabase__execute_sql` against `pg_indexes` shows all four new
  indexes; `mcp__supabase__get_advisors` (performance) shows no new warning.
- [x] **Step 5 - Validate the full result** - add
  `packages/ingest/src/cold/validate-chunks-load.ts`
  (`tsx --env-file=../../.env`, wired as `pnpm --filter @legirag/ingest
  validate:chunks-load`): reports total `chunks` rows, count with a `null`
  embedding (must be zero), count with a `null` `tsv` (must be zero unless
  `contenu` was empty, which 4a already guarantees never happens), the four
  index names from `pg_indexes`, and `pg_database_size`. Also runs one raw
  SQL nearest-neighbor query (`order by embedding <=> $1 limit 5` against a
  known chunk's own embedding, or a manually embedded test phrase) and prints
  the returned chunks' `article_identifier`/`contenu` prefix for a manual
  plausibility read - not the full `Retriever` (4d), just a spot check that
  the embeddings aren't degenerate.
  *Done when:* run against the real Supabase project, exit code 0; embedding/tsv
  null counts are both 0; all four indexes present; `pg_database_size` lands
  in the confirmed ≈150-250 Mo range (comfortably under the 500 Mo cap); the
  nearest-neighbor spot check returns plausible, non-identical results on
  manual read.
- [x] **Repair F-01 - one INSERT per batch, not per article**
  - `load-chunks.ts` called `insertChunks` once per article inside
    `processBatch`'s loop instead of once for the whole batch, deviating
    from this step's own spec text and from `load-renvois.ts`'s
    `replaceRenvois` pattern. Flattened all of a batch's `(article, chunk,
    embedding)` rows into one array and issue a single bulk INSERT per
    batch, matching the established pattern.
  *Done when:* `pnpm typecheck`/`lint`/`test` stay green; deleted 7 chunks
  across 3 real articles (1, 1, and 5 chunks) from the live project, reran
  `load:chunks`, confirmed it detected exactly 3 remaining articles and
  reinserted all 7 rows via a single batch INSERT; `chunks` back to
  21 299 rows / 9 708 articles / 0 missing embeddings.

## Files / areas

- `packages/ingest/src/cold/demo-scope.ts` (new)
- `packages/ingest/src/cold/prune-corpus.ts` (new)
- `supabase/migrations/..._create_chunks.sql` (new)
- `packages/shared/src/providers/embedding.ts` (new)
- `packages/shared/src/providers/embedding.test.ts` (new)
- `packages/shared/src/index.ts` (edit - export `embedTexts`)
- `packages/shared/package.json` (edit - add `@aws-sdk/client-bedrock-runtime`)
- `.env.example` (edit - add `MODEL_EMBEDDING`)
- `packages/ingest/src/cold/load-chunks.ts` (new)
- `supabase/migrations/..._add_chunks_indexes.sql` (new)
- `packages/ingest/src/cold/validate-chunks-load.ts` (new)
- `packages/ingest/package.json` (edit - `prune:corpus`, `load:chunks`,
  `validate:chunks-load` scripts)

## Data / contracts

- `chunks` table matches the locked `Chunk` type in
  `packages/shared/src/types.ts` exactly: `id`, `article_identifier` (FK),
  `subdivision_label` (nullable), `contenu`, `embedding vector(1024)`, plus
  the generated `tsv` column (not part of the TS type - a DB-only search
  artifact, same relationship `articles.tsv` would have had if 2d had built
  it, which it didn't and doesn't need to: nothing queries articles directly
  by keyword, only chunks).
- `embedTexts(texts: string[], inputType: 'search_document' | 'search_query'): Promise<number[][]>`
  is the one new cross-package contract - `packages/agent`'s future
  query-embedding step (item 8) and 4d's `Retriever` both call this same
  function (with `'search_query'`), so its signature is locked here, not
  re-decided later. Calls Bedrock's `InvokeModel` directly via
  `@aws-sdk/client-bedrock-runtime` (not the `ai`/`@ai-sdk/amazon-bedrock`
  wrapper `bedrockProvider` uses - see Step 3 for why), with `output_dimension`
  pinned to 1024 to match the locked `chunks.embedding vector(1024)` column.
- Demo scope (`DEMO_CODE_SLUGS`) lives only in `packages/ingest` (an
  ingestion-time decision), not in `packages/shared` - nothing outside
  ingestion needs to know the list, since after Step 1 the database itself
  is the source of truth for what's in scope.
- No changes to the `Chunk`, `Article`, `Subdivision`, or `Renvoi` TypeScript
  types themselves.

## Testing

- `embedTexts` is in-scope logic (env-var-required behavior, correct
  model/args passed to `embedMany`) - covered by `embedding.test.ts`, same
  pattern as `bedrock.test.ts`.
- `prune-corpus.ts`, `load-chunks.ts`, and `validate-chunks-load.ts` are
  integration scripts hitting a real external service (Supabase, Bedrock) -
  per the testing gate's own scope rule, not unit-tested; verified by running
  them against the real project, matching every prior `load-*.ts`/`validate-*.ts`
  script in this codebase (none of which have unit tests either).

## Notes for the AI

- `embedding vector(1024)` is a fixed-width column; `embedTexts` pins
  `output_dimension: 1024` explicitly in the request rather than relying on
  Cohere's default (1536), since a silent dimension mismatch would only
  surface at insert time, after the (paid) embedding call already succeeded.
  If `MODEL_EMBEDDING` is ever pointed at a model that ignores or doesn't
  support `output_dimension`, the insert still fails loudly with a Postgres
  dimension mismatch as a last-resort guard.
- No `pgvector` npm package needed - formatting `number[]` as
  `` `[${arr.join(',')}]` `` and passing it as a normal string query parameter
  is sufficient for `pg` to insert into a `vector` column.
- At ~21 300 rows total, none of this is at a scale where HNSW build time is
  actually a problem (the roadmap's "HNSW builds slowly" warning is about
  millions of rows) - the after-bulk-load ordering is still correct practice,
  just not urgent at this size.
- Step 1's `DEMO_CODE_SLUGS` is the only place the 5-code scope is written
  down in code. If the demo scope ever changes, that's a one-line edit plus a
  re-run of `prune:corpus` (additive re-runs of `load:corpus`/`load:renvois`
  first, if widening beyond what's already pruned away).
- Real Bedrock cost from this run belongs in the user's own notes for item
  12 later - this feature only logs the proxy numbers (chunks, characters),
  it doesn't build cost tracking.

## Findings

- **04b/F-01** [P2] closed - `load-chunks.ts` called `insertChunks` once per
  article inside `processBatch`'s loop instead of once per batch, deviating
  from this step's own spec text ("bulk inserts the batch's rows... same
  pattern as `load-renvois.ts`") and from `load-renvois.ts`'s
  `replaceRenvois` pattern - ~9 708 extra network round-trips for no
  resumability benefit. Found 2026-08-15 by `/audit`. Fixed by flattening
  all of a batch's rows into one array and issuing a single bulk INSERT per
  batch. Closed 2026-08-15 after a fresh `/audit` pass independently
  re-verified the real database (21 299 chunks, 0 missing embeddings, 9 708
  articles) and confirmed no new defect was introduced.

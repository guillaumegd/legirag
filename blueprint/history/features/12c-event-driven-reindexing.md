# Feature: Event-driven reindexing on text updates

**From build-plan:** feature 12c (third sub-item of 12, "Observability and
infrastructure automation")
**Status:** complete

## Goal

Today, chunking/embedding (4b's `load-chunks.ts`) only ever processes
articles that have **zero** existing chunks - it explicitly skips any
`article_identifier` already present in `chunks`. But `load-corpus.ts`
(2d) already upserts articles with `on conflict (article_identifier) do
update set contenu_text = excluded.contenu_text, ...` - the schema already
anticipates the same article's text being reloaded with different content
(a corrected re-fetch, a future non-COLD source). When that happens today,
the article row updates but its `chunks` silently go stale forever, since
nothing ever re-triggers chunking for an article that already has rows.
This feature closes that gap: a Postgres trigger captures the event (an
article's text actually changed) directly in the database, independent of
which script wrote it, and a worker drains the resulting queue and
replaces exactly that article's chunks/embeddings - never the whole corpus.

## In scope

- A `reindex_queue` table and an `articles` trigger that enqueues an
  `article_identifier` whenever `contenu_text` or `contenu_markdown`
  actually changes (insert, or update where the new value differs from the
  old one) - `IS DISTINCT FROM`, not just "an UPDATE ran", so a re-run that
  writes identical content enqueues nothing.
- A worker script that drains the queue in batches, recomputes chunks (4a's
  `chunkArticle`, unchanged) and embeddings (4b's `embedTexts`, unchanged)
  for exactly those articles, replaces their existing `chunks` rows
  (delete-then-insert, same idempotent shape `load-corpus.ts` already uses
  for `subdivisions`), and removes them from the queue.
- RLS on `reindex_queue`, default-deny (no policies) - an internal ops
  table, never read by the public API.

## Out of scope

- Any live external trigger (a DILA/LEGI webhook, a scheduled re-fetch).
  No such upstream feed exists yet - the event this feature reacts to is a
  change already landing in this database, from whatever wrote it
  (`load-corpus.ts` today, any future ingestion source later). Wiring an
  actual external source that calls `load-corpus.ts` on a schedule is
  separate infrastructure work, not this feature.
- Running the worker automatically on a schedule or via a serverless
  trigger (a cron job, a Supabase Edge Function, a Terraform-provisioned
  worker). That's deployment/infra wiring - item 12d or a later
  operational concern. This feature ships a script that can be invoked
  manually or by any scheduler later; it does not provision the scheduler.
- Reacting to `subdivisions` changing independently of `articles.contenu_markdown`
  (e.g., a future subdivision-parser upgrade producing different splits
  from the same source text). Out of scope - the build-plan line is about
  *text* updates, and subdivisions are already fully derived from
  `contenu_markdown` today, so a markdown change already covers the
  realistic case.
- Renvois (cross-references) re-extraction when text changes. `renvois`
  extraction (item 3) is a separate pipeline from chunking; re-triggering
  it is a different, larger feature, not implied by "recompute its
  chunk(s)/embedding(s)" in the build-plan line.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `reindex_queue` table and trigger** - new migration:
  `reindex_queue (article_identifier text primary key references articles
  on delete cascade, queued_at timestamptz not null default now())`, RLS
  enabled with no policies, and a trigger function `enqueue_reindex()`
  (`after insert or update on articles for each row`) that inserts
  (upserting `queued_at`) into `reindex_queue` only when `TG_OP =
  'INSERT'` or `NEW.contenu_text IS DISTINCT FROM OLD.contenu_text OR
  NEW.contenu_markdown IS DISTINCT FROM OLD.contenu_markdown`. *Done when:*
  the migration applies cleanly, and a live `UPDATE articles SET
  contenu_text = contenu_text` (identical value) on a real row enqueues
  nothing, while a live `UPDATE ... SET contenu_text = contenu_text || ' '`
  (an actual change) enqueues exactly that one `article_identifier`.
- [x] **Step 2 - Chunk-replacement function** - a `replaceChunksForArticle`
  function (new file, e.g. `packages/ingest/src/cold/replace-chunks.ts`)
  taking a DB client, an article row, and its subdivisions, that computes
  fresh chunks via the existing `chunkArticle` (4a, unchanged), embeds them
  via the existing `embedTexts` (4b, unchanged), deletes that article's
  existing `chunks` rows, and inserts the fresh ones - all in one
  transaction so a failure never leaves an article with partial or zero
  chunks. No DB-touching file in this package has a mocked-client unit test
  today (`load-chunks.ts`/`load-corpus.ts`/`load-renvois.ts` are all
  verified live, not mocked) - this function follows that same, already
  -established precedent rather than introducing a new pattern; its `chunkArticle`
  call is already covered by 4a's existing tests. *Done when:* `pnpm
  typecheck`/`pnpm build` pass; live verification happens together with
  Step 4.
- [x] **Step 3 - `process-reindex-queue` script** - a new script
  (`packages/ingest/src/cold/process-reindex-queue.ts`, mirroring
  `load-chunks.ts`'s batching/logging shape) that selects queued
  `article_identifier`s (batched, same `BATCH_SIZE` convention), fetches
  each article and its subdivisions, calls `replaceChunksForArticle`, then
  deletes the processed rows from `reindex_queue`, logging a running
  summary. Idempotent and resumable: an interrupted run leaves unprocessed
  rows queued, safe to rerun. *Done when:* running it live against a real
  queued article replaces its `chunks` rows (old ones gone, new ones
  present with fresh embeddings) and leaves `reindex_queue` empty for that
  article.
- [x] **Step 4 - End-to-end live proof** - manually change a real article's
  `contenu_text` (a throwaway, reversible `UPDATE` on a non-critical row,
  or a repeat `load-corpus.ts` run with one row's source text tweaked),
  confirm the trigger enqueued it, run the Step 3 script, and confirm the
  live `chunks` table reflects the new text (query the new chunk's
  `contenu`) - then revert the manual change and rerun the pipeline so the
  demo corpus ends this feature exactly as it started. *Done when:* the
  before/after query output is captured showing the full cycle worked, and
  the corpus is confirmed back to its original state afterward.

## Files / areas

- `supabase/migrations/` - new migration for `reindex_queue` + trigger.
- `packages/ingest/src/cold/replace-chunks.ts` - new.
- `packages/ingest/src/cold/process-reindex-queue.ts` - new script.
- `packages/ingest/src/cold/load-chunks.ts` - unchanged (still the
  fill-missing-only initial-load script; this feature adds the
  already-loaded-but-changed path alongside it, not instead of it).
- No changes to `chunking.ts` (4a), `subdivisions.ts` (2c), or the
  embedding call in `@legirag/shared` (4b) - all reused as-is.

## Data / contracts

- `reindex_queue` (new table) - internal ops state, never exposed through
  any API endpoint or `Retriever`/`ModelProvider` interface. Not a
  cross-package contract.
- No changes to `Article`, `Chunk`, or any `packages/shared` type.

## Testing

- No new unit-testable pure logic here - `replaceChunksForArticle` (Step 2)
  is DB/embedding orchestration built entirely from already-tested pieces
  (`chunkArticle`, 4a) and already-conventionally-untested DB write
  patterns in this exact package (`load-chunks.ts`, `load-corpus.ts`,
  `load-renvois.ts` have no test files either). All four steps are
  verified live against the real database instead, same evidence style as
  every other migration/load-script step in items 2-4.

## Notes for the AI

- The trigger is the load-bearing piece: it must fire regardless of which
  script or manual `UPDATE` changed the row, so the event is captured at
  the data layer, not re-implemented in every ingestion script that might
  someday write to `articles`. Do not add "call the reindex worker" logic
  into `load-corpus.ts` itself - that would defeat the point.
- Keep `queued_at` updated (not duplicated) on a re-enqueue of an
  already-queued article (`on conflict (article_identifier) do update set
  queued_at = now()`) - an article that changes twice before the worker
  runs still only needs processing once.
- Step 4's live proof must leave the real corpus unchanged when done - this
  is shared project data, not a scratch table. Confirm the revert before
  ending the step.
- Follow `coding-standards.md`'s RLS convention: enable RLS on the new
  table even though no policy grants access, matching this project's
  "never trust application code alone" posture (4c, `article_visible()`).

# Feature: Naive baseline

**From build-plan:** feature 6a (sub-feature of 6 - Retrieval quality
improvements, each measured in isolation)
**Status:** not started

## Goal

Establish the quality floor that 6b (contextual chunking), 6c (hybrid search),
and 6d (re-ranking) are each measured against. Build a deliberately weak
retrieval path - whole-article chunks with no hierarchical context, ranked by
brute-force vector similarity only - and score it through the existing eval
harness (item 5), so every later sub-feature's improvement has a real number
to show a lift over, not just "looks better."

## In scope

- `naiveChunk`, a pure function turning an article into one whole-text chunk
  with **no** hierarchical context prefix (unlike 4a's `chunkArticle`, which
  always prefixes `code › sectionPath › Article N`) - the deliberate weakness
  this sub-feature measures.
- Pure cosine-similarity + top-K ranking logic, unit tested, with no DB or
  vector-index dependency.
- A one-time script that reads a **capped sample of ~1 500 articles** (not the
  full ~9 700-article corpus - see Notes for the cost reasoning) from the live
  corpus, naive-chunks them, embeds them via the existing `embedTexts`
  provider, and caches the result to a **local, gitignored file**
  (`packages/eval/.data/`) - not a new Supabase table or column. Per
  `project-overview.md`'s open note, the project is already at 353/500 MB
  (70%) of the Supabase free tier with zero history rows loaded; persisting a
  second embedding set there is the wrong tradeoff for a one-off measurement,
  and re-embedding the full corpus a second time (it was already embedded once
  in 4b) is an avoidable cost for what's explicitly a floor measurement, not a
  production index.
- A harness-runner script that loads that cache, embeds each of the 15 eval
  questions, ranks candidates by cosine similarity (brute-force, in memory),
  and scores the result through item 5's existing `scoreQuestion` /
  `aggregateResults` - unchanged, reused exactly as-is.
- Recording the live run's numbers in this spec (same convention as 4d and 5),
  for 6b/6c/6d to quote as the baseline row in their own comparisons.

## Out of scope

- Any change to the production `chunks` table, `SupabaseRetriever`, or the
  real ingestion pipeline (`chunkArticle` in 4a) - this sub-feature only reads
  `articles`, never writes to Supabase, and never touches the retrieval path
  the app actually serves. 6d is the only sub-feature of 6 that changes
  production code.
- Vector search against the already-indexed, context-prefixed `chunks` table -
  that's 6b's job, and is what isolates contextual chunking's own effect
  against this baseline.
- Keyword/hybrid search of any kind - 6c's job.
- Re-ranking - 6d's job.
- Date-reference or `etat`/RLS-equivalent filtering in the brute-force ranker.
  The naive baseline is deliberately naive on every axis, not just chunking -
  it does no filtering at all, which is itself part of what makes it a floor.
  `q-009` (the exclusion fixture) is expected to score `exclusionRespected:
  false` here; that's a correct, documented result, not a bug (see Notes).
- Scoring `hors_perimetre` / `fausse_premisse` questions - out of scope for
  the whole eval harness per item 5's own spec; unchanged here.
- A consolidated cross-sub-feature comparison report (6a vs 6b vs 6c vs 6d in
  one table) - each sub-feature records its own numbers in its own spec;
  building a diffing/comparison tool is explicitly deferred (item 5's own
  Out of scope already made this call for the harness in general).
- Re-running or regenerating the embedding cache automatically - it's a
  one-time build step for this measurement; if the corpus changes later,
  regenerating it is a manual re-run, not wired into CI or any pipeline.
- Sampling a *different* subset per sub-feature. The ~1 500-article sample
  built here is a **fixed comparison corpus**: 6b and 6c must rank against the
  exact same article IDs (read back from this feature's cache file, not
  resampled), or their numbers wouldn't isolate chunking/hybrid's effect -
  they'd also be measuring "different articles happened to be easier." See
  Data / contracts.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Naive chunker, unit tested** -

  `packages/eval/src/naive-chunking.ts`:

  ```ts
  import type { Article } from '@legirag/shared';

  export interface NaiveChunk {
    articleIdentifier: string;
    contenu: string; // texte brut de l'article, sans préfixe de contexte
  }

  export function naiveChunk(article: Pick<Article, 'articleIdentifier' | 'contenuText'>): NaiveChunk {
    return { articleIdentifier: article.articleIdentifier, contenu: article.contenuText };
  }
  ```

  `packages/eval/src/naive-chunking.test.ts` - covers: the returned `contenu`
  equals `contenuText` verbatim (no prefix, no trimming, no added structure -
  the point being it deliberately carries none of 4a's hierarchical context),
  and `articleIdentifier` passes through unchanged.

  *Done when:* `pnpm test` runs `naive-chunking.test.ts` green;
  `pnpm --filter @legirag/eval typecheck` passes.

- [x] **Step 2 - Cosine similarity and ranking, unit tested** -

  `packages/eval/src/naive-retriever.ts`:

  ```ts
  export function cosineSimilarity(a: number[], b: number[]): number { /* ... */ }

  export interface EmbeddedNaiveChunk {
    articleIdentifier: string;
    contenu: string;
    embedding: number[];
  }

  export function rankByCosineSimilarity(
    queryEmbedding: number[],
    corpus: EmbeddedNaiveChunk[],
    topK: number,
  ): EmbeddedNaiveChunk[] {
    // trie corpus par cosineSimilarity(queryEmbedding, chunk.embedding) décroissant, coupe à topK
  }
  ```

  `packages/eval/src/naive-retriever.test.ts` - covers: `cosineSimilarity` on
  hand-computed vectors (identical vectors -> 1, orthogonal -> 0, opposite ->
  -1), `rankByCosineSimilarity` returns the closest-first order on a small
  fixture, respects `topK` (returns fewer than `topK` when the corpus itself
  is smaller), returns an empty array on an empty corpus, and doesn't mutate
  its `corpus` input array.

  *Done when:* `pnpm test` runs `naive-retriever.test.ts` green;
  `pnpm --filter @legirag/eval typecheck` passes.

- [x] **Step 3 - Embedding cache builder script** -

  `packages/eval/src/pg-client.ts` - a copy of
  `packages/retrieval/src/pg-client.ts` (`createDatabaseClient()` reading
  `DATABASE_URL` via `requireEnv`, same date/timestamp type-parser overrides),
  matching the project's existing per-package duplication convention (see 4d's
  own Notes on why `pg-client.ts` isn't shared).

  Add `pg`/`@types/pg` to `packages/eval/package.json` (versions matching
  `packages/retrieval/package.json`).

  `packages/eval/src/build-naive-cache.ts` (`tsx --env-file=../../.env`,
  wired as `pnpm --filter @legirag/eval build:naive-cache`):
  - Builds the capped article sample: `SAMPLE_PER_CODE = 300` - for each of
    the 5 demo `code_slug`s, `select article_identifier, contenu_text from
    articles where code_slug = $1 order by article_identifier limit 300`
    (deterministic, not random - see Notes), unioned with every
    `article_identifier` appearing in `articlesAttendus`/`articlesExclus`
    across `loadEvaluationQuestions()` (10 articles today, fetched by id if
    not already in the per-code sample), deduplicated by
    `article_identifier`. Total lands at ~1 500 articles (5 x 300, plus any
    ground-truth articles not already caught by the per-code cap).
  - Maps each through `naiveChunk`, then `embedTexts(texts, 'search_document')`
    in batches (reusing `embedTexts`'s own internal 96-per-call batching,
    matching `load-chunks.ts`'s batch-and-log pattern).
  - Writes `packages/eval/.data/naive-embeddings.json`:
    `EmbeddedNaiveChunk[]` (no `contenu` needed in the cache beyond what
    scoring reads - keep `contenu` too, so `run-naive-baseline.ts` doesn't need
    a second DB round trip to build `Chunk.contenu` for the report).
  - Logs progress (`N/~1500 articles embedded`) matching `load-chunks.ts`'s
    console-output convention.

  Add `packages/eval/.data/` to the root `.gitignore`, next to
  `packages/ingest/.data/` - same "large generated artifact, not tracked"
  reasoning already established there.

  *Done when:* run live against the real Supabase project,
  `packages/eval/.data/naive-embeddings.json` contains ~1 500 entries (300 per
  code x 5, plus any extra ground-truth articles), every ground-truth
  `articleIdentifier` from `eval/questions.json` is present in the file, and
  each entry has a 1024-length `embedding` array.

- [x] **Step 4 - Naive-baseline harness script, run against the live cache** -

  `packages/eval/src/run-naive-baseline.ts` (`tsx --env-file=../../.env`,
  wired as `pnpm --filter @legirag/eval naive-baseline`, mirroring
  `run-harness.ts`'s shape from item 5):

  ```ts
  import { readFileSync } from 'node:fs';
  import { embedTexts } from '@legirag/shared';
  import type { Chunk } from '@legirag/shared';
  import { loadEvaluationQuestions, scoreQuestion, aggregateResults, HARNESS_TOP_K } from './index.js';
  import { rankByCosineSimilarity, type EmbeddedNaiveChunk } from './naive-retriever.js';

  const cachePath = /* résolu via import.meta.url, même pattern que data-paths.ts */;

  async function main(): Promise<void> {
    const corpus: EmbeddedNaiveChunk[] = JSON.parse(readFileSync(cachePath, 'utf-8'));
    const questions = loadEvaluationQuestions();

    const scores = [];
    for (const q of questions) {
      const [queryEmbedding] = await embedTexts([q.question], 'search_query');
      if (!queryEmbedding) throw new Error('embedTexts a renvoyé un résultat vide pour la requête.');
      const ranked = rankByCosineSimilarity(queryEmbedding, corpus, HARNESS_TOP_K);
      const chunks: Chunk[] = ranked.map((r, i) => ({ id: i, articleIdentifier: r.articleIdentifier, contenu: r.contenu }));
      const score = scoreQuestion(q, chunks);
      console.log(`[${q.id}] ${q.category} - ${q.question}`);
      console.log(`  ${JSON.stringify(score)}`);
      scores.push(score);
    }

    const report = aggregateResults(scores);
    console.log('\n--- Rapport agrégé (baseline naïve) ---');
    console.table(report.perCategory);
    console.log('Overall:', report.overall);
    console.log('Exclusion checks:', report.exclusionChecks);
    console.log('Non notées :', report.unscored);
  }

  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
  ```

  Export `naiveChunk`, `cosineSimilarity`, `rankByCosineSimilarity`, and the
  `NaiveChunk`/`EmbeddedNaiveChunk` types from `packages/eval/src/index.ts`,
  for 6b to import if useful.

  *Done when:* run live via `pnpm --filter @legirag/eval naive-baseline`
  against the real Supabase project and the cache from Step 3; the report
  prints per-category and overall recall@1/5/10 and MRR. Numbers are recorded
  in this spec's Notes before `/complete` archives it, so 6b/6c/6d have a
  fixed baseline to quote.

## Files / areas

- `packages/eval/src/naive-chunking.ts` (new)
- `packages/eval/src/naive-chunking.test.ts` (new)
- `packages/eval/src/naive-retriever.ts` (new)
- `packages/eval/src/naive-retriever.test.ts` (new)
- `packages/eval/src/pg-client.ts` (new)
- `packages/eval/src/build-naive-cache.ts` (new)
- `packages/eval/src/run-naive-baseline.ts` (new)
- `packages/eval/src/index.ts` (edit - export the new naive-baseline symbols)
- `packages/eval/package.json` (edit - add `pg`/`@types/pg` deps,
  `build:naive-cache` and `naive-baseline` scripts)
- `.gitignore` (edit - add `packages/eval/.data/`)

## Data / contracts

- New `NaiveChunk` / `EmbeddedNaiveChunk` types, package-local to
  `packages/eval` (not promoted to `packages/shared`) - same reasoning as
  item 5's `EvaluationQuestion`: only this package consumes them, and 6b/6c/6d
  may need variations not yet known.
- `packages/eval/.data/naive-embeddings.json` is a local, gitignored cache
  artifact. Its shape (`EmbeddedNaiveChunk[]`) is only read by
  `run-naive-baseline.ts` today, but its **article-ID set is a locked
  contract for 6b/6c**: both must rank against this same ~1 500-article
  sample (read the `articleIdentifier`s back from this file, or regenerate
  with the exact same `SAMPLE_PER_CODE`/ordering/ground-truth-union logic)
  rather than picking their own subset, so the three reports are comparable
  apples-to-apples. 6d re-ranks 6c's own (production, full-corpus) results, so
  this cap doesn't apply there.
- No changes to `Article`, `Chunk`, `Retriever`, `RequeteRecherche`,
  `EvaluationQuestion`, `QuestionScore`, `HarnessReport`, or any Supabase
  table/schema. This feature only reads `articles` and calls `embedTexts`;
  `scoreQuestion`/`aggregateResults` are reused unmodified from item 5.

## Testing

- `naiveChunk` (pure passthrough with a real "what it deliberately omits"
  property) and `cosineSimilarity`/`rankByCosineSimilarity` (pure math with
  real edge cases - identical/orthogonal/opposite vectors, `topK` larger than
  the corpus) get Vitest coverage per the testing gate's scope rule.
- `build-naive-cache.ts` and `run-naive-baseline.ts` are DB- and
  Bedrock-integration scripts (real Postgres reads, real embedding calls),
  matching every other DB-touching script in this project (4b, 4d, item 5's
  `run-harness.ts`) - verified by actually running them against the live
  Supabase project (Steps 3 and 4's done-when), not a Vitest test.
- `pnpm typecheck` / `pnpm lint` / `pnpm test` stay green throughout.

## Notes for the AI

- This sub-feature is pure measurement scaffolding, not a production
  improvement - nothing it builds is imported by `packages/agent`,
  `packages/api`, or `packages/retrieval`. Its only "consumer" is the numbers
  it prints, and possibly 6b's spec quoting them.
- `q-009` (the `sensible_a_la_date` exclusion fixture, expecting an article to
  be *absent* for an old `dateReference`) is expected to score
  `exclusionRespected: false` against this baseline, because the naive ranker
  does no date filtering at all. Don't treat that as a fixture or harness bug
  - it's the correct, documented outcome of a deliberately unfiltered
  baseline. Record it as such in the live-results table below, the same way
  item 5 documented `q-002`'s genuine retrieval gap rather than "fixing" the
  fixture.
- Reuse `packages/eval/src/data-paths.ts`'s exact path-resolution pattern
  (resolved from the file itself via `import.meta.url`) for the new cache
  path constant, rather than a cwd-relative path.
- `embedTexts` already batches internally at 96 texts/call
  (`packages/shared/src/providers/embedding.ts`) - `build-naive-cache.ts`
  should pass batches sized for progress logging (e.g. the same `BATCH_SIZE =
  100` convention as `load-chunks.ts`), not fight that internal batching.
- **Cost reasoning for the ~1 500-article cap** - the live corpus is ~9 708
  articles / ~9.1M characters (checked 2026-08-16). Embedding all of it a
  second time (4b already paid to embed the full corpus once, into
  production `chunks`) is an avoidable cost for a floor measurement: the user
  confirmed 4b's one-time full-corpus embedding cost ~€0.60, so re-embedding
  everything here would be a comparable second charge for a throwaway number.
  Capping at ~1 500 articles (~15% of the corpus, ~16 batched embedding calls
  instead of ~102) keeps the cost small while still giving the ranker enough
  real "distractor" articles to be a meaningful test - the point confirmed
  with the user: since 6b/6c reuse this exact same sample (see Data /
  contracts), the *relative* lift each technique shows over this baseline
  stays valid even though the absolute numbers wouldn't match a full-corpus
  run.
- `packages/eval/.data/naive-embeddings.json` will be a generated file
  (~1 500 vectors x 1024 floats, tens of MB) - confirm it lands under
  `packages/eval/.data/` and is actually ignored by `git status` before
  considering Step 3 done, the same care 4b/4c took confirming their own
  generated artifacts didn't leak into git.
- `build-naive-cache.ts` is deliberately **not** resumable (no skip-set like
  `load-chunks.ts`'s `loadAlreadyDoneArticles`) - at ~16 batched embedding
  calls for the capped sample, a mid-run failure is cheap to just re-run from
  scratch; don't add resumability unless a real failure makes it worth it.

## Live harness results (naive baseline)

Run live via `pnpm --filter @legirag/eval naive-baseline` against the
~1 505-article capped sample (see Step 3), whole-article naive chunks, brute-force
cosine similarity, no filtering of any kind:

| Category | questionCount | recall@1 | recall@5 | recall@10 | MRR |
|---|---|---|---|---|---|
| recherche_simple | 5 | 0.6 | 0.8 | 1.0 | 0.7 |
| renvoi_obligatoire | 2 | 0.5 | 1.0 | 1.0 | 0.75 |
| sensible_a_la_date | 1 (scored) | 1.0 | 1.0 | 1.0 | 1.0 |
| **Overall** | 8 | 0.625 | 0.875 | 1.0 | 0.75 |

Plus: `q-009`'s exclusion check **failed** (`exclusionRespected: false`) - the
expected, documented outcome (see Notes): the naive ranker does no date
filtering at all, so the pre-`date_debut` article that should have been
excluded came back anyway. The 6 `hors_perimetre`/`fausse_premisse` questions
correctly listed as unscored.

**Important caveat for 6b/6c/6d when quoting this as the floor:** these
numbers are *not* directly comparable to item 5's own recorded hybrid-search
numbers (recall@1 0.375, recall@10 0.875, MRR 0.522) - that run searched the
*full* ~21 000-chunk production index, while this one searches a
~1 505-article capped sample (Step 3). A smaller candidate pool is
mechanically easier to rank correctly in, which is why this naive baseline's
recall@1 (0.625) looks *higher* than production hybrid search's (0.375)
despite using a deliberately weaker method - that's an artifact of corpus
size, not evidence that naive chunking + vector-only search beats contextual
chunking + hybrid search. 6b and 6c must run against this exact same
~1 505-article sample (see Data / contracts) so their numbers are compared
against *this* row, not against item 5's full-corpus numbers.

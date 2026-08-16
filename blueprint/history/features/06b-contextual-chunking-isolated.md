# Feature: Contextual chunking, measured in isolation

**From build-plan:** feature 6b (sub-feature of 6 - Retrieval quality
improvements, each measured in isolation)
**Status:** not started

## Goal

Isolate contextual chunking's own effect on retrieval quality, holding the
search method constant (vector-only, same as 6a). Run the same vector-only
brute-force-style ranking 6a used, but against the *real*, already-indexed,
context-prefixed `chunks` table (built in 4a/4b) instead of 6a's naive
whole-article chunks - restricted to the exact same ~1 505-article sample 6a
used, so the only thing that changes between the two reports is the chunk
content itself.

## In scope

- A vector-only SQL query against the production `chunks` table (`order by
  embedding <=> ... limit topK`, no keyword search, no RRF fusion) - the same
  vector-search CTE `SupabaseRetriever` (4d) already uses, minus the hybrid
  half.
- Restricting that query to the fixed ~1 505-article sample 6a locked in as
  the comparison corpus, read back from 6a's own cache file
  (`packages/eval/.data/naive-embeddings.json`) - reusing the already-generated
  file as the single source of truth for *which* articles are in-scope, rather
  than re-deriving the sample with a second copy of 6a's sampling logic that
  could silently drift out of sync.
- A harness-runner script mirroring 6a's shape: embeds each of the 15 eval
  questions, runs the vector-only query, scores through item 5's unchanged
  `scoreQuestion` / `aggregateResults`.
- Recording the live run's numbers in this spec, compared directly against
  6a's row (same corpus, same topK, same scoring - only the chunk source
  differs), so the delta is contextual chunking's own, isolated lift.

## Out of scope

- Keyword/hybrid search of any kind - 6c's job.
- Re-ranking - 6d's job.
- RLS session-variable setup (`SET LOCAL ROLE anon`, `app.date_reference`,
  `app.codes`) or any date-reference/`etat` filtering. 6a deliberately applied
  no filtering to keep the comparison to a single variable (chunk content);
  6b holds that same choice so the *only* thing that changes between the two
  reports is chunking - adding RLS filtering here (that 6a didn't have) would
  introduce a second variable and break the isolation. Production RLS
  enforcement is already proven separately in 4c/4d; this measurement doesn't
  need to re-prove it. Uses the same raw `DATABASE_URL` connection as 6a's own
  scripts (bypasses RLS, matching `build-naive-cache.ts` and `load-chunks.ts`).
- Any change to the production `chunks` table, `SupabaseRetriever`, or 4a's
  `chunkArticle` - this feature only reads `chunks`, never writes to it, and
  never touches the retrieval path the app actually serves.
- Any change to 6a's own files (`naive-chunking.ts`, `naive-retriever.ts`,
  `build-naive-cache.ts`) - 6b only *reads* 6a's already-generated cache file
  to get the article-ID sample; it doesn't modify 6a's code or re-run 6a's
  embedding step.
- Regenerating or re-deriving the ~1 505-article sample independently - see
  In scope. If `packages/eval/.data/naive-embeddings.json` doesn't exist
  locally, the fix is re-running 6a's `pnpm --filter @legirag/eval
  build:naive-cache` (unchanged), not writing a second sampling query here.
- Scoring `hors_perimetre` / `fausse_premisse` questions - out of scope for
  the whole eval harness per item 5's own spec; unchanged here.
- A consolidated cross-sub-feature comparison report (6a vs 6b vs 6c vs 6d in
  one table) - same call item 5 and 6a already made; each sub-feature records
  its own numbers in its own spec.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Vector-only harness script against the real `chunks` table, run against the live corpus** -

  `packages/eval/src/run-vector-only.ts` (`tsx --env-file=../../.env`, wired as
  `pnpm --filter @legirag/eval vector-only`, mirroring `run-naive-baseline.ts`'s
  shape from 6a and `run-harness.ts`'s from item 5):

  ```ts
  import { readFileSync } from 'node:fs';
  import { embedTexts } from '@legirag/shared';
  import type { Chunk } from '@legirag/shared';
  import { naiveEmbeddingsCachePath } from './data-paths.js';
  import { createDatabaseClient } from './pg-client.js';
  import { loadEvaluationQuestions } from './questions.js';
  import { aggregateResults, HARNESS_TOP_K, scoreQuestion, type QuestionScore } from './scoring.js';

  interface CachedEntry { articleIdentifier: string }

  function loadSampleArticleIds(): string[] {
    const cache: CachedEntry[] = JSON.parse(readFileSync(naiveEmbeddingsCachePath, 'utf-8'));
    return cache.map((c) => c.articleIdentifier);
  }

  const VECTOR_ONLY_SQL = `
    select id, article_identifier, subdivision_label, contenu
    from chunks
    where embedding is not null and article_identifier = any($1)
    order by embedding <=> $2::extensions.vector
    limit $3
  `;

  function toPgVector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  interface ChunkRow {
    id: number;
    article_identifier: string;
    subdivision_label: string | null;
    contenu: string;
  }

  function toChunk(row: ChunkRow): Chunk {
    return {
      id: row.id,
      articleIdentifier: row.article_identifier,
      contenu: row.contenu,
      ...(row.subdivision_label !== null ? { subdivisionLabel: row.subdivision_label } : {}),
    };
  }

  async function main(): Promise<void> {
    const articleIds = loadSampleArticleIds();
    const questions = loadEvaluationQuestions();
    const client = createDatabaseClient();
    await client.connect();

    console.log(
      `--- Vector-only sur chunks contextuels (${questions.length} questions, ` +
        `${articleIds.length} articles échantillonnés, topK=${HARNESS_TOP_K}) ---\n`,
    );

    try {
      const scores: QuestionScore[] = [];
      for (const q of questions) {
        const [queryEmbedding] = await embedTexts([q.question], 'search_query');
        if (!queryEmbedding) throw new Error('embedTexts a renvoyé un résultat vide pour la requête.');

        const { rows } = await client.query<ChunkRow>(VECTOR_ONLY_SQL, [
          articleIds,
          toPgVector(queryEmbedding),
          HARNESS_TOP_K,
        ]);
        const score = scoreQuestion(q, rows.map(toChunk));
        console.log(`[${q.id}] ${q.category} - ${q.question}`);
        console.log(`  ${JSON.stringify(score)}`);
        scores.push(score);
      }

      const report = aggregateResults(scores);
      console.log('\n--- Rapport agrégé (chunking contextuel, vector-only) ---');
      console.table(report.perCategory);
      console.log('Overall :', report.overall);
      console.log("Vérifications d'exclusion :", report.exclusionChecks);
      console.log('Non notées :', report.unscored);
    } finally {
      await client.end();
    }
  }

  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
  ```

  If `naiveEmbeddingsCachePath` doesn't resolve to an existing file, the
  `readFileSync` throw is enough (no custom message needed) - the error
  message already names the missing path, and the fix (re-run 6a's
  `build:naive-cache`) belongs in this spec's Notes, not in defensive
  application code for a scenario that only happens in a dev environment that
  skipped 6a.

  Add `"vector-only": "tsx --env-file=../../.env src/run-vector-only.ts"` to
  `packages/eval/package.json`'s `scripts`.

  *Done when:* run live via `pnpm --filter @legirag/eval vector-only` against
  the real Supabase project: it loads exactly the ~1 505 article IDs from
  6a's cache file, queries the real `chunks` table restricted to those
  articles, and prints a per-category and overall recall@1/5/10 and MRR
  report. Numbers are recorded in this spec's Notes before `/complete`
  archives it, compared directly against 6a's row.

## Files / areas

- `packages/eval/src/run-vector-only.ts` (new)
- `packages/eval/package.json` (edit - add `vector-only` script)

## Data / contracts

- No new types. Reuses `Chunk` (`@legirag/shared`, unchanged), and item 5's
  `scoreQuestion`/`aggregateResults`/`EvaluationQuestion`/`QuestionScore`/
  `HarnessReport` unmodified.
- Reads (never writes) the production `chunks` table as-is - no schema
  change, no new index, no RLS change.
- Depends on 6a's `packages/eval/.data/naive-embeddings.json` existing
  locally (gitignored, not a tracked contract) purely to read back its
  `articleIdentifier` list - if that file is regenerated later by re-running
  6a's script, 6b's numbers should be re-run too, since the sample could
  shift if the underlying `articles` table changed in between.

## Testing

- No new pure logic to unit test. `toChunk`/`toPgVector` are the same
  trivial, DB-row-shaped mapping helpers `SupabaseRetriever` (4d) already
  has, and weren't unit tested there either - this script is DB-integration
  code (a real Postgres query, a real embedding call per question), matching
  every other DB-touching script in this project - verified by actually
  running it against the live Supabase project (Step 1's done-when), not a
  Vitest test.
- `pnpm typecheck` / `pnpm lint` / `pnpm test` stay green throughout (no
  regressions in the existing suite).

## Notes for the AI

- This is a **one-step feature**: unlike 6a (which had genuinely separable
  pure-logic steps - chunking, then ranking), 6b has no new pure logic to
  build. It's one SQL query variant plus reusing everything else unchanged.
  Don't invent extra steps or pure-logic extractions just to mirror 6a's
  shape.
- If `pnpm --filter @legirag/eval vector-only` fails because
  `packages/eval/.data/naive-embeddings.json` doesn't exist, run `pnpm
  --filter @legirag/eval build:naive-cache` first (6a's script, unchanged) -
  don't write a second sampling query here. The file was confirmed present
  and containing 1 505 entries as of this spec being written (2026-08-16).
- `extensions.vector` needs the schema-qualified cast (`$2::extensions.vector`)
  - same reasoning as `SupabaseRetriever`'s own query (the `vector` extension
  is installed `with schema extensions`).
- Reuses `packages/eval/src/pg-client.ts` and `data-paths.ts`'s
  `naiveEmbeddingsCachePath` as-is from 6a - no new DB client, no new path
  constant.
- q-009 (the date-exclusion fixture) is expected to score
  `exclusionRespected: false` here too, for the same reason as 6a: no date
  filtering is applied (see Out of scope). This isn't a regression from 6a -
  it's the same deliberately-held-constant variable, not a new finding to
  investigate.
- When recording results, compare directly against 6a's row from
  `blueprint/history/features/06a-naive-baseline.md` (recall@1/5/10, MRR) -
  the delta between the two rows is contextual chunking's own, isolated
  effect, which is the entire point of this sub-feature.

## Live harness results (contextual chunking, vector-only)

Run live via `pnpm --filter @legirag/eval vector-only` against the real
`chunks` table, restricted to the same ~1 505-article sample as 6a, vector-only
ranking, no filtering:

| Category | questionCount | recall@1 | recall@5 | recall@10 | MRR |
|---|---|---|---|---|---|
| recherche_simple | 5 | 0.8 | 1.0 | 1.0 | 0.84 |
| renvoi_obligatoire | 2 | 1.0 | 1.0 | 1.0 | 1.0 |
| sensible_a_la_date | 1 (scored) | 1.0 | 1.0 | 1.0 | 1.0 |
| **Overall** | 8 | 0.875 | 1.0 | 1.0 | 0.9 |

Plus: `q-009`'s exclusion check **failed** as expected (same reason as 6a - no
date filtering applied, see Out of scope). The 6 `hors_perimetre`/
`fausse_premisse` questions correctly listed as unscored.

**Comparison against 6a (same ~1 505-article corpus, same topK, same
scoring - only the chunk source changed):**

| Metric | 6a (naive, whole-article) | 6b (contextual, context-prefixed) | Delta |
|---|---|---|---|
| recall@1 | 0.625 | 0.875 | **+0.25** |
| recall@5 | 0.875 | 1.0 | **+0.125** |
| recall@10 | 1.0 | 1.0 | 0 |
| MRR | 0.75 | 0.9 | **+0.15** |

Contextual chunking's isolated effect is a real, positive lift, concentrated
at the top of the ranking (recall@1 and MRR move the most; recall@10 was
already saturated at 1.0 for both, so there was no more room to gain there).
This confirms 4a's design choice (prefixing `code › sectionPath › Article N`
ahead of the content) was worth the complexity, on this sample.

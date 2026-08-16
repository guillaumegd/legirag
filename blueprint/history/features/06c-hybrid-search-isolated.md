# Feature: Hybrid keyword + vector search, measured in isolation

**From build-plan:** feature 6c (sub-feature of 6 - Retrieval quality
improvements, each measured in isolation)
**Status:** not started

## Goal

Isolate hybrid fusion's own effect on retrieval quality, holding both the
chunking method (contextual, same as 6b) and the corpus (the same ~1 505-article
sample 6a/6b used) constant. Run the exact hybrid formula `SupabaseRetriever`
(4d) already uses in production - vector search + keyword search + RRF fusion -
but restricted to 6a/6b's sample, so the only thing that changes between 6b's
report and this one is the search method itself.

This deliberately departs from the build-plan line's literal wording
("the existing, unchanged `SupabaseRetriever`, re-run through the harness") -
see Notes for why: re-running the unchanged, full-corpus `SupabaseRetriever`
would also change the corpus size vs. 6b, confounding "hybrid search's effect"
with "searching a smaller pool is mechanically easier" (the exact caveat 6a's
own spec already had to flag about item 5's full-corpus numbers). Restricting
to the same sample costs nothing extra - the sample's chunks are already
embedded and indexed in production (4b); only a `WHERE article_identifier =
any(...)` clause is added to an existing query.

## In scope

- A hybrid SQL query - vector search + keyword search (`ts_rank_cd`/`tsv`) +
  Reciprocal Rank Fusion (`RRF_K = 60`, `PRE_FUSION_LIMIT = 50`), the *exact*
  formula `SupabaseRetriever`'s `HYBRID_SEARCH_SQL` already uses in
  production - with an `article_identifier = any($sample)` filter added to
  both the `vector_search` and `keyword_search` CTEs, restricting the search
  to 6a/6b's same ~1 505-article sample.
- A harness-runner script mirroring 6b's shape: reads the sample's article
  IDs from 6a's cache file, embeds each of the 15 eval questions, runs the
  capped hybrid query, scores through item 5's unchanged `scoreQuestion` /
  `aggregateResults`.
- Recording the live run's numbers in this spec, compared directly against
  6b's row (same corpus, same topK, same scoring, same chunking - only the
  search method differs), so the delta is hybrid fusion's own, isolated
  lift.

## Out of scope

- Re-ranking - 6d's job.
- Changing `SupabaseRetriever`, the production `chunks` table, or the real
  retrieval path the app serves - this feature only reads `chunks`, and its
  SQL is a *variant* (capped to the sample), never wired into
  `SupabaseRetriever` itself.
- RLS session-variable setup or date-reference/`etat` filtering - same
  reasoning as 6a/6b: no filtering was applied in either of those two, so 6c
  holds that same choice to keep the isolation to a single variable (search
  method). Uses the same raw `DATABASE_URL` connection as 6a/6b's scripts.
- Re-running item 5's original, unrestricted `pnpm --filter @legirag/eval
  harness` script. Its full-corpus numbers (recall@1 0.375, recall@5 0.75,
  recall@10 0.875, MRR 0.522, recorded in `blueprint/history/features/
  05-evaluation-question-set-and-harness.md`) already exist and stay valid as
  a separate, real-world data point - they're just not what this feature
  compares against, for the reason explained in Goal.
- Any change to 6a's or 6b's own files - 6c only reads 6a's cache file (for
  the article-ID sample) the same way 6b already does; it doesn't modify
  either.
- A consolidated cross-sub-feature comparison report (6a vs 6b vs 6c vs 6d in
  one table) - same call item 5, 6a, and 6b already made.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Capped hybrid harness script, run against the live corpus** -

  `packages/eval/src/run-hybrid-capped.ts` (`tsx --env-file=../../.env`, wired
  as `pnpm --filter @legirag/eval hybrid-capped`, mirroring
  `run-vector-only.ts`'s shape from 6b):

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

  const RRF_K = 60; // même constante que SupabaseRetriever (4d), non ajustée ici
  const PRE_FUSION_LIMIT = 50; // idem

  // Formule identique à HYBRID_SEARCH_SQL (supabase-retriever.ts), avec un
  // filtre article_identifier = any($4) ajouté aux deux CTE pour restreindre
  // à l'échantillon de 6a/6b.
  const HYBRID_CAPPED_SQL = `
    with vector_search as (
      select id, row_number() over (order by embedding <=> $1::extensions.vector) as rank
      from chunks
      where embedding is not null and article_identifier = any($4)
      order by embedding <=> $1::extensions.vector
      limit ${PRE_FUSION_LIMIT}
    ),
    keyword_search as (
      select id, row_number() over (order by ts_rank_cd(tsv, websearch_to_tsquery('french', $2)) desc) as rank
      from chunks
      where tsv @@ websearch_to_tsquery('french', $2) and article_identifier = any($4)
      limit ${PRE_FUSION_LIMIT}
    ),
    fused as (
      select
        coalesce(v.id, k.id) as id,
        coalesce(1.0 / (${RRF_K} + v.rank), 0.0) + coalesce(1.0 / (${RRF_K} + k.rank), 0.0) as score
      from vector_search v
      full outer join keyword_search k on v.id = k.id
    )
    select c.id, c.article_identifier, c.subdivision_label, c.contenu, fused.score
    from fused join chunks c on c.id = fused.id
    order by fused.score desc
    limit $3
  `;

  function toPgVector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  interface HybridRow {
    id: number;
    article_identifier: string;
    subdivision_label: string | null;
    contenu: string;
  }

  function toChunk(row: HybridRow): Chunk {
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
      `--- Hybride (vecteurs + mots-clés) sur ${articleIds.length} articles échantillonnés, topK=${HARNESS_TOP_K} ---\n`,
    );

    try {
      const scores: QuestionScore[] = [];
      for (const q of questions) {
        const [queryEmbedding] = await embedTexts([q.question], 'search_query');
        if (!queryEmbedding) throw new Error('embedTexts a renvoyé un résultat vide pour la requête.');

        const { rows } = await client.query<HybridRow>(HYBRID_CAPPED_SQL, [
          toPgVector(queryEmbedding),
          q.question,
          HARNESS_TOP_K,
          articleIds,
        ]);
        const score = scoreQuestion(q, rows.map(toChunk));
        console.log(`[${q.id}] ${q.category} - ${q.question}`);
        console.log(`  ${JSON.stringify(score)}`);
        scores.push(score);
      }

      const report = aggregateResults(scores);
      console.log('\n--- Rapport agrégé (hybride, échantillon restreint) ---');
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

  Add `"hybrid-capped": "tsx --env-file=../../.env src/run-hybrid-capped.ts"`
  to `packages/eval/package.json`'s `scripts`.

  *Done when:* run live via `pnpm --filter @legirag/eval hybrid-capped`
  against the real Supabase project: loads the same ~1 505 article IDs from
  6a's cache file, queries `chunks` with the capped hybrid formula, prints a
  per-category and overall recall@1/5/10 and MRR report. Numbers are recorded
  in this spec's Notes before `/complete` archives it, compared directly
  against 6b's row.

## Files / areas

- `packages/eval/src/run-hybrid-capped.ts` (new)
- `packages/eval/package.json` (edit - add `hybrid-capped` script)

## Data / contracts

- No new types. Reuses `Chunk` (`@legirag/shared`, unchanged) and item 5's
  `scoreQuestion`/`aggregateResults`/`EvaluationQuestion`/`QuestionScore`/
  `HarnessReport` unmodified.
- Reads (never writes) the production `chunks` table as-is - no schema
  change, no new index, no RLS change, no change to `SupabaseRetriever`.
- `HYBRID_CAPPED_SQL` duplicates `SupabaseRetriever`'s `HYBRID_SEARCH_SQL`
  formula (same `RRF_K`/`PRE_FUSION_LIMIT` constants) with an added sample
  filter - deliberately a copy, not a shared/parameterized query, so this
  measurement script never risks affecting the production query if edited
  later (same reasoning as `pg-client.ts`'s existing duplication across
  packages).
- Depends on 6a's `packages/eval/.data/naive-embeddings.json` existing
  locally, exactly like 6b - re-run 6a's `build:naive-cache` if missing.

## Testing

- No new pure logic to unit test - same reasoning as 6b: this is a SQL query
  variant plus a DB round trip per question, verified by the live run
  (Step 1's done-when), not a Vitest test.
- `pnpm typecheck` / `pnpm lint` / `pnpm test` stay green throughout (no
  regressions in the existing suite).

## Notes for the AI

- This feature deliberately deviates from the build-plan line's literal text
  ("the existing, unchanged `SupabaseRetriever`, re-run through the
  harness") - confirmed with the user before writing this spec. The reason:
  running the real `SupabaseRetriever` unchanged means the full ~9 700-article
  corpus, not 6a/6b's ~1 505-article sample, which would confound "hybrid
  search's effect" with "a smaller candidate pool is easier to rank
  correctly in" (see 6a's own Notes on why its numbers aren't directly
  comparable to item 5's full-corpus run). Building a capped variant of the
  same formula costs nothing extra in embeddings (the sample's chunks are
  already embedded/indexed in production, 4b) - only a `WHERE` clause is
  added.
- **This changes the assumption 6a's spec recorded about 6d.** 6a's Data /
  contracts section said "6d re-ranks 6c's own (production, full-corpus)
  results, so this cap doesn't apply there" - that assumed 6c would use the
  unrestricted corpus. Since 6c now uses the capped sample instead, 6d's
  spec (not written yet) should re-rank *this* feature's capped-sample
  hybrid results for the same reason, so all four sub-features (6a-6d) stay
  comparable on the same fixed corpus. Flag this when 6d is spec'd.
- `HYBRID_CAPPED_SQL`'s `${PRE_FUSION_LIMIT}`/`${RRF_K}` are interpolated
  into the query string, not parameterized - same reason
  `supabase-retriever.ts` does it: `pg` doesn't parameterize `LIMIT`/arithmetic
  cleanly. Keep them in sync with `SupabaseRetriever`'s own constants if that
  file's values ever change (they're currently identical by construction,
  copied at spec-writing time).
- `extensions.vector` needs the schema-qualified cast (`$1::extensions.vector`)
  - same reasoning as `SupabaseRetriever`'s own query.
- If `websearch_to_tsquery('french', q.question)` produces an empty tsquery
  (a stopword-only question), `keyword_search` legitimately returns zero rows
  and RRF falls back to the vector list alone - correct behavior, matching
  4d's own note about this same edge case, not a bug to special-case.
- q-009 (the date-exclusion fixture) is expected to score
  `exclusionRespected: false` here too, for the same reason as 6a/6b: no date
  filtering is applied (see Out of scope) - not a regression to investigate.
- **Follow-up idea, deliberately not acted on here** (discussed with the user
  after this feature's live run): the 15-question set showed zero measurable
  lift from hybrid fusion over vector-only (see results below), verified as a
  genuine result, not a bug. The user's instinct was to add keyword-sensitive
  questions (e.g. an exact article-number lookup) to better exercise hybrid
  search's actual strength. Deliberately deferred rather than done now:
  `eval/questions.json` is a locked, shared artifact 6a/6b/6c all compare
  against, and retrofitting a question chosen *after* seeing this result
  would be test-tuning-to-the-answer, not honest measurement. If this is
  picked up later, it belongs as a dedicated addition to item 5's dataset
  (with its own review), followed by a full re-run of 6a-6d against the
  enlarged set - not a quiet patch to this already-recorded result.
- Item 5's original full-corpus harness numbers
  (`blueprint/history/features/05-evaluation-question-set-and-harness.md`)
  remain a valid, separate real-world data point - cite them for context if
  useful, but the comparison this spec's Notes/results section makes is
  strictly 6c vs. 6b (same sample).

## Live harness results (hybrid, capped sample)

Run live via `pnpm --filter @legirag/eval hybrid-capped` against the real
`chunks` table, restricted to the same ~1 505-article sample as 6a/6b, hybrid
(vector + keyword + RRF fusion), no filtering:

| Category | questionCount | recall@1 | recall@5 | recall@10 | MRR |
|---|---|---|---|---|---|
| recherche_simple | 5 | 0.8 | 1.0 | 1.0 | 0.84 |
| renvoi_obligatoire | 2 | 1.0 | 1.0 | 1.0 | 1.0 |
| sensible_a_la_date | 1 (scored) | 1.0 | 1.0 | 1.0 | 1.0 |
| **Overall** | 8 | 0.875 | 1.0 | 1.0 | 0.9 |

Plus: `q-009`'s exclusion check **failed** as expected (no date filtering,
same as 6a/6b). The 6 `hors_perimetre`/`fausse_premisse` questions correctly
listed as unscored.

**Comparison against 6b (same ~1 505-article corpus, same topK, same
scoring, same chunking - only the search method changed):**

| Metric | 6b (vector-only) | 6c (hybrid) | Delta |
|---|---|---|---|
| recall@1 | 0.875 | 0.875 | 0 |
| recall@5 | 1.0 | 1.0 | 0 |
| recall@10 | 1.0 | 1.0 | 0 |
| MRR | 0.9 | 0.9 | 0 |

**Every per-question score is identical to 6b's, question by question -
hybrid fusion showed zero measurable lift over vector-only on this sample.**
Verified this is a genuine result, not a broken keyword-search path: directly
queried `chunks` with the same `websearch_to_tsquery` used by q-001 ("vitesse
maximale autorisée en agglomération") and confirmed keyword search does
return a match (a single row, `LEGIARTI000045025478`) - but it isn't the
question's target article (`LEGIARTI000028436430`), and vector search alone
already ranked the target at position 1, so RRF fusion's keyword contribution
(`1/(60+rank)`, at most ≈0.016) never had the score margin needed to displace
an already-correct top-1 vector result. The mechanism works; it simply didn't
change any outcome for these 15 questions on this ~1 505-article sample -
plausibly because the sample is small enough that vector similarity alone
already saturates recall@5/@10, leaving no room for keyword search to help
(the same saturation effect 6b's own results section already noted for
recall@10). This is a real, useful finding for 6d and any future
re-evaluation: on this sample, hybrid search's value proposition wasn't
tested by these particular 15 questions - a larger or more keyword-sensitive
question set (e.g. exact statute-number lookups) might show a different
result.

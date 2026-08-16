import { readFileSync } from 'node:fs';
import { embedTexts } from '@legirag/shared';
import type { Chunk } from '@legirag/shared';
import { naiveEmbeddingsCachePath } from './data-paths.js';
import { createDatabaseClient } from './pg-client.js';
import { loadEvaluationQuestions } from './questions.js';
import { aggregateResults, HARNESS_TOP_K, scoreQuestion, type QuestionScore } from './scoring.js';

interface CachedEntry {
  articleIdentifier: string;
}

// Relit l'échantillon d'articles verrouillé par 6a/6b - voir
// current-feature.md, In scope.
function loadSampleArticleIds(): string[] {
  const cache: CachedEntry[] = JSON.parse(readFileSync(naiveEmbeddingsCachePath, 'utf-8'));
  return cache.map((c) => c.articleIdentifier);
}

const RRF_K = 60; // même constante que SupabaseRetriever (4d), non ajustée ici
const PRE_FUSION_LIMIT = 50; // idem

// Formule identique à HYBRID_SEARCH_SQL (supabase-retriever.ts), avec un
// filtre article_identifier = any($4) ajouté aux deux CTE pour restreindre à
// l'échantillon de 6a/6b - copie volontaire, pas une requête partagée, pour
// que ce script de mesure ne puisse jamais affecter la vraie requête de prod.
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

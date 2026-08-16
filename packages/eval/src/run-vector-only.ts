import { embedTexts } from '@legirag/shared';
import { type ChunkRow, loadSampleArticleIds, toChunk, toPgVector } from './chunk-row.js';
import { createDatabaseClient } from './pg-client.js';
import { loadEvaluationQuestions } from './questions.js';
import { aggregateResults, HARNESS_TOP_K, scoreQuestion, type QuestionScore } from './scoring.js';

// Mêmes CTE vector_search que SupabaseRetriever (4d), sans keyword_search ni
// fusion RRF - isole l'effet du chunking, pas de la recherche hybride (6c).
const VECTOR_ONLY_SQL = `
  select id, article_identifier, subdivision_label, contenu
  from chunks
  where embedding is not null and article_identifier = any($1)
  order by embedding <=> $2::extensions.vector
  limit $3
`;

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

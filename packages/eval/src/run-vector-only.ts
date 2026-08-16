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

// Relit l'échantillon d'articles verrouillé par 6a plutôt que de le
// re-dériver ici - voir current-feature.md, In scope.
function loadSampleArticleIds(): string[] {
  const cache: CachedEntry[] = JSON.parse(readFileSync(naiveEmbeddingsCachePath, 'utf-8'));
  return cache.map((c) => c.articleIdentifier);
}

// Mêmes CTE vector_search que SupabaseRetriever (4d), sans keyword_search ni
// fusion RRF - isole l'effet du chunking, pas de la recherche hybride (6c).
const VECTOR_ONLY_SQL = `
  select id, article_identifier, subdivision_label, contenu
  from chunks
  where embedding is not null and article_identifier = any($1)
  order by embedding <=> $2::extensions.vector
  limit $3
`;

// Miroir de toPgVector dans supabase-retriever.ts / load-chunks.ts.
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

import { readFileSync } from 'node:fs';
import { embedTexts } from '@legirag/shared';
import type { Chunk } from '@legirag/shared';
import { naiveEmbeddingsCachePath } from './data-paths.js';
import { rankByCosineSimilarity, type EmbeddedNaiveChunk } from './naive-retriever.js';
import { loadEvaluationQuestions } from './questions.js';
import { aggregateResults, HARNESS_TOP_K, scoreQuestion, type QuestionScore } from './scoring.js';

function toChunk(ranked: EmbeddedNaiveChunk, index: number): Chunk {
  return { id: index, articleIdentifier: ranked.articleIdentifier, contenu: ranked.contenu };
}

async function main(): Promise<void> {
  const corpus: EmbeddedNaiveChunk[] = JSON.parse(readFileSync(naiveEmbeddingsCachePath, 'utf-8'));
  const questions = loadEvaluationQuestions();

  console.log(
    `--- Baseline naïve (${questions.length} questions, corpus ${corpus.length} articles, topK=${HARNESS_TOP_K}) ---\n`,
  );

  const scores: QuestionScore[] = [];
  for (const q of questions) {
    const [queryEmbedding] = await embedTexts([q.question], 'search_query');
    if (!queryEmbedding) throw new Error('embedTexts a renvoyé un résultat vide pour la requête.');

    const ranked = rankByCosineSimilarity(queryEmbedding, corpus, HARNESS_TOP_K);
    const chunks = ranked.map(toChunk);
    const score = scoreQuestion(q, chunks);
    console.log(`[${q.id}] ${q.category} - ${q.question}`);
    console.log(`  ${JSON.stringify(score)}`);
    scores.push(score);
  }

  const report = aggregateResults(scores);
  console.log('\n--- Rapport agrégé (baseline naïve) ---');
  console.table(report.perCategory);
  console.log('Overall :', report.overall);
  console.log("Vérifications d'exclusion :", report.exclusionChecks);
  console.log('Non notées (hors_perimetre / fausse_premisse) :', report.unscored);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

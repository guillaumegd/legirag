import { SupabaseRetriever } from '@legirag/retrieval';
import { loadEvaluationQuestions } from './questions.js';
import { aggregateResults, HARNESS_TOP_K, scoreQuestion, type QuestionScore } from './scoring.js';

async function main(): Promise<void> {
  const questions = loadEvaluationQuestions();
  const retriever = new SupabaseRetriever();

  console.log(`--- Harnais d'évaluation (${questions.length} questions, topK=${HARNESS_TOP_K}) ---\n`);

  const scores: QuestionScore[] = [];
  for (const q of questions) {
    const chunks = await retriever.search({
      texte: q.question,
      dateReference: q.dateReference ? new Date(q.dateReference) : new Date(),
      topK: HARNESS_TOP_K,
    });
    const score = scoreQuestion(q, chunks);
    console.log(`[${q.id}] ${q.category} - ${q.question}`);
    console.log(`  ${JSON.stringify(score)}`);
    scores.push(score);
  }

  const report = aggregateResults(scores);
  console.log('\n--- Rapport agrégé ---');
  console.table(report.perCategory);
  console.log('Overall :', report.overall);
  console.log('Vérifications d\'exclusion :', report.exclusionChecks);
  console.log('Non notées (hors_perimetre / fausse_premisse) :', report.unscored);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

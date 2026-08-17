import { randomUUID } from 'node:crypto';
import { buildFixedChainGraph } from '@legirag/agent';
import { aggregateAgentResults, scoreAgentQuestion, type AgentQuestionScore } from './agent-scoring.js';
import { aggregateCost, mean, type CostRow } from './cost-metrics.js';
import { scoreCrossRefCoverage } from './cross-ref-coverage.js';
import { codesForArticles, fetchCodeSlugsByArticleId } from './expected-codes.js';
import { createDatabaseClient } from './pg-client.js';
import { loadEvaluationQuestions } from './questions.js';

interface CoverageRow {
  questionId: string;
  coverage: number;
}

async function main(): Promise<void> {
  const questions = loadEvaluationQuestions();

  const client = createDatabaseClient();
  await client.connect();
  let codeByArticleId: Map<string, string>;
  try {
    const allExpectedIds = questions.flatMap((q) => q.articlesAttendus ?? []);
    codeByArticleId = await fetchCodeSlugsByArticleId(client, allExpectedIds);
  } finally {
    await client.end();
  }

  console.log(`--- Harnais d'évaluation de l'agent (${questions.length} questions) ---\n`);

  const scores: AgentQuestionScore[] = [];
  const costRows: CostRow[] = [];
  const coverageRows: CoverageRow[] = [];

  for (const q of questions) {
    const graph = buildFixedChainGraph();
    const dateReference = q.dateReference ? new Date(q.dateReference) : new Date();
    const result = await graph.invoke({
      question: q.question,
      dateReference,
      codes: undefined,
      traceId: randomUUID(),
      reponse: undefined,
    });

    const expectedCodes = codesForArticles(q.articlesAttendus ?? [], codeByArticleId);
    const actualCodes = result.codes ?? [];
    const actualConfiance = result.reponse?.confiance ?? 'abstention';
    const score = scoreAgentQuestion(q, expectedCodes, actualCodes, actualConfiance);
    scores.push(score);

    // +1 : routerQuestion ne retente jamais - toujours exactement un appel.
    // Coût du routeur exclu de promptTokens/completionTokens (voir "Scope
    // decision" de 9b) - draft porte le coût dominant, prompt complet inclus.
    const costRow: CostRow = {
      questionId: q.id,
      category: q.category,
      llmCalls: 1 + result.draftAttempts,
      promptTokens: result.tokenUsage?.promptTokens ?? 0,
      completionTokens: result.tokenUsage?.completionTokens ?? 0,
      renvoiIterations: result.renvoiIterations,
    };
    costRows.push(costRow);

    console.log(`[${q.id}] ${q.category} - ${q.question}`);
    console.log(`  codes attendus=${JSON.stringify(expectedCodes)} codes obtenus=${JSON.stringify(actualCodes)}`);
    console.log(`  confiance=${actualConfiance} (abstention attendue=${score.abstentionExpected})`);
    console.log(`  ${JSON.stringify(score)}`);
    console.log(
      `  llmCalls=${costRow.llmCalls} tokens(prompt/completion)=${costRow.promptTokens}/${costRow.completionTokens} renvoiIterations=${costRow.renvoiIterations}`,
    );

    if (q.category === 'renvoi_obligatoire') {
      const coverage = scoreCrossRefCoverage(q.articlesAttendus ?? [], result.citations);
      coverageRows.push({ questionId: q.id, coverage });
      console.log(`  couverture des renvois=${coverage}`);
    }
  }

  const report = aggregateAgentResults(scores);
  console.log('\n--- Rapport agrégé : routage et abstention ---');
  console.table(report.perCategory);
  console.log('Overall :', report.overall);
  console.log('Non notés pour le routage :', report.routingUnscored);

  console.log('\n--- Rapport agrégé : tours et coût (moyenne par catégorie) ---');
  console.table(aggregateCost(costRows));
  console.log('Overall :', {
    llmCalls: mean(costRows.map((r) => r.llmCalls)),
    promptTokens: mean(costRows.map((r) => r.promptTokens)),
    completionTokens: mean(costRows.map((r) => r.completionTokens)),
  });

  console.log('\n--- Couverture des renvois (renvoi_obligatoire) ---');
  console.table(coverageRows);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

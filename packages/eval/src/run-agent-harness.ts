import { runAgentHarness } from './agent-harness.js';
import { aggregateCost, mean } from './cost-metrics.js';
import { loadEvaluationQuestions } from './questions.js';

async function main(): Promise<void> {
  console.log(`--- Harnais d'évaluation de l'agent (${loadEvaluationQuestions().length} questions) ---\n`);

  const { agentReport, costRows, coverageRows } = await runAgentHarness(
    ({ question, expectedCodes, actualCodes, actualConfiance, score, costRow, coverageRow }) => {
      console.log(`[${score.questionId}] ${score.category} - ${question}`);
      console.log(`  codes attendus=${JSON.stringify(expectedCodes)} codes obtenus=${JSON.stringify(actualCodes)}`);
      console.log(`  confiance=${actualConfiance} (abstention attendue=${score.abstentionExpected})`);
      console.log(`  ${JSON.stringify(score)}`);
      console.log(
        `  llmCalls=${costRow.llmCalls} tokens(prompt/completion)=${costRow.promptTokens}/${costRow.completionTokens} renvoiIterations=${costRow.renvoiIterations}`,
      );
      if (coverageRow !== undefined) {
        console.log(`  couverture des renvois=${coverageRow.coverage}`);
      }
    },
  );

  console.log('\n--- Rapport agrégé : routage et abstention ---');
  console.table(agentReport.perCategory);
  console.log('Overall :', agentReport.overall);
  console.log('Non notés pour le routage :', agentReport.routingUnscored);

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

import { readFileSync } from 'node:fs';
import { runAgentHarness } from './agent-harness.js';
import { mean } from './cost-metrics.js';
import { baselinePath } from './data-paths.js';
import { checkRegression } from './regression.js';
import { Baseline } from './schema.js';

function loadBaseline(): Baseline {
  const raw: unknown = JSON.parse(readFileSync(baselinePath, 'utf-8'));
  return Baseline.parse(raw);
}

// Construit un Baseline à partir d'un run en direct - même forme que
// eval/baseline.json, pour que checkRegression compare deux objets
// identiquement typés plutôt que deux formes ad hoc.
export function toBaseline(run: Awaited<ReturnType<typeof runAgentHarness>>): Baseline {
  const coverageValues = run.coverageRows.map((r) => r.coverage);
  return {
    capturedAt: new Date().toISOString(),
    perCategory: run.agentReport.perCategory.map((c) => ({
      category: c.category,
      questionCount: c.questionCount,
      ...(c.routingAccuracy !== undefined ? { routingAccuracy: c.routingAccuracy } : {}),
      abstentionAccuracy: c.abstentionAccuracy,
    })),
    overall: run.agentReport.overall,
    ...(coverageValues.length > 0 ? { crossRefCoverageMean: mean(coverageValues) } : {}),
  };
}

async function main(): Promise<void> {
  console.log('--- Vérification de non-régression (item 12b) ---\n');

  const run = await runAgentHarness(({ score }) => {
    console.log(`[${score.questionId}] ${score.category} - abstentionCorrect=${score.abstentionCorrect} routingCorrect=${score.routingCorrect}`);
  });
  const current = toBaseline(run);
  const baseline = loadBaseline();

  const result = checkRegression(baseline, current);

  console.log(`\nRéférence capturée le ${baseline.capturedAt}`);
  console.log('Run actuel :', current.overall, current.crossRefCoverageMean !== undefined ? `couverture renvois=${current.crossRefCoverageMean}` : '');

  if (result.ok) {
    console.log('\nAucune régression détectée.');
    return;
  }

  console.error('\nRégression(s) détectée(s) :');
  for (const regression of result.regressions) {
    console.error(`  - ${regression}`);
  }
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

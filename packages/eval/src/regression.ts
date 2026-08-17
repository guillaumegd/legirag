import type { Baseline } from './schema.js';

// Tolérance flottante pure, pas une marge de qualité tolérée : les scores
// sont des fractions exactes (k/n sur au plus 15 questions), cette valeur
// n'existe que pour ne jamais faire échouer la comparaison sur du bruit
// d'arrondi binaire.
const EPSILON = 1e-9;

export interface RegressionCheckResult {
  ok: boolean;
  regressions: string[];
}

function compareMetric(label: string, baselineValue: number | undefined, currentValue: number | undefined, regressions: string[]): void {
  if (baselineValue === undefined) return;
  if (currentValue === undefined) {
    regressions.push(`${label} : absent du run actuel (référence ${baselineValue})`);
    return;
  }
  if (currentValue < baselineValue - EPSILON) {
    regressions.push(`${label} : ${currentValue} < référence ${baselineValue}`);
  }
}

// Une catégorie ne régresse jamais silencieusement en disparaissant : si
// eval/questions.json change au point qu'une catégorie de la référence n'a
// plus d'équivalent dans le run actuel, c'est signalé comme une régression
// explicite plutôt qu'ignoré faute de correspondance.
export function checkRegression(baseline: Baseline, current: Baseline): RegressionCheckResult {
  const regressions: string[] = [];

  for (const baselineCategory of baseline.perCategory) {
    const currentCategory = current.perCategory.find((c) => c.category === baselineCategory.category);
    if (currentCategory === undefined) {
      regressions.push(`${baselineCategory.category} : catégorie absente du run actuel`);
      continue;
    }
    compareMetric(`${baselineCategory.category}.routingAccuracy`, baselineCategory.routingAccuracy, currentCategory.routingAccuracy, regressions);
    compareMetric(`${baselineCategory.category}.abstentionAccuracy`, baselineCategory.abstentionAccuracy, currentCategory.abstentionAccuracy, regressions);
  }

  compareMetric('overall.routingAccuracy', baseline.overall.routingAccuracy, current.overall.routingAccuracy, regressions);
  compareMetric('overall.abstentionAccuracy', baseline.overall.abstentionAccuracy, current.overall.abstentionAccuracy, regressions);
  compareMetric('crossRefCoverageMean', baseline.crossRefCoverageMean, current.crossRefCoverageMean, regressions);

  return { ok: regressions.length === 0, regressions };
}

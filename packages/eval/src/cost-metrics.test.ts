import { describe, expect, it } from 'vitest';
import { aggregateCost, mean, type CostRow } from './cost-metrics.js';

describe('mean', () => {
  it('calcule la moyenne de plusieurs valeurs', () => {
    expect(mean([1, 2, 3])).toBe(2);
  });

  it('renvoie 0 pour un tableau vide (pas de division par zéro)', () => {
    expect(mean([])).toBe(0);
  });

  it('renvoie la valeur elle-même pour un tableau à un élément', () => {
    expect(mean([42])).toBe(42);
  });
});

function costRow(overrides: Partial<CostRow>): CostRow {
  return { questionId: 'q-x', category: 'recherche_simple', llmCalls: 1, promptTokens: 0, completionTokens: 0, renvoiIterations: 0, ...overrides };
}

describe('aggregateCost', () => {
  it('moyenne les métriques par catégorie', () => {
    const rows = [
      costRow({ questionId: 'q-1', category: 'recherche_simple', llmCalls: 1, promptTokens: 100, completionTokens: 10 }),
      costRow({ questionId: 'q-2', category: 'recherche_simple', llmCalls: 3, promptTokens: 300, completionTokens: 30 }),
      costRow({ questionId: 'q-3', category: 'renvoi_obligatoire', llmCalls: 2, promptTokens: 200, completionTokens: 20 }),
    ];

    const report = aggregateCost(rows);

    const rechercheSimple = report.find((r) => r.category === 'recherche_simple')!;
    expect(rechercheSimple.questionCount).toBe(2);
    expect(rechercheSimple.llmCalls).toBe(2);
    expect(rechercheSimple.promptTokens).toBe(200);
    expect(rechercheSimple.completionTokens).toBe(20);

    const renvoiObligatoire = report.find((r) => r.category === 'renvoi_obligatoire')!;
    expect(renvoiObligatoire.questionCount).toBe(1);
    expect(renvoiObligatoire.llmCalls).toBe(2);
  });

  it('renvoie un tableau vide pour aucune ligne', () => {
    expect(aggregateCost([])).toEqual([]);
  });
});

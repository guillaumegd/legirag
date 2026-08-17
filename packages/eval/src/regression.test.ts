import { describe, expect, it } from 'vitest';
import type { Baseline } from './schema.js';
import { checkRegression } from './regression.js';

function baseline(overrides: Partial<Baseline> = {}): Baseline {
  return {
    capturedAt: '2026-08-17T00:00:00.000Z',
    perCategory: [
      { category: 'recherche_simple', questionCount: 5, routingAccuracy: 1, abstentionAccuracy: 1 },
      { category: 'fausse_premisse', questionCount: 3, abstentionAccuracy: 0 },
    ],
    overall: { routingAccuracy: 1, abstentionAccuracy: 0.8 },
    crossRefCoverageMean: 1,
    ...overrides,
  };
}

describe('checkRegression', () => {
  it('ok quand le run actuel égale la référence', () => {
    const result = checkRegression(baseline(), baseline());
    expect(result).toEqual({ ok: true, regressions: [] });
  });

  it('ok quand le run actuel fait mieux que la référence', () => {
    const meilleur = baseline({ overall: { routingAccuracy: 1, abstentionAccuracy: 0.9 } });
    expect(checkRegression(baseline(), meilleur).ok).toBe(true);
  });

  it('détecte une régression sur une métrique de catégorie', () => {
    const pire = baseline({
      perCategory: [
        { category: 'recherche_simple', questionCount: 5, routingAccuracy: 0.8, abstentionAccuracy: 1 },
        { category: 'fausse_premisse', questionCount: 3, abstentionAccuracy: 0 },
      ],
    });
    const result = checkRegression(baseline(), pire);
    expect(result.ok).toBe(false);
    expect(result.regressions).toEqual(['recherche_simple.routingAccuracy : 0.8 < référence 1']);
  });

  it('détecte une régression sur une métrique overall', () => {
    const pire = baseline({ overall: { routingAccuracy: 1, abstentionAccuracy: 0.6 } });
    const result = checkRegression(baseline(), pire);
    expect(result.ok).toBe(false);
    expect(result.regressions).toEqual(['overall.abstentionAccuracy : 0.6 < référence 0.8']);
  });

  it('une métrique déjà à 0 dans les deux runs ne déclenche jamais de fausse régression', () => {
    const result = checkRegression(baseline(), baseline());
    const fausseCategorie = result.regressions.find((r) => r.startsWith('fausse_premisse'));
    expect(fausseCategorie).toBeUndefined();
  });

  it('signale une catégorie de référence absente du run actuel', () => {
    const sansFaussePremisse = baseline({
      perCategory: [{ category: 'recherche_simple', questionCount: 5, routingAccuracy: 1, abstentionAccuracy: 1 }],
    });
    const result = checkRegression(baseline(), sansFaussePremisse);
    expect(result.ok).toBe(false);
    expect(result.regressions).toContain('fausse_premisse : catégorie absente du run actuel');
  });

  it('détecte une régression sur crossRefCoverageMean', () => {
    const pire = baseline({ crossRefCoverageMean: 0.5 });
    const result = checkRegression(baseline(), pire);
    expect(result.ok).toBe(false);
    expect(result.regressions).toEqual(['crossRefCoverageMean : 0.5 < référence 1']);
  });
});

import { describe, expect, it } from 'vitest';
import type { Citation } from '@legirag/shared';
import { scoreCrossRefCoverage } from './cross-ref-coverage.js';

function citation(articleIdentifier: string): Citation {
  return {
    article_identifier: articleIdentifier,
    subdivision: 'article entier',
    code: 'code de test',
    texte_exact: 'texte',
    date_debut: '2020-01-01',
    etat: 'VIGUEUR',
    url_legifrance: 'https://example.test',
  };
}

describe('scoreCrossRefCoverage', () => {
  it('renvoie 1 quand tous les articles attendus sont présents', () => {
    expect(scoreCrossRefCoverage(['A', 'B'], [citation('A'), citation('B'), citation('C')])).toBe(1);
  });

  it('renvoie une fraction partielle', () => {
    expect(scoreCrossRefCoverage(['A', 'B'], [citation('A')])).toBe(0.5);
  });

  it('renvoie 0 quand aucun article attendu n’est présent', () => {
    expect(scoreCrossRefCoverage(['A', 'B'], [citation('X')])).toBe(0);
  });

  it('renvoie 0 pour une liste d’articles attendus vide (pas de division par zéro)', () => {
    expect(scoreCrossRefCoverage([], [citation('A')])).toBe(0);
  });
});

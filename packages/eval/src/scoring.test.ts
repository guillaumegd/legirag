import { describe, expect, it } from 'vitest';
import type { Chunk } from '@legirag/shared';
import type { EvaluationQuestion } from './schema.js';
import { aggregateResults, scoreQuestion } from './scoring.js';

function chunk(articleIdentifier: string): Chunk {
  return { id: Math.random(), articleIdentifier, contenu: 'contenu de test' };
}

function question(overrides: Partial<EvaluationQuestion>): EvaluationQuestion {
  return { id: 'q-x', question: 'question de test ?', category: 'recherche_simple', ...overrides } as EvaluationQuestion;
}

describe('scoreQuestion', () => {
  it('trouve un hit en 1ère position', () => {
    const q = question({ articlesAttendus: ['A'] });
    const score = scoreQuestion(q, [chunk('A'), chunk('B')]);
    expect(score).toMatchObject({ rank: 1, hitAt1: true, hitAt5: true, hitAt10: true, reciprocalRank: 1 });
  });

  it('trouve un hit en 5ème position (pas en 1ère)', () => {
    const q = question({ articlesAttendus: ['E'] });
    const score = scoreQuestion(q, [chunk('A'), chunk('B'), chunk('C'), chunk('D'), chunk('E')]);
    expect(score).toMatchObject({ rank: 5, hitAt1: false, hitAt5: true, hitAt10: true, reciprocalRank: 1 / 5 });
  });

  it('trouve un hit en 10ème position (pas en 5ème)', () => {
    const chunks = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(chunk);
    const q = question({ articlesAttendus: ['J'] });
    const score = scoreQuestion(q, chunks);
    expect(score).toMatchObject({ rank: 10, hitAt1: false, hitAt5: false, hitAt10: true, reciprocalRank: 1 / 10 });
  });

  it("ne trouve rien quand l'article attendu est absent", () => {
    const q = question({ articlesAttendus: ['Z'] });
    const score = scoreQuestion(q, [chunk('A'), chunk('B')]);
    expect(score.rank).toBeUndefined();
    expect(score).toMatchObject({ hitAt1: false, hitAt5: false, hitAt10: false, reciprocalRank: 0 });
  });

  it("avec plusieurs articlesAttendus, retient le premier qui apparaît dans les résultats", () => {
    const q = question({ category: 'renvoi_obligatoire', articlesAttendus: ['A', 'C'] });
    const score = scoreQuestion(q, [chunk('X'), chunk('C'), chunk('A')]);
    expect(score.rank).toBe(2); // C trouvé en position 2, avant A en position 3
  });

  it('une question non notée (hors_perimetre) ne porte aucun champ de rang', () => {
    const q = question({ category: 'hors_perimetre' });
    const score = scoreQuestion(q, [chunk('A')]);
    expect(score.hasGroundTruth).toBe(false);
    expect(score.rank).toBeUndefined();
    expect(score.hitAt1).toBeUndefined();
  });

  it('exclusion respectée quand aucun article exclu ne ressort', () => {
    const q = question({ category: 'sensible_a_la_date', articlesExclus: ['A'] });
    const score = scoreQuestion(q, [chunk('B'), chunk('C')]);
    expect(score.exclusionRespected).toBe(true);
  });

  it('exclusion violée quand un article exclu ressort', () => {
    const q = question({ category: 'sensible_a_la_date', articlesExclus: ['A'] });
    const score = scoreQuestion(q, [chunk('B'), chunk('A')]);
    expect(score.exclusionRespected).toBe(false);
  });
});

describe('aggregateResults', () => {
  const scores = [
    scoreQuestion(question({ id: 'q-1', category: 'recherche_simple', articlesAttendus: ['A'] }), [chunk('A')]), // rank 1
    scoreQuestion(question({ id: 'q-2', category: 'recherche_simple', articlesAttendus: ['B'] }), [chunk('X'), chunk('B')]), // rank 2
    scoreQuestion(question({ id: 'q-3', category: 'renvoi_obligatoire', articlesAttendus: ['C'] }), [chunk('Z')]), // pas trouvé
    scoreQuestion(question({ id: 'q-4', category: 'sensible_a_la_date', articlesExclus: ['D'] }), [chunk('E')]), // exclusion respectée
    scoreQuestion(question({ id: 'q-5', category: 'sensible_a_la_date', articlesExclus: ['F'] }), [chunk('F')]), // exclusion violée
    scoreQuestion(question({ id: 'q-6', category: 'hors_perimetre' }), [chunk('A')]), // non notée
  ];
  const report = aggregateResults(scores);

  it('calcule le recall@1 et le MRR par catégorie', () => {
    const rechercheSimple = report.perCategory.find((c) => c.category === 'recherche_simple')!;
    expect(rechercheSimple.questionCount).toBe(2);
    expect(rechercheSimple.recallAt1).toBe(0.5); // 1 hit sur 2 (rank 1 et rank 2)
    expect(rechercheSimple.mrr).toBeCloseTo((1 + 1 / 2) / 2);

    const renvoi = report.perCategory.find((c) => c.category === 'renvoi_obligatoire')!;
    expect(renvoi.recallAt1).toBe(0);
    expect(renvoi.mrr).toBe(0);
  });

  it('calcule les métriques globales sur toutes les questions notées positivement', () => {
    expect(report.overall.questionCount).toBe(3); // q-1, q-2, q-3 (les seules avec hitAt1 défini)
    expect(report.overall.recallAt1).toBeCloseTo(1 / 3);
  });

  it('liste les vérifications d’exclusion séparément', () => {
    expect(report.exclusionChecks).toEqual(
      expect.arrayContaining([
        { questionId: 'q-4', passed: true },
        { questionId: 'q-5', passed: false },
      ]),
    );
  });

  it('liste les questions non notées séparément', () => {
    expect(report.unscored).toEqual([{ questionId: 'q-6', category: 'hors_perimetre' }]);
  });
});

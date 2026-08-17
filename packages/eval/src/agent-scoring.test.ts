import { describe, expect, it } from 'vitest';
import type { EvaluationQuestion } from './schema.js';
import { aggregateAgentResults, scoreAbstention, scoreAgentQuestion, scoreRouting, type AgentQuestionScore } from './agent-scoring.js';

function question(overrides: Partial<EvaluationQuestion>): EvaluationQuestion {
  return { id: 'q-x', question: 'question de test ?', category: 'recherche_simple', ...overrides } as EvaluationQuestion;
}

describe('scoreRouting', () => {
  it('correct quand tous les codes attendus sont présents', () => {
    expect(scoreRouting(['code-de-la-route'], ['code-de-la-route', 'code-penal'])).toBe(true);
  });

  it('correct pour une correspondance exacte', () => {
    expect(scoreRouting(['code-de-la-route'], ['code-de-la-route'])).toBe(true);
  });

  it('incorrect quand un code attendu manque', () => {
    expect(scoreRouting(['code-de-la-route', 'code-penal'], ['code-de-la-route'])).toBe(false);
  });

  it('non noté (undefined) quand il n’y a aucun code attendu', () => {
    expect(scoreRouting([], ['code-de-la-route'])).toBeUndefined();
  });
});

describe('scoreAbstention', () => {
  it('abstention attendue et obtenue sur hors_perimetre -> correct', () => {
    expect(scoreAbstention(question({ category: 'hors_perimetre' }), 'abstention')).toBe(true);
  });

  it('abstention attendue et obtenue sur fausse_premisse -> correct', () => {
    expect(scoreAbstention(question({ category: 'fausse_premisse' }), 'abstention')).toBe(true);
  });

  it('abstention attendue mais réponse confiante -> incorrect', () => {
    expect(scoreAbstention(question({ category: 'hors_perimetre' }), 'elevee')).toBe(false);
  });

  it('pas d’abstention attendue et réponse confiante -> correct', () => {
    expect(scoreAbstention(question({ category: 'recherche_simple', articlesAttendus: ['A'] }), 'elevee')).toBe(true);
    expect(scoreAbstention(question({ category: 'renvoi_obligatoire', articlesAttendus: ['A'] }), 'moyenne')).toBe(true);
    expect(scoreAbstention(question({ category: 'sensible_a_la_date', articlesAttendus: ['A'] }), 'elevee')).toBe(true);
  });

  it('pas d’abstention attendue mais l’agent s’abstient -> incorrect', () => {
    expect(scoreAbstention(question({ category: 'recherche_simple', articlesAttendus: ['A'] }), 'abstention')).toBe(false);
  });

  it('sensible_a_la_date sans articlesAttendus (seulement articlesExclus) : abstention attendue - même situation que q-009 (article pas encore en vigueur, aucune version historique indexée)', () => {
    const q = question({ category: 'sensible_a_la_date', articlesExclus: ['A'] });
    expect(scoreAbstention(q, 'abstention')).toBe(true);
    expect(scoreAbstention(q, 'elevee')).toBe(false);
  });
});

describe('scoreAgentQuestion', () => {
  it('assemble routage et abstention pour une question notée', () => {
    const score = scoreAgentQuestion(question({ id: 'q-1' }), ['code-de-la-route'], ['code-de-la-route'], 'elevee');
    expect(score).toEqual({
      questionId: 'q-1',
      category: 'recherche_simple',
      routingCorrect: true,
      abstentionExpected: false,
      abstentionActual: false,
      abstentionCorrect: true,
    });
  });

  it('omet routingCorrect quand il n’y a pas de code attendu', () => {
    const score = scoreAgentQuestion(question({ id: 'q-2', category: 'hors_perimetre' }), [], [], 'abstention');
    expect(score.routingCorrect).toBeUndefined();
    expect(score.abstentionCorrect).toBe(true);
  });
});

describe('aggregateAgentResults', () => {
  const scores: AgentQuestionScore[] = [
    scoreAgentQuestion(question({ id: 'q-1', category: 'recherche_simple' }), ['code-de-la-route'], ['code-de-la-route'], 'elevee'),
    scoreAgentQuestion(question({ id: 'q-2', category: 'recherche_simple' }), ['code-penal'], ['code-de-la-route'], 'elevee'),
    scoreAgentQuestion(question({ id: 'q-3', category: 'hors_perimetre' }), [], [], 'abstention'),
    scoreAgentQuestion(question({ id: 'q-4', category: 'hors_perimetre' }), [], [], 'elevee'),
  ];
  const report = aggregateAgentResults(scores);

  it('calcule la précision de routage et d’abstention par catégorie', () => {
    const rechercheSimple = report.perCategory.find((c) => c.category === 'recherche_simple')!;
    expect(rechercheSimple.routingAccuracy).toBe(0.5);
    expect(rechercheSimple.abstentionAccuracy).toBe(1);

    const horsPerimetre = report.perCategory.find((c) => c.category === 'hors_perimetre')!;
    expect(horsPerimetre.routingAccuracy).toBeUndefined();
    expect(horsPerimetre.abstentionAccuracy).toBe(0.5);
  });

  it('calcule les métriques globales', () => {
    expect(report.overall.routingAccuracy).toBe(0.5);
    expect(report.overall.abstentionAccuracy).toBeCloseTo(0.75);
  });

  it('liste les questions non notées pour le routage', () => {
    expect(report.routingUnscored).toEqual([
      { questionId: 'q-3', category: 'hors_perimetre' },
      { questionId: 'q-4', category: 'hors_perimetre' },
    ]);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EvaluationCategory, EvaluationQuestion } from './schema.js';
import { loadEvaluationQuestions } from './questions.js';
import { questionsPath } from './data-paths.js';

describe('loadEvaluationQuestions', () => {
  const questions = loadEvaluationQuestions();

  it("charge exactement 15 questions", () => {
    expect(questions).toHaveLength(15);
  });

  it('a des identifiants tous uniques', () => {
    const ids = questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('valide chaque entrée brute de eval/questions.json contre le schéma EvaluationQuestion', () => {
    // Relit et parse le JSON indépendamment de loadEvaluationQuestions() (qui
    // valide déjà en interne et lèverait avant ce test) - preuve réelle que
    // le fichier suivi par git respecte le schéma, entrée par entrée.
    const raw: unknown = JSON.parse(readFileSync(questionsPath, 'utf-8'));
    expect(Array.isArray(raw)).toBe(true);
    for (const entry of raw as unknown[]) {
      expect(EvaluationQuestion.safeParse(entry).success).toBe(true);
    }
  });

  it('représente chacune des 5 catégories du build-plan', () => {
    const categories = new Set(questions.map((q) => q.category));
    for (const categorie of EvaluationCategory.options) {
      expect(categories.has(categorie)).toBe(true);
    }
  });
});

describe('EvaluationQuestion (refine catégorie / vérité terrain)', () => {
  const base = { id: 'q-test', question: 'Question de test ?' };

  it('rejette une question recherche_simple sans articlesAttendus', () => {
    const invalide = { ...base, category: 'recherche_simple' as const };
    expect(EvaluationQuestion.safeParse(invalide).success).toBe(false);
  });

  it('rejette une question hors_perimetre avec des articlesAttendus', () => {
    const invalide = {
      ...base,
      category: 'hors_perimetre' as const,
      articlesAttendus: ['LEGIARTI000000000000'],
    };
    expect(EvaluationQuestion.safeParse(invalide).success).toBe(false);
  });

  it('accepte une question sensible_a_la_date avec seulement articlesExclus', () => {
    const valide = {
      ...base,
      category: 'sensible_a_la_date' as const,
      articlesExclus: ['LEGIARTI000000000000'],
    };
    expect(EvaluationQuestion.safeParse(valide).success).toBe(true);
  });
});

import type { Confiance } from '@legirag/shared';
import type { EvaluationCategory, EvaluationQuestion } from './schema.js';

const ABSTENTION_EXPECTED_CATEGORIES: EvaluationCategory[] = ['hors_perimetre', 'fausse_premisse'];

export interface AgentQuestionScore {
  questionId: string;
  category: EvaluationCategory;
  routingCorrect?: boolean; // absent si la question n'a pas d'articlesAttendus
  abstentionExpected: boolean;
  abstentionActual: boolean;
  abstentionCorrect: boolean;
}

export interface AgentCategoryMetrics {
  category: EvaluationCategory;
  questionCount: number;
  routingAccuracy?: number; // absent si aucune question de la catégorie n'a de vérité terrain de routage
  abstentionAccuracy: number;
}

export interface AgentHarnessReport {
  perCategory: AgentCategoryMetrics[];
  overall: { routingAccuracy?: number; abstentionAccuracy: number };
  routingUnscored: { questionId: string; category: EvaluationCategory }[];
}

// Sous-ensemble, pas égalité stricte : router_question demande explicitement
// tous les codes pertinents (une question inter-codes comme q-006 doit en
// retourner plusieurs), un code en trop n'est donc pas une erreur de routage.
export function scoreRouting(expectedCodes: string[], actualCodes: string[]): boolean | undefined {
  if (expectedCodes.length === 0) return undefined;
  const actual = new Set(actualCodes);
  return expectedCodes.every((code) => actual.has(code));
}

export function scoreAbstention(question: EvaluationQuestion, actualConfiance: Confiance): boolean {
  return (actualConfiance === 'abstention') === abstentionExpected(question);
}

// hors_perimetre/fausse_premisse : toujours. sensible_a_la_date sans
// articlesAttendus (seulement articlesExclus, ex. q-009) : la corpus n'a
// aucune version historique aujourd'hui (item 10 non construit), donc une
// dateReference antérieure à l'entrée en vigueur n'a réellement rien à
// trouver - l'abstention y est la seule réponse honnête, pas une erreur.
function abstentionExpected(question: EvaluationQuestion): boolean {
  if (ABSTENTION_EXPECTED_CATEGORIES.includes(question.category)) return true;
  return question.category === 'sensible_a_la_date' && !question.articlesAttendus?.length;
}

export function scoreAgentQuestion(question: EvaluationQuestion, expectedCodes: string[], actualCodes: string[], actualConfiance: Confiance): AgentQuestionScore {
  const routingCorrect = scoreRouting(expectedCodes, actualCodes);
  const abstentionActual = actualConfiance === 'abstention';
  return {
    questionId: question.id,
    category: question.category,
    ...(routingCorrect !== undefined ? { routingCorrect } : {}),
    abstentionExpected: abstentionExpected(question),
    abstentionActual,
    abstentionCorrect: scoreAbstention(question, actualConfiance),
  };
}

function mean(values: boolean[]): number {
  return values.length === 0 ? 0 : values.filter(Boolean).length / values.length;
}

function categoryMetrics(category: EvaluationCategory, scores: AgentQuestionScore[]): AgentCategoryMetrics {
  const routingScored = scores.filter((s) => s.routingCorrect !== undefined);
  return {
    category,
    questionCount: scores.length,
    ...(routingScored.length > 0 ? { routingAccuracy: mean(routingScored.map((s) => s.routingCorrect!)) } : {}),
    abstentionAccuracy: mean(scores.map((s) => s.abstentionCorrect)),
  };
}

export function aggregateAgentResults(scores: AgentQuestionScore[]): AgentHarnessReport {
  const categories = [...new Set(scores.map((s) => s.category))];
  const perCategory = categories.map((category) => categoryMetrics(category, scores.filter((s) => s.category === category)));
  const routingScored = scores.filter((s) => s.routingCorrect !== undefined);

  return {
    perCategory,
    overall: {
      ...(routingScored.length > 0 ? { routingAccuracy: mean(routingScored.map((s) => s.routingCorrect!)) } : {}),
      abstentionAccuracy: mean(scores.map((s) => s.abstentionCorrect)),
    },
    routingUnscored: scores
      .filter((s) => s.routingCorrect === undefined)
      .map((s) => ({ questionId: s.questionId, category: s.category })),
  };
}

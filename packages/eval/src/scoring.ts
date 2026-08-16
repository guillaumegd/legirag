import type { Chunk } from '@legirag/shared';
import type { EvaluationCategory, EvaluationQuestion } from './schema.js';

// Indépendant du PRE_FUSION_LIMIT interne de SupabaseRetriever - voir 4d.
export const HARNESS_TOP_K = 10;

export interface QuestionScore {
  questionId: string;
  category: EvaluationCategory;
  hasGroundTruth: boolean; // false seulement pour hors_perimetre / fausse_premisse
  rank?: number; // position 1-indexée du premier chunk attendu, absent si non trouvé
  hitAt1?: boolean;
  hitAt5?: boolean;
  hitAt10?: boolean;
  reciprocalRank?: number;
  exclusionRespected?: boolean; // présent seulement si articlesExclus était renseigné
}

export interface CategoryMetrics {
  category: EvaluationCategory;
  questionCount: number;
  recallAt1: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
}

export interface HarnessReport {
  topK: number;
  perCategory: CategoryMetrics[];
  overall: Omit<CategoryMetrics, 'category'>;
  exclusionChecks: { questionId: string; passed: boolean }[];
  unscored: { questionId: string; category: EvaluationCategory }[];
}

function findRank(articlesAttendus: string[], chunks: Chunk[]): number | undefined {
  const index = chunks.findIndex((chunk) => articlesAttendus.includes(chunk.articleIdentifier));
  return index === -1 ? undefined : index + 1;
}

export function scoreQuestion(question: EvaluationQuestion, chunks: Chunk[]): QuestionScore {
  const hasPositive = Boolean(question.articlesAttendus?.length);
  const hasExclusion = Boolean(question.articlesExclus?.length);

  const positive: Partial<QuestionScore> = hasPositive
    ? (() => {
        const rank = findRank(question.articlesAttendus!, chunks);
        return {
          ...(rank !== undefined ? { rank } : {}),
          hitAt1: rank !== undefined && rank <= 1,
          hitAt5: rank !== undefined && rank <= 5,
          hitAt10: rank !== undefined && rank <= 10,
          reciprocalRank: rank !== undefined ? 1 / rank : 0,
        };
      })()
    : {};

  const exclusion: Partial<QuestionScore> = hasExclusion
    ? { exclusionRespected: !chunks.some((chunk) => question.articlesExclus!.includes(chunk.articleIdentifier)) }
    : {};

  return {
    questionId: question.id,
    category: question.category,
    hasGroundTruth: hasPositive || hasExclusion,
    ...positive,
    ...exclusion,
  };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function baseMetrics(scores: QuestionScore[]): Omit<CategoryMetrics, 'category'> {
  const scored = scores.filter((s) => s.hitAt1 !== undefined);
  return {
    questionCount: scored.length,
    recallAt1: mean(scored.map((s) => (s.hitAt1 ? 1 : 0))),
    recallAt5: mean(scored.map((s) => (s.hitAt5 ? 1 : 0))),
    recallAt10: mean(scored.map((s) => (s.hitAt10 ? 1 : 0))),
    mrr: mean(scored.map((s) => s.reciprocalRank ?? 0)),
  };
}

function categoryMetrics(category: EvaluationCategory, scores: QuestionScore[]): CategoryMetrics {
  return { category, ...baseMetrics(scores) };
}

export function aggregateResults(scores: QuestionScore[]): HarnessReport {
  const categories = [...new Set(scores.map((s) => s.category))];
  const perCategory = categories.map((category) => categoryMetrics(category, scores.filter((s) => s.category === category)));

  return {
    topK: HARNESS_TOP_K,
    perCategory,
    overall: baseMetrics(scores),
    exclusionChecks: scores
      .filter((s) => s.exclusionRespected !== undefined)
      .map((s) => ({ questionId: s.questionId, passed: s.exclusionRespected! })),
    unscored: scores
      .filter((s) => !s.hasGroundTruth)
      .map((s) => ({ questionId: s.questionId, category: s.category })),
  };
}

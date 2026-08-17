import { z } from 'zod';

export const EvaluationCategory = z.enum([
  'recherche_simple',
  'renvoi_obligatoire',
  'sensible_a_la_date',
  'hors_perimetre',
  'fausse_premisse',
]);
export type EvaluationCategory = z.infer<typeof EvaluationCategory>;

export const EvaluationQuestion = z
  .object({
    id: z.string(),
    question: z.string(),
    category: EvaluationCategory,
    articlesAttendus: z.array(z.string()).optional(),
    articlesExclus: z.array(z.string()).optional(),
    dateReference: z.string().optional(), // 'YYYY-MM-DD' ; absent = aujourd'hui
    notes: z.string().optional(),
  })
  .refine(
    (q) => {
      const hasGroundTruth = Boolean(q.articlesAttendus?.length) || Boolean(q.articlesExclus?.length);
      if (q.category === 'hors_perimetre' || q.category === 'fausse_premisse') return !hasGroundTruth;
      if (q.category === 'recherche_simple' || q.category === 'renvoi_obligatoire') {
        return Boolean(q.articlesAttendus?.length);
      }
      return hasGroundTruth; // sensible_a_la_date : au moins l'un des deux
    },
    { message: 'vérité terrain incohérente avec la catégorie (voir Data / contracts).' },
  );
export type EvaluationQuestion = z.infer<typeof EvaluationQuestion>;

// Item 12b : forme du rapport de qualité comparé entre eval/baseline.json et
// un run en direct - miroir d'AgentHarnessReport (agent-scoring.ts) plus la
// couverture des renvois, qui vit dans un module séparé côté harnais.
const BaselineMetrics = z.object({
  routingAccuracy: z.number().min(0).max(1).optional(),
  abstentionAccuracy: z.number().min(0).max(1),
});

export const Baseline = z.object({
  capturedAt: z.string().min(1),
  perCategory: z.array(BaselineMetrics.extend({ category: EvaluationCategory, questionCount: z.number().int().nonnegative() })),
  overall: BaselineMetrics,
  crossRefCoverageMean: z.number().min(0).max(1).optional(),
});
export type Baseline = z.infer<typeof Baseline>;

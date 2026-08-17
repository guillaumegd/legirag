import { z } from 'zod';
import { dateReferenceSchema } from '../common/date-reference.schema.js';

// Borne le coût pire-cas d'une seule question (11c) - une vraie question
// juridique tient largement en dessous ; ceci ne cible qu'un texte
// anormalement long qui gonflerait le prompt de draft. L'autre moitié du
// coût "par requête" (combien d'appels modèle une question peut déclencher)
// est déjà bornée par MAX_RENVOI_ITERATIONS/MAX_DRAFT_ATTEMPTS (packages/
// agent/src/graph.ts, item 9c) - non dupliquée ici.
const QUESTION_MAX_LENGTH = 2000;

export const QuestionRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'question est requis et ne peut pas être vide')
    .max(QUESTION_MAX_LENGTH, `question ne peut pas dépasser ${QUESTION_MAX_LENGTH} caractères`),
  dateReference: dateReferenceSchema,
  codes: z.array(z.string().min(1)).optional(),
});

export type QuestionRequest = z.infer<typeof QuestionRequestSchema>;

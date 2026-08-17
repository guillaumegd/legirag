import { z } from 'zod';
import { dateReferenceSchema } from '../common/date-reference.schema.js';

export const QuestionRequestSchema = z.object({
  question: z.string().trim().min(1, 'question est requis et ne peut pas être vide'),
  dateReference: dateReferenceSchema,
  codes: z.array(z.string().min(1)).optional(),
});

export type QuestionRequest = z.infer<typeof QuestionRequestSchema>;

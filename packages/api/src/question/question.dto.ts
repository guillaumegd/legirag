import { z } from 'zod';

export const QuestionRequestSchema = z.object({
  question: z.string().trim().min(1, 'question est requis et ne peut pas être vide'),
  dateReference: z
    .string()
    .refine((val) => !Number.isNaN(Date.parse(val)), {
      message: 'dateReference doit être une date valide (format ISO 8601)',
    })
    .optional(),
  codes: z.array(z.string().min(1)).optional(),
});

export type QuestionRequest = z.infer<typeof QuestionRequestSchema>;

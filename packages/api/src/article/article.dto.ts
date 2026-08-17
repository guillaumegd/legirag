import { z } from 'zod';
import { dateReferenceSchema } from '../common/date-reference.schema.js';

export const ArticleQuerySchema = z.object({
  dateReference: dateReferenceSchema,
});

export type ArticleQuery = z.infer<typeof ArticleQuerySchema>;

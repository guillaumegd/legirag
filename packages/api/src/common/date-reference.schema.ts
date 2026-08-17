import { z } from 'zod';

export const dateReferenceSchema = z
  .string()
  .refine((val) => !Number.isNaN(Date.parse(val)), {
    message: 'dateReference doit être une date valide (format ISO 8601)',
  })
  .optional();

import { describe, expect, it } from 'vitest';
import { QuestionRequestSchema } from './question.dto.js';

describe('QuestionRequestSchema', () => {
  it('accepte une question seule', () => {
    const result = QuestionRequestSchema.safeParse({ question: 'vitesse maximale en agglomération' });
    expect(result.success).toBe(true);
  });

  it('accepte dateReference et codes optionnels valides', () => {
    const result = QuestionRequestSchema.safeParse({
      question: 'vitesse maximale en agglomération',
      dateReference: '2026-08-17',
      codes: ['code-de-la-route'],
    });
    expect(result.success).toBe(true);
  });

  it('rejette une question manquante', () => {
    const result = QuestionRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejette une question vide', () => {
    const result = QuestionRequestSchema.safeParse({ question: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejette une dateReference invalide', () => {
    const result = QuestionRequestSchema.safeParse({
      question: 'vitesse maximale en agglomération',
      dateReference: 'pas-une-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejette des codes qui ne sont pas des chaînes', () => {
    const result = QuestionRequestSchema.safeParse({
      question: 'vitesse maximale en agglomération',
      codes: [42],
    });
    expect(result.success).toBe(false);
  });

  it('rejette une question de plus de 2000 caractères', () => {
    const result = QuestionRequestSchema.safeParse({ question: 'a'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('accepte une question de exactement 2000 caractères', () => {
    const result = QuestionRequestSchema.safeParse({ question: 'a'.repeat(2000) });
    expect(result.success).toBe(true);
  });
});

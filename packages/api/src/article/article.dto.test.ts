import { describe, expect, it } from 'vitest';
import { ArticleQuerySchema } from './article.dto.js';

describe('ArticleQuerySchema', () => {
  it('accepte une requête sans dateReference', () => {
    const result = ArticleQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepte une dateReference valide', () => {
    const result = ArticleQuerySchema.safeParse({ dateReference: '2026-08-17' });
    expect(result.success).toBe(true);
  });

  it('rejette une dateReference invalide', () => {
    const result = ArticleQuerySchema.safeParse({ dateReference: 'pas-une-date' });
    expect(result.success).toBe(false);
  });
});

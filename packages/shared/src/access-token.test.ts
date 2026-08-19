import { afterEach, describe, expect, it } from 'vitest';
import { verifyAccessToken } from './access-token.js';

afterEach(() => {
  delete process.env.LEGIRAG_ACCESS_TOKEN;
});

describe('verifyAccessToken', () => {
  it('accepte "Bearer <token>" quand le token correspond', () => {
    process.env.LEGIRAG_ACCESS_TOKEN = 'secret-de-test';
    expect(verifyAccessToken('Bearer secret-de-test')).toBe(true);
  });

  it('rejette un token différent', () => {
    process.env.LEGIRAG_ACCESS_TOKEN = 'secret-de-test';
    expect(verifyAccessToken('Bearer mauvais-token')).toBe(false);
  });

  it('rejette un token de longueur différente sans lever', () => {
    process.env.LEGIRAG_ACCESS_TOKEN = 'secret-de-test';
    expect(verifyAccessToken('Bearer court')).toBe(false);
  });

  it('rejette un en-tête absent', () => {
    process.env.LEGIRAG_ACCESS_TOKEN = 'secret-de-test';
    expect(verifyAccessToken(undefined)).toBe(false);
  });

  it('rejette un en-tête sans le préfixe "Bearer "', () => {
    process.env.LEGIRAG_ACCESS_TOKEN = 'secret-de-test';
    expect(verifyAccessToken('secret-de-test')).toBe(false);
  });

  it("lève une erreur explicite quand LEGIRAG_ACCESS_TOKEN n'est pas configuré", () => {
    expect(() => verifyAccessToken('Bearer peu-importe')).toThrow(
      "Variable d'environnement manquante : LEGIRAG_ACCESS_TOKEN",
    );
  });
});

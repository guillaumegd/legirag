import { afterEach, describe, expect, it } from 'vitest';
import { requireEnv } from './env.js';

afterEach(() => {
  delete process.env.TEST_REQUIRE_ENV;
});

describe('requireEnv', () => {
  it("lève une erreur explicite quand la variable est absente", () => {
    expect(() => requireEnv('TEST_REQUIRE_ENV')).toThrow(
      "Variable d'environnement manquante : TEST_REQUIRE_ENV",
    );
  });

  it('renvoie la valeur quand la variable est présente', () => {
    process.env.TEST_REQUIRE_ENV = 'valeur';
    expect(requireEnv('TEST_REQUIRE_ENV')).toBe('valeur');
  });
});

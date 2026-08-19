import { afterEach, describe, expect, it } from 'vitest';
import { readPositiveNumberEnv } from './positive-number-env.js';

afterEach(() => {
  delete process.env.TEST_POSITIVE_NUMBER_ENV;
});

describe('readPositiveNumberEnv', () => {
  it('renvoie le repli quand la variable est absente', () => {
    expect(readPositiveNumberEnv('TEST_POSITIVE_NUMBER_ENV', 42)).toBe(42);
  });

  it('renvoie la valeur analysée quand elle est présente et valide', () => {
    process.env.TEST_POSITIVE_NUMBER_ENV = '7';
    expect(readPositiveNumberEnv('TEST_POSITIVE_NUMBER_ENV', 42)).toBe(7);
  });

  it('renvoie le repli quand la valeur n’est pas un nombre', () => {
    process.env.TEST_POSITIVE_NUMBER_ENV = 'pas-un-nombre';
    expect(readPositiveNumberEnv('TEST_POSITIVE_NUMBER_ENV', 42)).toBe(42);
  });

  it('renvoie le repli quand la valeur est négative ou nulle', () => {
    process.env.TEST_POSITIVE_NUMBER_ENV = '0';
    expect(readPositiveNumberEnv('TEST_POSITIVE_NUMBER_ENV', 42)).toBe(42);
    process.env.TEST_POSITIVE_NUMBER_ENV = '-5';
    expect(readPositiveNumberEnv('TEST_POSITIVE_NUMBER_ENV', 42)).toBe(42);
  });
});

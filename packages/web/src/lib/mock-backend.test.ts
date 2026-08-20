import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMockBackendEnabled, selectScenario } from './mock-backend';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isMockBackendEnabled', () => {
  it('is false when LEGIRAG_MOCK_BACKEND is unset', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LEGIRAG_MOCK_BACKEND', '');
    expect(isMockBackendEnabled()).toBe(false);
  });

  it('is false when LEGIRAG_MOCK_BACKEND is set to anything other than "true"', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LEGIRAG_MOCK_BACKEND', '1');
    expect(isMockBackendEnabled()).toBe(false);
  });

  it('is true when LEGIRAG_MOCK_BACKEND is "true" and NODE_ENV is not production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LEGIRAG_MOCK_BACKEND', 'true');
    expect(isMockBackendEnabled()).toBe(true);
  });

  it('stays false in production even when LEGIRAG_MOCK_BACKEND is "true"', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LEGIRAG_MOCK_BACKEND', 'true');
    expect(isMockBackendEnabled()).toBe(false);
  });
});

describe('selectScenario', () => {
  it('returns "abstention" when the question contains "abstention"', () => {
    expect(selectScenario('Je veux tester une abstention')).toBe('abstention');
  });

  it('returns "erreur" when the question contains "erreur"', () => {
    expect(selectScenario("Simuler une erreur d'appel")).toBe('erreur');
  });

  it('returns "nominal" for any other question', () => {
    expect(selectScenario("Un salarié peut-il être licencié pendant un arrêt maladie ?")).toBe('nominal');
  });

  it('is case-insensitive', () => {
    expect(selectScenario('ABSTENTION totale')).toBe('abstention');
    expect(selectScenario('ERREUR de traitement')).toBe('erreur');
  });

  it('is accent-insensitive (accented text around the keyword does not break matching)', () => {
    expect(selectScenario('Décision rendue en erreur évidente')).toBe('erreur');
  });

  it('matches the keyword anywhere in the question, not just as a whole word', () => {
    expect(selectScenario('Que dit le corpus en cas d\'abstention du juge ?')).toBe('abstention');
  });
});

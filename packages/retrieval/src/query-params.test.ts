import { describe, expect, it } from 'vitest';
import { formatCodesFilter, formatDateReference } from './query-params.js';

describe('formatDateReference', () => {
  it("formate une date en 'YYYY-MM-DD'", () => {
    expect(formatDateReference(new Date('2026-08-16T00:00:00.000Z'))).toBe('2026-08-16');
  });

  it('utilise le jour calendaire Europe/Paris, pas le jour UTC', () => {
    // 2026-01-05T23:45 UTC = 2026-01-06T00:45 heure de Paris (hiver, UTC+1) :
    // le jour local a déjà basculé, formatDateReference doit refléter Paris.
    expect(formatDateReference(new Date('2026-01-05T23:45:00.000Z'))).toBe('2026-01-06');
  });

  it("ne recule pas d'un jour près de minuit heure de Paris (régression F-01)", () => {
    // 2026-08-17T00:30 heure de Paris (été, UTC+2) = 2026-08-16T22:30 UTC.
    // L'ancienne implémentation (toISOString().slice(0, 10)) renvoyait le
    // jour UTC (16), un jour en retard sur le "aujourd'hui" local réel (17).
    expect(formatDateReference(new Date('2026-08-17T00:30:00+02:00'))).toBe('2026-08-17');
  });
});

describe('formatCodesFilter', () => {
  it('renvoie une chaîne vide quand codes est undefined', () => {
    expect(formatCodesFilter(undefined)).toBe('');
  });

  it('renvoie une chaîne vide quand codes est un tableau vide', () => {
    expect(formatCodesFilter([])).toBe('');
  });

  it('joint plusieurs codes par des virgules, sans espace', () => {
    expect(formatCodesFilter(['code-civil', 'code-penal'])).toBe('code-civil,code-penal');
  });

  it('renvoie le code seul quand il n\'y en a qu\'un', () => {
    expect(formatCodesFilter(['code-civil'])).toBe('code-civil');
  });
});

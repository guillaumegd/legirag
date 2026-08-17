import { describe, expect, it } from 'vitest';
import { buildRouterPrompt, filterKnownCodes, type CodeDisponible } from './router-question.js';

const AVAILABLE: CodeDisponible[] = [
  { codeSlug: 'code-de-la-route', code: 'Code de la route' },
  { codeSlug: 'code-penal', code: 'Code pénal' },
];

describe('buildRouterPrompt', () => {
  it('inclut la question et chaque code disponible', () => {
    const prompt = buildRouterPrompt('140 km/h sur autoroute', AVAILABLE);
    expect(prompt).toContain('140 km/h sur autoroute');
    expect(prompt).toContain('code-de-la-route');
    expect(prompt).toContain('Code de la route');
    expect(prompt).toContain('code-penal');
    expect(prompt).toContain('Code pénal');
  });

  it("n'inclut aucun code hors de la liste fournie", () => {
    const prompt = buildRouterPrompt('question', AVAILABLE);
    expect(prompt).not.toContain('code-civil');
  });
});

describe('filterKnownCodes', () => {
  it('garde uniquement les codes présents dans la liste disponible', () => {
    expect(filterKnownCodes(['code-de-la-route', 'code-invente', 'code-penal'], AVAILABLE)).toEqual([
      'code-de-la-route',
      'code-penal',
    ]);
  });

  it('retourne un tableau vide si aucun code proposé ne correspond', () => {
    expect(filterKnownCodes(['code-invente'], AVAILABLE)).toEqual([]);
  });

  it('retourne un tableau vide si la liste disponible est vide', () => {
    expect(filterKnownCodes(['code-de-la-route'], [])).toEqual([]);
  });
});

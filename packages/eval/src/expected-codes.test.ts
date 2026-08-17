import { describe, expect, it } from 'vitest';
import { codesForArticles } from './expected-codes.js';

describe('codesForArticles', () => {
  it('résout chaque article vers son code', () => {
    const map = new Map([
      ['A', 'code-de-la-route'],
      ['B', 'code-penal'],
    ]);
    expect(codesForArticles(['A', 'B'], map)).toEqual(['code-de-la-route', 'code-penal']);
  });

  it('dédoublonne en conservant le premier ordre rencontré', () => {
    const map = new Map([
      ['A', 'code-de-la-route'],
      ['B', 'code-penal'],
      ['C', 'code-de-la-route'],
    ]);
    expect(codesForArticles(['A', 'C', 'B'], map)).toEqual(['code-de-la-route', 'code-penal']);
  });

  it('ignore silencieusement un article absent de la map', () => {
    const map = new Map([['A', 'code-de-la-route']]);
    expect(codesForArticles(['A', 'inconnu'], map)).toEqual(['code-de-la-route']);
  });

  it('renvoie un tableau vide pour une liste vide', () => {
    expect(codesForArticles([], new Map())).toEqual([]);
  });
});

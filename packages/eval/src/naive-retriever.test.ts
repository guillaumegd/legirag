import { describe, expect, it } from 'vitest';
import { cosineSimilarity, rankByCosineSimilarity, type EmbeddedNaiveChunk } from './naive-retriever.js';

describe('cosineSimilarity', () => {
  it('renvoie 1 pour deux vecteurs identiques', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('renvoie 0 pour deux vecteurs orthogonaux', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('renvoie -1 pour deux vecteurs opposés', () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1);
  });

  it('renvoie 0 plutôt que NaN quand un vecteur est de magnitude nulle', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 1], [0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe('rankByCosineSimilarity', () => {
  const corpus: EmbeddedNaiveChunk[] = [
    { articleIdentifier: 'loin', contenu: 'a', embedding: [0, 1] },
    { articleIdentifier: 'proche', contenu: 'b', embedding: [1, 0.01] },
    { articleIdentifier: 'moyen', contenu: 'c', embedding: [1, 1] },
  ];

  it('trie du plus proche au plus loin', () => {
    const ranked = rankByCosineSimilarity([1, 0], corpus, 3);
    expect(ranked.map((c) => c.articleIdentifier)).toEqual(['proche', 'moyen', 'loin']);
  });

  it('respecte topK', () => {
    const ranked = rankByCosineSimilarity([1, 0], corpus, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked.map((c) => c.articleIdentifier)).toEqual(['proche', 'moyen']);
  });

  it('renvoie moins que topK si le corpus est plus petit', () => {
    const ranked = rankByCosineSimilarity([1, 0], corpus, 10);
    expect(ranked).toHaveLength(3);
  });

  it('renvoie un tableau vide pour un corpus vide', () => {
    expect(rankByCosineSimilarity([1, 0], [], 5)).toEqual([]);
  });

  it('ne modifie pas le tableau corpus passé en entrée', () => {
    const original = [...corpus];
    rankByCosineSimilarity([1, 0], corpus, 3);
    expect(corpus).toEqual(original);
  });
});

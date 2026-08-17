import type { Chunk } from '@legirag/shared';
import { describe, expect, it } from 'vitest';
import { toRequeteRecherche, toToolContent } from './chercher-droit.js';

describe('toRequeteRecherche', () => {
  const now = new Date('2026-08-17T10:00:00.000Z');

  it('applique topK=10 et dateReference=now par défaut', () => {
    expect(toRequeteRecherche({ texte: 'vitesse maximale' }, now)).toEqual({
      texte: 'vitesse maximale',
      dateReference: now,
      topK: 10,
    });
  });

  it('convertit la date fournie (chaîne YYYY-MM-DD) en Date, sans utiliser now', () => {
    const result = toRequeteRecherche({ texte: 'vitesse maximale', date: '2020-01-01' }, now);
    expect(result.dateReference).toEqual(new Date('2020-01-01'));
  });

  it('passe topK, codes et idcc quand fournis', () => {
    const result = toRequeteRecherche(
      { texte: 'vitesse maximale', topK: 5, codes: ['code-de-la-route'], idcc: '1234' },
      now,
    );
    expect(result).toEqual({
      texte: 'vitesse maximale',
      dateReference: now,
      topK: 5,
      codes: ['code-de-la-route'],
      idcc: '1234',
    });
  });

  it("n'ajoute pas codes/idcc quand absents", () => {
    const result = toRequeteRecherche({ texte: 'vitesse maximale' }, now);
    expect('codes' in result).toBe(false);
    expect('idcc' in result).toBe(false);
  });
});

describe('toToolContent', () => {
  it('renvoie un message dédié quand chunks est vide', () => {
    expect(toToolContent([])).toEqual([
      { type: 'text', text: 'Aucun résultat trouvé pour cette recherche.' },
    ]);
  });

  it('formate un chunk avec subdivision', () => {
    const chunk: Chunk = {
      id: 1,
      articleIdentifier: 'LEGIARTI000006841372',
      subdivisionLabel: 'I, 1°',
      contenu: 'Le contenu de la subdivision.',
    };
    expect(toToolContent([chunk])).toEqual([
      { type: 'text', text: '[LEGIARTI000006841372 I, 1°]\nLe contenu de la subdivision.' },
    ]);
  });

  it('formate un chunk sans subdivision (article entier)', () => {
    const chunk: Chunk = {
      id: 2,
      articleIdentifier: 'LEGIARTI000006841373',
      contenu: "Le contenu de l'article.",
    };
    expect(toToolContent([chunk])).toEqual([
      { type: 'text', text: "[LEGIARTI000006841373]\nLe contenu de l'article." },
    ]);
  });

  it('formate plusieurs chunks, un content par chunk', () => {
    const chunks: Chunk[] = [
      { id: 1, articleIdentifier: 'A', contenu: 'contenu A' },
      { id: 2, articleIdentifier: 'B', contenu: 'contenu B' },
    ];
    expect(toToolContent(chunks)).toHaveLength(2);
  });
});

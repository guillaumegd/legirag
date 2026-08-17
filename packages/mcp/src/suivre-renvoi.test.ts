import { describe, expect, it } from 'vitest';
import { splitRenvois, type RenvoiRow } from './suivre-renvoi.js';

function makeRow(overrides: Partial<RenvoiRow>): RenvoiRow {
  return {
    id: 1,
    sourceArticle: 'LEGIARTI-source',
    cibleArticleNum: '893',
    forme: 'simple',
    interCode: false,
    resolu: true,
    cibleVisible: true,
    ...overrides,
  };
}

describe('splitRenvois', () => {
  it('un renvoi résolu et visible va dans renvois', () => {
    const row = makeRow({ cibleArticleId: 'LEGIARTI-cible' });
    const result = splitRenvois([row]);
    expect(result.renvois).toEqual([
      {
        id: 1,
        sourceArticle: 'LEGIARTI-source',
        cibleArticleNum: '893',
        cibleArticleId: 'LEGIARTI-cible',
        forme: 'simple',
        interCode: false,
        resolu: true,
      },
    ]);
    expect(result.nonResolus).toEqual([]);
  });

  it('un renvoi résolu mais dont la cible n\'est pas visible va dans nonResolus', () => {
    const row = makeRow({ cibleArticleId: 'LEGIARTI-cible', cibleVisible: false });
    const result = splitRenvois([row]);
    expect(result.renvois).toEqual([]);
    expect(result.nonResolus).toEqual(['893']);
  });

  it('un renvoi jamais résolu va dans nonResolus', () => {
    const row = makeRow({ resolu: false, cibleVisible: false });
    const result = splitRenvois([row]);
    expect(result.renvois).toEqual([]);
    expect(result.nonResolus).toEqual(['893']);
  });

  it('nonResolus mentionne le code cible pour un renvoi inter-code', () => {
    const row = makeRow({ interCode: true, cibleCode: 'code civil', cibleVisible: false });
    const result = splitRenvois([row]);
    expect(result.nonResolus).toEqual(['893 (code civil)']);
  });

  it('nonResolus ne mentionne pas de code pour un renvoi même code', () => {
    const row = makeRow({ cibleVisible: false });
    const result = splitRenvois([row]);
    expect(result.nonResolus).toEqual(['893']);
  });

  it('un article sans aucun renvoi renvoie deux tableaux vides', () => {
    expect(splitRenvois([])).toEqual({ renvois: [], nonResolus: [] });
  });
});

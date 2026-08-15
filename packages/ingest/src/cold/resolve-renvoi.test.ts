import { describe, expect, it } from 'vitest';
import { buildArticleIndex, resolveRenvoi } from './resolve-renvoi.js';
import type { ExtractedRenvoi } from './renvois.js';

function renvoi(overrides: Partial<ExtractedRenvoi>): ExtractedRenvoi {
  return {
    cibleArticleNum: 'L631-3',
    forme: 'simple',
    interCode: false,
    offsetDebut: 0,
    offsetFin: 0,
    ...overrides,
  };
}

const INDEX = buildArticleIndex([
  { articleIdentifier: 'LEGIARTI-SOURCE-CODE-L631-3', articleNum: 'L. 631-3', codeSlug: 'code-source' },
  { articleIdentifier: 'LEGIARTI-AUTRE-CODE-L631-3', articleNum: 'L. 631-3', codeSlug: 'code-de-la-voirie-routiere' },
]);

describe('resolveRenvoi', () => {
  it('résout une référence même code via sourceCodeSlug', () => {
    const result = resolveRenvoi(renvoi({ cibleArticleNum: 'L. 631-3' }), 'code-source', INDEX);
    expect(result).toEqual({ cibleArticleId: 'LEGIARTI-SOURCE-CODE-L631-3', resolu: true });
  });

  it('résout une référence inter-code en reslugifiant cibleCode', () => {
    const result = resolveRenvoi(
      renvoi({ cibleArticleNum: 'L. 631-3', cibleCode: 'code de la voirie routière', interCode: true }),
      'code-source',
      INDEX,
    );
    expect(result).toEqual({ cibleArticleId: 'LEGIARTI-AUTRE-CODE-L631-3', resolu: true });
  });

  it("retourne non résolu quand le numéro normalisé n'est dans aucun code", () => {
    const result = resolveRenvoi(renvoi({ cibleArticleNum: 'L999-99' }), 'code-source', INDEX);
    expect(result).toEqual({ resolu: false });
  });

  it("retourne non résolu quand le numéro existe mais dans un autre code que celui visé", () => {
    const result = resolveRenvoi(
      renvoi({ cibleArticleNum: 'L. 631-3', cibleCode: 'code inexistant', interCode: true }),
      'code-source',
      INDEX,
    );
    expect(result).toEqual({ resolu: false });
  });
});

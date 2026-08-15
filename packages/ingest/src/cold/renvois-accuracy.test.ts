import { describe, expect, it } from 'vitest';
import { computeAccuracy } from './renvois-accuracy.js';
import { RENVOIS_SAMPLE } from './renvois-sample.js';
import { extractRenvois } from './renvois.js';
import type { ExtractedRenvoi } from './renvois.js';

describe('computeAccuracy', () => {
  it('vaut 1/1/1 quand un extracteur parfait retrouve exactement les attendus', () => {
    const parfait = (_texte: string): ExtractedRenvoi[] => [
      { cibleArticleNum: 'L. 1', forme: 'simple', interCode: false, offsetDebut: 0, offsetFin: 0 },
    ];
    const sample = [{ articleIdentifier: 'X', contenuText: 'peu importe', attendus: parfait('') }];

    const resultat = computeAccuracy(sample, parfait);

    expect(resultat).toEqual({
      precision: 1,
      recall: 1,
      f1: 1,
      byForme: {
        simple: { precision: 1, recall: 1 },
        enumeration: { precision: 1, recall: 1 },
        plage: { precision: 1, recall: 1 },
      },
    });
  });

  it('compte un doublon manqué dans une plage comme un vrai faux négatif', () => {
    const troisAttendus: ExtractedRenvoi[] = [
      { cibleArticleNum: 'L142-10', forme: 'plage', interCode: false, offsetDebut: 0, offsetFin: 0 },
      { cibleArticleNum: 'L142-11', forme: 'plage', interCode: false, offsetDebut: 0, offsetFin: 0 },
      { cibleArticleNum: 'L142-12', forme: 'plage', interCode: false, offsetDebut: 0, offsetFin: 0 },
    ];
    const extracteurIncomplet = (_texte: string): ExtractedRenvoi[] => troisAttendus.slice(0, 2);
    const sample = [{ articleIdentifier: 'X', contenuText: 'peu importe', attendus: troisAttendus }];

    const resultat = computeAccuracy(sample, extracteurIncomplet);

    expect(resultat.precision).toBe(1);
    expect(resultat.recall).toBeCloseTo(2 / 3);
  });

  it('reste à 1/1 sur une ligne d\'exclusion où prédit et attendu sont tous deux vides', () => {
    const sample = [{ articleIdentifier: 'X', contenuText: 'texte hors périmètre', attendus: [] }];

    const resultat = computeAccuracy(sample, () => []);

    expect(resultat.precision).toBe(1);
    expect(resultat.recall).toBe(1);
  });

  it("l'extracteur réel atteint le seuil de précision/rappel sur l'échantillon annoté", () => {
    const resultat = computeAccuracy(RENVOIS_SAMPLE, extractRenvois);

    expect(resultat.precision).toBeGreaterThanOrEqual(0.9);
    expect(resultat.recall).toBeGreaterThanOrEqual(0.85);
  });
});

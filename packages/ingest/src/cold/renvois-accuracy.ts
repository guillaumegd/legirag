import type { AnnotatedRenvoiCase } from './renvois-sample.js';
import type { ExtractedRenvoi } from './renvois.js';

type Forme = ExtractedRenvoi['forme'];
const FORMES: Forme[] = ['simple', 'enumeration', 'plage'];

// La clé de comparaison couvre cibleSubdivision en plus des quatre champs
// cités dans la spec (cibleArticleNum/cibleCode/forme/interCode) : sans
// elle, la détection de subdivision-cible construite à l'étape 3 ne serait
// jamais mesurée par ce score, alors que c'est exactement ce que
// l'échantillon annoté teste.
function cle(r: ExtractedRenvoi): string {
  return [r.cibleArticleNum, r.cibleCode ?? '', r.cibleSubdivision ?? '', r.forme, String(r.interCode)].join(' ');
}

// Comparaison en multi-ensemble : chaque renvoi attendu ne peut être
// apparié qu'une seule fois, ce qui compte correctement les doublons d'une
// plage ou d'une énumération plutôt que de se contenter d'un "au moins un
// attendu correspond".
function vraisPositifs(predits: ExtractedRenvoi[], attendus: ExtractedRenvoi[]): number {
  const disponibles = new Map<string, number>();
  for (const item of attendus) {
    const k = cle(item);
    disponibles.set(k, (disponibles.get(k) ?? 0) + 1);
  }

  let total = 0;
  for (const item of predits) {
    const k = cle(item);
    const reste = disponibles.get(k) ?? 0;
    if (reste > 0) {
      total += 1;
      disponibles.set(k, reste - 1);
    }
  }
  return total;
}

function ratio(numerateur: number, denominateur: number): number {
  if (denominateur === 0) return numerateur === 0 ? 1 : 0;
  return numerateur / denominateur;
}

function f1(vp: number, predits: number, attendus: number): number {
  const p = ratio(vp, predits);
  const r = ratio(vp, attendus);
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

export interface AccuracyResult {
  precision: number;
  recall: number;
  f1: number;
  byForme: Record<Forme, { precision: number; recall: number }>;
}

export function computeAccuracy(
  sample: AnnotatedRenvoiCase[],
  extractor: (contenuText: string) => ExtractedRenvoi[],
): AccuracyResult {
  let vp = 0;
  let predits = 0;
  let attendus = 0;

  const parForme = new Map(FORMES.map((forme) => [forme, { vp: 0, predits: 0, attendus: 0 }]));

  for (const cas of sample) {
    const actuels = extractor(cas.contenuText);
    predits += actuels.length;
    attendus += cas.attendus.length;
    vp += vraisPositifs(actuels, cas.attendus);

    for (const forme of FORMES) {
      const actuelsForme = actuels.filter((r) => r.forme === forme);
      const attendusForme = cas.attendus.filter((r) => r.forme === forme);
      const stats = parForme.get(forme);
      if (stats === undefined) continue;
      stats.predits += actuelsForme.length;
      stats.attendus += attendusForme.length;
      stats.vp += vraisPositifs(actuelsForme, attendusForme);
    }
  }

  const byForme = Object.fromEntries(
    FORMES.map((forme) => {
      const stats = parForme.get(forme);
      const s = stats ?? { vp: 0, predits: 0, attendus: 0 };
      return [forme, { precision: ratio(s.vp, s.predits), recall: ratio(s.vp, s.attendus) }];
    }),
  ) as Record<Forme, { precision: number; recall: number }>;

  return { precision: ratio(vp, predits), recall: ratio(vp, attendus), f1: f1(vp, predits, attendus), byForme };
}

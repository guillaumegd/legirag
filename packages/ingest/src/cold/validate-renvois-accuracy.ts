import { computeAccuracy } from './renvois-accuracy.js';
import { RENVOIS_SAMPLE } from './renvois-sample.js';
import { extractRenvois } from './renvois.js';

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

const resultat = computeAccuracy(RENVOIS_SAMPLE, extractRenvois);

console.log(`Échantillon : ${RENVOIS_SAMPLE.length} lignes réelles`);
console.log(`Précision globale : ${pct(resultat.precision)}`);
console.log(`Rappel global : ${pct(resultat.recall)}`);
console.log(`F1 global : ${pct(resultat.f1)}`);
console.log('');
console.log('Par forme :');
for (const [forme, stats] of Object.entries(resultat.byForme)) {
  console.log(`  ${forme.padEnd(12)} précision ${pct(stats.precision).padEnd(7)} rappel ${pct(stats.recall)}`);
}

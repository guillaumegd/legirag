import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { coldCorpusPath } from './data-paths.js';
import { expandPlage, extractRenvois, normalizeArticleNum } from './renvois.js';
import { ColdArticleRow } from './types.js';

// Diagnostic léger, indépendant de la grammaire complète d'extractRenvois :
// repère toute paire "X à Y" pour vérifier, via expandPlage (exporté), la
// part de plages non développables sur le corpus réel - pas une mesure de
// justesse (Step 5 s'en charge), juste une photographie de la forme.
const PAIRE_PLAGE = /([LRD]\.?\s*\d[\d-]*|\d[\d-]*)\s*à\s*([LRD]\.?\s*\d[\d-]*|\d[\d-]*)/g;

// Même logique : un aperçu des clauses hors-code pour relecture manuelle,
// pas la définition d'exclusion elle-même (interne à renvois.ts).
const EXCLUSION_APERCU =
  /article[s]?\s+(?:[LRD]\.?\s*\d[\d-]*|\d[\d-]*)\s+de\s+la\s+loi|article[s]?\s+(?:[LRD]\.?\s*\d[\d-]*|\d[\d-]*)\s+de\s+l['’]ordonnance|article[s]?\s+(?:[LRD]\.?\s*\d[\d-]*|\d[\d-]*)\s+du\s+décret|article[s]?\s+(?:[LRD]\.?\s*\d[\d-]*|\d[\d-]*)\s+de\s+la\s+convention/i;

// Compteurs "au moins une fois par ligne", même méthode que les regex de
// repérage utilisées pendant le cadrage de cette feature - permet de
// comparer directement aux chiffres cités dans le done-when de l'étape 6,
// contrairement aux compteurs d'occurrences ci-dessus (une ligne peut
// contenir plusieurs plages).
const LIGNE_AVEC_PLAGE = /articles?\s+[LRD]?\.?\s*[\d-]+\s+à\s+[LRD]?\.?\s*[\d-]+/i;
const LIGNE_AVEC_ENUM = /articles\s+[LRD]?\.?\s*[\d-]+(?:,\s*[LRD]?\.?\s*[\d-]+)*\s+et\s+[LRD]?\.?\s*[\d-]+/i;
const LIGNE_AVEC_DU_CODE = /du\s+code\s+[a-zà-ÿ]/i;

async function main(): Promise<void> {
  const rl = createInterface({ input: createReadStream(coldCorpusPath, { encoding: 'utf8' }) });

  let total = 0;
  let avecMentionArticle = 0;
  let sansRenvoi = 0;
  let avecRenvoi = 0;
  let totalRenvois = 0;
  let interCode = 0;
  const parForme = new Map<string, number>();
  let plagesRencontrees = 0;
  let plagesNonDeveloppees = 0;
  let lignesAvecPlage = 0;
  let lignesAvecEnum = 0;
  let lignesAvecDuCode = 0;
  let lignesAvecExclusion = 0;
  const exclusionsApercu: string[] = [];

  for await (const line of rl) {
    if (line.length === 0) continue;
    total++;
    const row: ColdArticleRow = ColdArticleRow.parse(JSON.parse(line));
    const texte = row.article_contenu_text;

    if (/\barticles?\b/i.test(texte)) avecMentionArticle++;
    if (LIGNE_AVEC_PLAGE.test(texte)) lignesAvecPlage++;
    if (LIGNE_AVEC_ENUM.test(texte)) lignesAvecEnum++;
    if (LIGNE_AVEC_DU_CODE.test(texte)) lignesAvecDuCode++;
    if (EXCLUSION_APERCU.test(texte)) lignesAvecExclusion++;

    const renvois = extractRenvois(texte);
    if (renvois.length === 0) {
      sansRenvoi++;
    } else {
      avecRenvoi++;
      totalRenvois += renvois.length;
      for (const r of renvois) {
        if (r.interCode) interCode++;
        parForme.set(r.forme, (parForme.get(r.forme) ?? 0) + 1);
      }
    }

    for (const m of texte.matchAll(PAIRE_PLAGE)) {
      const debut = m[1];
      const fin = m[2];
      if (debut === undefined || fin === undefined) continue;
      if (normalizeArticleNum(debut) === normalizeArticleNum(fin)) continue; // pas une vraie plage
      plagesRencontrees++;
      if (expandPlage(debut, fin) === null) plagesNonDeveloppees++;
    }

    if (exclusionsApercu.length < 15 && EXCLUSION_APERCU.test(texte)) {
      const m = EXCLUSION_APERCU.exec(texte);
      if (m !== null) {
        const start = Math.max(0, m.index - 30);
        exclusionsApercu.push(`${row.article_identifier} | ${texte.slice(start, m.index + m[0].length + 20)}`);
      }
    }
  }

  console.log(`Lignes analysées : ${total}`);
  console.log(
    `Avec une mention "article(s)" : ${avecMentionArticle} (${((avecMentionArticle / total) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Sans renvoi extrait : ${sansRenvoi} (${((sansRenvoi / total) * 100).toFixed(1)}%) - ` +
      `avec au moins un renvoi : ${avecRenvoi} (${((avecRenvoi / total) * 100).toFixed(1)}%)`,
  );
  console.log(`Total de renvois extraits : ${totalRenvois}`);
  console.log(`Part inter-codes : ${interCode} (${((interCode / totalRenvois) * 100).toFixed(1)}%)`);
  console.log('Répartition par forme :');
  for (const [forme, count] of [...parForme.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${forme.padEnd(12)} ${count}`);
  }
  console.log(
    `Plages rencontrées (diagnostic indépendant, occurrences) : ${plagesRencontrees}, ` +
      `dont non développables (préfixes différents, borne non numérique...) : ${plagesNonDeveloppees}`,
  );
  console.log('');
  console.log('Lignes (pas occurrences) contenant au moins un motif, à comparer aux chiffres du done-when :');
  console.log(`  plage "X à Y"        : ${lignesAvecPlage}`);
  console.log(`  énumération "X et Y" : ${lignesAvecEnum}`);
  console.log(`  "du code ..."        : ${lignesAvecDuCode}`);
  console.log(`  exclusion hors-code  : ${lignesAvecExclusion}`);
  console.log('');
  console.log(`Aperçu de clauses exclues (hors-code) pour relecture manuelle (${exclusionsApercu.length}) :`);
  for (const extrait of exclusionsApercu) console.log(`  ${extrait}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

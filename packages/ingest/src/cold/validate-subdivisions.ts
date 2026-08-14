import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { coldCorpusPath } from './data-paths.js';
import { extractSubdivisions } from './subdivisions.js';
import { ColdArticleRow } from './types.js';

function profondeur(label: string): number {
  return label.split(',').length;
}

async function main(): Promise<void> {
  const rl = createInterface({ input: createReadStream(coldCorpusPath, { encoding: 'utf8' }) });

  let total = 0;
  let sansSubdivision = 0;
  let avecSubdivision = 0;
  let minCount = Infinity;
  let maxCount = 0;
  let sumCount = 0;
  const profondeurs = new Map<number, number>();
  const contenuVide: string[] = [];

  for await (const line of rl) {
    if (line.length === 0) continue;
    total++;
    const row: ColdArticleRow = ColdArticleRow.parse(JSON.parse(line));
    const subdivisions = extractSubdivisions(row.article_contenu_markdown);

    if (subdivisions.length === 0) {
      sansSubdivision++;
      continue;
    }

    avecSubdivision++;
    minCount = Math.min(minCount, subdivisions.length);
    maxCount = Math.max(maxCount, subdivisions.length);
    sumCount += subdivisions.length;

    for (const subdivision of subdivisions) {
      const d = profondeur(subdivision.label);
      profondeurs.set(d, (profondeurs.get(d) ?? 0) + 1);
      if (subdivision.contenu.length === 0) contenuVide.push(row.article_identifier);
    }
  }

  console.log(`Lignes analysées : ${total}`);
  console.log(
    `Sans subdivision : ${sansSubdivision} (${((sansSubdivision / total) * 100).toFixed(1)}%) - ` +
      `avec subdivision : ${avecSubdivision} (${((avecSubdivision / total) * 100).toFixed(1)}%)`,
  );
  if (avecSubdivision > 0) {
    console.log(
      `Nombre de subdivisions par article (parmi les non-vides) : min ${minCount}, max ${maxCount}, ` +
        `moyenne ${(sumCount / avecSubdivision).toFixed(2)}`,
    );
  }
  console.log('Profondeur des étiquettes (1 = "I"/"1°"/"a)", 2 = "I, 1°", 3 = "I, 1°, a)") :');
  for (const [d, count] of [...profondeurs.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  profondeur ${d} : ${count}`);
  }

  if (contenuVide.length > 0) {
    console.error(`ÉCHEC : ${contenuVide.length} subdivision(s) au contenu vide, probable mauvais découpage :`);
    for (const id of contenuVide.slice(0, 20)) console.error(`  ${id}`);
    process.exitCode = 1;
    return;
  }

  console.log('OK : aucune subdivision au contenu vide.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

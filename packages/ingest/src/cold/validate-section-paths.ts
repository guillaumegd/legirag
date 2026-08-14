import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { coldCorpusPath } from './data-paths.js';
import { parseSectionPath, splitContextSegments } from './section-path.js';
import { ColdArticleRow } from './types.js';

async function main(): Promise<void> {
  const rl = createInterface({ input: createReadStream(coldCorpusPath, { encoding: 'utf8' }) });

  let total = 0;
  let collapsedRows = 0;
  let minLength = Infinity;
  let maxLength = 0;
  let sumLength = 0;
  const emptyRows: string[] = [];

  for await (const line of rl) {
    if (line.length === 0) continue;
    total++;
    const row: ColdArticleRow = ColdArticleRow.parse(JSON.parse(line));
    const rawSegments = splitContextSegments(row.texte_contexte);
    const sectionPath = parseSectionPath(row.texte_contexte);

    if (sectionPath.length === 0) emptyRows.push(row.article_identifier);
    if (sectionPath.length < rawSegments.length) collapsedRows++;
    minLength = Math.min(minLength, sectionPath.length);
    maxLength = Math.max(maxLength, sectionPath.length);
    sumLength += sectionPath.length;
  }

  console.log(`Lignes analysées : ${total}`);
  console.log(`Longueur de sectionPath : min ${minLength}, max ${maxLength}, moyenne ${(sumLength / total).toFixed(2)}`);
  console.log(`Lignes avec au moins une fusion de renommage : ${collapsedRows} (${((collapsedRows / total) * 100).toFixed(1)}%)`);

  if (emptyRows.length > 0) {
    console.error(`ÉCHEC : ${emptyRows.length} ligne(s) produisent un sectionPath vide :`);
    for (const id of emptyRows.slice(0, 20)) console.error(`  ${id}`);
    process.exitCode = 1;
    return;
  }

  console.log('OK : aucune ligne ne produit de sectionPath vide.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

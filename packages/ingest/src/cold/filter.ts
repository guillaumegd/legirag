import { ColdArticleRow } from './types.js';

// Ne valide (et ne coûte) que les lignes qu'on garde vraiment : les ~684 000
// lignes non-CODE du dataset ne passent jamais par le schéma Zod.
export function filterColdRows(rows: unknown[]): ColdArticleRow[] {
  const kept: ColdArticleRow[] = [];
  for (const row of rows) {
    const nature = (row as { texte_nature?: unknown } | null | undefined)?.texte_nature;
    if (nature !== 'CODE') continue;
    // Une ligne CODE qui ne respecte pas le schéma est un signal de dérive du
    // format source : on arrête l'ingestion plutôt que de la faire silencieusement.
    kept.push(ColdArticleRow.parse(row));
  }
  return kept;
}

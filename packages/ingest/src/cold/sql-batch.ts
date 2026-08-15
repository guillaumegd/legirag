// Génère les $1, $2… d'un INSERT multi-lignes plutôt qu'une requête par ligne :
// à l'échelle du corpus (157k+ lignes), l'aller-retour réseau par ligne
// dominerait le temps total. Partagé entre load-corpus.ts et load-renvois.ts.
export function placeholders(rowCount: number, columnCount: number): string {
  const rows: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const cols: string[] = [];
    for (let c = 0; c < columnCount; c++) cols.push(`$${r * columnCount + c + 1}`);
    rows.push(`(${cols.join(', ')})`);
  }
  return rows.join(', ');
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { ensureShardsDownloaded } from './hf-source.js';

// Sortie diagnostique de la feuille de route J2 / 2.1 : compter avant de
// parser quoi que ce soit, plutôt que supposer la forme annoncée par le
// cahier des charges technique.
const dataDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '.data', 'raw');

function bump<K>(counts: Map<K, number>, key: K): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function toObject(counts: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

async function main(): Promise<void> {
  const shardPaths = await ensureShardsDownloaded(dataDir);

  const natureCounts = new Map<string, number>();
  const etatCounts = new Map<string, number>();
  const dateFinCounts = new Map<string, number>();
  const titres = new Set<string>();
  // texte_titre est le titre du texte contenant (arrêté, décret, loi, code…),
  // pas réservé aux codes — le distinct global ne dit donc rien sur "combien
  // de codes". On isole en plus la même mesure sur les seules lignes CODE.
  const titresCode = new Set<string>();
  const etatCountsCode = new Map<string, number>();
  let totalRows = 0;

  for (const [index, shardPath] of shardPaths.entries()) {
    const file = await asyncBufferFromFile(shardPath);
    const metadata = await parquetMetadataAsync(file);
    const rows = Number(metadata.num_rows);
    totalRows += rows;

    const columns = await parquetReadObjects({
      file,
      columns: ['texte_nature', 'article_etat', 'article_date_fin', 'texte_titre'],
    });
    for (const row of columns) {
      const nature = String(row['texte_nature']);
      const etat = String(row['article_etat']);
      bump(natureCounts, nature);
      bump(etatCounts, etat);
      bump(dateFinCounts, String(row['article_date_fin']));
      titres.add(String(row['texte_titre']));
      if (nature === 'CODE') {
        titresCode.add(String(row['texte_titre']));
        bump(etatCountsCode, etat);
      }
    }
    console.error(`Fragment ${index + 1}/${shardPaths.length} : ${rows} lignes (total ${totalRows})`);
  }

  console.log('--- Diagnostics COLD French Law ---');
  console.log('Lignes totales :', totalRows);
  console.log('Counter(texte_nature) :', toObject(natureCounts));
  console.log('Counter(article_etat), toutes natures :', toObject(etatCounts));
  console.log('Counter(article_date_fin) :', toObject(dateFinCounts));
  console.log('Titres distincts, toutes natures confondues :', titres.size);
  console.log('--- Sur texte_nature === CODE uniquement ---');
  console.log('Lignes CODE :', natureCounts.get('CODE') ?? 0);
  console.log('Counter(article_etat) sur CODE :', toObject(etatCountsCode));
  console.log('Codes distincts (texte_titre, nature CODE) :', titresCode.size);

  const etatCodeValues = [...etatCountsCode.keys()];
  const seulementVigueur = etatCodeValues.length === 1 && etatCodeValues[0] === 'VIGUEUR';
  console.log(
    seulementVigueur
      ? 'Confirmé : parmi les lignes CODE, article_etat ne porte bien que la valeur VIGUEUR.'
      : `À NOTER : parmi les lignes CODE, article_etat porte ${etatCodeValues.length} valeur(s) distincte(s), pas seulement VIGUEUR — le cahier des charges technique § 3.3 est à corriger en conséquence.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

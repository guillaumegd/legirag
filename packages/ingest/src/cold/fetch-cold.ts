import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { filterColdRows } from './filter.js';
import { ensureShardsDownloaded } from './hf-source.js';
import { ColdArticleRow } from './types.js';

// Ne décode que les colonnes retenues par le schéma : les 5 colonnes `*_en`
// et l'index `Unnamed: 0` du parquet brut ont un volume comparable au texte
// français utile et seraient sinon décodés pour rien sur chaque fragment.
const COLD_COLUMNS = Object.keys(ColdArticleRow.shape);

const packageRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const rawDir = path.join(packageRoot, '.data', 'raw');
const outputPath = path.join(packageRoot, '.data', 'cold-corpus.ndjson');
// Écrit d'abord dans un fichier temporaire : un échec en cours de route (déjà
// arrivé en conditions réelles) ne doit jamais laisser un cold-corpus.ndjson
// tronqué mais indiscernable d'un corpus complet plus petit.
const tmpOutputPath = `${outputPath}.tmp`;

function writeLine(stream: WriteStream, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const canContinue = stream.write(line, (error) => {
      if (error) reject(error);
    });
    if (canContinue) resolve();
    else stream.once('drain', resolve);
  });
}

function closeStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.end((error?: Error | null) => (error ? reject(error) : resolve()));
  });
}

async function main(): Promise<void> {
  const shardPaths = await ensureShardsDownloaded(rawDir);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const out = createWriteStream(tmpOutputPath, { encoding: 'utf8' });
  let totalKept = 0;

  try {
    for (const [index, shardPath] of shardPaths.entries()) {
      const file = await asyncBufferFromFile(shardPath);
      const rawRows = await parquetReadObjects({ file, columns: COLD_COLUMNS });
      const kept = filterColdRows(rawRows);
      for (const row of kept) {
        await writeLine(out, `${JSON.stringify(row)}\n`);
      }
      totalKept += kept.length;
      console.error(
        `Fragment ${index + 1}/${shardPaths.length} : ${kept.length} lignes CODE retenues (total ${totalKept})`,
      );
    }
    await closeStream(out);
  } catch (error) {
    out.destroy();
    await rm(tmpOutputPath, { force: true });
    throw error;
  }

  await rename(tmpOutputPath, outputPath);
  console.log(`Terminé : ${totalKept} lignes écrites dans ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

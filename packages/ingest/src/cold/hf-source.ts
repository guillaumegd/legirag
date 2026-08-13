import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const DATASET = 'harvard-lil/cold-french-law';
const PARQUET_LIST_URL = `https://huggingface.co/api/datasets/${DATASET}/parquet`;

// Payload externe (API Hugging Face) : validé, pas juste casté, pour échouer
// avec un message clair si la forme change plutôt qu'un TypeError opaque
// plus loin dans fetchWithRetry.
const ParquetFileList = z.object({
  csv: z.object({
    train: z.array(z.string().url()).min(1),
  }),
});

// Hugging Face limite les requêtes anonymes par fenêtre fixe (429, en-tête
// `ratelimit: "resolvers";r=0;t=<secondes avant réinitialisation>`) —
// constaté en conditions réelles en préparant cette étape. On respecte ce
// délai plutôt que de deviner un backoff fixe.
async function fetchWithRetry(url: string, maxAttempts = 5): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res;
    if (res.status === 429 && attempt < maxAttempts) {
      const header = res.headers.get('ratelimit') ?? '';
      const match = /t=(\d+)/.exec(header);
      const waitSeconds = match ? Number(match[1]) + 2 : 30 * attempt;
      console.error(
        `Limite de débit Hugging Face — attente ${waitSeconds}s (tentative ${attempt}/${maxAttempts})`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      continue;
    }
    throw new Error(`Échec du téléchargement ${url} : HTTP ${res.status}`);
  }
  throw new Error(`Échec du téléchargement ${url} après ${maxAttempts} tentatives`);
}

// Le dataset source est un unique CSV de ~2,3 Go ; Hugging Face en publie une
// conversion parquet auto-générée et shardée sur `refs/convert/parquet`. On
// interroge cette liste plutôt que de coder en dur le nombre de fragments,
// qui peut changer si le dataset est republié.
export async function listColdShardUrls(): Promise<string[]> {
  const res = await fetchWithRetry(PARQUET_LIST_URL);
  const raw: unknown = await res.json();
  const parsed = ParquetFileList.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Réponse inattendue de l'API parquet Hugging Face pour ${DATASET} (config "csv", split "train") : ${parsed.error.message}`,
    );
  }
  return parsed.data.csv.train;
}

// Persiste chaque fragment localement une seule fois (règle d'ingestion :
// un artefact coûteux ne se recalcule jamais). Un unique GET par fragment,
// pas des requêtes par plage de colonnes : c'est ce qui a déclenché la
// limite de débit lors de la préparation de cette étape.
export async function ensureShardsDownloaded(destDir: string): Promise<string[]> {
  await mkdir(destDir, { recursive: true });
  const urls = await listColdShardUrls();
  const paths: string[] = [];
  for (const [index, url] of urls.entries()) {
    const dest = path.join(destDir, `shard-${String(index).padStart(4, '0')}.parquet`);
    const cached = await stat(dest).catch(() => null);
    if (cached && cached.size > 0) {
      console.error(`Fragment ${index + 1}/${urls.length} déjà en cache (${cached.size} octets)`);
    } else {
      console.error(`Téléchargement du fragment ${index + 1}/${urls.length}...`);
      const res = await fetchWithRetry(url);
      const buffer = Buffer.from(await res.arrayBuffer());
      // Écriture atomique : un fragment interrompu en cours d'écriture (kill,
      // OOM, mise en veille) ne doit jamais rester en cache comme s'il était
      // complet — même défaut que sur cold-corpus.ndjson, ici sur le cache
      // de téléchargement des fragments.
      const tmpDest = `${dest}.tmp`;
      try {
        await writeFile(tmpDest, buffer);
        await rename(tmpDest, dest);
      } catch (error) {
        await rm(tmpDest, { force: true });
        throw error;
      }
      console.error(`Fragment ${index + 1}/${urls.length} enregistré (${buffer.length} octets)`);
    }
    paths.push(dest);
  }
  return paths;
}

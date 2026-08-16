import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Résolu depuis ce fichier plutôt qu'un appelant, donc stable quel que soit
// le script qui l'importe - miroir de packages/ingest/src/cold/data-paths.ts.
const repoRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

export const questionsPath = path.join(repoRoot, 'eval', 'questions.json');

// Cache local, gitignored (packages/eval/.data/) - jamais un chemin relatif au
// cwd de l'appelant, même raison que questionsPath ci-dessus.
export const naiveEmbeddingsCachePath = path.join(repoRoot, 'packages', 'eval', '.data', 'naive-embeddings.json');

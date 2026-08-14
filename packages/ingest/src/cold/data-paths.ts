import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Résolu depuis ce fichier plutôt qu'un appelant, donc stable quel que soit
// le script qui l'importe (inspect-cold.ts, fetch-cold.ts,
// validate-section-paths.ts, ...).
const packageRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

export const rawDataDir = path.join(packageRoot, '.data', 'raw');
export const coldCorpusPath = path.join(packageRoot, '.data', 'cold-corpus.ndjson');

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Résolu depuis ce fichier plutôt qu'un appelant, donc stable quel que soit
// le script qui l'importe - miroir de packages/ingest/src/cold/data-paths.ts.
const repoRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

export const questionsPath = path.join(repoRoot, 'eval', 'questions.json');

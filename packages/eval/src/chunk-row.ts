import { readFileSync } from 'node:fs';
import type { Chunk } from '@legirag/shared';
import { naiveEmbeddingsCachePath } from './data-paths.js';

interface CachedEntry {
  articleIdentifier: string;
}

// Relit l'échantillon d'articles verrouillé par 6a plutôt que de le
// re-dériver - voir 6a/6b/6c's current-feature.md, In scope. Partagé par les
// scripts de mesure de 6b/6c (pas la formule SQL elle-même, voir chaque
// script - copiée volontairement pour ne jamais affecter la requête de prod).
export function loadSampleArticleIds(): string[] {
  const cache: CachedEntry[] = JSON.parse(readFileSync(naiveEmbeddingsCachePath, 'utf-8'));
  return cache.map((c) => c.articleIdentifier);
}

// Miroir de toPgVector dans supabase-retriever.ts / load-chunks.ts.
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export interface ChunkRow {
  id: number;
  article_identifier: string;
  subdivision_label: string | null;
  contenu: string;
}

export function toChunk(row: ChunkRow): Chunk {
  return {
    id: row.id,
    articleIdentifier: row.article_identifier,
    contenu: row.contenu,
    ...(row.subdivision_label !== null ? { subdivisionLabel: row.subdivision_label } : {}),
  };
}

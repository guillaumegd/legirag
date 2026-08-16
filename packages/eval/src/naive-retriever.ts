// Package-local : recherche vectorielle "à la main", sans pgvector ni HNSW,
// pour comparer le baseline naïf sans toucher à la vraie base (voir
// current-feature.md, In scope).
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface EmbeddedNaiveChunk {
  articleIdentifier: string;
  contenu: string;
  embedding: number[];
}

export function rankByCosineSimilarity(
  queryEmbedding: number[],
  corpus: EmbeddedNaiveChunk[],
  topK: number,
): EmbeddedNaiveChunk[] {
  return [...corpus]
    .sort((a, b) => cosineSimilarity(queryEmbedding, b.embedding) - cosineSimilarity(queryEmbedding, a.embedding))
    .slice(0, topK);
}

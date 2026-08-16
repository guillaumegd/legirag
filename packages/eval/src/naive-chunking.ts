import type { Article } from '@legirag/shared';

// Package-local, contrairement à ExtractedChunk (packages/ingest/src/cold/chunking.ts) :
// volontairement plus faible - un seul chunk par article, sans préfixe de contexte
// hiérarchique (voir current-feature.md, la faiblesse que 6a mesure).
export interface NaiveChunk {
  articleIdentifier: string;
  contenu: string; // texte brut de l'article, sans préfixe de contexte
}

export function naiveChunk(article: Pick<Article, 'articleIdentifier' | 'contenuText'>): NaiveChunk {
  return { articleIdentifier: article.articleIdentifier, contenu: article.contenuText };
}

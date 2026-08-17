import { embedTexts } from '@legirag/shared';
import type { Client } from 'pg';
import { chunkArticle, type ExtractedChunk } from './chunking.js';
import { placeholders } from './sql-batch.js';

const CHUNK_COLUMNS = ['article_identifier', 'subdivision_label', 'contenu', 'embedding'];

export interface ArticleForChunking {
  articleIdentifier: string;
  code: string;
  sectionPath: string[];
  articleNum: string;
  contenuText: string;
}

export interface SubdivisionForChunking {
  label: string;
  ordre: number;
  contenu: string;
}

export interface ReplaceChunksResult {
  chunksInserted: number;
  charactersEmbedded: number;
}

function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

function chunkRowValues(articleIdentifier: string, chunk: ExtractedChunk, embedding: number[]): unknown[] {
  return [articleIdentifier, chunk.subdivisionLabel ?? null, chunk.contenu, toPgVector(embedding)];
}

// Item 12c : remplace les chunks d'un seul article déjà chargé (contenu
// modifié) - jamais le chargement initial (load-chunks.ts, 4b, réservé aux
// articles sans aucun chunk). embedTexts tourne avant le begin/commit,
// jamais à l'intérieur : un appel réseau externe (lent, faillible) ne doit
// jamais tenir une transaction DB ouverte - même choix que processBatch
// dans load-chunks.ts.
export async function replaceChunksForArticle(
  client: Client,
  article: ArticleForChunking,
  subdivisions: SubdivisionForChunking[],
): Promise<ReplaceChunksResult> {
  const chunks = chunkArticle(article, subdivisions);
  const texts = chunks.map((c) => c.contenu);
  const embeddings = await embedTexts(texts, 'search_document');

  await client.query('begin');
  try {
    await client.query('delete from chunks where article_identifier = $1', [article.articleIdentifier]);

    if (chunks.length > 0) {
      const rows: unknown[] = [];
      chunks.forEach((chunk, i) => {
        const embedding = embeddings[i];
        if (!embedding) throw new Error(`Embedding manquant pour un chunk de ${article.articleIdentifier}`);
        rows.push(...chunkRowValues(article.articleIdentifier, chunk, embedding));
      });
      const text = `insert into chunks (${CHUNK_COLUMNS.join(', ')}) values ${placeholders(chunks.length, CHUNK_COLUMNS.length)}`;
      await client.query(text, rows);
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }

  return { chunksInserted: chunks.length, charactersEmbedded: texts.reduce((sum, t) => sum + t.length, 0) };
}

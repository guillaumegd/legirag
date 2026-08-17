import { embedTexts } from '@legirag/shared';
import type { Client } from 'pg';
import { chunkArticle, type ExtractedChunk } from './chunking.js';
import { createDatabaseClient } from './pg-client.js';
import { placeholders } from './sql-batch.js';

const BATCH_SIZE = 100; // articles par lot, jamais un chunk coupé entre deux lots
const CHUNK_COLUMNS = ['article_identifier', 'subdivision_label', 'contenu', 'embedding'];

// Alias camelCase en SQL plutôt qu'un mapping séparé : le shape retourné
// colle directement à ce que chunkArticle (4a) attend (Pick<Article, ...>).
interface ArticleRow {
  articleIdentifier: string;
  code: string;
  sectionPath: string[];
  articleNum: string;
  contenuText: string;
}

interface SubdivisionRow {
  article_identifier: string;
  label: string;
  ordre: number;
  contenu: string;
}

async function loadAlreadyDoneArticles(client: Client): Promise<Set<string>> {
  const { rows } = await client.query<{ article_identifier: string }>(
    'select distinct article_identifier from chunks',
  );
  return new Set(rows.map((r) => r.article_identifier));
}

async function loadRemainingArticles(client: Client, done: Set<string>): Promise<ArticleRow[]> {
  const { rows } = await client.query<ArticleRow>(
    `select
       article_identifier as "articleIdentifier",
       code,
       section_path as "sectionPath",
       article_num as "articleNum",
       contenu_text as "contenuText"
     from articles where article_identifier != all($1) order by article_identifier`,
    [[...done]],
  );
  return rows;
}

async function loadSubdivisionsByArticle(
  client: Client,
  articleIdentifiers: string[],
): Promise<Map<string, SubdivisionRow[]>> {
  const { rows } = await client.query<SubdivisionRow>(
    `select article_identifier, label, ordre, contenu
     from subdivisions where article_identifier = any($1)`,
    [articleIdentifiers],
  );
  const byArticle = new Map<string, SubdivisionRow[]>();
  for (const row of rows) {
    const existing = byArticle.get(row.article_identifier);
    if (existing) existing.push(row);
    else byArticle.set(row.article_identifier, [row]);
  }
  return byArticle;
}

function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

function chunkRowValues(articleIdentifier: string, chunk: ExtractedChunk, embedding: number[]): unknown[] {
  return [articleIdentifier, chunk.subdivisionLabel ?? null, chunk.contenu, toPgVector(embedding)];
}

async function insertChunks(client: Client, rows: unknown[], chunkCount: number): Promise<void> {
  if (chunkCount === 0) return;
  const text = `insert into chunks (${CHUNK_COLUMNS.join(', ')})
    values ${placeholders(chunkCount, CHUNK_COLUMNS.length)}`;
  await client.query(text, rows);
}

// Un seul INSERT pour tout le lot plutôt qu'un par article - même pattern
// que replaceRenvois dans load-renvois.ts. La résumabilité (skip-set par
// article_identifier) ne dépend pas du nombre d'INSERT par lot, donc rien ne
// justifiait 100 aller-retours réseau au lieu d'un seul.
async function processBatch(
  client: Client,
  batch: ArticleRow[],
  subdivisionsByArticle: Map<string, SubdivisionRow[]>,
): Promise<{ chunksInserted: number; charactersEmbedded: number }> {
  const perArticleChunks = batch.map((article) => ({
    article,
    chunks: chunkArticle(article, subdivisionsByArticle.get(article.articleIdentifier) ?? []),
  }));

  const allTexts = perArticleChunks.flatMap(({ chunks }) => chunks.map((c) => c.contenu));
  const allEmbeddings = await embedTexts(allTexts, 'search_document');

  let offset = 0;
  const rows: unknown[] = [];
  let chunksInserted = 0;
  for (const { article, chunks } of perArticleChunks) {
    for (const chunk of chunks) {
      const embedding = allEmbeddings[offset];
      if (!embedding) throw new Error(`Embedding manquant pour un chunk de ${article.articleIdentifier}`);
      rows.push(...chunkRowValues(article.articleIdentifier, chunk, embedding));
      offset++;
    }
    chunksInserted += chunks.length;
  }
  await insertChunks(client, rows, chunksInserted);

  return { chunksInserted, charactersEmbedded: allTexts.reduce((sum, t) => sum + t.length, 0) };
}

async function main(): Promise<void> {
  const client = createDatabaseClient();
  await client.connect();

  try {
    const done = await loadAlreadyDoneArticles(client);
    console.log(`${done.size} article(s) déjà chargé(s), ignoré(s).`);

    const remaining = await loadRemainingArticles(client, done);
    console.log(`${remaining.length} article(s) à traiter.`);

    let articlesProcessed = 0;
    let chunksInserted = 0;
    let charactersEmbedded = 0;

    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
      const batch = remaining.slice(i, i + BATCH_SIZE);
      const subdivisionsByArticle = await loadSubdivisionsByArticle(
        client,
        batch.map((a) => a.articleIdentifier),
      );
      const result = await processBatch(client, batch, subdivisionsByArticle);
      // Item 12c : un article inséré ici a aussi déclenché le trigger
      // enqueue_reindex (INSERT), qui l'a mis en file - déjà traité par ce
      // chargement initial, donc retiré tout de suite, sinon un premier
      // chargement sur une base vierge laisse reindex_queue pleine
      // d'articles déjà à jour, qu'un futur `process:reindex-queue`
      // réembedderait une seconde fois pour rien (audit, 2026-08-17).
      await client.query('delete from reindex_queue where article_identifier = any($1)', [
        batch.map((a) => a.articleIdentifier),
      ]);

      articlesProcessed += batch.length;
      chunksInserted += result.chunksInserted;
      charactersEmbedded += result.charactersEmbedded;
      console.log(
        `${articlesProcessed}/${remaining.length} articles - ${chunksInserted} chunks - ` +
          `${charactersEmbedded} caractères embeddés`,
      );
    }

    console.log('--- Résumé ---');
    console.log(`Articles traités : ${articlesProcessed}`);
    console.log(`Chunks insérés : ${chunksInserted}`);
    console.log(`Caractères soumis à l'embedding : ${charactersEmbedded}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

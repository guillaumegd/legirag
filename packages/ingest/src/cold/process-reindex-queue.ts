import type { Client } from 'pg';
import { createDatabaseClient } from './pg-client.js';
import { replaceChunksForArticle, type ArticleForChunking, type SubdivisionForChunking } from './replace-chunks.js';

const BATCH_SIZE = 100;

async function loadQueuedArticles(client: Client, limit: number): Promise<ArticleForChunking[]> {
  const { rows } = await client.query<ArticleForChunking>(
    `select
       a.article_identifier as "articleIdentifier",
       a.code,
       a.section_path as "sectionPath",
       a.article_num as "articleNum",
       a.contenu_text as "contenuText"
     from reindex_queue q
     join articles a on a.article_identifier = q.article_identifier
     order by q.queued_at
     limit $1`,
    [limit],
  );
  return rows;
}

async function loadSubdivisionsByArticle(client: Client, articleIdentifiers: string[]): Promise<Map<string, SubdivisionForChunking[]>> {
  const { rows } = await client.query<{ article_identifier: string; label: string; ordre: number; contenu: string }>(
    `select article_identifier, label, ordre, contenu from subdivisions where article_identifier = any($1)`,
    [articleIdentifiers],
  );
  const byArticle = new Map<string, SubdivisionForChunking[]>();
  for (const row of rows) {
    const existing = byArticle.get(row.article_identifier);
    const subdivision = { label: row.label, ordre: row.ordre, contenu: row.contenu };
    if (existing) existing.push(subdivision);
    else byArticle.set(row.article_identifier, [subdivision]);
  }
  return byArticle;
}

// Resumable par construction : une ligne n'est retirée de reindex_queue
// qu'après le commit de replaceChunksForArticle - une interruption en cours
// de lot laisse les articles non traités en file, un re-run les reprend
// sans double traitement (le trigger n'en ajoute pas de nouveau tant que le
// contenu ne rechange pas).
async function processQueuedArticle(client: Client, article: ArticleForChunking, subdivisions: SubdivisionForChunking[]): Promise<void> {
  await replaceChunksForArticle(client, article, subdivisions);
  await client.query('delete from reindex_queue where article_identifier = $1', [article.articleIdentifier]);
}

async function main(): Promise<void> {
  const client = createDatabaseClient();
  await client.connect();

  try {
    let articlesProcessed = 0;

    for (;;) {
      const batch = await loadQueuedArticles(client, BATCH_SIZE);
      if (batch.length === 0) break;

      const subdivisionsByArticle = await loadSubdivisionsByArticle(
        client,
        batch.map((a) => a.articleIdentifier),
      );

      for (const article of batch) {
        await processQueuedArticle(client, article, subdivisionsByArticle.get(article.articleIdentifier) ?? []);
        articlesProcessed++;
        console.log(`[${articlesProcessed}] ${article.articleIdentifier} réindexé.`);
      }
    }

    console.log('--- Résumé ---');
    console.log(`Articles réindexés : ${articlesProcessed}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

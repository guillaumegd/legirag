import type { Client } from 'pg';
import { streamColdCorpus } from './corpus-stream.js';
import { createDatabaseClient } from './pg-client.js';
import { extractRenvois, type ExtractedRenvoi } from './renvois.js';
import { buildArticleIndex, resolveRenvoi, type ArticleIndexRow } from './resolve-renvoi.js';
import { placeholders } from './sql-batch.js';

const BATCH_SIZE = 500;
const LOG_EVERY = 10_000;

const RENVOI_COLUMNS = [
  'source_article',
  'cible_article_num',
  'cible_code',
  'cible_article_id',
  'cible_subdivision',
  'forme',
  'inter_code',
  'offset_debut',
  'offset_fin',
];

interface RenvoiRow {
  sourceArticle: string;
  cibleArticleNum: string;
  cibleCode: string | null;
  cibleArticleId: string | null;
  cibleSubdivision: string | null;
  forme: ExtractedRenvoi['forme'];
  interCode: boolean;
  offsetDebut: number;
  offsetFin: number;
}

// Passe 1 : reconstitue l'index code_slug::article_num -> article_identifier
// depuis le corpus local plutôt que d'interroger Supabase par renvoi - c'est
// la même donnée que 2d y a déjà chargée, un aller-retour réseau par renvoi
// n'apporterait rien.
async function buildIndexFromCorpus(): Promise<Map<string, string>> {
  const rows: ArticleIndexRow[] = [];
  for await (const { article } of streamColdCorpus()) {
    if (article === null) continue;
    rows.push({ articleIdentifier: article.articleIdentifier, articleNum: article.articleNum, codeSlug: article.codeSlug });
  }
  return buildArticleIndex(rows);
}

function renvoiToRow(renvoi: RenvoiRow): unknown[] {
  return [
    renvoi.sourceArticle,
    renvoi.cibleArticleNum,
    renvoi.cibleCode,
    renvoi.cibleArticleId,
    renvoi.cibleSubdivision,
    renvoi.forme,
    renvoi.interCode,
    renvoi.offsetDebut,
    renvoi.offsetFin,
  ];
}

// delete-puis-insert par lot d'articles source, comme 2d pour les
// subdivisions : les renvois n'ont pas de clé naturelle stable d'un run à
// l'autre, remplacer le jeu complet par article source est le seul moyen
// simple de rester idempotent après un échec partiel.
async function replaceRenvois(client: Client, sourceArticles: string[], renvois: RenvoiRow[]): Promise<void> {
  await client.query('delete from renvois where source_article = any($1)', [sourceArticles]);
  if (renvois.length === 0) return;

  const text = `insert into renvois (${RENVOI_COLUMNS.join(', ')})
    values ${placeholders(renvois.length, RENVOI_COLUMNS.length)}`;
  await client.query(text, renvois.flatMap(renvoiToRow));
}

async function flushBatch(client: Client, sourceArticles: string[], renvois: RenvoiRow[]): Promise<void> {
  if (sourceArticles.length === 0) return;
  await client.query('begin');
  try {
    await replaceRenvois(client, sourceArticles, renvois);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function main(): Promise<void> {
  console.log('Passe 1 : construction de l’index de résolution...');
  const index = await buildIndexFromCorpus();
  console.log(`Index construit : ${index.size} entrées.`);

  const client = createDatabaseClient();
  await client.connect();

  let articlesProcessed = 0;
  let renvoisExtraits = 0;
  let renvoisResolus = 0;
  let renvoisNonResolus = 0;
  let batchSourceArticles: string[] = [];
  let batchRenvois: RenvoiRow[] = [];

  try {
    console.log('Passe 2 : extraction et résolution des renvois...');
    for await (const { row, article } of streamColdCorpus()) {
      if (article === null) continue;

      articlesProcessed++;
      batchSourceArticles.push(article.articleIdentifier);

      for (const extracted of extractRenvois(row.article_contenu_text)) {
        renvoisExtraits++;
        const resolved = resolveRenvoi(extracted, article.codeSlug, index);
        if (resolved.resolu) renvoisResolus++;
        else renvoisNonResolus++;

        batchRenvois.push({
          sourceArticle: article.articleIdentifier,
          cibleArticleNum: extracted.cibleArticleNum,
          cibleCode: extracted.cibleCode ?? null,
          cibleArticleId: resolved.cibleArticleId ?? null,
          cibleSubdivision: extracted.cibleSubdivision ?? null,
          forme: extracted.forme,
          interCode: extracted.interCode,
          offsetDebut: extracted.offsetDebut,
          offsetFin: extracted.offsetFin,
        });
      }

      if (batchSourceArticles.length >= BATCH_SIZE) {
        await flushBatch(client, batchSourceArticles, batchRenvois);
        batchSourceArticles = [];
        batchRenvois = [];
      }

      if (articlesProcessed % LOG_EVERY === 0) {
        console.log(`${articlesProcessed} articles traités (${renvoisExtraits} renvois extraits)`);
      }
    }
    await flushBatch(client, batchSourceArticles, batchRenvois);
  } finally {
    await client.end();
  }

  console.log('--- Résumé ---');
  console.log(`Articles traités : ${articlesProcessed}`);
  console.log(`Renvois extraits : ${renvoisExtraits}`);
  console.log(`Renvois résolus : ${renvoisResolus}`);
  console.log(`Renvois non résolus : ${renvoisNonResolus}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

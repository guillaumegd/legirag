import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Client } from 'pg';
import { coldCorpusPath } from './data-paths.js';
import { createDatabaseClient } from './pg-client.js';
import { extractSubdivisions } from './subdivisions.js';
import { toArticle, type MappedArticle } from './to-article.js';
import { ColdArticleRow } from './types.js';

const BATCH_SIZE = 500;
const LOG_EVERY = 10_000;

const ARTICLE_COLUMNS = [
  'article_identifier',
  'article_num',
  'code',
  'code_slug',
  'etat',
  'date_debut',
  'date_fin',
  'section_path',
  'contenu_text',
  'contenu_markdown',
  'palier',
];

const SUBDIVISION_COLUMNS = ['article_identifier', 'label', 'ordre', 'contenu'];

interface SubdivisionRow {
  articleIdentifier: string;
  label: string;
  ordre: number;
  contenu: string;
}

// Génère les $1, $2… d'un INSERT multi-lignes plutôt qu'une requête par ligne :
// à 157k articles, l'aller-retour réseau par ligne dominerait le temps total.
function placeholders(rowCount: number, columnCount: number): string {
  const rows: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const cols: string[] = [];
    for (let c = 0; c < columnCount; c++) cols.push(`$${r * columnCount + c + 1}`);
    rows.push(`(${cols.join(', ')})`);
  }
  return rows.join(', ');
}

function articleToRow(article: MappedArticle): unknown[] {
  return [
    article.articleIdentifier,
    article.articleNum,
    article.code,
    article.codeSlug,
    article.etat,
    article.dateDebut,
    article.dateFin,
    article.sectionPath,
    article.contenuText,
    article.contenuMarkdown ?? null,
    article.palier,
  ];
}

// upsert (pas un simple insert) : un re-run après échec partiel doit converger
// vers le même état plutôt que de buter sur des article_identifier dupliqués.
async function upsertArticles(client: Client, articles: MappedArticle[]): Promise<void> {
  const text = `insert into articles (${ARTICLE_COLUMNS.join(', ')})
    values ${placeholders(articles.length, ARTICLE_COLUMNS.length)}
    on conflict (article_identifier) do update set
      article_num = excluded.article_num,
      code = excluded.code,
      code_slug = excluded.code_slug,
      etat = excluded.etat,
      date_debut = excluded.date_debut,
      date_fin = excluded.date_fin,
      section_path = excluded.section_path,
      contenu_text = excluded.contenu_text,
      contenu_markdown = excluded.contenu_markdown,
      palier = excluded.palier,
      updated_at = now()`;
  await client.query(text, articles.flatMap(articleToRow));
}

// delete-puis-insert plutôt qu'un upsert par subdivision : elles n'ont pas de
// clé naturelle stable d'un run à l'autre, remplacer le jeu complet par
// article est le seul moyen simple de rester idempotent.
async function replaceSubdivisions(
  client: Client,
  articleIdentifiers: string[],
  subdivisions: SubdivisionRow[],
): Promise<void> {
  await client.query('delete from subdivisions where article_identifier = any($1)', [articleIdentifiers]);
  if (subdivisions.length === 0) return;

  const text = `insert into subdivisions (${SUBDIVISION_COLUMNS.join(', ')})
    values ${placeholders(subdivisions.length, SUBDIVISION_COLUMNS.length)}`;
  const values = subdivisions.flatMap((s) => [s.articleIdentifier, s.label, s.ordre, s.contenu]);
  await client.query(text, values);
}

async function flushBatch(
  client: Client,
  articles: MappedArticle[],
  subdivisions: SubdivisionRow[],
): Promise<void> {
  if (articles.length === 0) return;
  await client.query('begin');
  try {
    await upsertArticles(client, articles);
    await replaceSubdivisions(
      client,
      articles.map((a) => a.articleIdentifier),
      subdivisions,
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function main(): Promise<void> {
  const client = createDatabaseClient();
  await client.connect();

  let read = 0;
  let loaded = 0;
  let skipped = 0;
  let subdivisionsInserted = 0;
  let batchArticles: MappedArticle[] = [];
  let batchSubdivisions: SubdivisionRow[] = [];

  try {
    const rl = createInterface({ input: createReadStream(coldCorpusPath, { encoding: 'utf8' }) });
    for await (const line of rl) {
      if (line.length === 0) continue;
      read++;
      const row: ColdArticleRow = ColdArticleRow.parse(JSON.parse(line));
      const article = toArticle(row);

      if (article === null) {
        skipped++;
      } else {
        loaded++;
        batchArticles.push(article);
        for (const subdivision of extractSubdivisions(row.article_contenu_markdown)) {
          batchSubdivisions.push({ articleIdentifier: article.articleIdentifier, ...subdivision });
          subdivisionsInserted++;
        }
      }

      if (batchArticles.length >= BATCH_SIZE) {
        await flushBatch(client, batchArticles, batchSubdivisions);
        batchArticles = [];
        batchSubdivisions = [];
      }

      if (read % LOG_EVERY === 0) {
        console.log(`${read} lignes lues (${loaded} chargées, ${skipped} ignorées)`);
      }
    }
    await flushBatch(client, batchArticles, batchSubdivisions);
  } finally {
    await client.end();
  }

  console.log('--- Résumé ---');
  console.log(`Lignes lues : ${read}`);
  console.log(`Articles chargés : ${loaded}`);
  console.log(`Lignes ignorées (article_num null) : ${skipped}`);
  console.log(`Subdivisions insérées : ${subdivisionsInserted}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

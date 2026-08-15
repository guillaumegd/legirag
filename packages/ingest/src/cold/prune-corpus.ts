import type { Client } from 'pg';
import { DEMO_CODE_SLUGS } from './demo-scope.js';
import { createDatabaseClient } from './pg-client.js';

interface Counts {
  articles: number;
  subdivisions: number;
  renvois: number;
  databaseSize: string;
}

async function readCounts(client: Client): Promise<Counts> {
  // Un seul Client pg ne traite pas les requêtes en parallèle (Promise.all
  // sur le même client est déprécié depuis pg@8, supprimé en pg@9) - donc
  // séquentiel, pas concurrent.
  const articles = await client.query<{ n: number }>('select count(*)::int as n from articles');
  const subdivisions = await client.query<{ n: number }>('select count(*)::int as n from subdivisions');
  const renvois = await client.query<{ n: number }>('select count(*)::int as n from renvois');
  const size = await client.query<{ taille: string }>(
    'select pg_size_pretty(pg_database_size(current_database())) as taille',
  );
  const articlesRow = articles.rows[0];
  const subdivisionsRow = subdivisions.rows[0];
  const renvoisRow = renvois.rows[0];
  const sizeRow = size.rows[0];
  if (!articlesRow || !subdivisionsRow || !renvoisRow || !sizeRow) {
    throw new Error('Requête de comptage : aucune ligne retournée.');
  }
  return {
    articles: articlesRow.n,
    subdivisions: subdivisionsRow.n,
    renvois: renvoisRow.n,
    databaseSize: sizeRow.taille,
  };
}

function printCounts(label: string, counts: Counts): void {
  console.log(`${label} : ${counts.articles} articles, ${counts.subdivisions} subdivisions, ` +
    `${counts.renvois} renvois - base : ${counts.databaseSize}`);
}

async function main(): Promise<void> {
  const client = createDatabaseClient();
  await client.connect();

  try {
    const before = await readCounts(client);
    printCounts('Avant élagage', before);
    console.log(`Codes conservés : ${DEMO_CODE_SLUGS.join(', ')}`);

    const deleted = await client.query('delete from articles where code_slug != all($1)', [DEMO_CODE_SLUGS]);
    console.log(`${deleted.rowCount} article(s) supprimé(s) (cascade sur subdivisions/renvois).`);

    // VACUUM ne peut pas tourner dans un bloc de transaction - chaque appel
    // s'exécute seul, en dehors de toute transaction explicite.
    console.log('VACUUM FULL en cours (peut prendre quelques instants)...');
    await client.query('vacuum full articles');
    await client.query('vacuum full subdivisions');
    await client.query('vacuum full renvois');

    const after = await readCounts(client);
    printCounts('Après élagage', after);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

import type { Client } from 'pg';
import { createDatabaseClient } from './pg-client.js';

const EXPECTED_INDEXES = [
  'idx_chunks_embedding_hnsw',
  'idx_chunks_tsv',
  'idx_articles_etat',
  'idx_articles_code_slug_dates',
];

interface Counts {
  totalChunks: number;
  chunksSansEmbedding: number;
  chunksSansTsv: number;
  articlesCouverts: number;
  tailleBase: string;
}

async function readCounts(client: Client): Promise<Counts> {
  const { rows } = await client.query<{
    total: number;
    sans_embedding: number;
    sans_tsv: number;
    articles: number;
    taille: string;
  }>(`
    select
      count(*)::int as total,
      count(*) filter (where embedding is null)::int as sans_embedding,
      count(*) filter (where tsv is null)::int as sans_tsv,
      count(distinct article_identifier)::int as articles,
      pg_size_pretty(pg_database_size(current_database())) as taille
    from chunks
  `);
  const row = rows[0];
  if (!row) throw new Error('Requête de comptage : aucune ligne retournée.');
  return {
    totalChunks: row.total,
    chunksSansEmbedding: row.sans_embedding,
    chunksSansTsv: row.sans_tsv,
    articlesCouverts: row.articles,
    tailleBase: row.taille,
  };
}

async function readIndexNames(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ indexname: string }>(
    `select indexname from pg_indexes where indexname = any($1)`,
    [EXPECTED_INDEXES],
  );
  return rows.map((r) => r.indexname);
}

interface NearestNeighbor {
  id: number;
  article_identifier: string;
  apercu: string;
  distance: number;
}

async function nearestNeighborSpotCheck(client: Client): Promise<{ anchor: string; results: NearestNeighbor[] }> {
  const anchor = await client.query<{ id: number; article_identifier: string; contenu: string }>(
    `select id, article_identifier, contenu from chunks where contenu ilike '%vitesse%' order by id limit 1`,
  );
  const anchorRow = anchor.rows[0];
  if (!anchorRow) throw new Error("Aucun chunk contenant 'vitesse' trouvé pour l'ancre du spot check.");

  const { rows } = await client.query<NearestNeighbor>(
    `select c2.id, c2.article_identifier, left(c2.contenu, 200) as apercu,
            c2.embedding <=> c1.embedding as distance
     from chunks c2, (select embedding from chunks where id = $1) c1
     where c2.id != $1
     order by c2.embedding <=> c1.embedding
     limit 5`,
    [anchorRow.id],
  );
  return { anchor: `[${anchorRow.article_identifier}] ${anchorRow.contenu.slice(0, 200)}`, results: rows };
}

async function main(): Promise<void> {
  const client = createDatabaseClient();
  await client.connect();

  try {
    const counts = await readCounts(client);
    console.log(
      `Chunks : ${counts.totalChunks} - articles couverts : ${counts.articlesCouverts} - base : ${counts.tailleBase}`,
    );
    console.log(`Chunks sans embedding : ${counts.chunksSansEmbedding}`);
    console.log(`Chunks sans tsv : ${counts.chunksSansTsv}`);

    const indexNames = await readIndexNames(client);
    console.log(`Index présents (${indexNames.length}/${EXPECTED_INDEXES.length}) : ${indexNames.join(', ')}`);

    console.log('\n--- Spot check : plus proches voisins ---');
    const { anchor, results } = await nearestNeighborSpotCheck(client);
    console.log(`Ancre : ${anchor}`);
    for (const r of results) {
      console.log(`  distance ${r.distance.toFixed(4)} - [${r.article_identifier}] ${r.apercu}`);
    }

    const missingIndexes = EXPECTED_INDEXES.filter((name) => !indexNames.includes(name));
    if (counts.chunksSansEmbedding > 0 || counts.chunksSansTsv > 0 || missingIndexes.length > 0) {
      console.error('\nÉCHEC :');
      if (counts.chunksSansEmbedding > 0) console.error(`  ${counts.chunksSansEmbedding} chunk(s) sans embedding`);
      if (counts.chunksSansTsv > 0) console.error(`  ${counts.chunksSansTsv} chunk(s) sans tsv`);
      if (missingIndexes.length > 0) console.error(`  index manquant(s) : ${missingIndexes.join(', ')}`);
      process.exitCode = 1;
      return;
    }

    console.log('\nOK : aucun chunk invalide, tous les index présents.');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

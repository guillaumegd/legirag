import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { embedTexts } from '@legirag/shared';
import type { Client } from 'pg';
import { naiveEmbeddingsCachePath } from './data-paths.js';
import { naiveChunk } from './naive-chunking.js';
import type { EmbeddedNaiveChunk } from './naive-retriever.js';
import { createDatabaseClient } from './pg-client.js';
import { loadEvaluationQuestions } from './questions.js';

// Coût plafonné volontairement - voir current-feature.md, "Cost reasoning for
// the ~1 500-article cap". 6b/6c doivent réutiliser cet échantillon tel quel.
const SAMPLE_PER_CODE = 300;
const BATCH_SIZE = 100; // articles par lot, même convention que load-chunks.ts

interface ArticleRow {
  articleIdentifier: string;
  contenuText: string;
}

async function loadCodeSlugs(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ code_slug: string }>('select distinct code_slug from articles');
  return rows.map((r) => r.code_slug);
}

async function loadSampleForCode(client: Client, codeSlug: string): Promise<ArticleRow[]> {
  const { rows } = await client.query<ArticleRow>(
    `select article_identifier as "articleIdentifier", contenu_text as "contenuText"
     from articles where code_slug = $1 order by article_identifier limit $2`,
    [codeSlug, SAMPLE_PER_CODE],
  );
  return rows;
}

// Garantit que les articles "vérité terrain" du harnais sont dans
// l'échantillon, sinon le score de 6a serait faussé plutôt que réellement bas.
async function loadMissingGroundTruthArticles(client: Client, alreadySampled: Set<string>): Promise<ArticleRow[]> {
  const groundTruthIds = new Set<string>();
  for (const question of loadEvaluationQuestions()) {
    for (const id of question.articlesAttendus ?? []) groundTruthIds.add(id);
    for (const id of question.articlesExclus ?? []) groundTruthIds.add(id);
  }

  const missing = [...groundTruthIds].filter((id) => !alreadySampled.has(id));
  if (missing.length === 0) return [];

  const { rows } = await client.query<ArticleRow>(
    `select article_identifier as "articleIdentifier", contenu_text as "contenuText"
     from articles where article_identifier = any($1)`,
    [missing],
  );
  return rows;
}

async function embedArticlesInBatches(articles: ArticleRow[]): Promise<EmbeddedNaiveChunk[]> {
  const cache: EmbeddedNaiveChunk[] = [];

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const chunks = batch.map((article) => naiveChunk(article));
    const embeddings = await embedTexts(
      chunks.map((c) => c.contenu),
      'search_document',
    );

    let offset = 0;
    for (const chunk of chunks) {
      const embedding = embeddings[offset];
      if (!embedding) throw new Error(`Embedding manquant pour ${chunk.articleIdentifier}`);
      cache.push({ articleIdentifier: chunk.articleIdentifier, contenu: chunk.contenu, embedding });
      offset++;
    }

    console.log(`${Math.min(i + BATCH_SIZE, articles.length)}/${articles.length} articles embeddés`);
  }

  return cache;
}

async function main(): Promise<void> {
  const client = createDatabaseClient();
  await client.connect();

  try {
    const codeSlugs = await loadCodeSlugs(client);
    console.log(`${codeSlugs.length} code(s) trouvé(s) : ${codeSlugs.join(', ')}`);

    const sampled: ArticleRow[] = [];
    const seen = new Set<string>();
    for (const codeSlug of codeSlugs) {
      const rows = await loadSampleForCode(client, codeSlug);
      for (const row of rows) {
        if (seen.has(row.articleIdentifier)) continue;
        seen.add(row.articleIdentifier);
        sampled.push(row);
      }
    }
    console.log(`${sampled.length} article(s) échantillonné(s) (${SAMPLE_PER_CODE}/code).`);

    const groundTruth = await loadMissingGroundTruthArticles(client, seen);
    sampled.push(...groundTruth);
    console.log(`${groundTruth.length} article(s) de vérité terrain ajouté(s) en plus du plafond par code.`);
    console.log(`${sampled.length} article(s) au total à embedder.`);

    const cache = await embedArticlesInBatches(sampled);

    mkdirSync(dirname(naiveEmbeddingsCachePath), { recursive: true });
    writeFileSync(naiveEmbeddingsCachePath, JSON.stringify(cache));
    console.log(`Cache écrit : ${naiveEmbeddingsCachePath} (${cache.length} entrées)`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

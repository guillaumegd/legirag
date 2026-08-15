import { chunkArticle, type ExtractedChunk } from './chunking.js';
import { streamColdCorpus } from './corpus-stream.js';
import { extractSubdivisions } from './subdivisions.js';

function estValide(chunk: ExtractedChunk): boolean {
  return chunk.contenu.length > 0 && chunk.contenu.includes('\nArticle ');
}

async function main(): Promise<void> {
  let articlesTraites = 0;
  let articlesSansSubdivision = 0;
  let articlesAvecSubdivision = 0;
  let totalChunks = 0;
  let minChunksParArticle = Infinity;
  let maxChunksParArticle = 0;
  let sumChunksParArticle = 0;
  let exempleSansSubdivision: ExtractedChunk | null = null;
  const exemplesAvecSubdivision: ExtractedChunk[] = [];
  const invalides: string[] = [];

  for await (const { row, article } of streamColdCorpus()) {
    if (article === null) continue;

    articlesTraites++;
    const subdivisions = extractSubdivisions(row.article_contenu_markdown);
    const chunks = chunkArticle(article, subdivisions);
    totalChunks += chunks.length;

    if (subdivisions.length === 0) {
      articlesSansSubdivision++;
      if (exempleSansSubdivision === null) exempleSansSubdivision = chunks[0] ?? null;
    } else {
      articlesAvecSubdivision++;
      minChunksParArticle = Math.min(minChunksParArticle, chunks.length);
      maxChunksParArticle = Math.max(maxChunksParArticle, chunks.length);
      sumChunksParArticle += chunks.length;
      const premier = chunks[0];
      if (premier && exemplesAvecSubdivision.length < 2) exemplesAvecSubdivision.push(premier);
    }

    for (const chunk of chunks) {
      if (!estValide(chunk)) invalides.push(article.articleIdentifier);
    }
  }

  console.log(`Articles traités : ${articlesTraites}`);
  console.log(
    `Sans subdivision : ${articlesSansSubdivision} - avec subdivision : ${articlesAvecSubdivision}`,
  );
  console.log(`Total chunks produits : ${totalChunks}`);
  if (articlesAvecSubdivision > 0) {
    console.log(
      `Chunks par article (parmi ceux avec subdivisions) : min ${minChunksParArticle}, ` +
        `max ${maxChunksParArticle}, moyenne ${(sumChunksParArticle / articlesAvecSubdivision).toFixed(2)}`,
    );
  }

  console.log('\n--- Exemple sans subdivision ---');
  console.log(exempleSansSubdivision?.contenu ?? '(aucun trouvé)');
  for (const [i, exemple] of exemplesAvecSubdivision.entries()) {
    console.log(`\n--- Exemple avec subdivision ${i + 1} ---`);
    console.log(exemple.contenu);
  }

  if (invalides.length > 0) {
    console.error(`\nÉCHEC : ${invalides.length} chunk(s) invalide(s) (contenu vide ou ligne "Article" absente) :`);
    for (const id of invalides.slice(0, 20)) console.error(`  ${id}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nOK : aucun chunk invalide.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

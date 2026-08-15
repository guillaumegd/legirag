import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { coldCorpusPath } from './data-paths.js';
import { toArticle, type MappedArticle } from './to-article.js';
import { ColdArticleRow } from './types.js';

export interface ColdCorpusEntry {
  row: ColdArticleRow;
  article: MappedArticle | null;
}

// Centralise la lecture + le parsing + le mapping d'une ligne du corpus local
// (auparavant redupliqué dans load-corpus.ts et load-renvois.ts). Chaque
// appelant garde sa propre décision sur les lignes ignorées (article ===
// null) : load-corpus.ts les compte pour son résumé, load-renvois.ts les
// filtre simplement.
export async function* streamColdCorpus(): AsyncGenerator<ColdCorpusEntry> {
  const rl = createInterface({ input: createReadStream(coldCorpusPath, { encoding: 'utf8' }) });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const row: ColdArticleRow = ColdArticleRow.parse(JSON.parse(line));
    yield { row, article: toArticle(row) };
  }
}

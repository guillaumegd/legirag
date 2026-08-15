import { slugifyCode } from './to-article.js';
import { normalizeArticleNum, type ExtractedRenvoi } from './renvois.js';

export interface ArticleIndexRow {
  articleIdentifier: string;
  articleNum: string;
  codeSlug: string;
}

function indexKey(codeSlug: string, articleNum: string): string {
  return `${codeSlug}::${normalizeArticleNum(articleNum)}`;
}

// Un article par (code_slug, article_num) dans le corpus réel (confirmé lors
// de 2d) - une éventuelle collision écrase silencieusement l'entrée
// précédente, pas la peine de s'en prémunir pour un cas non observé.
export function buildArticleIndex(rows: Iterable<ArticleIndexRow>): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    index.set(indexKey(row.codeSlug, row.articleNum), row.articleIdentifier);
  }
  return index;
}

export interface ResolvedRenvoi {
  cibleArticleId?: string;
  resolu: boolean;
}

// cibleCode absent = code courant (même code_slug que l'article source) ;
// sinon on reslugifie le texte écrit pour retrouver le code_slug visé - même
// fonction que 2d, pour que la résolution ne diverge jamais de son
// slugifying des titres réels.
export function resolveRenvoi(
  extracted: ExtractedRenvoi,
  sourceCodeSlug: string,
  index: Map<string, string>,
): ResolvedRenvoi {
  const targetCodeSlug = extracted.cibleCode === undefined ? sourceCodeSlug : slugifyCode(extracted.cibleCode);
  const cibleArticleId = index.get(indexKey(targetCodeSlug, extracted.cibleArticleNum));
  return cibleArticleId === undefined ? { resolu: false } : { cibleArticleId, resolu: true };
}

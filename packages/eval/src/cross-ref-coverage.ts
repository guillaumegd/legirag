import type { Citation } from '@legirag/shared';

// Fraction des articles attendus effectivement présents dans le pool de
// citations final - pas seulement récupérés par la recherche initiale, ce
// qui est exactement ce qu'une question renvoi_obligatoire teste : est-ce
// que suivre_renvoi a comblé ce que chercher_droit seul n'a pas trouvé.
export function scoreCrossRefCoverage(articlesAttendus: string[], citations: Citation[]): number {
  if (articlesAttendus.length === 0) return 0;
  const present = new Set(citations.map((c) => c.article_identifier));
  const found = articlesAttendus.filter((id) => present.has(id)).length;
  return found / articlesAttendus.length;
}

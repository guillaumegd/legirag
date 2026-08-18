import type { ArticleForCitation } from '@legirag/retrieval';
import type { Citation } from '@legirag/shared';
import { urlLegifrance } from '@legirag/shared';

// Convention verrouillée (8a) : une citation d'article entier (pas de
// subdivision demandée) porte ce libellé plutôt qu'un champ vide -
// Citation.subdivision est non-vide et obligatoire (packages/shared/src/
// schema.ts). Toute future construction de Citation (8b-8d, item 11) doit
// réutiliser cette même convention plutôt qu'en inventer une autre.
export const SUBDIVISION_ARTICLE_ENTIER = 'article entier';

export function toCitation(article: ArticleForCitation): Citation {
  return {
    article_identifier: article.articleIdentifier,
    article_num: article.articleNum,
    subdivision: article.subdivisionLabel ?? SUBDIVISION_ARTICLE_ENTIER,
    code: article.code,
    texte_exact: article.texteExact,
    date_debut: article.dateDebut,
    etat: article.etat,
    url_legifrance: urlLegifrance(article.articleIdentifier),
  };
}

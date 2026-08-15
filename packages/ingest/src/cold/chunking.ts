import type { Article } from '@legirag/shared';
import type { ExtractedSubdivision } from './subdivisions.js';

const SEPARATEUR_CONTEXTE = ' › ';

// Forme avant persistance : ni `id`, `articleIdentifier`, ni `embedding`, qui
// n'existent qu'une fois le chunk chargé et vectorisé (4b). Nommé différemment
// du `Chunk` de packages/shared/src/types.ts (la ligne DB complète) pour que
// les deux puissent être importés côte à côte sans collision, même pattern
// qu'`ExtractedSubdivision` vis-à-vis de `Subdivision`.
export interface ExtractedChunk {
  subdivisionLabel?: string;
  contenu: string;
}

function contexte(article: Pick<Article, 'code' | 'sectionPath'>): string {
  return [article.code, ...article.sectionPath].join(SEPARATEUR_CONTEXTE);
}

// Cahier des charges technique §3.5 : un chunk n'est jamais le texte nu d'un
// article, il porte son contexte hiérarchique complet, préfixé au moment de
// l'embedding - sans quoi l'embedding perd son domaine ("vitesse" sans "code
// de la route" est ambigu).
export function chunkArticle(
  article: Pick<Article, 'code' | 'sectionPath' | 'articleNum' | 'contenuText'>,
  subdivisions: ExtractedSubdivision[],
): ExtractedChunk[] {
  const prefixeContexte = contexte(article);

  if (subdivisions.length === 0) {
    return [
      {
        contenu: `${prefixeContexte}\nArticle ${article.articleNum}\n\n${article.contenuText}`,
      },
    ];
  }

  return [...subdivisions]
    .sort((a, b) => a.ordre - b.ordre)
    .map((subdivision) => ({
      subdivisionLabel: subdivision.label,
      contenu: `${prefixeContexte}\nArticle ${article.articleNum}, ${subdivision.label}\n\n${subdivision.contenu}`,
    }));
}

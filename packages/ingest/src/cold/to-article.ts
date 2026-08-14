import { Etat, type Article } from '@legirag/shared';
import type { ColdArticleRow } from './types.js';
import { parseSectionPath } from './section-path.js';

// article_num sert de clé de recherche mais n'est jamais unique à lui seul
// (confirmé sur le corpus réel : 21 358 valeurs sur 105 119 apparaissent dans
// plusieurs codes différents) - code_slug le désambiguïse.
export function slugifyCode(texteTitre: string): string {
  return texteTitre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type MappedArticle = Omit<Article, 'idcc' | 'updatedAt'>;

// idcc et updatedAt restent à la charge du script de chargement (2d, étape 3) :
// idcc est toujours absent pour une ligne COLD, updatedAt dépend du moment du
// chargement, ni l'un ni l'autre ne se déduit de la ligne source.
export function toArticle(row: ColdArticleRow): MappedArticle | null {
  // 3 lignes réelles sur 157 174 sont des chapitres-placeholders sans numéro
  // d'article - pas un article interrogeable au sens où ce lot de features le
  // définit.
  if (row.article_num === null) return null;

  // Confirmé sur le corpus réel : parmi les lignes CODE, article_etat ne
  // porte que 'VIGUEUR' ou null (16 lignes, des articles réels par ailleurs).
  // Etat.parse fait échouer fort si une valeur imprévue apparaît un jour,
  // plutôt que de la faire passer silencieusement.
  const etat = Etat.parse(row.article_etat ?? 'VIGUEUR');

  // Zéro ligne réelle n'a de markdown vide aujourd'hui, mais le schéma
  // l'autorise (z.string()) - undefined plutôt qu'une chaîne vide pour
  // rester fidèle à Article.contenuMarkdown, optionnel.
  const contenuMarkdown = row.article_contenu_markdown === '' ? undefined : row.article_contenu_markdown;

  return {
    articleIdentifier: row.article_identifier,
    articleNum: row.article_num,
    code: row.texte_titre,
    codeSlug: slugifyCode(row.texte_titre),
    etat,
    dateDebut: row.article_date_debut,
    dateFin: row.article_date_fin,
    sectionPath: parseSectionPath(row.texte_contexte),
    contenuText: row.article_contenu_text,
    ...(contenuMarkdown !== undefined ? { contenuMarkdown } : {}),
    // Toute ligne chargée ici vient de COLD, un instantané des textes en
    // vigueur seulement - le palier profondeur (historique complet) est
    // l'affaire de l'item 10.
    palier: 'largeur',
  };
}

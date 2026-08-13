import { z } from 'zod';

// Colonnes réelles du dataset harvard-lil/cold-french-law (parquet, format `csv`
// converti par Hugging Face), vérifiées en direct par inspect-cold.ts — le
// cahier des charges technique § 3.1 en annonçait 15, la réalité en a 17. Le
// schéma brut porte aussi une colonne d'index `Unnamed: 0` et 5 colonnes
// `*_en` (traductions) : on ne les déclare pas ici, donc `ColdArticleRow.parse`
// les élimine silencieusement — c'est le mécanisme qui remplace un filtrage de
// colonnes explicite.
export const ColdArticleRow = z.object({
  article_identifier: z.string().min(1),
  // Vérifié en direct (fetch-cold.ts sur le jeu complet) : 3 des 157 174
  // lignes CODE ont un article_num null — un motif borné et identifié
  // (chapitres-placeholders : « Le présent chapitre ne comporte pas de
  // dispositions législatives. »), pas une dérive du format. Exclure ces
  // lignes est aussi une décision métier laissée à 2d, comme pour article_etat.
  article_num: z.string().min(1).nullable(),
  // Vérifié en direct (inspect-cold.ts) : parmi les 157 174 lignes CODE,
  // 157 158 portent VIGUEUR et 16 portent null — pas de valeur unique comme
  // l'annonçait le cahier des charges technique § 3.3. Ce que signifie une
  // ligne CODE sans état (l'écarter ? la traiter comme VIGUEUR ?) est une
  // décision métier laissée à 2d ; ce schéma se contente de refléter la
  // source fidèlement.
  article_etat: z.string().min(1).nullable(),
  article_date_debut: z.string().date(),
  article_date_fin: z.string().date(),
  texte_date_publi: z.string().date().nullable(),
  texte_date_signature: z.string().date().nullable(),
  texte_nature: z.string().min(1),
  texte_ministere: z.string().nullable(),
  texte_num: z.string().nullable(),
  texte_nor: z.string().nullable(),
  texte_num_parution_jo: z.string().nullable(),
  texte_titre: z.string().min(1),
  texte_titre_court: z.string().min(1),
  texte_contexte: z.string().min(1),
  article_contenu_markdown: z.string(),
  article_contenu_text: z.string().min(1),
});
export type ColdArticleRow = z.infer<typeof ColdArticleRow>;

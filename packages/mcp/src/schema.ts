import { z } from 'zod';

// Entrée MCP de chercher_droit - miroir de RequeteRecherche (@legirag/shared),
// sauf date en chaîne 'YYYY-MM-DD' (contrat MCP texte) plutôt qu'en Date.
export const ChercherDroitInput = z.object({
  texte: z.string().min(1),
  codes: z.array(z.string()).optional(),
  date: z.string().date().optional(),
  idcc: z.string().optional(),
  topK: z.number().int().positive().optional(),
});
export type ChercherDroitInput = z.infer<typeof ChercherDroitInput>;

// Entrée MCP de suivre_renvoi - contrat verrouillé (cahier des charges
// technique §5.3) : uniquement articleId, pas de date/codes.
export const SuivreRenvoiInput = z.object({
  articleId: z.string().min(1),
});
export type SuivreRenvoiInput = z.infer<typeof SuivreRenvoiInput>;

// Entrée MCP de demander_a_l_humain - contrat verrouillé (cahier des charges
// technique §5.3).
export const DemanderALHumainInput = z.object({
  motif: z.string().min(1),
  questionOuverte: z.string().min(1),
});
export type DemanderALHumainInput = z.infer<typeof DemanderALHumainInput>;

// Entrée MCP de calculer - le cahier des charges technique §5.3 fixe la forme
// { type, params: Record<string, unknown> } mais ne spécifie aucune formule ;
// cette union discriminante type chaque branche précisément (compatible avec
// le même contrat filaire) plutôt que de garder params non typé - voir
// current-feature.md / "Scope decision: calculer's formulas" pour le détail.
// sourceArticle est une entrée : seul l'appelant (via chercher_droit) sait
// quel article fonde le calcul, l'outil ne fait que le renvoyer.
const DureeUnite = z.enum(['jours', 'mois', 'annees']);

const DelaiParams = z.object({
  dateDepart: z.string().date(),
  duree: z.number().int().positive(),
  unite: DureeUnite,
  sourceArticle: z.string().min(1),
});

const AncienneteParams = z.object({
  dateDebut: z.string().date(),
  dateReference: z.string().date().optional(),
  sourceArticle: z.string().min(1),
});

const SeuilParams = z.object({
  valeur: z.number(),
  seuil: z.number(),
  sourceArticle: z.string().min(1),
});

export const CalculerInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delai'), params: DelaiParams }),
  z.object({ type: z.literal('prescription'), params: DelaiParams }),
  z.object({ type: z.literal('anciennete'), params: AncienneteParams }),
  z.object({ type: z.literal('seuil'), params: SeuilParams }),
]);
export type CalculerInput = z.infer<typeof CalculerInput>;

// Entrée/sortie MCP de router_question - contrat verrouillé (cahier des
// charges technique §5.3). RouterQuestionOutput sert deux fois : type de
// sortie de l'outil, et schéma passé à generateObject (packages/mcp/src/
// router-question.ts) pour contraindre la sortie du modèle.
export const RouterQuestionInput = z.object({
  question: z.string().min(1),
});
export type RouterQuestionInput = z.infer<typeof RouterQuestionInput>;

export const RouterQuestionOutput = z.object({
  codes: z.array(z.string()),
  confiance: z.number().min(0).max(1),
  raisonnement: z.string().min(1),
});
export type RouterQuestionOutput = z.infer<typeof RouterQuestionOutput>;

// Entrées MCP des trois outils non implémentés (7d) - contrats verrouillés
// (cahier des charges technique §5.3), pas de schéma de sortie : voir
// current-feature.md / "Scope decision: stub behavior" (aucune sortie réelle
// n'est jamais produite, donc rien à typer).
export const VersionALaDateInput = z.object({
  articleNum: z.string().min(1),
  code: z.string().min(1),
  date: z.string().date(),
});
export type VersionALaDateInput = z.infer<typeof VersionALaDateInput>;

export const ResoudreConventionInput = z.object({
  secteur: z.string().min(1).optional(),
  idcc: z.string().min(1).optional(),
  nomConvention: z.string().min(1).optional(),
});
export type ResoudreConventionInput = z.infer<typeof ResoudreConventionInput>;

export const AnalyserDocumentInput = z.object({
  contenu: z.string().min(1),
  question: z.string().min(1),
});
export type AnalyserDocumentInput = z.infer<typeof AnalyserDocumentInput>;

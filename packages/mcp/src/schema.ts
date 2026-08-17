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

// Entrée MCP de router_question - contrat verrouillé (cahier des charges
// technique §5.3). La sortie (RouterQuestionOutput) vit désormais dans
// @legirag/agent (8a) : routerQuestion() l'utilise directement comme schéma
// generateObject, elle n'a plus sa place dans le seul contrat filaire ici.
export const RouterQuestionInput = z.object({
  question: z.string().min(1),
});
export type RouterQuestionInput = z.infer<typeof RouterQuestionInput>;

// demander_a_l_humain et calculer : leurs schémas d'entrée
// (DemanderALHumainInput, CalculerInput) vivent désormais dans
// @legirag/agent (8a), puisque demanderALHumain()/calculer() les utilisent
// directement comme type de paramètre - importés d'ici pour le registerTool
// de server.ts plutôt que dupliqués.

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

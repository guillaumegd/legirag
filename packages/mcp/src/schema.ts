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

import { z } from 'zod';
import { Confiance, Escalade, MotifPresence } from '@legirag/shared';

// Entrée de demander_a_l_humain - contrat verrouillé (cahier des charges
// technique §5.3). Vit ici (pas dans packages/mcp/src/schema.ts) parce que
// demanderALHumain (demander-a-l-humain.ts) l'utilise directement comme type
// de paramètre - packages/mcp l'importe de @legirag/agent pour son propre
// registerTool plutôt que d'en garder une copie.
export const DemanderALHumainInput = z.object({
  motif: z.string().min(1),
  questionOuverte: z.string().min(1),
});
export type DemanderALHumainInput = z.infer<typeof DemanderALHumainInput>;

// Entrée de calculer - le cahier des charges technique §5.3 fixe la forme
// { type, params: Record<string, unknown> } mais ne spécifie aucune formule ;
// cette union discriminante type chaque branche précisément (compatible avec
// le même contrat filaire) plutôt que de garder params non typé - voir
// blueprint/history/features/07c-* pour le détail d'origine.
// sourceArticle est une entrée : seul l'appelant (via chercher_droit) sait
// quel article fonde le calcul, l'outil ne fait que le renvoyer.
// Vit ici, pas dans packages/mcp/src/schema.ts, pour la même raison que
// DemanderALHumainInput ci-dessus : calculer() l'utilise directement comme
// type de paramètre.
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

// Sortie de router_question - contrat verrouillé (cahier des charges
// technique §5.3). Sert deux fois : type de sortie de routerQuestion, et
// schéma passé à generateObject (router-question.ts) pour contraindre la
// sortie du modèle - doit donc vivre à côté de la fonction qui l'utilise.
export const RouterQuestionOutput = z.object({
  codes: z.array(z.string()),
  confiance: z.number().min(0).max(1),
  raisonnement: z.string().min(1),
});
export type RouterQuestionOutput = z.infer<typeof RouterQuestionOutput>;

// Schéma passé à generateObject (graph.ts, 8d) : le modèle ne cite jamais un
// article en recopiant ses champs (ça a produit un subdivision "<UNKNOWN>"
// en 8a) - il pointe uniquement vers un numéro de la liste de sources
// numérotée du prompt. toReponseStructuree (graph.ts) substitue ensuite la
// vraie Citation récupérée par le code à cet index - voir "Scope decision:
// index-based selection" (8d). Purement interne à packages/agent, jamais vu
// hors de ce paquet.
const TexteComplementaireIndexe = z.object({
  index: z.number().int().min(0),
  motif_presence: MotifPresence,
});

export const ReponseStructureeIndexee = z.object({
  verdict: z.string().min(1),
  regle_principale_index: z.number().int().min(0).optional(),
  textes_complementaires: z.array(TexteComplementaireIndexe),
  hors_perimetre: z.array(z.string()).min(1),
  confiance: Confiance,
  escalade: Escalade.optional(),
});
export type ReponseStructureeIndexee = z.infer<typeof ReponseStructureeIndexee>;

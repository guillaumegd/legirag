import { z } from 'zod';

// Cahier des charges technique § 3.4 - table `articles.etat`
export const Etat = z.enum(['VIGUEUR', 'MODIFIE', 'ABROGE']);
export type Etat = z.infer<typeof Etat>;

// Cahier des charges métier § 7 - `regle_principale` et chaque texte de `textes_complementaires[]`
// R1 : article_identifier et subdivision sont obligatoires, garantis par le type avant le vérificateur
export const Citation = z.object({
  article_identifier: z.string().min(1),
  article_num: z.string().min(1),
  subdivision: z.string().min(1),
  code: z.string().min(1),
  texte_exact: z.string().min(1),
  date_debut: z.string().date(),
  etat: Etat,
  url_legifrance: z.string().url(),
});
export type Citation = z.infer<typeof Citation>;

// Motif de présence exigé pour chaque texte complémentaire - cahier des charges métier § 7
export const MotifPresence = z.enum([
  'renvoi_explicite',
  'exception',
  'cas_particulier',
  'condition',
]);
export type MotifPresence = z.infer<typeof MotifPresence>;

export const TexteComplementaire = Citation.extend({
  motif_presence: MotifPresence,
});
export type TexteComplementaire = z.infer<typeof TexteComplementaire>;

// F11 - vers qui se tourner en cas d'abstention
export const Escalade = z.object({
  motif: z.string().min(1),
  interlocuteur: z.string().min(1),
});
export type Escalade = z.infer<typeof Escalade>;

export const Confiance = z.enum(['elevee', 'moyenne', 'abstention']);
export type Confiance = z.infer<typeof Confiance>;

// Forme brute (avant refine) de la réponse structurée - exportée séparément
// pour que packages/agent (8a) puisse en dériver, via .omit(), le schéma
// passé à generateObject : trace_id et date_reference sont assignés par le
// code du graphe après l'appel modèle (jamais par le modèle lui-même), donc
// le schéma qui contraint la sortie du modèle ne doit pas les demander.
export const ReponseStructureeObjet = z.object({
  verdict: z.string().min(1),
  // Optionnel uniquement pour porter une abstention honnête (item 8a) :
  // une recherche vide n'a aucune citation réelle à donner, et en fabriquer
  // une violerait la règle "jamais d'affirmation non sourcée" pire que
  // l'absence elle-même. Voir le refine ci-dessous : obligatoire dès que
  // confiance n'est pas 'abstention'.
  regle_principale: Citation.optional(),
  // R4 : le motif de présence rend explicite pourquoi chaque texte apparaît
  textes_complementaires: z.array(TexteComplementaire),
  // R4 : jamais vide - une réponse silencieuse sur son périmètre est un défaut, pas une simplicité
  hors_perimetre: z.array(z.string()).min(1),
  confiance: Confiance,
  escalade: Escalade.optional(),
  date_reference: z.string().date(),
  trace_id: z.string().min(1),
});

// Schéma de la réponse structurée - cahier des charges métier § 7
export const ReponseStructuree = ReponseStructureeObjet.refine(
  (r) => r.confiance !== 'abstention' || r.escalade !== undefined,
  {
    message: 'Une abstention doit porter une escalade',
    path: ['escalade'],
  },
).refine((r) => r.confiance === 'abstention' || r.regle_principale !== undefined, {
  message: 'Une réponse non abstentionniste doit citer une règle principale',
  path: ['regle_principale'],
});
export type ReponseStructuree = z.infer<typeof ReponseStructuree>;

const ExecutionTraceTokenUsage = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
});

// Item 12a - le détail des appels individuels faits pendant une seule
// exécution d'un nœud (route: un appel modèle ; draft: un appel modèle par
// tentative, y compris les tentatives ratées ; search/followRenvois: leurs
// appels DB/retriever) - optionnel pour rester lisible par les traces
// persistées avant 12a, qui n'ont jamais porté ce détail.
export const ExecutionTraceCall = z.object({
  kind: z.enum(['model', 'tool']),
  name: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  tokenUsage: ExecutionTraceTokenUsage.optional(),
});
export type ExecutionTraceCall = z.infer<typeof ExecutionTraceCall>;

// Item 11b - un pas du graphe fixe (route/search/draft/followRenvois), pas
// un appel outil individuel : la chaîne fixe (note item 9) ne fait aucun
// choix d'outil dynamique, donc "tool call" ici = une exécution de nœud.
// summary reste volontairement non typé nœud par nœud (route: codes choisis,
// search: nombre de citations, draft: confiance/tentatives, followRenvois:
// nouvelles citations) - un objet libre plutôt que quatre formes distinctes
// pour un enregistrement lu bien plus souvent qu'il n'est produit.
export const ExecutionTraceStep = z.object({
  node: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  summary: z.record(z.string(), z.unknown()),
  calls: z.array(ExecutionTraceCall).optional(),
});
export type ExecutionTraceStep = z.infer<typeof ExecutionTraceStep>;

// Enregistrement minimal (routage, appels d'outils, timing) capturé pendant
// un run du graphe et servi par GET /trace/:trace_id (project-overview.md,
// "Execution trace") - relu et revalidé après lecture de la colonne jsonb,
// jamais fait confiance comme typé en sortie de Postgres (même principe que
// ReponseStructuree.parse avant l'événement SSE `done`, 11a).
export const ExecutionTrace = z.object({
  traceId: z.string().min(1),
  question: z.string().min(1),
  dateReference: z.string().date(),
  codes: z.array(z.string()).optional(),
  steps: z.array(ExecutionTraceStep),
  tokenUsage: ExecutionTraceTokenUsage.optional(),
  totalDurationMs: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
});
export type ExecutionTrace = z.infer<typeof ExecutionTrace>;

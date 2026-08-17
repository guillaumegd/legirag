import { z } from 'zod';

// Cahier des charges technique § 3.4 - table `articles.etat`
export const Etat = z.enum(['VIGUEUR', 'MODIFIE', 'ABROGE']);
export type Etat = z.infer<typeof Etat>;

// Cahier des charges métier § 7 - `regle_principale` et chaque texte de `textes_complementaires[]`
// R1 : article_identifier et subdivision sont obligatoires, garantis par le type avant le vérificateur
export const Citation = z.object({
  article_identifier: z.string().min(1),
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

import type { DemanderALHumainInput } from './schema.js';

export interface DemanderALHumainResult {
  escalade: string;
  interlocuteur: string;
}

// Pas de système de routage humain réel derrière ce projet démonstrateur -
// interlocuteur fixe assumé, voir current-feature.md / Notes pour l'IA.
const INTERLOCUTEUR_PAR_DEFAUT = 'support juridique legirag';

export function demanderALHumain(input: DemanderALHumainInput): DemanderALHumainResult {
  return {
    escalade: `${input.motif} : ${input.questionOuverte}`,
    interlocuteur: INTERLOCUTEUR_PAR_DEFAUT,
  };
}

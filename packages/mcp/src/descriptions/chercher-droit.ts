import type { ToolDescription } from '../tool-description.js';

export const chercherDroitDescription: ToolDescription = {
  name: 'chercher_droit',
  version: 1,
  description:
    "Recherche des extraits de textes légaux français (articles de code) pertinents pour une question ou une situation, par recherche hybride mot-clé + sémantique. Retourne des extraits classés par pertinence, chacun identifié par son article et éventuellement sa subdivision. Ne suit pas les renvois vers d'autres articles et ne calcule rien : uniquement de la recherche.",
};

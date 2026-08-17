import type { ToolDescription } from '../tool-description.js';

export const demanderALHumainDescription: ToolDescription = {
  name: 'demander_a_l_humain',
  version: 1,
  description:
    "Formule une escalade vers un interlocuteur humain lorsque la question dépasse ce que l'agent peut couvrir avec certitude (hors périmètre du corpus indexé, besoin d'un avis personnalisé, incertitude trop grande). Ne cherche rien et ne calcule rien : produit uniquement le message d'escalade et l'interlocuteur à contacter.",
};

import type { ToolDescription } from '../tool-description.js';

export const suivreRenvoiDescription: ToolDescription = {
  name: 'suivre_renvoi',
  version: 1,
  description:
    "Parcourt le graphe des renvois d'un article déjà identifié (par exemple trouvé via chercher_droit) : liste les articles qu'il cite, y compris dans d'autres codes. Ne recherche rien et ne retourne pas le contenu des articles cités, seulement leur identifiant et si le renvoi est actuellement exploitable. Un renvoi non exploitable (extraction sans correspondance, ou cible non en vigueur aujourd'hui) apparaît dans nonResolus plutôt que renvois.",
};

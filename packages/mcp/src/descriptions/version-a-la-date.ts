import type { ToolDescription } from '../tool-description.js';

export const versionALaDateDescription: ToolDescription = {
  name: 'version_a_la_date',
  version: 1,
  description:
    "Outil non implémenté (nécessite le palier de profondeur - historique complet des textes -, prévu à l'item 10 de la feuille de route). Censé retourner la version d'un article en vigueur à une date donnée avec ses versions voisines, mais échoue systématiquement aujourd'hui faute d'historique indexé. Ne pas appeler pour répondre à une question réelle : utiliser chercher_droit pour la version actuellement en vigueur, ou demander_a_l_humain pour une question portant sur une version passée d'un texte.",
};

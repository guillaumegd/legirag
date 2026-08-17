import type { ToolDescription } from '../tool-description.js';

export const calculerDescription: ToolDescription = {
  name: 'calculer',
  version: 1,
  description:
    "Effectue un calcul de date ou de seuil déterministe (délai, prescription, ancienneté, seuil), à partir des chiffres déjà trouvés par chercher_droit - jamais l'inverse : cet outil ne connaît aucune règle juridique et ne va rien chercher, il ne fait que l'arithmétique. sourceArticle est fourni par l'appelant et simplement renvoyé tel quel. À utiliser chaque fois qu'une réponse implique une date limite, une durée écoulée, ou une comparaison à un seuil chiffré, pour ne jamais laisser le modèle de langage faire le calcul lui-même.",
};

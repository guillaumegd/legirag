// Description versionnée d'un outil MCP - jamais inline dans le code de câblage
// du serveur, car l'item 9 rejouera ces descriptions dans le harnais d'évaluation
// pour détecter une régression du taux de sélection d'outil.
export interface ToolDescription {
  name: string;
  version: number;
  description: string;
}

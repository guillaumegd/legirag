import type { Chunk, RequeteRecherche } from '@legirag/shared';
import type { ChercherDroitInput } from './schema.js';

const DEFAULT_TOP_K = 10;

// now est injectable (au lieu d'un `new Date()` interne) pour rester une
// fonction pure et testable sans horloge simulée.
export function toRequeteRecherche(input: ChercherDroitInput, now: Date = new Date()): RequeteRecherche {
  return {
    texte: input.texte,
    dateReference: input.date ? new Date(input.date) : now,
    topK: input.topK ?? DEFAULT_TOP_K,
    ...(input.codes ? { codes: input.codes } : {}),
    ...(input.idcc ? { idcc: input.idcc } : {}),
  };
}

export interface ToolTextContent {
  type: 'text';
  text: string;
}

const AUCUN_RESULTAT: ToolTextContent[] = [
  { type: 'text', text: 'Aucun résultat trouvé pour cette recherche.' },
];

export function toToolContent(chunks: Chunk[]): ToolTextContent[] {
  if (chunks.length === 0) return AUCUN_RESULTAT;

  return chunks.map((chunk) => ({
    type: 'text',
    text: `[${chunk.articleIdentifier}${chunk.subdivisionLabel ? ` ${chunk.subdivisionLabel}` : ''}]\n${chunk.contenu}`,
  }));
}

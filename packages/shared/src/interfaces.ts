import type { LanguageModel } from 'ai';
import type { Chunk, RequeteRecherche } from './types.js';

// Cahier des charges technique § 4.1 — une seule implémentation aujourd'hui (Supabase),
// l'interface reste en place pour qu'ajouter OpenSearch plus tard coûte une demi-journée.
export interface Retriever {
  search(q: RequeteRecherche): Promise<Chunk[]>;
}

// § 6 — le modèle est une variable d'environnement, jamais en dur dans le code.
export interface ModelProvider {
  volume(): LanguageModel;
  escalade(): LanguageModel;
}

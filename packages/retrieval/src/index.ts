// Implémentation Supabase de l'interface Retriever - à partir de J4.
export { SupabaseRetriever } from './supabase-retriever.js';
// Réutilisé par packages/mcp (7b) - corrige un vrai bug (F-01/4c, frontière
// Europe/Paris), donc exporté plutôt que redérivé.
export { formatDateReference } from './query-params.js';
// Réutilisé par packages/agent (8a) pour ses propres requêtes RLS-scopées
// (suivre_renvoi, router_question) - une seule implémentation partagée
// plutôt qu'une nouvelle copie dupliquée.
export { createDatabaseClient } from './pg-client.js';
// packages/agent (8a) : construit une Citation à partir d'un article/
// subdivision réels, jamais du Chunk.contenu préfixé par le contexte de
// recherche.
export { fetchArticlesForCitation } from './fetch-articles-for-citation.js';
export type { ArticleForCitation, CitationSource } from './fetch-articles-for-citation.js';

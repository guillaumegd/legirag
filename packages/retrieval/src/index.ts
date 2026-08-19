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
// packages/api (11b) : GET /article/:article_identifier, même contrat RLS
// que fetchArticlesForCitation mais retourne l'Article complet + ses
// Subdivision, pas seulement le texte utile à une Citation.
export { fetchArticleByIdentifier } from './fetch-article-by-identifier.js';
// packages/api (11b) : persiste/relit le trace record d'un run du graphe
// (POST /question) pour GET /trace/:trace_id.
export { persistTrace, fetchTrace } from './traces.js';
// Partagé par packages/api et packages/mcp : rate-limit par IP persisté en
// base (fix, 2026-08-19), remplace un compteur en mémoire peu fiable sur
// Lambda multi-instance.
export { checkRateLimit } from './rate-limit.js';
export type { RateLimitResult } from './rate-limit.js';

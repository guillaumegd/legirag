-- Fix (2026-08-19, /audit F-12) - la purge opportuniste (rate-limit.ts)
-- supprime par created_at seul, sans filtrer par kind : l'index composite
-- (kind, ip, created_at) créé par la migration précédente ne peut pas
-- servir à ça (kind n'est pas fixé), donc ce delete forçait un Seq Scan
-- complet de la table - confirmé en direct via EXPLAIN. Cet index dédié
-- lui donne un chemin d'accès direct aux vieilles lignes.
create index if not exists rate_limit_requests_created_at_idx
  on rate_limit_requests (created_at);

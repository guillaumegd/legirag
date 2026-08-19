-- Fix (2026-08-19) - garde-fou d'accès pour l'API et le MCP. Contrairement à
-- traces (lisible par quiconque tient le trace_id), cette table ne doit être
-- accessible que via la connexion privilégiée DATABASE_URL : une IP est une
-- donnée sensible, et aucun usage légitime ne nécessite de la lire via une
-- clé anon/authenticated. RLS activée sans aucune policy = accès refusé par
-- défaut à tout rôle autre que le propriétaire de la table.
create table if not exists rate_limit_requests (
  id bigint generated always as identity primary key,
  ip inet not null,
  created_at timestamptz not null default now()
);

-- Sert les deux fenêtres glissantes (1 min, 24 h) vérifiées par
-- packages/retrieval/src/rate-limit.ts en une seule requête indexée.
create index if not exists rate_limit_requests_ip_created_at_idx
  on rate_limit_requests (ip, created_at);

alter table rate_limit_requests enable row level security;

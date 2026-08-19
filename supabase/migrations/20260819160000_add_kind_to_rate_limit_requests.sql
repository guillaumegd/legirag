-- Fix (2026-08-19, item 17) - sépare les compteurs payants (POST
-- /question) et gratuits (GET /trace, GET /article) : le quota gratuit
-- peut générer beaucoup plus de lignes/jour que le payant, donc les deux
-- doivent être comptés indépendamment sans se partager un budget.
-- rate-limit.ts (checkRateLimit) filtre désormais par kind en plus de
-- ip/created_at ; cette colonne partitionne les mêmes fenêtres glissantes
-- sans changer leur logique.
alter table rate_limit_requests
  add column kind text not null default 'paid' check (kind in ('paid', 'free'));

-- Remplace l'index existant : les requêtes de rate-limit.ts filtrent
-- désormais toujours par kind en premier.
drop index if exists rate_limit_requests_ip_created_at_idx;
create index if not exists rate_limit_requests_kind_ip_created_at_idx
  on rate_limit_requests (kind, ip, created_at);

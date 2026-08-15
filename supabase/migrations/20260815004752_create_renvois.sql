create table if not exists renvois (
  id bigint generated always as identity primary key,
  source_article text not null references articles (article_identifier) on delete cascade,
  cible_article_num text not null,
  cible_code text,
  cible_article_id text references articles (article_identifier) on delete set null,
  cible_subdivision text,
  forme text not null check (forme in ('simple', 'enumeration', 'plage')),
  inter_code boolean not null,
  offset_debut integer,
  offset_fin integer,
  resolu boolean not null default false
);

create index if not exists idx_renvois_source_article on renvois (source_article);
create index if not exists idx_renvois_cible_article_id
  on renvois (cible_article_id) where cible_article_id is not null;

alter table renvois enable row level security;

create policy renvois_public_read on renvois for select using (true);

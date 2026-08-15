create extension if not exists vector with schema extensions;

create table if not exists chunks (
  id bigint generated always as identity primary key,
  article_identifier text not null references articles (article_identifier) on delete cascade,
  subdivision_label text,
  contenu text not null,
  embedding extensions.vector(1024),
  tsv tsvector generated always as (to_tsvector('french', contenu)) stored
);

create index if not exists idx_chunks_article_identifier on chunks (article_identifier);

alter table chunks enable row level security;

create policy chunks_public_read on chunks for select using (true);

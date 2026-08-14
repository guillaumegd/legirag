create table if not exists articles (
  article_identifier text primary key,
  article_num text not null,
  code text not null,
  code_slug text not null,
  etat text not null check (etat in ('VIGUEUR', 'MODIFIE', 'ABROGE')),
  date_debut date not null,
  date_fin date not null,
  section_path text[] not null default '{}',
  contenu_text text not null,
  contenu_markdown text,
  palier text not null check (palier in ('largeur', 'profondeur')),
  idcc text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_articles_article_num on articles (article_num);
create index if not exists idx_articles_code_slug_article_num
  on articles (code_slug, article_num);

create table if not exists subdivisions (
  id bigint generated always as identity primary key,
  article_identifier text not null references articles (article_identifier) on delete cascade,
  label text not null,
  ordre integer not null,
  contenu text not null,
  unique (article_identifier, ordre)
);

alter table articles enable row level security;
alter table subdivisions enable row level security;

create policy articles_public_read on articles for select using (true);
create policy subdivisions_public_read on subdivisions for select using (true);

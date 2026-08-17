-- Item 12c : capture l'événement "le texte d'un article a réellement changé"
-- au niveau de la base elle-même, indépendamment du script qui a écrit la
-- ligne (load-corpus.ts aujourd'hui, une future source non-COLD demain).
-- Table interne, jamais lue par l'API publique - RLS activée sans aucune
-- policy (default-deny), même posture que article_visible() (4c) : ne pas
-- se fier uniquement au code applicatif pour garder cette table privée.
create table if not exists reindex_queue (
  article_identifier text primary key references articles (article_identifier) on delete cascade,
  queued_at timestamptz not null default now()
);

alter table reindex_queue enable row level security;

-- IS DISTINCT FROM plutôt que "une UPDATE a eu lieu" : un ré-upsert qui
-- réécrit un contenu identique (load-corpus.ts, re-run idempotent) ne doit
-- rien mettre en file - seul un texte qui a réellement changé compte comme
-- l'événement que ce trigger existe pour capturer.
create or replace function public.enqueue_reindex()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT'
     or NEW.contenu_text is distinct from OLD.contenu_text
     or NEW.contenu_markdown is distinct from OLD.contenu_markdown
  then
    insert into public.reindex_queue (article_identifier)
    values (NEW.article_identifier)
    on conflict (article_identifier) do update set queued_at = now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists articles_enqueue_reindex on articles;
create trigger articles_enqueue_reindex
  after insert or update on articles
  for each row execute function public.enqueue_reindex();

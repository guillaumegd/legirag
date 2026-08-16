-- Session-variable-driven RLS on the search path (articles, subdivisions,
-- chunks). Replaces the temporary `using (true)` public-read policies these
-- three tables carried since 2d/4b. `renvois` is left untouched here -
-- deferred to item 8 (cross-reference following), whose visibility rules
-- differ per-source/per-target instead of following a single article.
--
-- `article_visible` unconditionally hides `ABROGE` rows - a deliberate
-- interim rule, since no ABROGE/MODIFIE rows exist in the corpus yet (COLD
-- only snapshots current in-force text). Item 10 (historical versions/time
-- travel) must revisit this so a past `app.date_reference` can surface a
-- version that was in force then, even though it is `ABROGE` today.
create or replace function public.article_visible(a public.articles)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.etat <> 'ABROGE'
    and a.date_debut <= (select coalesce(nullif(current_setting('app.date_reference', true), '')::date, current_date))
    and a.date_fin    >= (select coalesce(nullif(current_setting('app.date_reference', true), '')::date, current_date))
    and (
      (select nullif(current_setting('app.codes', true), '')) is null
      or a.code_slug = any(string_to_array((select current_setting('app.codes', true)), ','))
    )
    and (
      a.idcc is null
      or a.idcc = (select nullif(current_setting('app.idcc', true), ''))
    );
$$;

drop policy if exists articles_public_read on articles;
create policy articles_search_read on articles
  for select using (article_visible(articles));

-- subdivisions/chunks have no etat/date/code/idcc columns of their own; the
-- inner `select` below is itself subject to articles' own RLS policy above,
-- so the same predicate applies without duplicating it here.
drop policy if exists subdivisions_public_read on subdivisions;
create policy subdivisions_search_read on subdivisions
  for select using (
    exists (select 1 from public.articles a where a.article_identifier = subdivisions.article_identifier)
  );

drop policy if exists chunks_public_read on chunks;
create policy chunks_search_read on chunks
  for select using (
    exists (select 1 from public.articles a where a.article_identifier = chunks.article_identifier)
  );

create index if not exists idx_articles_idcc on articles (idcc) where idcc is not null;

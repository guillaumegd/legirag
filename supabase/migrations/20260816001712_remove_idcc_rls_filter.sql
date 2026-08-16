-- Retrait du filtre idcc posé dans 20260816000815_add_search_rls.sql :
-- aucune donnée KALI (conventions collectives) n'existe encore dans le
-- corpus (idcc est null sur les 9 708 articles actuels), donc câbler ce
-- filtre maintenant serait spéculatif - à réintroduire quand la branche
-- KALI/idcc sera réellement construite (cf. note laissée dans
-- project-overview.md, section "Collective bargaining agreement").
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
    );
$$;

drop index if exists idx_articles_idcc;

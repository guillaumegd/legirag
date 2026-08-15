-- resolu était stocké indépendamment de cible_article_id, alors que
-- resolveRenvoi (packages/ingest/src/cold/resolve-renvoi.ts) garantit déjà
-- resolu === (cible_article_id is not null) au chargement. Une future
-- suppression d'article cible (ON DELETE SET NULL) ne mettait pas resolu à
-- jour, laissant une ligne "résolue" pointant vers rien. Colonne générée :
-- l'invariant est désormais garanti par le schéma, pas par le chargeur.
alter table renvois drop column resolu;

alter table renvois
  add column resolu boolean not null generated always as (cible_article_id is not null) stored;

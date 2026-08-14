# Feature: Supabase schema and load

**From build-plan:** feature 2d (sub-feature of 2 - Legal corpus in the database)
**Status:** complete

## Goal

Create the `articles` and `subdivisions` tables in the connected Supabase
project (`kqgtonbfeqzraaddnriy`, currently empty - `pgvector` is already
installed, no tables or migrations exist yet), then load the full filtered
COLD corpus (`packages/ingest/.data/cold-corpus.ndjson`, 157,174 rows) and
every row's extracted subdivisions (2c's `extractSubdivisions`) into it, so a
query for any `article_num` returns its text, code, hierarchical path, and
subdivisions - the exact bar the build plan sets for this item. This closes
out build-plan item 2; item 3 (cross-reference graph) depends on `articles`
existing to add its `renvois` table's foreign key against.

## In scope

- The `articles` and `subdivisions` tables, their indexes, and RLS enabled
  with a public-read policy, applied to the real Supabase project as a
  tracked migration
- A pure mapping function from a validated `ColdArticleRow` (2a) to the
  `Article` shape (`packages/shared/src/types.ts`), deciding the three things
  the source data leaves open (see Notes for the AI): `article_etat: null` ->
  `'VIGUEUR'`, a null `article_num` row is skipped (not loaded), and
  `code_slug` generation from `texte_titre`
- A load script that streams the local corpus, calls 2c's
  `extractSubdivisions` per row, and writes both tables in batches, re-runnable
  without duplicating rows (idempotent upsert)
- A validation script proving the build-plan's literal acceptance bar against
  the real database: look up a known `article_num`, get back its text, code,
  hierarchical path, and subdivisions in one round trip

## Out of scope

- The `renvois` and `chunks` tables (items 3 and 4) - not created here
- The real RLS filtering policies (state/date/code/agreement-ID, project
  overview's "Search index and access-control policies") - item 4's job. This
  feature's `select using (true)` policy is a deliberate placeholder so RLS
  is enabled from day one instead of bolted on later, not the final access
  control; item 4 replaces or extends it
- The `Retriever` implementation (`packages/retrieval`) that will query these
  tables - item 4
- Historical versions / time travel (`palier: 'profondeur'`, build-plan item
  10) - every row loaded here is `palier: 'largeur'`, since COLD is a
  current-state-only snapshot
- The uppercase `A.`/`B.` subdivision marker and alinéa-level subdivisions -
  already deferred by 2c, unaffected by this feature
- KALI/`idcc` ingestion - every row loaded here has `idcc: undefined`, per
  the locked data model

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Create the migration** - write
  `supabase/migrations/<timestamp>_create_articles_subdivisions.sql` with the
  exact DDL in Data / contracts below (both tables, their indexes, RLS
  enabled, the public-read policies), then apply it to the connected project
  with the `mcp__supabase__apply_migration` tool using that same SQL.
  *Done when:* `mcp__supabase__list_tables` (verbose) shows `articles` and
  `subdivisions` with the documented columns, primary keys, and the
  `subdivisions -> articles` foreign key; `mcp__supabase__list_migrations`
  lists the new migration; `mcp__supabase__get_advisors` (security) reports
  no new RLS-related warning for either table.
- [x] **Step 2 - Row mapping, unit tested** - add
  `packages/ingest/src/cold/to-article.ts` exporting
  `slugifyCode(texteTitre: string): string` (lowercase, strip accents,
  replace anything that isn't `a-z0-9` with a single hyphen, trim leading and
  trailing hyphens) and
  `toArticle(row: ColdArticleRow): Omit<Article, 'contenuMarkdown' | 'idcc' | 'updatedAt'> & { contenuMarkdown?: string } | null`
  (reuses `parseSectionPath` from 2b for `sectionPath`): returns `null` when
  `row.article_num` is `null` (the 3 placeholder-chapter rows); otherwise maps
  `article_etat` to `'VIGUEUR'` when it is `null` and passes it through
  otherwise, maps `article_contenu_markdown === ''` to `undefined`, sets
  `palier: 'largeur'`, and leaves `idcc`/`updatedAt` for the load script to
  fill in. Export both from `packages/ingest/src/index.ts`.
  *Done when:* `pnpm test` passes new cases in `to-article.test.ts`, fixed
  hand-written examples only (2b/2c precedent: real-corpus-scale checks live
  in a separate `validate-*.ts` script, never inside a Vitest test): accented
  and apostrophe'd titles (`"Code de l'énergie"`, `"Code de la sécurité
  sociale"`) slugify to a stable, expected result; two genuinely distinct but
  textually similar real titles (`"Code forestier"` and `"Code forestier
  (nouveau)"`, both present in the real corpus per 2c's Notes) slugify to
  different results; a row with
  `article_num: null` returns `null`; a row with
  `article_etat: null` maps to `etat: 'VIGUEUR'`; a row with
  `article_contenu_markdown: ''` maps to `contenuMarkdown: undefined`.
- [x] **Step 3 - Load script** - add `packages/ingest/src/cold/load-corpus.ts`
  (run via `tsx --env-file=../../.env`, wired as
  `pnpm --filter @legirag/ingest load:corpus`), using the `pg` package
  (add `pg` + `@types/pg` as dependencies) against `DATABASE_URL` (fail fast
  if unset, same `requireEnv` pattern as `bedrock.ts`): streams
  `cold-corpus.ndjson` line by line, calls `toArticle` then, for rows that
  aren't skipped, `extractSubdivisions` on `article_contenu_markdown`, and
  writes in batches of 500 inside a transaction per batch:
  `insert into articles (...) values (...) on conflict (article_identifier)
  do update set ...` for the article row, then
  `delete from subdivisions where article_identifier = any($1)` followed by a
  bulk insert of the freshly extracted subdivisions for that batch's article
  identifiers - this delete-then-insert makes a full re-run idempotent without
  a natural per-subdivision key. Logs progress every 10,000 rows and a final
  summary: rows read, rows loaded, rows skipped (null `article_num`),
  subdivisions inserted.
  *Done when:* running it against the full local corpus completes with exit
  code 0, and a follow-up count matches expectations: 157,171 articles
  (157,174 minus the 3 skipped), and a subdivisions count consistent with 2c's
  `validate:subdivisions` output (~25% of articles have one or more).
- [x] **Step 4 - Validate the acceptance bar against the real database** - add
  `packages/ingest/src/cold/validate-load.ts` (`tsx --env-file=../../.env`,
  wired as `pnpm --filter @legirag/ingest validate:load`): picks a handful of
  known real `article_num` values spanning different codes (at least one with
  subdivisions, e.g. an article with a confirmed `"I, 1°"`-shaped label from
  2c's Notes, and one without), runs one SQL query per lookup joining
  `articles` and `subdivisions` by `article_identifier`, and prints the
  result: article number, code, `section_path`, text, and its subdivisions in
  `ordre`. Also runs `select code, count(distinct code_slug) from articles
  group by code having count(distinct code_slug) > 1` (a code somehow split
  across slugs) and `select code_slug, count(distinct code) from articles
  group by code_slug having count(distinct code) > 1` (two distinct codes
  collapsed onto the same slug), printing any rows either query returns -
  this is where `slugifyCode`'s real-corpus collision behavior actually gets
  checked, against what's actually loaded, not the raw file.
  *Done when:* running it against the real Supabase project completes with
  exit code 0, both collision queries return zero rows, and the printed
  output for each lookup is correct on manual read - text matches the known
  article, `section_path` is non-empty, subdivisions (when present) come back
  in order with non-empty `contenu`.
- [x] **Repair F-01 - `pg` date/timestamptz columns as JS `Date`, not string** -
  add `packages/ingest/src/cold/pg-client.ts` exporting `createDatabaseClient()`:
  registers `pg`'s type parsers for `date` (OID 1082), `timestamp` (1114), and
  `timestamptz` (1184) to return the raw string instead of a `Date` object,
  then constructs and returns a `Client` using `DATABASE_URL`. Update
  `load-corpus.ts` and `validate-load.ts` to use it instead of constructing
  their own `Client`.
  *Done when:* a real query against `articles` through this helper returns
  `date_debut`/`date_fin` as strings (`typeof === 'string'`), not `Date`
  objects - re-running the same manual check that found F-01.
- [x] **Repair F-02 - `requireEnv` duplicated three times** - add
  `packages/shared/src/env.ts` exporting `requireEnv`; update
  `packages/shared/src/providers/bedrock.ts` to import it instead of defining
  its own copy; export it from `packages/shared/src/index.ts`; use it from
  `@legirag/shared` in the new `pg-client.ts` instead of a local copy.
  *Done when:* `rg "function requireEnv"` finds exactly one definition
  (`packages/shared/src/env.ts`), `pnpm typecheck`/`pnpm test`/`pnpm lint`
  stay clean.
- [x] **Repair F-03 - `requireEnv`'s new home has no direct unit test** - add
  `packages/shared/src/env.test.ts`: throws the exact French message when the
  env var is unset, returns the value when set.
  *Done when:* `pnpm test` passes the new cases, `pnpm typecheck`/`pnpm lint`
  stay clean.

## Files / areas

- `supabase/migrations/20260814144702_create_articles_subdivisions.sql` (new)
- `supabase/config.toml`, `supabase/.gitignore` (new, `supabase init`)
- `packages/ingest/src/cold/to-article.ts` + `.test.ts` (new)
- `packages/ingest/src/cold/load-corpus.ts` (new)
- `packages/ingest/src/cold/validate-load.ts` (new)
- `packages/ingest/src/cold/pg-client.ts` (new, F-01 repair)
- `packages/ingest/src/index.ts` - export `slugifyCode`, `toArticle` (edit)
- `packages/ingest/package.json` - add `pg`, `@types/pg`; add `load:corpus`,
  `validate:load` scripts (edit)
- `packages/shared/src/env.ts` + `.test.ts` (new, F-02/F-03 repair)
- `packages/shared/src/index.ts`, `packages/shared/src/providers/bedrock.ts`
  (edit, F-02 repair)
- `package.json` (root) - add `supabase` CLI as a dev dependency (edit)

## Data / contracts

**New, load-bearing - the `articles` and `subdivisions` tables.** Item 3's
`renvois` table foreign-keys against `articles.article_identifier`, item 4's
`chunks` table foreign-keys against both, item 11's API reads from both. Exact
DDL, snake_case columns per Postgres convention (the TS side keeps
`Article`/`Subdivision`'s camelCase; `packages/retrieval`, item 4, is where the
row-to-type mapping happens - out of scope here):

```sql
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
```

The `unique (article_identifier, ordre)` constraint on `subdivisions` doubles
as its foreign-key index (leading column covers lookups by
`article_identifier` alone), so no separate index is added.

- **New, load-bearing:** `slugifyCode(texteTitre: string): string` and
  `toArticle(row: ColdArticleRow): ... | null`
  (`packages/ingest/src/cold/to-article.ts`) - item 3 and later re-ingestion
  runs reuse `toArticle` rather than re-deriving these mapping decisions.
- **New, load-bearing:** `requireEnv(name: string): string`, exported from
  `@legirag/shared` (`packages/shared/src/env.ts`) - added mid-feature (F-02
  repair) after this feature pushed a previously-private copy in
  `bedrock.ts` to three duplicates. Future packages needing a fail-fast env
  var should import this instead of redefining it.
- **New:** `createDatabaseClient(): Client` (`packages/ingest/src/cold/pg-client.ts`)
  - registers `pg`'s date/timestamp/timestamptz type-parser overrides so
    these columns round-trip as the ISO strings `Article` expects, instead of
    `pg`'s default `Date` objects (F-01 repair). Any future `pg`-based code
    against this schema (there is none yet outside this feature) should be
    aware `pg.types` was mutated process-wide by importing this module.
- No changes to `packages/shared`'s locked `Article`/`Subdivision` shapes -
  this feature targets that exact shape.

## Testing

- `slugifyCode` and `toArticle` are pure logic with real edge cases (accents,
  apostrophes, null `article_num`, null `article_etat`, empty markdown) -
  covered by unit tests per the project's testing gate (`pnpm test`, already
  configured and declared in `AGENTS.md`).
- The migration (Step 1), load script (Step 3), and validation script
  (Step 4) run against the real corpus and the real connected Supabase
  project - not unit-tested, verified by their actual run's exit code, the
  MCP tool checks named in each step's done-when, and Step 4's printed
  output, same pattern as 2b's and 2c's `validate-*.ts` scripts.
- `requireEnv` (`packages/shared/src/env.ts`) got its own direct unit test
  (F-03 repair) covering both branches.

## Notes for the AI

- **Migration file naming:** use `YYYYMMDDHHMMSS_create_articles_subdivisions.sql`
  (e.g. via `date +%Y%m%d%H%M%S`), the Supabase CLI's own convention, so a
  later `supabase init` in this repo picks up the migration history in the
  right order even though no local CLI project exists yet.
- **Why `article_identifier text primary key`, not a `bigint identity`
  surrogate:** this deviates from the usual "prefer identity" guideline on
  purpose - `articleIdentifier` is already the join key `Subdivision`,
  `Renvoi`, and `Chunk` all carry in the locked data model
  (`packages/shared/src/types.ts`), so a surrogate key would just add an
  unnecessary join everywhere else in the schema without buying anything;
  LEGIARTI ids are stable and confirmed unique across the full corpus
  (157,174 distinct ids, zero duplicates, checked directly while scoping this
  feature).
- **Recovery from a failed or interrupted load run:** don't build retry
  logic. Because Step 3 upserts articles (`on conflict ... do update`) and
  fully replaces each batch's subdivisions (`delete` then re-`insert`), simply
  re-running the script to completion after any failure converges to the
  correct end state - no partial-row cleanup needed.
- **Why `article_etat: null` maps to `'VIGUEUR'`, not a fourth state:**
  confirmed directly against the persisted corpus while scoping this feature -
  among the 157,174 `CODE` rows, `article_etat` is only ever `'VIGUEUR'`
  (157,158 rows) or `null` (16 rows, real articles with valid `article_num`
  values like `L381-2`, not the placeholder rows). COLD only snapshots texts
  currently in force, so there's no signal these 16 are anything other than a
  metadata gap on otherwise-current articles. `MODIFIE`/`ABROGE` become real
  once item 10 adds historical versions; nothing in this feature's data can
  produce them.
- **Why a null `article_num` row is skipped, not loaded with a placeholder:**
  confirmed directly against the corpus - exactly 3 rows, all
  chapter-placeholder text ("Le présent chapitre ne comporte pas de
  dispositions législatives."), no overlap with the 16 null-`etat` rows.
  `article_num` is how the build plan itself defines this feature's
  acceptance bar ("queryable by article number"), so a row that has none
  isn't a queryable article in the sense that matters here.
- **77 distinct `texte_titre` values, not the ~73 codes the project overview
  mentions:** confirmed directly against the corpus, includes cases like both
  `"Code forestier"` and `"Code forestier (nouveau)"` present as genuinely
  separate rows. Not a defect to fix in this feature - load every distinct
  title as its own `code`/`code_slug`, no deduplication. Worth a one-line
  mention if it comes up later, not a blocker here.
- **`article_num` collides across codes** (confirmed: 21,358 of 105,119
  distinct values appear under more than one code, e.g. `"R142-11"` in 9
  different codes) - it is never a candidate key on its own. The composite
  index is `(code_slug, article_num)`; `article_identifier` stays the only
  primary key.
- **Why `pg` directly, not `@supabase/supabase-js`:** this is a one-off bulk
  load of 157k+ rows plus their subdivisions, run against `DATABASE_URL` (the
  direct Postgres connection already documented in `.env.example` for exactly
  this purpose), not a request the running app serves - no need for the
  PostgREST layer or its auth headers. `packages/retrieval` (item 4) is where
  `@supabase/supabase-js` or an equivalent client belongs, behind the
  `Retriever` interface.
- Follow `packages/shared`'s `smoke` script precedent
  (`tsx --env-file=../../.env`) for both new scripts that need `DATABASE_URL` -
  don't add a `dotenv` dependency.
- Match `packages/ingest/src/cold/`'s existing comment convention: French,
  since these files describe French legal-text ingestion decisions specific
  to this domain (see `section-path.ts`, `subdivisions.ts`).
- Never `Read` `cold-corpus.ndjson` in full (157k lines) while building or
  reviewing this - use `wc -l`, `grep`, small `head`/sample reads, or a
  script's own streaming pass, same rule 2c followed.
- The RLS policies added here are intentionally minimal (`select using
  (true)`, no insert/update/delete policy for anon/authenticated - only a
  direct `DATABASE_URL` connection or the service-role key can write). Don't
  read this as item 4's access-control work being done; flag it explicitly as
  a placeholder in any summary of this feature.
- **Migration tooling, mid-feature correction:** Step 1 was first applied via
  the Supabase MCP server's `apply_migration` tool with a hand-written local
  file. At the user's explicit request, this was redone end-to-end with the
  official Supabase CLI (`supabase` added as a repo dev dependency,
  `supabase init` / `login` / `link` / `migration new` / `db push`), after
  first dropping the tables and clearing the remote migration-history row
  created by the MCP path. The final schema is identical either way; only the
  application mechanism changed. Future schema changes on this project should
  use the CLI flow (`supabase migration new <name>`, edit the generated file,
  `supabase db push`), not `apply_migration`.

## Findings

- **02d/F-01** [P1] closed - `pg`'s default type parser returned
  `articles.date_debut`/`date_fin`/`updated_at` as JS `Date` objects, not the
  ISO strings the locked `Article.dateDebut`/`dateFin`/`updatedAt: string`
  contract requires - confirmed live against the real database, not
  speculative. Nothing shipped in this feature read the columns back, so
  nothing was broken yet, but item 4's `Retriever` and item 11's API would
  have inherited the bug silently (a runtime driver behavior TypeScript can't
  see). Found 2026-08-14 by `/audit`. Fixed by adding
  `packages/ingest/src/cold/pg-client.ts` (`createDatabaseClient()`),
  registering `pg` type-parser overrides for `date`/`timestamp`/`timestamptz`
  (OIDs 1082/1114/1184); both `load-corpus.ts` and `validate-load.ts` now use
  it instead of constructing their own `Client`. Closed 2026-08-14 after a
  fresh `/audit` pass independently re-ran the same live query (3 rows, all
  three columns) and confirmed strings, not `Date` objects, with no new
  defect introduced.
- **02d/F-02** [P2] closed - `requireEnv` (fail-fast env var read) was
  duplicated three times: the pre-existing copy in `bedrock.ts` plus one each
  freshly written for `load-corpus.ts` and `validate-load.ts` - this feature
  is what pushed the count from one to three. Found 2026-08-14 by `/audit`.
  Fixed by extracting it to `packages/shared/src/env.ts`, exported from the
  package; `bedrock.ts` and both `ingest` scripts (the latter transitively
  via `pg-client.ts`) now share the one definition. Closed 2026-08-14 after a
  fresh `/audit` pass confirmed `rg "function requireEnv"` finds exactly one
  definition and re-read all four call sites.
- **02d/F-03** [P3] closed - the newly-extracted `packages/shared/src/env.ts`
  (F-02's fix) had no direct unit test of its own, only indirect coverage via
  `bedrock.test.ts`'s tests of `bedrockProvider` - inconsistent with this
  same feature's `to-article.ts`, which got a direct test for equivalent pure
  logic. Found 2026-08-14 by `/audit`. Fixed by adding
  `packages/shared/src/env.test.ts` covering both branches (throws when
  unset, returns the value when set). Closed 2026-08-14 after a fresh
  `/audit` pass re-read the test file and re-ran the full suite
  independently (55/55).

# Feature: Hierarchical path parser

**From build-plan:** feature 2b (sub-feature of 2 - Legal corpus in the database)
**Status:** complete

## Goal

Turn each COLD article's `texte_contexte` field into `sectionPath` - the
ordered `text[]` of hierarchy segments (part/book/title/chapter/section/...)
that 2d will store as `articles.section_path` and later features (contextual
chunking, the answer screen's breadcrumb) will read directly. Pure parsing
logic, no DB or subdivision work.

## In scope

- `parseSectionPath(texteContexte: string): string[]` - splits `texte_contexte`
  into its hierarchy segments and collapses same-level rename duplicates (see
  Notes for the AI)
- Unit tests covering the header combinations the real corpus actually
  contains (verified against the full local `cold-corpus.ndjson`, not assumed)
- A validation script that runs the parser over the full persisted corpus and
  reports distribution stats, so any shape the unit tests didn't anticipate
  surfaces now instead of during 2d's load

## Out of scope

- Creating `articles`/`subdivisions` tables or loading anything into Supabase
  (2d) - this feature only produces the `string[]`, it doesn't persist it
- Extracting subdivisions (`I`, `1°`, alinéas) from `article_contenu_markdown` (2c)
- Classifying each segment by level type (Partie vs. Livre vs. Titre, ...) -
  `sectionPath` per `project-overview.md` is an unlabeled ordered `string[]`,
  not a typed structure
- Re-deriving hierarchy from anything other than `texte_contexte` - the field
  already contains the full breadcrumb (confirmed in 2a / the technical brief)

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Implement `parseSectionPath`, unit tested** - add
  `packages/ingest/src/cold/section-path.ts` exporting
  `parseSectionPath(texteContexte: string): string[]`: split on `\n`, trim
  each line, drop blank lines, then collapse consecutive segments that share
  the same label prefix (the text before the segment's first `:`, normalized
  for case/whitespace) into just the last one in the run - see Notes for the
  AI for why. Export it from `packages/ingest/src/index.ts`.
  *Done when:* `pnpm test` passes `section-path.test.ts` covering: a path with
  every level (Partie -> Livre -> Titre -> Chapitre -> Section -> Sous-section),
  a path with no `Partie`, a path with no `Sous-section`, a path with accents
  and roman numerals, a degenerate one-segment path, a two-segment rename
  collapse (same prefix, different title, keep the later one), a
  multi-segment rename chain (3+ consecutive renames collapse to one), a
  Code-général-des-impôts-style path where adjacent segments use unrelated
  short labels (`I`, `2`, `B`, `2 bis`, ...) that must **not** collapse since
  they are genuinely different levels, and whitespace/punctuation noise
  (double spaces, trailing period) that shouldn't break the split.
- [x] **Step 2 - Validate at scale against the real corpus** - add
  `packages/ingest/src/cold/validate-section-paths.ts` (run via `tsx`, wired
  as `pnpm --filter @legirag/ingest validate:section-paths`), which streams
  `packages/ingest/.data/cold-corpus.ndjson` line by line, calls
  `parseSectionPath` on every row's `texte_contexte`, and logs: total rows,
  min/max/average output length, and how many rows had at least one
  rename-collapse applied. It exits non-zero and prints the offending
  `article_identifier` if any row produces an empty array.
  *Done when:* running it against the full local corpus (157,174 `CODE` rows)
  completes with exit code 0 and zero empty-array rows, and the printed stats
  are sane (output length between 1 and roughly a dozen; collapsed-row count
  in the tens of thousands, consistent with Step 1's rename test cases).
- [x] **Step 3 - Repair F-08** - extract the `.data` path resolution
  (`packageRoot`/`rawDataDir`/`coldCorpusPath`) duplicated across
  `inspect-cold.ts`, `fetch-cold.ts`, and `validate-section-paths.ts` into a
  shared `packages/ingest/src/cold/data-paths.ts`; export the raw
  split/trim/filter step from `section-path.ts` as `splitContextSegments` and
  have `validate-section-paths.ts` call it instead of re-deriving "raw
  segment count" inline, so the collapse stat can never silently drift from
  `parseSectionPath`'s own tokenization rule.
  *Done when:* `pnpm test`, `pnpm typecheck`, `pnpm lint` all still pass;
  `pnpm --filter @legirag/ingest validate:section-paths` still reports the
  same stats against the real corpus (157,174 rows, 33.8% collapsed, zero
  empty rows); no file still computes the `.data` path independently.

## Files / areas

- `packages/ingest/src/cold/section-path.ts` - `parseSectionPath`,
  `splitContextSegments` (new)
- `packages/ingest/src/cold/section-path.test.ts` - unit tests (new)
- `packages/ingest/src/cold/validate-section-paths.ts` - full-corpus
  validation script (new)
- `packages/ingest/src/cold/data-paths.ts` - shared `.data` path resolution (new)
- `packages/ingest/src/cold/fetch-cold.ts` - use `data-paths.ts` (edit)
- `packages/ingest/src/cold/inspect-cold.ts` - use `data-paths.ts` (edit)
- `packages/ingest/src/index.ts` - export `parseSectionPath` (edit)
- `packages/ingest/package.json` - add the `validate:section-paths` script (edit)

## Data / contracts

- **New, load-bearing:** `parseSectionPath(texteContexte: string): string[]`
  (`packages/ingest/src/cold/section-path.ts`) - 2d imports this directly to
  populate `articles.section_path` (`text[] NOT NULL` per the technical
  brief's schema). Internal to `packages/ingest` for now, exported from the
  package like `ColdArticleRow` was in 2a.
- No new cross-package (`packages/shared`) contracts - `sectionPath` is
  already typed as `string[]` on the `Article` shape.

## Testing

- `parseSectionPath` and `splitContextSegments` are pure logic with real edge
  cases (missing levels, rename collapses, non-colon labels) - covered by
  unit tests per the project's testing gate (`pnpm test`, already configured
  and declared in `AGENTS.md`). 11 tests total in `section-path.test.ts`.
- Step 2 runs against a real local file (157k rows) - not itself unit-tested;
  verified by the actual run's exit code and logged stats, same pattern as
  2a's `inspect-cold.ts`.

## Notes for the AI

- **`texte_contexte` is already newline-delimited in the real data** - every
  one of the 157,174 `CODE` rows in the local corpus contains `\n` between
  segments. `docs/private/3-FEUILLE-DE-ROUTE.md` §2.3 describes splitting on
  level keywords (`Partie`, `LIVRE`/`Livre`, `TITRE`/`Titre`, ...) instead;
  that assumption predates inspecting the real field and doesn't match it -
  don't implement keyword-splitting.
- **Why the rename collapse exists:** COLD is a `VIGUEUR`-only snapshot (no
  history), but roughly a third of rows still carry consecutive segments at
  the same level with different wording - e.g. `"Livre III : ... RETRAITE DU
  COMBATTANT ..."` immediately followed by `"Livre III : ... ALLOCATION DE
  RECONNAISSANCE DU COMBATTANT ..."`. This is the level's title before and
  after a legislative rename, both left in the field, oldest first. Keeping
  only the last of each run yields the current title. Compare on the label
  prefix (text before the first `:`), not a hardcoded keyword list - the Code
  général des impôts nests real, distinct levels with short non-keyword
  labels (`I`, `2`, `B`, `2 bis`, ...) right next to each other, and those
  must not be merged just because they lack a recognized level word.
- Keep this step to parsing only - no DB schema, no Supabase load (2d), no
  subdivision extraction (2c).
- Never `Read` `cold-corpus.ndjson` in full (157k lines) while building or
  reviewing this - use `wc -l`, `grep`, or small `head`/sample reads, and let
  Step 2's script do the real full-file pass at the Node level.

## Findings

- **02b/F-07** [P3] closed - `ensureShardsDownloaded` (from feature 2a) could
  cache a truncated parquet shard as if it were complete. Found 2026-08-13 by
  /audit (scope: current, during feature 2a). Fixed by writing each shard to
  a `.tmp` path and renaming on success, removing `.tmp` and rethrowing on
  error. Closed 2026-08-14 by /audit during this feature: re-read the full
  `ensureShardsDownloaded` function (touched incidentally while fixing
  02b/F-11's em dash in the neighboring comment) and confirmed the
  write/rename/cleanup sequence is unchanged and correct.
- **02b/F-08** [P3] closed - `validate-section-paths.ts` duplicated the
  `.data` path resolution (now written a third time across the package) and
  re-derived `parseSectionPath`'s own split/trim/filter rule inline just to
  detect a rename collapse, risking silent drift between the two
  definitions of "a raw segment". Found and fixed 2026-08-14 by /audit and
  /implement: extracted `packages/ingest/src/cold/data-paths.ts` as the
  single path helper, and exported `splitContextSegments` from
  `section-path.ts` for the script to reuse instead of re-implementing it.
  Verified against the full 157,174-row corpus (identical stats before and
  after). Closed 2026-08-14 after a fresh /audit pass re-confirmed no
  remaining duplication and no regression.
- **02b/F-09** [P2] closed - Step 3's build-step checkbox in
  `current-feature.md` was left unchecked after the step was implemented,
  tested, and committed, which would have broken the checklist-based
  resume-after-context-clear mechanism documented in `ai-interaction.md`.
  Found 2026-08-14 by /audit. Fixed by checking the box. Closed 2026-08-14
  after a fresh /audit pass re-read the file and confirmed all three steps
  show `[x]`.
- **02b/F-10** [P3] closed - `section-path.ts`'s top comment pointed at
  `current-feature.md` for a worked example, which `/complete` resets to a
  stub - the pointer would have gone stale as soon as this feature closed.
  Found 2026-08-14 by /audit. Fixed by inlining the example directly in the
  comment instead. Closed 2026-08-14 after a fresh /audit pass confirmed the
  comment is self-contained.
- **02b/F-11** [P3] closed - Em dashes in comments across
  `packages/ingest/src/` (mostly pre-existing from feature 2a), against
  `coding-standards.md`'s "no em-dash" writing rule. Found 2026-08-14 by
  /audit while fixing 02b/F-10. Fixed at the user's explicit request: swept
  every em dash to a hyphen across `packages/ingest/src/` (`types.ts`,
  `inspect-cold.ts`, `hf-source.ts`, `index.ts`, `filter.test.ts`,
  `section-path.ts`). Deliberately left the same pattern in other packages
  (`agent`, `api`, `retrieval`, `shared`, `mcp`, `web`) untouched as
  unrelated scope creep - tracked separately as F-12. Closed 2026-08-14 after
  a fresh /audit pass confirmed zero remaining source matches in
  `packages/ingest/src/`.

`F-01` (`.env.example` model-ID comment) and `F-12` (em dashes outside
`packages/ingest`) are unrelated to this feature and stay open in the live
ledger (`blueprint/context/findings.md`).

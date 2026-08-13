# Feature: COLD corpus acquisition and filtering

**From build-plan:** feature 2a (sub-feature of 2 - Legal corpus in the database)
**Status:** complete

## Goal

Get the COLD French Law dataset (`harvard-lil/cold-french-law`, 841,761 rows on
Hugging Face) onto disk as one clean, versioned, reusable file: only the rows
that are actual legal codes, without the five unused English translation
columns. Every later corpus step (hierarchy parsing, subdivision extraction,
DB load) reads this one artifact instead of re-fetching or re-filtering
841k rows each time - the project's ingestion rule is that costly
intermediate artifacts are always persisted, never recomputed.

## In scope

- Fetching the dataset from Hugging Face (parquet)
- Verifying the dataset's real shape before writing any parsing logic against
  it (columns, `texte_nature` values, confirming `article_etat` really is
  single-valued `VIGUEUR` as the technical brief claims, `article_date_fin`'s
  distinct values, distinct code count) - checked against real data, not
  assumed from the brief
- A `ColdArticleRow` type + Zod schema for the 17 columns that matter (i.e.
  the real COLD schema minus the 5 `*_en` columns and the `Unnamed: 0` index
  column)
- Filtering to `texte_nature === 'CODE'` (the dataset also contains 15 other
  `texte_nature` values that are not codes)
- Persisting the filtered, validated rows as NDJSON at
  `packages/ingest/.data/cold-corpus.ndjson` (gitignored - this is a large
  local build artifact, not source)

## Out of scope

- Parsing `texte_contexte` into a hierarchical path (2b)
- Extracting subdivisions from the markdown content (2c)
- Creating the Postgres schema or loading anything into Supabase (2d)
- The LEGI XML historical dumps (palier profondeur - build-plan item 10);
  COLD only ever carries `VIGUEUR`, so no version history exists in this data
- KALI ingestion (optional, deferred branch)

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Inspect the source and lock the row type** - add
  `packages/ingest/src/cold/inspect-cold.ts` (run via `tsx`), which fetches
  the COLD dataset from Hugging Face and logs: total row count,
  `Counter(texte_nature)`, `Counter(article_etat)`,
  `Counter(article_date_fin)`, and the distinct `texte_titre` (code) count.
  From the confirmed real columns, define `ColdArticleRow` (type + Zod
  schema, the 17 non-English columns) in `packages/ingest/src/cold/types.ts`.
  *Done when:* the script runs against the live dataset and prints all five
  diagnostics; `article_etat` is confirmed single-valued `VIGUEUR` in the
  logged output (not assumed); `pnpm typecheck` passes for the new schema.
- [x] **Step 2 - Filter and validate, unit tested** - `filterColdRows(rows:
  unknown[]): ColdArticleRow[]` in `packages/ingest/src/cold/filter.ts`:
  keeps only rows where `texte_nature === 'CODE'`, and validates each kept
  row against the `ColdArticleRow` Zod schema, throwing on the first row that
  fails (a schema drift here should stop ingestion, not silently drop data).
  *Done when:* `pnpm test` covers a fixture with a `CODE` row, a non-`CODE`
  row, and a `CODE` row missing a required field, asserting the function
  keeps only the valid `CODE` row and throws on the malformed one.
- [x] **Step 3 - Persist the intermediate artifact** - add
  `packages/ingest/src/cold/fetch-cold.ts`, wired as `pnpm --filter
  @legirag/ingest fetch:cold`, which runs the real fetch, applies Step 2's
  filter, and writes one `ColdArticleRow` JSON object per line to
  `packages/ingest/.data/cold-corpus.ndjson`. Add `packages/ingest/.data/` to
  `.gitignore`. Export `ColdArticleRow` from the package so 2b/2c/2d can
  import it. *Done when:* running the script end-to-end against the live
  dataset produces the NDJSON file; the logged row count matches the
  `CODE`-only count from Step 1's diagnostics; manually looking up 3 known
  articles by `article_num` in the file finds the expected text and code
  title.

## Files / areas

- `packages/ingest/src/cold/types.ts` - `ColdArticleRow` type + Zod schema (new)
- `packages/ingest/src/cold/inspect-cold.ts` - diagnostic script (new)
- `packages/ingest/src/cold/filter.ts` + `filter.test.ts` - filter/validate logic (new)
- `packages/ingest/src/cold/fetch-cold.ts` - fetch + persist CLI entry (new)
- `packages/ingest/src/cold/hf-source.ts` - Hugging Face parquet-shard download/cache (new)
- `packages/ingest/src/index.ts` - export `ColdArticleRow` (edit)
- `packages/ingest/package.json` - add `tsx`, `hyparquet`, `zod` deps and the
  `inspect:cold`/`fetch:cold` scripts (edit)
- `.gitignore` - add `packages/ingest/.data/` (edit)

## Data / contracts

- **New, load-bearing:** `ColdArticleRow` (`packages/ingest/src/cold/types.ts`)
  - type + Zod schema for the raw COLD row shape, confirmed against the live
    dataset in Step 1, not assumed from the technical brief
  - internal to `packages/ingest` (not `packages/shared`) - it is a
    source-specific external payload shape, not a cross-package contract
  - 2b (hierarchy parser) and 2c (subdivision extractor) will consume this
    type directly, and the NDJSON file it describes, so its field names and
    optionality must be right the first time
- **New artifact:** `packages/ingest/.data/cold-corpus.ndjson` - one
  `ColdArticleRow` per line, gitignored, the reusable input for 2b/2c/2d

## Testing

- Step 2's `filterColdRows` is pure logic with real edge cases (wrong
  `texte_nature`, malformed row, nullable `article_num`/`article_etat`) -
  covered by unit tests, per the project's testing gate (`pnpm test` is
  configured and declared in `AGENTS.md`). 5 tests in `filter.test.ts`.
- Steps 1 and 3 call a real external service (Hugging Face) and write a real
  file - not unit-testable in the parser/validator sense. Verified with the
  actual run: the logged diagnostics (Step 1) and the logged row count plus a
  manual spot check of 3 known articles in the NDJSON output (Step 3).

## Notes for the AI

- **This is a programmatic transform, not something the AI reads through
  itself.** 841,761 rows must never pass through the model's own context -
  neither the raw dataset nor the filtered/persisted NDJSON. Write and run
  code (`inspect-cold.ts`, `filterColdRows`, `fetch-cold.ts`) that does the
  fetching, counting, filtering, and writing at the Node process level. The
  AI only ever needs to look at a handful of sample rows: to confirm the
  schema by eye in Step 1's logged output, and to build the small fixtures
  for Step 2's unit test. Never `Read` the generated `cold-corpus.ndjson`
  file in full - verify it with `wc -l`, `grep`, or a small `head` sample
  instead.
- Keep COLD's original French column names on `ColdArticleRow`
  (`article_identifier`, `texte_nature`, ...) - matches the project's
  convention of not translating domain vocabulary (see
  `coding-standards.md`).
- This step only fetches, filters, and persists - it does not parse
  `texte_contexte` or the markdown content. Don't let hierarchy or
  subdivision logic creep in here; that's 2b and 2c.
- The technical brief (`docs/private/2-CAHIER-DES-CHARGES-TECHNIQUE.md §3.1`,
  local-only, not tracked in git) flags known OCR noise in the source text
  (e.g. a stray capital mid-word). This step doesn't touch content, but don't
  assume the text is clean in anything written here either.
- For the Hugging Face fetch, prefer a pure-JS parquet reader with no native
  bindings (e.g. `hyparquet`) over anything requiring a native/Python
  toolchain - the monorepo is TypeScript-only end to end. Confirm the actual
  file layout (single file vs. sharded) against the live dataset in Step 1
  before committing to a download strategy.
- `packages/ingest/.data/` will hold a large file (the dataset filters down
  from 841,761 rows, but a fraction of those are still likely tens of
  thousands of full-text articles) - keep it gitignored, never commit it.

## Findings

- **02a/F-02** [P1] closed - fetch-cold.ts leaves a truncated NDJSON file on
  any mid-run failure. Found 2026-08-13 by /audit (scope: current). Fixed by
  writing to a `.tmp` path and renaming on success, removing the `.tmp` and
  rethrowing on error; verified live (clean run still correct, forced
  mid-run failure leaves the prior good file untouched). Closed 2026-08-13
  by /audit after re-reading the repaired code fresh.
- **02a/F-03** [P2] closed - fetch-cold.ts decoded all 23 parquet columns
  instead of the 17 that survive filtering, wasting decode work on the 5
  unused `*_en` columns and inconsistent with `inspect-cold.ts`'s own
  pattern. Found 2026-08-13 by /audit (scope: current). Fixed by projecting
  `parquetReadObjects` to `Object.keys(ColdArticleRow.shape)`; verified
  output byte-identical (SHA1 match) to the prior run. Closed 2026-08-13 by
  /audit.
- **02a/F-04** [P2] closed - no regression test locked in the nullable
  `article_num`/`article_etat` acceptance that a live run discovered was
  required (a `CODE` row with `article_num: null` crashed the first real
  `fetch:cold` run). Found 2026-08-13 by /audit (scope: current). Fixed by
  adding two test cases to `filter.test.ts` (18 tests total, was 16). Closed
  2026-08-13 by /audit.
- **02a/F-05** [P3] closed - the Hugging Face parquet-list API response was
  cast (`as ParquetFileList`) instead of validated with Zod, against the
  project's own external-payload rule. Found 2026-08-13 by /audit (scope:
  current). Fixed with a Zod schema scoped to the `csv.train` shape actually
  used; verified against the real API response. Closed 2026-08-13 by /audit.
- **02a/F-06** [P3] closed - `current-feature.md`'s spec text still claimed
  15 columns / 6 English columns after Step 1's own verification found 17/5.
  Found 2026-08-13 by /audit (scope: current). Fixed by updating the Goal, In
  scope, and Step 1 passages. Closed 2026-08-13 by /audit.

`02a/F-07` [P3] (`ensureShardsDownloaded` can cache a truncated shard the
same way `cold-corpus.ndjson` could) was fixed in this feature but had not
yet been re-reviewed by `/audit` at completion time, so it stays in the live
ledger (`blueprint/context/findings.md`) rather than archiving here.

## Post-implementation notes

Step 1's live verification found the technical brief's COLD schema claims
were off in several ways the brief presented as settled: 17 real columns
(not 15, missed `texte_num_parution_jo`), `article_etat` null on 210,669 of
841,761 rows overall (16 of the 157,174 `CODE` rows), and 77 distinct codes
(not exactly 73). A second real-data surprise - 3 `CODE` rows with
`article_num: null`, all placeholder chapters ("Le présent chapitre ne
comporte pas de dispositions législatives") - only surfaced when `fetch-cold.ts`
ran against the full dataset for real and crashed partway through, which is
what led to the `article_num`/`article_etat` fields being `.nullable()`
rather than assumed non-null.

Fetching the dataset also hit Hugging Face's anonymous rate limit
mid-exploration; `hf-source.ts`'s retry logic reads the exact reset time from
the `ratelimit` response header rather than guessing a backoff, and shards
are downloaded as whole files (one GET each) rather than column-projected
range requests, which is what triggered the limit in the first place.

Two `/audit` passes ran after the build steps: the first found and fixed
five issues (02a/F-02 through 02a/F-06, above); a second fresh pass (not
scoped to just re-checking those five) found one more of the same class
(02a/F-07, fixed but not yet re-audited at completion time).

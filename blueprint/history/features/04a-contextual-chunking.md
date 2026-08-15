# Feature: Contextual chunking

**From build-plan:** feature 4a (sub-feature of 4 - Search index and access-control policies)
**Status:** complete

## Goal

Turn each loaded article (plus its subdivisions) into the chunk texts that
4b will embed and index: one chunk per subdivision when they exist, one
chunk for the whole article otherwise, each prefixed with its full
hierarchical context so the embedding never loses which code and section it
belongs to. This is a pure, unit-tested transform - no table, no embeddings,
no database write yet. It closes out cahier des charges technique §3.5 and
roadmap task 4.1, and is what 4b's embedding/load step consumes directly.

## In scope

- `packages/ingest/src/cold/chunking.ts`: an `ExtractedChunk` type
  (`subdivisionLabel?: string`, `contenu: string` - the pre-persistence shape,
  named like `ExtractedSubdivision`/`ExtractedRenvoi` so it can sit next to
  the locked `Chunk` from `packages/shared` without colliding) and a pure
  `chunkArticle` function producing the exact prefix format from §3.5:
  `[code, ...sectionPath].join(' › ')`, a newline, then
  `Article {articleNum}` (append `, {subdivisionLabel}` when the chunk is a
  subdivision), a blank line, then the content
- Chunk unit: the subdivision when subdivisions exist (one chunk per
  subdivision, each carrying only that subdivision's own `contenu`, sorted by
  `ordre` regardless of input order), the whole article
  (`article.contenuText`) when it has none
- A validation script proving the shape holds on the real corpus: chunk-count
  distribution (min/max/avg per article), no empty-content chunks, and a
  handful of full chunk texts printed for a manual eyeball check against the
  §3.5 example format

## Out of scope

- Persisting chunks anywhere, the `chunks` table, or its indexes (4b)
- Generating or storing embeddings (4b), keyword (`tsv`) indexing (4b), RLS
  (4c), and the `Retriever` implementation (4d)
- Further splitting a long subdivision or article by token/character length -
  §3.5 fixes the chunk unit at subdivision-or-article with nothing smaller;
  if a chunk turns out too long for embed-v4's limit in practice, that surfaces
  and gets measured in 4b/6, not guessed at here
- Re-deriving subdivisions from markdown - this feature consumes whatever
  subdivisions it's given (2c's `extractSubdivisions` output shape, or later
  the persisted `subdivisions` rows in 4b), it doesn't re-implement extraction

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `chunkArticle`, unit tested** - add
  `packages/ingest/src/cold/chunking.ts` exporting `ExtractedChunk` and
  `chunkArticle(article: Pick<Article, 'code' | 'sectionPath' | 'articleNum' | 'contenuText'>, subdivisions: ExtractedSubdivision[]): ExtractedChunk[]`.
  No subdivisions -> one chunk, `subdivisionLabel: undefined`, content is
  `article.contenuText`. One or more subdivisions -> one chunk per
  subdivision (sorted by `ordre`), `subdivisionLabel` set to the
  subdivision's `label`, content is that subdivision's own `contenu`. Every
  chunk's `contenu` starts with `[code, ...sectionPath].join(' › ')`, a
  newline, `Article {articleNum}` (plus `, {subdivisionLabel}` for a
  subdivision chunk), a blank line, then the content. Export from
  `packages/ingest/src/index.ts`.
  *Done when:* `pnpm test` passes new cases in `chunking.test.ts`: an
  article with no subdivisions produces exactly one chunk whose prefix and
  body match the §3.5 example format; an article with subdivisions produces
  one chunk per subdivision, each with its own `Article {num}, {label}` line
  and only that subdivision's content (not the full article text);
  subdivisions passed out of `ordre` order still come out sorted; an empty
  `sectionPath` still produces a valid prefix (just the code name, no
  dangling separator).
- [x] **Step 2 - Validate at scale against the real corpus** - add
  `packages/ingest/src/cold/validate-chunking.ts`
  (`tsx src/cold/validate-chunking.ts`, wired as
  `pnpm --filter @legirag/ingest validate:chunking`): streams
  `cold-corpus.ndjson` once (same `coldCorpusPath` streaming pattern as
  `validate-subdivisions.ts`), running `toArticle` then `extractSubdivisions`
  then `chunkArticle` per row, and reports total chunks produced, the
  with-subdivisions vs. without-subdivisions split, chunks-per-article
  min/max/average (among articles with subdivisions), and prints 3 full
  example chunk texts (one without subdivisions, two with) for a manual read
  against the §3.5 format. Fails loudly (non-zero exit, listing up to 20
  identifiers) if any chunk's `contenu` is empty or missing its `Article `
  line.
  *Done when:* running it against the full local corpus completes with exit
  code 0, the summary numbers are printed, and the 3 printed examples read
  correctly on manual inspection (right code, right hierarchy path, right
  article/subdivision line, right body text).
- [x] **Repair F-01 - use `streamColdCorpus` instead of a hand-rolled read loop**
  - `validate-chunking.ts` re-implemented the `createReadStream` +
    `createInterface` + `ColdArticleRow.parse` + `toArticle` loop that
    `corpus-stream.ts`'s `streamColdCorpus()` already centralizes (added in
    3b's Repair F-02 for exactly this reason). Switched to
    `for await (const { row, article } of streamColdCorpus())`, dropping the
    now-unused `createReadStream`/`createInterface`/`coldCorpusPath`/
    `ColdArticleRow`/`toArticle` imports.
  *Done when:* `pnpm typecheck`/`lint`/`test` stay green and
  `validate:chunking` reproduces the identical summary (157171 articles,
  122398/34773 split, 318747 chunks) against the real corpus.
- [x] **Repair F-02 - one `noUncheckedIndexedAccess` idiom, not two**
  - Replaced `exemplesAvecSubdivision.push(...chunks.slice(0, 1))` with the
    same `const x = arr[0]; if (x) ...` pattern already used two lines above
    for `exempleSansSubdivision`.
  *Done when:* same evidence as F-01 (shared verification pass).

## Files / areas

- `packages/ingest/src/cold/chunking.ts` (new)
- `packages/ingest/src/cold/chunking.test.ts` (new)
- `packages/ingest/src/cold/validate-chunking.ts` (new)
- `packages/ingest/src/index.ts` (export the new module)
- `packages/ingest/package.json` (new `validate:chunking` script)

## Data / contracts

- `ExtractedChunk` (new, ingest-local, pre-persistence): `{ subdivisionLabel?:
  string; contenu: string }` - mirrors the locked `Chunk` type in
  `packages/shared/src/types.ts` minus `id`, `articleIdentifier`, and
  `embedding`, which only exist once a chunk is loaded (4b), same relationship
  `MappedArticle`/`ExtractedSubdivision` already have to their DB-row
  counterparts.
- `chunkArticle`'s `subdivisions` parameter is typed as `ExtractedSubdivision[]`
  (2c's `{ label, ordre, contenu }`), not the DB-row `Subdivision[]` - when 4b
  reads persisted subdivisions rows back from Postgres it can pass them
  straight through unchanged, since `Subdivision` is a structural superset
  (extra `id`/`articleIdentifier` fields don't break the call).
- No new database schema, no changes to `packages/shared`.

## Testing

- `chunkArticle` is pure logic with real edge cases (no subdivisions, several
  subdivisions, out-of-order input, empty `sectionPath`) - in scope for the
  test gate, covered by `chunking.test.ts` per Step 1's done-when.
- `validate-chunking.ts` is a corpus-scale sanity script, not unit-testable
  logic - verified by running it and reading its output, same as
  `validate-subdivisions.ts`/`validate-section-paths.ts` before it.

## Notes for the AI

- Follow the existing ingest conventions exactly: `ExtractedSubdivision` and
  `MappedArticle` are the templates for `ExtractedChunk`'s naming and doc
  comments, `validate-subdivisions.ts` is the template for
  `validate-chunking.ts`'s streaming and reporting style.
- The separator is U+203A (›) with a space on each side, matching the
  cahier des charges technique §3.5 example literally.
- Don't reach for the database or `packages/retrieval` in this feature - 4b
  (schema, embeddings, indexes), 4c (RLS), and 4d (the `Retriever`) are
  separate `/feature` runs that build on this one.

## Findings

- **04a/F-01** [P2] closed - `validate-chunking.ts` re-implemented the
  `createReadStream`/`createInterface`/`ColdArticleRow.parse`/`toArticle`
  corpus-read loop that `corpus-stream.ts`'s `streamColdCorpus()` already
  centralizes (added in 3b's Repair F-02 for exactly this reason). Found
  2026-08-15 by `/audit`. Fixed by switching to
  `for await (const { row, article } of streamColdCorpus())` and dropping the
  five now-unused imports. Closed 2026-08-15 after a fresh `/audit` pass
  confirmed the manual loop is gone, `validate:chunking` reproduces the
  identical summary against the real corpus, and no new defect was introduced.
- **04a/F-02** [P3] closed - two different `noUncheckedIndexedAccess`
  workarounds six lines apart in `validate-chunking.ts` (`chunks[0] ?? null`
  vs. `.push(...chunks.slice(0, 1))`) for the identical situation. Found
  2026-08-15 by `/audit`. Fixed by using the same `const x = arr[0]; if (x)
  ...` pattern at both call sites. Closed 2026-08-15 after a fresh `/audit`
  pass confirmed both sites now match and no new defect was introduced.

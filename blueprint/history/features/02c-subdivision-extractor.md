# Feature: Subdivision extractor

**From build-plan:** feature 2c (sub-feature of 2 - Legal corpus in the database)
**Status:** complete

## Goal

Turn each COLD article's `article_contenu_markdown` field into an ordered list
of subdivisions (`I`, `II`, `1°`, `2°`, `a)`, `b)`, and nested combinations
like `I, 1°, a)`) that 2d will load into the `subdivisions` table, and that
later chunking (feature 4/6) will use to chunk "the subdivision when it
exists, the article otherwise" per the technical brief. Pure parsing logic,
no DB or Supabase load.

The three levels in scope (`I`/`II` Roman numerals, `1°`/`2°` enumeration,
`a)`/`b)` lettered enumeration) are exactly the official hierarchy defined by
Légifrance's own drafting guide (fiche 3.2.2 "Division du texte" - the guide
that governs how the texts we're parsing are written in the first place), not
a guess: "Les énumérations sont présentées en premier niveau avec 1°, 2°,
3°…, puis en deuxième niveau avec a), b), c),… et en troisième niveau avec un
tiret." Confirmed against the real corpus during spec'ing this feature:
5,555 rows use the `a)`/`b)`/`c)` marker, always at a genuine block start,
zero collisions found with wrapped citation prefixes (unlike the
uppercase-letter pattern some pre-2000 texts use instead - see Notes for the
AI).

## In scope

- `splitContentBlocks(markdown: string): string[]` - normalizes
  `article_contenu_markdown`'s line-wrapped text into real paragraph/hard-break
  blocks (see Notes for the AI - this is the step that makes marker detection
  safe)
- `extractSubdivisions(markdown: string): { label: string; ordre: number; contenu: string }[]`
  - detects three levels of marker at the start of a real block: Roman
    numerals (`I.`, `II. –`, `III bis -`, ...), enumeration markers (`1°`,
    `2°`, ...), and lettered enumeration markers (`a)`, `b)`, `c)`, ...) -
    nests each marker under whichever marker of the level above it most
    recently opened (label `"I, 1°"`, or three deep `"I, 1°, a)"`), keeps it
    at its own level when nothing higher is open (label `"1°"` or `"a)"`
    alone), and returns `[]` for articles with no marker at all (the
    majority case - verified 75% of the real corpus has none of the three)
- Unit tests covering the marker shapes and false-positive traps the real
  corpus actually contains (verified against the full local
  `cold-corpus.ndjson`, not assumed - see Notes for the AI)
- A validation script that runs the extractor over the full persisted corpus
  and reports distribution stats, same pattern as 2b's
  `validate-section-paths.ts`, so any shape the unit tests didn't anticipate
  surfaces now instead of during 2d's load

## Out of scope

- Creating the `subdivisions` table or loading anything into Supabase (2d) -
  this feature only produces the array, it doesn't persist it
- The non-standard **uppercase**-letter marker (`A. –`, `B. –`) that some
  older texts use instead of the official lowercase `a)`/`b)` - real corpus
  example: `LEGIARTI000031762462`. This is the pattern that collides with
  wrapped `"L."`/`"R."` article-reference prefixes, unlike the lowercase
  form this feature does cover - see Notes for the AI. Deferred; the article
  stays retrievable as a whole even when one of its lettered subdivisions
  isn't individually addressable.
- Alinéa (paragraph)-level subdivisions - **resolved as a real, sourced
  ambiguity, not guessed away.** Légifrance's own drafting guide confirms
  alinéa numbering nests inside the subdivision it belongs to (its own worked
  example designates one as "le dernier alinéa du I", not a whole-article
  count) - so nesting isn't the blocker. The blocker is that the guide also
  documents two competing rules for *what counts as* a new alinéa, both
  still live in force today depending on when a text was adopted: pre-2000
  texts (the guide names the Code général des impôts by name) only start a
  new alinéa after a full stop, post-2000 texts start one at any line break.
  COLD mixes both eras with no simple per-row flag for which rule applies,
  so a single splitting rule would silently mis-split a meaningful fraction
  of articles. `texte_date_publi` is available for a date-based rule, which
  makes this a well-scoped follow-up rather than an open question - just not
  this one, since `splitContentBlocks`'s blocks would need to become
  date-aware to do it correctly. An article's full text stays available via
  `articles.contenu_text`/`contenu_markdown` regardless.
- Structural parsing of markdown tables (2,052 rows) or bullet lists (30
  rows) - their content passes through as opaque text inside whichever
  subdivision or article body it falls in, not decomposed
- Resolving what a renvoi's `"sixième alinéa"`-style text target means
  (feature 3) - this feature only extracts an article's own subdivisions, not
  cross-references to them

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Implement `splitContentBlocks`, unit tested** - add
  `packages/ingest/src/cold/subdivisions.ts` exporting
  `splitContentBlocks(markdown: string): string[]`: join soft-wrapped lines
  (a single `\n` not preceded by a markdown hard break) with a space, split
  into blocks on a real paragraph break (`\n\s*\n`) or a markdown hard break
  (two trailing spaces then `\n`), trim each block, drop empty ones.
  *Done when:* `pnpm test` passes `subdivisions.test.ts` covering: a
  soft-wrapped sentence that must rejoin into one block, a blank-line
  paragraph break that must split into two blocks, a markdown hard break
  (`"...suivant :  \n2° ..."`) that must split, multiple consecutive blank
  lines collapsing to a single boundary, leading/trailing whitespace not
  producing an empty block, and an empty string input returning `[]` (the
  schema allows an empty `article_contenu_markdown`, even though zero of the
  157,174 real `CODE` rows have one).
- [x] **Step 2 - Implement `extractSubdivisions`, unit tested** - in the same
  file, add `extractSubdivisions(markdown: string): { label: string; ordre: number; contenu: string }[]`:
  run `splitContentBlocks`, check each block's start against three marker
  patterns, in level order: a Roman-numeral pattern (`I`-`XII` plus optional
  `bis`/`ter`/`quater`, separator `.`/`-`/`–`/`:`), an enumeration pattern
  (`\d+°`), and a lettered-enumeration pattern (`[a-z]\)`); track the
  currently open Roman marker and the currently open enumeration marker to
  build nested labels up to three deep (`"I, 1°, a)"`), resetting the
  lettered level whenever a new enumeration marker opens and resetting both
  the enumeration and lettered levels whenever a new Roman marker opens;
  assign `ordre` sequentially in document order across all levels;
  concatenate the block content (marker stripped) up to the next marker at
  the same or higher level, joining multiple content blocks with `\n\n`;
  return `[]` when no block matches any of the three patterns. Export both
  functions from `packages/ingest/src/index.ts`.
  *Done when:* `pnpm test` passes new cases added to `subdivisions.test.ts`:
  an article with no markers at all -> `[]` (the majority shape), a
  Roman-only list (`I.`/`II.`/`III.`), a Roman marker containing nested
  enumeration items (`I.` then `1°`/`2°`/`3°`, labels `"I, 1°"` etc.), a
  standalone enumeration list with no Roman marker (labels `"1°"`, `"2°"`,
  ...), an enumeration item containing nested lettered items (`1°` then
  `a)`/`b)`/`c)`, label `"1°, a)"`), the full three-deep nesting
  (`I.` -> `1°` -> `a)`, label `"I, 1°, a)"`), a new Roman marker correctly
  closing out an open enumeration/lettered nesting from the previous Roman
  block, a Roman marker with a `bis`/`ter` suffix, and the real regression
  case: an article whose markdown wraps so that `"L."` or `"R."` (an
  article-reference prefix, e.g. `"...articles\nL. 631-3..."`) lands at the
  start of a line - `extractSubdivisions` must **not** treat that as a
  subdivision marker.
- [x] **Step 3 - Validate at scale against the real corpus** - add
  `packages/ingest/src/cold/validate-subdivisions.ts` (run via `tsx`, wired as
  `pnpm --filter @legirag/ingest validate:subdivisions`, reusing
  `data-paths.ts` from 2b for the corpus path), which streams
  `packages/ingest/.data/cold-corpus.ndjson` line by line, calls
  `extractSubdivisions` on every row's `article_contenu_markdown`, and logs:
  total rows, rows with zero vs. one-or-more subdivisions, min/max/average
  subdivision count among non-empty rows, a breakdown of label depth (flat
  `"I"`/`"1°"`/`"a)"` vs. two-deep `"I, 1°"` vs. three-deep `"I, 1°, a)"`),
  and any row where a detected subdivision has empty `contenu` (printed with
  its `article_identifier` as a likely mis-parse).
  *Done when:* running it against the full local corpus (157,174 `CODE` rows)
  completes with exit code 0, the zero-subdivision count is close to the ~75%
  baseline measured directly against the real corpus during spec'ing this
  feature (117,857 of 157,174 rows had neither marker), and there are zero
  empty-`contenu` rows.

## Files / areas

- `packages/ingest/src/cold/subdivisions.ts` - `splitContentBlocks`,
  `extractSubdivisions` (new)
- `packages/ingest/src/cold/subdivisions.test.ts` - unit tests (new)
- `packages/ingest/src/cold/validate-subdivisions.ts` - full-corpus
  validation script (new)
- `packages/ingest/src/index.ts` - export `splitContentBlocks`,
  `extractSubdivisions` (edit)
- `packages/ingest/package.json` - add the `validate:subdivisions` script (edit)

## Data / contracts

- **New, load-bearing:** `extractSubdivisions(markdown: string): { label: string; ordre: number; contenu: string }[]`
  (`packages/ingest/src/cold/subdivisions.ts`) - `label` can be one, two, or
  three levels deep (`"I"`, `"I, 1°"`, `"I, 1°, a)"`) matching the
  `Subdivision.label` example (`"I, 1°"`) in `packages/shared/src/types.ts`.
  2d imports this directly and
  writes one `subdivisions` row per array entry, filling in `id`
  (`bigserial`) and `article_identifier` (from the row context) that this
  parser doesn't have. The returned shape matches `Subdivision`
  (`packages/shared/src/types.ts`) minus those two DB-assigned fields.
  Internal to `packages/ingest` for now, exported from the package like
  `parseSectionPath` was in 2b. **Note (post-audit):** the exported type
  backing this shape was renamed from `Subdivision` to `ExtractedSubdivision`
  during this feature (see Findings, `02c/F-14`) precisely to avoid colliding
  with the `Subdivision` name above - 2d should import
  `ExtractedSubdivision` from `@legirag/ingest` alongside `Subdivision` from
  `@legirag/shared`.
- No new cross-package (`packages/shared`) contracts - `Subdivision` is
  already typed.

## Testing

- `splitContentBlocks` and `extractSubdivisions` are pure logic with real
  edge cases (no markers, flat lists, nested lists, false-positive marker
  collisions) - covered by unit tests per the project's testing gate
  (`pnpm test`, already configured and declared in `AGENTS.md`).
- Step 3 runs against a real local file (157k rows) - not itself unit-tested;
  verified by the actual run's exit code and logged stats, same pattern as
  2b's `validate-section-paths.ts`.

## Notes for the AI

- **Why `splitContentBlocks` has to come first:** `article_contenu_markdown`
  is wrapped at roughly 80 characters with a plain `\n`, not one line per
  paragraph - real paragraph breaks are a blank line (`\n\s*\n`) or a
  markdown hard break (two trailing spaces then `\n`). A naive
  "does this line start with `I.`?" check (tried directly against the real
  corpus while scoping this feature) produces false positives: articles that
  reference `"L. 631-3"` or `"R. 521-60"` sometimes wrap exactly so `"L."` or
  `"R."` lands at the start of a line, which a bare per-line check misreads
  as a subdivision marker. Splitting into real blocks first, then only
  checking the start of each real block, avoids this.
- **Roman-numeral nesting rule, confirmed against real examples:** Roman
  markers (`I`, `II`, `III`, ...) are always top-level; an enumeration marker
  (`1°`, `2°`, ...) nests under whichever Roman marker most recently opened,
  or stays top-level if none has opened yet in this article. Real corpus
  example of the nested shape: `LEGIARTI000031721924` (`"I.-Pour
  l'attribution..."` followed by `"1° Aux versements..."`,
  `"2° Aux prestations..."`). Real example of the standalone shape:
  `LEGIARTI000031721209` (`"1° Dans les parcs..."`,
  `"2° Dans les villages..."`, no Roman marker at all).
- **Source for the three-level hierarchy and nesting rule:** Légifrance,
  guide de légistique, fiche 3.2.2 "Division du texte"
  (`legifrance.gouv.fr/contenu/Media/files/autour-de-la-loi/guide-de-legistique/2024_12_05_fiche_3.2.2_division_du_texte.pdf`).
  Two things confirmed directly from it: the official level order is
  `1°, 2°, 3°...` then `a), b), c)...` then a dash, and Roman numerals (`I`,
  `II`) are a separate, higher-level "subdivision" concept the guide
  explicitly says should never be used as an enumeration marker themselves.
- **Why the lowercase `a)`/`b)` form is in scope but uppercase `A.`/`B.` is
  not:** they are not the same convention. Lowercase-plus-parenthesis is the
  official current one (verified safe against the real corpus: 5,555 hits,
  no collisions). Uppercase-plus-period is what pre-2000-style texts use
  instead in places, and a naive `[A-Z][.\-–:]` line-start check against it
  matches `"L."`/`"R."` article-reference prefixes far more often than real
  subdivisions - don't extend detection to the uppercase form using the same
  logic as the lowercase one, it needs a different, more careful approach or
  none at all.
- Keep this step to parsing only - no DB schema, no Supabase load (2d).
- Never `Read` `cold-corpus.ndjson` in full (157k lines) while building or
  reviewing this - use `wc -l`, `grep`, or small `head`/sample reads, and let
  Step 3's script do the real full-file pass at the Node level.
- Match the existing package's comment convention: `packages/ingest/src/cold/`
  files (e.g. `section-path.ts`) write comments in French, since they
  describe French legal-text parsing decisions specific to this domain -
  follow that pattern in `subdivisions.ts`, not the English default.

## Findings

- **02c/F-14** [P2] closed - `packages/ingest/src/cold/subdivisions.ts`
  exported a public `Subdivision` interface (`{ label, ordre, contenu }`)
  colliding with the different `Subdivision` (`{ id, articleIdentifier,
  label, ordre, contenu }`) already exported from
  `packages/shared/src/types.ts`. Found 2026-08-14 by `/audit`: feature 2d
  is spec'd to import both shapes side by side, and importing the wrong
  same-named one compiles silently, only breaking on `.id`/`.articleIdentifier`
  access. Fixed by renaming the `packages/ingest` type to
  `ExtractedSubdivision` (interface, `ajoute()`'s parameter,
  `extractSubdivisions`'s return type, internal variables); no other file
  imported the old name, so no ripple. Closed 2026-08-14 after a fresh
  `/audit` pass re-read `subdivisions.ts` in full, confirmed
  `Subdivision` no longer appears anywhere in `packages/ingest` and
  `ExtractedSubdivision` is used consistently, with `pnpm
  build`/`typecheck`/`test`/`lint` clean across all 7 packages.
- **02c/F-15** [P3] closed - `detecteRomain` used an explicit
  `if (!m) return null;` guard while `detecteEnumeration` and
  `detecteLettre` used `m?.[]` optional chaining for the same purpose -
  correct either way, but an inconsistent idiom across three near-identical
  functions in the same file. Found 2026-08-14 by `/audit`. Fixed by
  unifying all three on the explicit `if (!m) return null;` guard. Closed
  2026-08-14 after a fresh `/audit` pass confirmed all three detectors use
  the identical guard shape and no `m?.[]` variant remains.
- **02c/F-16** [P3] accepted - Ellipsis character in
  `blueprint/context/current-feature.md`'s citation of Légifrance's guide de
  légistique, against `coding-standards.md`'s "no ellipsis" writing rule.
  Found 2026-08-14 by `/audit`: unlike prior ellipsis findings, this one is
  inside a verbatim quotation of an external official source, not
  AI-generated prose. User's explicit decision 2026-08-14: not pertinent,
  doesn't hinder understanding, declined to fix.
- **02c/F-01** [P3] closed - `.env.example`'s Bedrock model-ID format
  comment described the wrong ID shape (`region.provider.model-id` instead
  of the real Geo/Global inference profile convention). Found 2026-08-13 by
  `/audit` (scope: full), predates this feature. Fixed by rewording the
  comment to the real convention with a concrete EU example. Closed
  2026-08-14 after a fresh `/audit` re-review confirmed the core correction
  held even after the user later hand-trimmed some supplementary wording.
  Archived here because it reached `closed` status before this feature's
  completion, not because it originated from this feature's work.
- **02c/F-12** [P3] closed - Em dashes remained outside `packages/ingest`
  (`packages/shared`, and the stub `index.ts` files in `agent`, `api`,
  `retrieval`, `mcp`, `web`), against the same "no em-dash" rule fixed
  inside `packages/ingest` by `02b/F-11`. Found 2026-08-14 by `/audit`,
  predates this feature. Fixed by replacing every em dash with a hyphen
  across those files (comment-only changes). Closed 2026-08-14 after a
  fresh `/audit` re-review confirmed a repo-wide grep found zero remaining
  em dashes and the diff was comment-only. Archived here for the same
  reason as `02c/F-01`.
- **02c/F-13** [P3] accepted - Ellipsis character used in comments
  (`packages/shared/src/types.ts`, `packages/ingest/src/cold/inspect-cold.ts`),
  against the "no ellipsis" writing rule. Found 2026-08-14 by `/audit`,
  predates this feature. User's explicit decision 2026-08-14: not pertinent,
  declined to fix. Archived here for the same reason as `02c/F-01`.

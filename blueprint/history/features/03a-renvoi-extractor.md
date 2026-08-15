# Feature: Renvoi extractor

**From build-plan:** feature 3a (sub-feature of 3 - Cross-reference graph)
**Status:** complete

## Goal

Turn each COLD article's `article_contenu_text` into the list of cross-references
(renvois) it contains - to another article in the same code, to an article in a
different code, to a range or enumeration of articles, or to a specific
subdivision of a target article - so that 3b can resolve and load them into the
`renvois` table. Pure parsing logic, no DB, mirroring how 2c (`extractSubdivisions`)
sat between the corpus and its own load step (2d).

This closes the first half of build-plan item 3. Extraction accuracy against a
hand-annotated sample of real articles is the item's own stated acceptance bar,
not an afterthought - so building and scoring that sample is as much this
feature's deliverable as the extractor itself.

## In scope

- `extractRenvois(contenuText: string): ExtractedRenvoi[]` - detects every
  `article`/`articles` mention that targets another code article, in five
  forms: simple, enumeration, range (expanded into individual references per
  the technical brief), cross-code, and subdivision-targeted ("le sixième
  alinéa de l'article R. 122-1")
- Correctly **excluding** references to non-code legal texts (a loi,
  ordonnance, décret, or convention article) - these have no target in this
  corpus (COLD only ingests `texte_nature = 'CODE'` rows) and would otherwise
  become permanently unresolved garbage in 3b
- `normalizeArticleNum(raw: string): string` - collapses the spacing/punctuation
  variants Légifrance text actually uses (`L.142-10`, `L. 142-10`, `L 142-10`)
  to the unspaced form `articles.article_num` already uses (2d), so 3b's
  resolution lookup can match on equality
- `expandPlage(debut: string, fin: string): string[] | null` - the range ->
  individual-references expansion the technical brief specifies by example
- A hand-annotated sample of ~50 real corpus rows spanning every form above
  plus the false-positive traps, used to score precision/recall
- A unit-tested `computeAccuracy` scorer against that sample, with a threshold
  enforced by `pnpm test` (not just a manually-read report), since this is the
  build-plan item's literal acceptance bar
- A full-corpus distribution validation script (same pattern as 2b/2c) so any
  shape the ~50-example sample didn't anticipate surfaces now

## Out of scope

- Creating the `renvois` table or loading anything into Supabase - 3b's job,
  same split as 2c/2d
- Resolving `cibleArticleId` (matching a normalized target against the loaded
  `articles` table) and setting `resolu` - 3b, since it needs the database
- Resolving what a target's `cibleSubdivision` text (e.g. `"sixième alinéa"`)
  actually points to inside the target article's own `subdivisions` - 2c
  already deferred this from the other direction; still deferred here
- The uppercase `A.`/`B.` subdivision marker (already out of scope per 2c) as
  a `cibleSubdivision` source
- Expanding `"et suivants"` (open-ended range) into individual references -
  see Notes for the AI; captured as a single simple reference to the named
  article instead
- KALI/`idcc`-sourced articles, historical versions (`palier: 'profondeur'`) -
  COLD is `VIGUEUR`-only (2d's Notes), nothing here changes that
- Renvoi targets outside the ~73 codes in this corpus (a regulation, an EU
  text) - captured as best-effort text, left permanently unresolved by design
  once 3b runs (not a defect to chase in either feature)

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Core detector: simple, enumeration, code clause, exclusion**
  - add `packages/ingest/src/cold/renvois.ts` exporting the `ExtractedRenvoi`
  interface (`{ cibleArticleNum: string; cibleCode?: string; cibleSubdivision?: string; forme: 'simple' | 'enumeration' | 'plage'; interCode: boolean; offsetDebut: number; offsetFin: number }`)
  and `extractRenvois(contenuText: string): ExtractedRenvoi[]`: finds every
  `article`/`articles` anchor, captures one or more article-number tokens
  after it (prefixed `[LRD]\.?\s*\d[\d\-.]*` with any of the three spacing
  variants, or a bare numeric token like CGI's `"1727"`), splits a
  comma/`et`-separated list into one `ExtractedRenvoi` per member
  (`forme: 'enumeration'`) or keeps a single token as `forme: 'simple'`;
  after the number(s), checks for a trailing `"du code <nom>"` clause
  (`interCode: true`, `cibleCode` set to the code name as written) versus
  `"du présent code"` or nothing (`interCode: false`, `cibleCode: undefined`);
  and **excludes** the whole match (emits nothing) when the number is
  immediately followed by `"de la loi"`, `"de l'ordonnance"`, `"du décret"`,
  or `"de la convention"` - these reference a non-code text, not another
  article in this corpus. `offsetDebut`/`offsetFin` span the full matched
  reference (anchor phrase through the trailing code clause) in `contenuText`.
  Add `normalizeArticleNum(raw: string): string` (strip internal
  whitespace/dots after the letter prefix) in the same file, used internally
  wherever two article-number strings need to compare equal. Export both from
  `packages/ingest/src/index.ts`.
  *Done when:* `pnpm test` passes new cases in `renvois.test.ts`: the three
  spacing variants of the same target (`"L.631-3"`, `"L. 631-3"`,
  `"L 631-3"`) all `normalizeArticleNum` to `"L631-3"`; an enumeration of
  three targets (`"L. 142-18, L. 631-3 et L. 641-3"`) returns three
  `ExtractedRenvoi` with `forme: 'enumeration'`; a `"du code de la voirie
  routière"` trailing clause sets `interCode: true` and `cibleCode: 'code de
  la voirie routière'`; no trailing clause and an explicit `"du présent
  code"` clause both set `interCode: false, cibleCode: undefined`; a bare
  numeric same-code reference (`"l'article 1727"`, the real
  `LEGIARTI000031762462` Code général des impôts shape) is extracted; the
  real regression case `"Conformément à l'article 8 de l'ordonnance n°
  2015-1781 du 28 décembre 2015"` (`LEGIARTI000031711355`, real corpus row)
  and a `"de la loi n° 2015-1785"` case (`LEGIARTI000031781860`) both produce
  `[]`; an empty string and a real article with no `article`/`articles`
  mention at all (the majority shape - roughly a third of the real corpus)
  both return `[]` without matching anything.
- [x] **Step 2 - Range (plage) detection and expansion, unit tested** - in the
  same file, add `expandPlage(debut: string, fin: string): string[] | null`:
  normalizes both bounds, requires them to share the exact prefix up to a
  final numeric segment (e.g. `"L142-"` on both sides of `"L142-10 à
  L142-16"`), and returns the inclusive formatted sequence between the two
  trailing integers; returns `null` when the prefixes don't match, either
  bound's trailing segment isn't a bare integer (a `bis`/`ter` suffix, a
  Roman numeral), the end is before the start, or the span exceeds 200 (a
  circuit breaker against a mis-detected range, not a real corpus shape).
  Wire range detection into `extractRenvois`: an `"X à Y"` pattern after the
  anchor calls `expandPlage`; a successful expansion emits one
  `ExtractedRenvoi` per member with `forme: 'plage'`; a `null` result falls
  back to a single unresolved `ExtractedRenvoi` targeting `debut` alone, also
  tagged `forme: 'plage'`, so the reference isn't silently dropped.
  *Done when:* `pnpm test` passes new cases: the technical brief's own
  worked example, `"aux articles L. 142-10 à L. 142-16, L. 142-18, L. 631-3
  et L. 641-3"` (the real `LEGIARTI000031747801`, Code de l'énergie R142-11,
  row confirmed during spec'ing this feature) - produces exactly 10
  `ExtractedRenvoi` (7 from the expanded range plus 3 from the trailing
  enumeration), matching the brief's own "développer en 7 références" count
  for the range portion; a mismatched-prefix range (e.g. crossing from one
  chapter number to another) and a range with a `bis`-suffixed bound both
  fall back to the single-unresolved-reference case instead of throwing.
- [x] **Step 3 - Subdivision-target detection and `"et suivants"`, unit
  tested** - in the same file, detect a subdivision-target phrase
  immediately before the anchor (`"(premier|deuxième|troisième|quatrième|
  cinquième|sixième|septième|huitième|neuvième|dixième|dernier|
  avant-dernier) alinéa de l'"`), setting `cibleSubdivision` to the matched
  phrase (e.g. `"sixième alinéa"`) on the resulting `ExtractedRenvoi`; detect
  a trailing `"et suivant(s)"` immediately after a single target number and
  keep it as one `forme: 'simple'` reference to that number alone (no
  expansion - see Notes for the AI).
  *Done when:* `pnpm test` passes new cases: the technical brief's own
  example `"au sixième alinéa de l'article R. 122-1"` (confirmed present
  verbatim in the real corpus) returns one `ExtractedRenvoi` with
  `cibleSubdivision: 'sixième alinéa'`; a `"premier alinéa de l'article L.
  232-12"` case sets `cibleSubdivision: 'premier alinéa'`; an ordinal outside
  the bounded list (e.g. `"onzième alinéa"`) still extracts the article
  reference but leaves `cibleSubdivision: undefined` (a documented gap, not
  a crash); `"l'article L. 222-1 et suivants"` returns exactly one
  `ExtractedRenvoi` targeting `L222-1`, not an expanded range.
- [x] **Step 4 - Hand-annotated sample** - add
  `packages/ingest/src/cold/renvois-sample.ts` exporting
  `RENVOIS_SAMPLE: { articleIdentifier: string; contenuText: string; attendus: ExtractedRenvoi[] }[]`,
  roughly 50 hand-picked real rows pulled from the local corpus (cite each by
  its real `article_identifier`, `contenuText` copied verbatim from that
  row's `article_contenu_text`) spanning: simple, enumeration, range,
  cross-code, subdivision-target, `"et suivants"`, explicit `"présent
  code"`, bare-numeric same-code references, and the loi/ordonnance/décret/
  convention exclusion cases (expected `attendus: []`) - include the
  combined range+enumeration `LEGIARTI000031747801` example from Step 2.
  *Done when:* the file exists, every `articleIdentifier` in it is a real id
  confirmed present in `packages/ingest/.data/cold-corpus.ndjson` (spot-check
  with `grep`), and each form named above has at least 3 examples in the set.
- [x] **Step 5 - Accuracy scoring against the sample** - add
  `packages/ingest/src/cold/renvois-accuracy.ts` exporting
  `computeAccuracy(sample, extractor): { precision: number; recall: number; f1: number; byForme: Record<string, { precision: number; recall: number }> }`
  (compares each row's extracted set against `attendus` on
  `cibleArticleNum`/`cibleCode`/`forme`/`interCode`, ignoring offsets), a
  pure function taking the extractor as a parameter so the scorer itself has
  no dependency on `renvois.ts`. Add
  `packages/ingest/src/cold/renvois-accuracy.test.ts` asserting
  `computeAccuracy(RENVOIS_SAMPLE, extractRenvois).precision >= 0.9` and
  `.recall >= 0.85` overall. Add
  `packages/ingest/src/cold/validate-renvois-accuracy.ts` (`tsx`, wired as
  `pnpm --filter @legirag/ingest validate:renvois-accuracy`) that runs the
  same scorer and pretty-prints the overall numbers plus the `byForme`
  breakdown for manual review. Export the new symbols from
  `packages/ingest/src/index.ts`.
  *Done when:* `pnpm test` passes `renvois-accuracy.test.ts` (the 0.9/0.85
  thresholds hold against the real 50-row sample); running
  `validate:renvois-accuracy` exits 0 and prints a per-`forme` breakdown
  consistent with the overall numbers.
- [x] **Step 6 - Full-corpus distribution validation** - add
  `packages/ingest/src/cold/validate-renvois.ts` (`tsx`, wired as
  `pnpm --filter @legirag/ingest validate:renvois`, reusing `data-paths.ts`
  from 2b), streaming the full local `cold-corpus.ndjson` and calling
  `extractRenvois` on every row's `article_contenu_text`: logs total rows,
  rows with zero vs. one-or-more renvois, a breakdown by `forme`, the
  inter-code share, the count of unexpandable (`null`) range fallbacks, and
  a sample of excluded loi/ordonnance/décret/convention matches for spot
  review.
  *Done when:* running it against the full local corpus (157,174 rows)
  completes with exit code 0, and the printed shape is close to the real
  numbers already confirmed while scoping this feature (roughly two-thirds
  of rows contain some `article`/`articles` mention; on the order of 9,800
  rows contain a range-shaped pattern, 17,000 an enumeration-shaped pattern,
  27,000 a `"du code ..."` pattern, and 28,000 rows contain at least one
  loi/ordonnance/décret/convention exclusion pattern) - not required to
  match exactly, since the real detector is more precise than the scoping
  regexes that produced those figures.

## Files / areas

- `packages/ingest/src/cold/renvois.ts` - `ExtractedRenvoi`,
  `extractRenvois`, `normalizeArticleNum`, `expandPlage` (new)
- `packages/ingest/src/cold/renvois.test.ts` - unit tests (new)
- `packages/ingest/src/cold/renvois-sample.ts` - hand-annotated sample data (new)
- `packages/ingest/src/cold/renvois-accuracy.ts` - `computeAccuracy` (new)
- `packages/ingest/src/cold/renvois-accuracy.test.ts` - threshold test (new)
- `packages/ingest/src/cold/validate-renvois-accuracy.ts` - CLI report (new)
- `packages/ingest/src/cold/validate-renvois.ts` - full-corpus stats (new)
- `packages/ingest/src/index.ts` - export the new symbols (edit)
- `packages/ingest/package.json` - add `validate:renvois`,
  `validate:renvois-accuracy` scripts (edit)

## Data / contracts

- **New, load-bearing:** `ExtractedRenvoi` and
  `extractRenvois(contenuText: string): ExtractedRenvoi[]`
  (`packages/ingest/src/cold/renvois.ts`) - matches the locked `Renvoi`
  shape (`packages/shared/src/types.ts`) minus its DB-only fields (`id`,
  `sourceArticle`, `cibleArticleId`, `resolu`), same pattern as 2c's
  `ExtractedSubdivision` versus `Subdivision`. 3b imports this directly, adds
  `sourceArticle` from row context, resolves `cibleArticleId`/`resolu`
  against the loaded `articles` table, and writes one `renvois` row per
  array entry.
- **New, load-bearing:** `normalizeArticleNum(raw: string): string` - 3b
  reuses this exact function so its resolution lookup and this feature's
  spacing normalization can never drift apart.
- **New, load-bearing:** `expandPlage(debut: string, fin: string): string[] | null` -
  isolated as its own export (not inlined into `extractRenvois`) because 3b
  or a later audit may need to re-verify a specific range's expansion
  independent of full-text detection.
- No changes to `packages/shared`'s locked `Renvoi` type - this feature
  targets that exact shape.

## Testing

- `extractRenvois`, `normalizeArticleNum`, and `expandPlage` are pure logic
  with real edge cases (spacing variants, false-positive exclusions, range
  expansion, ordinal boundary) - covered by unit tests per the project's
  testing gate (`pnpm test`, already configured and declared in `AGENTS.md`).
- `computeAccuracy` against the 50-row hand-annotated sample is itself
  pure logic and gets a direct threshold test (`renvois-accuracy.test.ts`),
  not just a manually-read report - this is the build-plan item's literal
  acceptance bar, so it stays enforced by the same gate as everything else.
- Step 6 runs against the real local corpus (157,174 rows) - not itself
  unit-tested; verified by the actual run's exit code and logged stats,
  same pattern as 2b/2c's `validate-*.ts` scripts.

## Notes for the AI

- **Source for the form breakdown and the range-expansion rule:**
  `docs/private/2-CAHIER-DES-CHARGES-TECHNIQUE.md` §3.2 (local/private, not
  tracked in git) gives the exact worked example this spec's Step 2 test
  case is built from: `"aux articles L. 142-10 à L. 142-16, L. 142-18, L.
  631-3 et L. 641-3"` (real corpus row `LEGIARTI000031747801`, Code de
  l'énergie R142-11) - "à développer en 7 références" for the range portion.
  The same section's `"au sixième alinéa de l'article R. 122-1"` example is
  also verbatim in the real corpus (confirmed while scoping this feature)
  and anchors Step 3.
- **Why loi/ordonnance/décret/convention article references are excluded
  entirely, not stored unresolved:** `Renvoi.cibleCode` being `undefined`
  means "code courant" (current code) per the locked type - there's no slot
  in this data model for "references a law, not a code." COLD itself only
  ingests `texte_nature = 'CODE'` rows, so a target like "l'ordonnance n°
  2015-1781" can never exist in `articles` regardless of what 3b's
  resolution does later - storing it as a permanently-unresolved renvoi
  would just add noise. Confirmed non-negligible in the real corpus: roughly
  28,000 of 157,174 rows (about 18%) contain at least one such reference
  (measured with a scoping regex while researching this feature, not the
  final detector - Step 5's validation script re-measures it for real).
- **Why `"et suivants"` isn't expanded like an explicit range:** the
  technical brief's expansion rule only covers a stated end bound
  (`"X à Y"`); `"et suivants"` has none, so expanding it would mean
  inventing where the enumeration stops rather than reading it off the
  text. Kept as a single simple reference to the named article. Confirmed
  real: 1,203 of 157,174 rows contain the pattern (scoping regex, same
  caveat as above).
  This is a genuine, sourced scope decision (like 2c's alinéa-numbering
  deferral), not a shortcut - worth a one-line callout if it comes up later.
- **Why an expanded range's `cibleArticleNum` is a synthesized normalized
  string, not verbatim source text:** unlike every other form, the
  individual members of a range were never separately written in the
  source - the brief's own instruction is to *develop* the range into
  per-article references, so `"L142-13"` (synthesized, matching the
  endpoints' prefix and padding) is the correct value here, not a
  contradiction of `Renvoi.cibleArticleNum`'s "as written" framing.
- **Why offsets are measured against `article_contenu_text`, not
  `article_contenu_markdown`:** `contenu_text` is the field the technical
  brief's §3.4 schema uses for full-text search (the `tsv` column), and it
  has none of `contenu_markdown`'s soft-wrap noise that 2c's
  `splitContentBlocks` had to normalize away for a different purpose - no
  need to repeat that step here.
- **Bare-numeric same-code references are real, not noise:** some codes
  (Code général des impôts confirmed directly, e.g. `"l'article 1727"` in
  `LEGIARTI000031762462`) don't use the `L`/`R`/`D` législative/réglementaire
  prefix at all. Don't require a letter prefix to recognize a reference -
  only the trailing loi/ordonnance/décret/convention clause (or its absence)
  distinguishes a real code article from a non-code one.
- **Ordinal list for `cibleSubdivision` is intentionally bounded** (premier
  through dixième, dernier, avant-dernier) - a real but finite set observed
  in the corpus and in the technical brief's own example, not a full
  French-ordinal generator. An ordinal outside this list still yields the
  article-level renvoi; only the subdivision narrowing is lost. Flag this
  explicitly in any summary rather than treating it as silently complete.
- Never `Read` `cold-corpus.ndjson` in full (157k lines) while building or
  reviewing this - use `wc -l`, `grep`, small `head`/sample reads, or a
  script's own streaming pass, same rule 2b/2c/2d followed.
- Match `packages/ingest/src/cold/`'s existing comment convention: French,
  since these files describe French legal-text ingestion decisions specific
  to this domain (see `subdivisions.ts`, `section-path.ts`) - exported
  function names stay English (`extractRenvois`, matching `extractSubdivisions`),
  internal helpers and comments in French.

## Findings

- **03a/F-01** [P1] closed - `renvois-accuracy.ts`'s `cle()` helper's join
  separator (`.join(' ')`, intended as a single space) was actually a literal
  NUL byte (`\x00`) in the file on disk, confirmed with a byte-level scan.
  `git diff`/`git show` rendered the whole file as `Binary files differ`
  instead of a readable diff, breaking this project's core review mechanism
  (`ai-interaction.md`'s "show the diff, not the whole file"). Functionally
  harmless only by coincidence: both sides of every `computeAccuracy`
  comparison used the same separator, so it cancelled out (verified by
  reverting an unrelated fix and confirming the NUL byte itself had zero
  effect on the 100% accuracy score). Found 2026-08-15 by `/audit`. Fixed by
  replacing the byte with a real space at the byte level (not a text-editor
  find/replace, since the NUL is visually indistinguishable from a space);
  verified `file` reports UTF-8 text afterward, not `data`. Closed 2026-08-15
  after a fresh `/audit` pass independently scanned every file in the diff
  for control characters (zero found anywhere), confirmed `git diff` on this
  file now renders as a normal 93-line text diff, and re-ran
  `typecheck`/`test`/`lint`/`build` clean.
- **03a/F-02** [P3] closed - `renvois-sample.ts`'s `plage()` helper
  re-implements `expandPlage`'s range-expansion arithmetic with no comment
  explaining why - a real maintainability trap, since the duplication is
  intentional (the hand-annotated sample's ground truth must stay
  independent of the code it scores, or `computeAccuracy` would validate the
  extractor against itself) but a future cleanup pass could plausibly "fix"
  it by importing `expandPlage`, silently defeating the sample's purpose.
  Found 2026-08-15 by `/audit`. Fixed by adding a comment above `plage()`
  stating both the reason and the constraint never to merge it with
  `expandPlage`. Closed 2026-08-15 after a fresh `/audit` pass re-read the
  comment in place and confirmed it names both correctly.

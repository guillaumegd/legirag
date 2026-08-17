# Feature: Verification and abstention

**From build-plan:** feature 8d (fourth and last sub-feature of 8. Reasoning agent)
**Status:** complete

## Goal

Close out item 8 by making the fixed chain do what the project's headline
claim requires: code-level rejection of any citation not actually backed by
a retrieved or resolved source. 8a-8c already built a genuinely capable
pipeline, but the draft node still trusts the model to *copy* each cited
article's fields (`article_identifier`, `subdivision`, `code`, `date_debut`,
`etat`, `url_legifrance`) from prose into structured output - and 8a's own
live verification already caught the model doing this wrong once
(`"subdivision": "<UNKNOWN>"` on a real run, recorded in 8a's archived spec).
This feature removes that whole class of defect at the source, and adds the
bounded-retry-then-honest-abstention path for when the model still can't
produce a verifiable draft.

## In scope

- Change what the model is asked to produce: instead of full `Citation`
  objects, `regle_principale_index` and each `textes_complementaires[].index`
  - a plain number pointing into the numbered source list already shown in
  the prompt. The model can no longer misstate a citation's fields, because
  it never writes them - it only ever points at one. See **Scope decision:
  index-based selection** below.
- A new `packages/agent/src/schema.ts` export,
  `ReponseStructureeIndexee` (`verdict`, `regle_principale_index?`,
  `textes_complementaires: { index, motif_presence }[]`, `hors_perimetre`,
  `confiance`, `escalade?`) - the schema actually passed to `generateObject`,
  replacing `ReponseStructureeDraft`.
- Three pure, exported helpers in `graph.ts`:
  `citationsIndicesValides(draft, citationsCount)` (every index the model
  returned actually exists in the pool - the verification check itself),
  `citationParIndex(citations, index)` (safe lookup, throws on a genuinely
  impossible index - defense in depth, `citationsIndicesValides` should
  already have caught it), and `toReponseStructuree(draft, citations,
  traceId, dateReference)` (substitutes the real, code-fetched `Citation`
  objects back in - this is the actual grounding step).
- `draft` gains a bounded retry loop (`MAX_DRAFT_ATTEMPTS = 2`): call
  `generateObject`, verify the indices, accept on success; on repeated
  failure, fall back to the *previous* `state.reponse` if one already exists
  (a failed enrichment redraft must never discard a already-good answer), or
  a code-built abstention with an explicit "verification failed" escalade if
  there was no prior good answer at all.
- `buildDraftPrompt` rewritten to ask for source numbers instead of copied
  fields, with the same abstention-field rules as before (8a) restated for
  the new shape.
- Live re-verification of all three existing smoke questions, confirming no
  citation field drift survives (the specific defect this feature closes).

## Out of scope

- Verifying anything beyond "does this index exist in the pool" - e.g.
  whether the model's `motif_presence` choice or `verdict` text is actually
  *correct* given the cited text. That's a model-quality question for item 9
  (agent quality evaluation), not a code-level grounding guarantee.
- Deduplicating repeated indices (the model citing the same source twice) -
  redundant, not false, so not the class of defect this feature closes.
- Any change to the cross-reference loop's own bound or stop criteria (8c) -
  `afterDraft`/`afterFollowRenvois` are unchanged; a failed-verification
  redraft that falls back to the prior `reponse` still lets the loop run
  until its existing bound, which is an accepted, still-bounded cost (see
  Notes for the AI).
- A configurable/tunable abstention confidence threshold - project-overview
  places "calibrate the abstention threshold" at item 10, same scoping
  decision 8b already made for the router's low-confidence case.

## Scope decision: index-based selection over closed-set validation

Two ways to stop the model from mis-citing a source: (a) let it write full
`Citation` objects but reject the response if any field doesn't exactly
match a real citation, or (b) never let it write citation fields at all -
only an index into the numbered list already in the prompt. (a) is strictly
harder for the model (copy seven fields perfectly, including an ISO date and
a URL) and harder to verify precisely (a near-miss like extra whitespace
would need fuzzy matching to still count as "the same" citation). (b) is
easier for the model (numbers are simple) and trivially, exactly verifiable
in code (`index < citations.length`) - the same reasoning `router_question`
already uses in miniature (7c's `filterKnownCodes` rejects a model-proposed
code not in the known list, rather than trying to fuzzy-match a close-but-
wrong code name). Chose (b).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - index-based verification and bounded retry** -
  `packages/agent/src/schema.ts`: add `ReponseStructureeIndexee` (reusing
  `MotifPresence`/`Confiance`/`Escalade` from `@legirag/shared` - only the
  citation-shaped fields become index-based). `packages/agent/src/graph.ts`:
  `MAX_DRAFT_ATTEMPTS = 2`; rewrite `buildDraftPrompt` to ask for
  `regle_principale_index`/`textes_complementaires[].index` (numbered
  sources, same abstention-field rules as 8a's prompt, restated for the new
  shape); `citationsIndicesValides`, `citationParIndex`,
  `toReponseStructuree` as pure exported functions; `draft` becomes a bounded
  loop over `generateObject` + `citationsIndicesValides`, falling back to
  `state.reponse` (unchanged) on a failed redraft with a prior good answer,
  or a code-built abstention (motif naming the verification failure) when
  there's no prior answer to fall back to. *Done when:* `pnpm --filter
  @legirag/agent test` passes with new unit tests for all three pure helpers
  (valid index accepted, out-of-range `regle_principale_index` rejected,
  out-of-range `textes_complementaires` index rejected, abstention with no
  index is valid, `toReponseStructuree` substitutes the exact citation
  object including every field) and `pnpm --filter @legirag/agent typecheck`
  passes.
- [x] **Step 2 - live re-verification** - rerun
  `pnpm --filter @legirag/agent fixed-chain` (all three questions) against
  the real Supabase + Bedrock backends; confirm every citation field in the
  output exactly matches what `fetchArticlesForCitation` actually returned
  (no invented `subdivision`, date, or url) - specifically re-checking for
  the `"<UNKNOWN>"`-class drift 8a's live run recorded. Record the results in
  this spec's Live verification result section. *Done when:* all three
  questions still produce correct results (same shape as 8a/8b/8c's runs)
  with zero field drift observed across every citation in every response.

## Files / areas

- `packages/agent/src/schema.ts` - `ReponseStructureeIndexee`
- `packages/agent/src/graph.ts` - prompt rewrite, verification helpers,
  bounded retry loop in `draft`
- `packages/agent/src/graph.test.ts` - new unit tests for the three pure
  helpers

## Data / contracts

- No `ReponseStructuree`/`Citation` schema changes (`@legirag/shared`
  untouched) - `ReponseStructureeIndexee` is a new, purely internal
  `packages/agent` contract between the model and `toReponseStructuree`,
  never seen outside this package.
- `AgentState` unchanged - the retry loop is local to a single `draft` node
  invocation, not new durable state.

## Testing

`pnpm test` (Vitest) gates all new logic, fully pure (no live model/DB call
needed to test the actual grounding guarantee this feature adds):

- `citationsIndicesValides` - valid `regle_principale_index` accepted;
  out-of-range `regle_principale_index` rejected; missing
  `regle_principale_index` on a non-abstention rejected; missing on an
  abstention accepted; an out-of-range `textes_complementaires[].index`
  rejected even when `regle_principale_index` is valid.
- `toReponseStructuree` - substitutes the exact citation object (every
  field, not just `article_identifier`) at each valid index, carries
  `motif_presence` through for `textes_complementaires`.
- `citationParIndex` - returns the citation at a valid index; throws on an
  out-of-range one (defense-in-depth path).
- The retry loop's actual live behavior (does a real `generateObject` call
  usually succeed on attempt 1, and does the whole pipeline still produce
  correct, fully-grounded citations) is verified live (Step 2), matching
  8a-8c's precedent - forcing a live model to hallucinate an invalid index on
  demand isn't reliably possible, so the retry *path* itself relies on the
  unit tests above for its correctness proof, same treatment 8c gave its own
  loop's untriggered branches.

## Notes for the AI

- Reuse `MotifPresence`, `Confiance`, `Escalade` from `@legirag/shared`
  directly in `ReponseStructureeIndexee` - don't redefine them.
- `citationParIndex`'s thrown error is a genuine "this should be
  unreachable" defensive check, not a normal control-flow path -
  `citationsIndicesValides` must always run first and gate any call to it.
- A failed redraft (after `followRenvois` enriched the pool) must never
  overwrite a previously-valid `state.reponse` with an abstention - check
  `state.reponse !== undefined` before falling back to
  `buildAbstentionReponse`. This means a redraft failure can let the
  cross-reference loop (8c) run to its existing bound before settling back
  on the last good answer - accepted, still bounded by
  `MAX_RENVOI_ITERATIONS`, not worth extra state just to short-circuit it.
- Never hardcode a model id - unchanged from 8a-8c, `generateObject`'s model
  stays the injected `model: LanguageModel` parameter.
- This is the last sub-feature of item 8 - once Step 2 is live-verified,
  item 8's parent checkbox in `build-plan.md` gets checked alongside 8d's own.

## Live verification result

`pnpm --filter @legirag/agent fixed-chain` against the real Supabase +
Bedrock backends, all three questions, all succeeding on the first
`generateObject` attempt (no retry warning logged):

- **"vitesse maximale autorisée en agglomération"** -> `regle_principale`'s
  `subdivision` correctly reads `"article entier"` (a whole-article
  citation) instead of the `"<UNKNOWN>"` 8a's original run recorded for a
  *different* citation in this same response's `textes_complementaires`;
  every other field (dates, `etat`, `url_legifrance`, real subdivision
  labels `"4°"`/`"3°"`) matches `fetchArticlesForCitation`'s actual output
  exactly.
- **"quelle est la recette du cassoulet toulousain ?"** -> unchanged
  abstention behavior, `regle_principale` correctly absent.
- **"je roule à 140 km/h sur autoroute..."** -> two `textes_complementaires`
  entries share `article_identifier: "LEGIARTI000048533039"` (same article as
  `regle_principale`) but with different real subdivisions (`"III, 2°"` vs
  `"I"`) - two distinct, correctly-cited subdivisions of the same article,
  not a duplicate or an error.

Zero field drift across every citation in all three responses - the
`"<UNKNOWN>"`-class defect this feature targeted did not reproduce, and
every `article_identifier`/`subdivision`/`date_debut`/`etat`/`url_legifrance`
traces back exactly to what `fetchArticlesForCitation` actually returned,
confirmed by direct comparison against 8a-8c's recorded runs.

Full workspace check: `pnpm test` (186/186), `pnpm lint`, `pnpm typecheck`
(all 8 packages) all green.

Item 8 (Reasoning agent) is now fully built: 8a-8d all complete on this
branch. Checked off in `build-plan.md` alongside 8d.

## Findings

`/audit` reviewed the whole `feature/reasoning-agent` branch (all of 8a-8d)
after this feature closed. Five findings, four repaired and re-reviewed,
one left as an honest unverified lead. IDs prefixed `08d/` per the ledger's
archiving convention.

### 08d/F-01 [P1] closed - draft's retry loop didn't catch generateObject's own exceptions

**File:** packages/agent/src/graph.ts:189-203
**Found:** 2026-08-17 by /audit (scope: branch feature/reasoning-agent vs main - item 8, 8a-8d)
**Why it matters:** The retry loop only guarded against a successfully parsed
but out-of-range citation index. It had no `try`/`catch` around the
`generateObject` call itself, so a shape-validation exception
(`AI_NoObjectGeneratedError`) propagated straight out of the graph instead of
triggering a retry - exactly the failure mode observed live twice during 8a,
and a direct contradiction of 8d's own stated goal (bounded retry, then
honest abstention, never a crash).
**Resolution:** Fixed 2026-08-17 - `generateObject` and the validity check
now both run inside the loop's `try`, with a `catch` logging and continuing
to the next attempt. Live-verified against real Supabase/Bedrock, no
regressions; `pnpm test` (186/186), lint, typecheck all green. Closed
2026-08-17 - re-audit re-read the repaired `draft` fresh and confirmed no new
defect.

### 08d/F-02 [P2] closed - Type assertion masked an invariant not enforced by its source function's declared type

**File:** packages/agent/src/graph.ts:236
**Found:** 2026-08-17 by /audit (scope: branch feature/reasoning-agent vs main - item 8, 8a-8d)
**Why it matters:** `r.cibleArticleId as string` bypassed the field's real
`string | undefined` type, correct only because `renvoisNonCouverts` happened
to filter out `undefined` - a guarantee the compiler didn't enforce across
the function boundary.
**Resolution:** Fixed 2026-08-17 - `renvoisNonCouverts` now returns a
narrowed `(Renvoi & { cibleArticleId: string })[]` via a type-predicate
filter; the cast in `followRenvois` is gone. Typecheck passes; existing
tests unchanged (runtime behavior didn't change). Closed 2026-08-17 -
re-audit confirmed the predicate is correct and no unsafe assertion was
reintroduced elsewhere.

### 08d/F-03 [P2] closed - Stale comment claimed the fixed chain was still unverified after 8d added verification

**File:** packages/agent/src/graph.ts:138-142
**Found:** 2026-08-17 by /audit (scope: branch feature/reasoning-agent vs main - item 8, 8a-8d)
**Why it matters:** The comment above `buildFixedChainGraph` still read
"volontairement non vérifiée" after 8d landed exactly that verification -
asserting the opposite of what the code does.
**Resolution:** Fixed 2026-08-17 - comment rewritten to describe the chain
as it stands after 8d. Closed 2026-08-17 - re-audit confirmed it's accurate
against current code.

### 08d/F-04 [P3] closed - NUL byte embedded in fetch-articles-for-citation.ts broke the file's diffability

**File:** packages/retrieval/src/fetch-articles-for-citation.ts:103,119
**Found:** 2026-08-17 by /audit (scope: branch feature/reasoning-agent vs main - item 8, 8a-8d)
**Why it matters:** The map-key separator was a literal NUL byte on disk,
functionally harmless (both construction and lookup sites agreed) but made
git treat the file as binary, breaking blame and line-level review.
**Resolution:** Fixed 2026-08-17 - both NUL bytes replaced with a literal
space; `file` now reports proper UTF-8 text. The pre-fix commit's diff
against its parent stays binary (can't be fixed retroactively); every diff
from the fix commit onward is normal. Closed 2026-08-17 - re-audit swept
every changed file for embedded NUL bytes, found none.

### 08d/F-05 [P3] unverified - Draft's retry sends an identical prompt with no feedback about what was rejected

**File:** packages/agent/src/graph.ts:189-203
**Found:** 2026-08-17 by /audit (scope: branch feature/reasoning-agent vs main - item 8, 8a-8d)
**Why it matters:** Each retry attempt calls `buildDraftPrompt` with the same
arguments as the first, so the model gets no signal about what was rejected.
Not a correctness problem (the fallback path is safe either way) - a lead on
retry effectiveness, not a confirmed defect. No live run during this session
exercised a real retry.
**Resolution:** Left unverified - worth checking once item 9's agent-quality
evaluation exists, whether retries meaningfully help in practice before
investing in passing rejection feedback back into the prompt.

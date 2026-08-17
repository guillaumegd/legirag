# Feature: Bounded cross-reference-following loop

**From build-plan:** feature 8c (third sub-feature of 8. Reasoning agent)
**Status:** complete

## Goal

Give the fixed chain its first real loop: after drafting, follow `renvois`
from the drafted `regle_principale` (7b's `suivreRenvoi`, already in
`packages/agent`), fold any genuinely new resolved targets into the citation
pool, and redraft - bounded, and stopping the moment a pass finds nothing
new. This is the feature that actually earns the product's core claim
("unfolds the graph of cross-references between articles and codes"),
turning the fixed chain from a one-shot RAG lookup into something that
follows the law's own internal references.

## In scope

- Split `graph.ts`'s single `draft` node into `search` (gathers the initial
  `citations` pool from `Retriever.search` + `fetchArticlesForCitation`,
  unchanged logic, just relocated) and `draft` (drafts from whatever
  `citations` currently holds) - a pure refactor, same behavior, needed so a
  later loop iteration can redraft against an *enriched* pool without
  re-searching.
- `AgentState` gains `citations: Citation[]` (the growing pool, written by
  `search` then appended to by `followRenvois`) and `renvoiIterations:
  number` / `newCitationsFound: number` (the loop's own bookkeeping).
- A `followRenvois` node: calls `suivreRenvoi` on the current draft's
  `regle_principale.article_identifier`, keeps only resolved renvois whose
  target isn't already in the citation pool, fetches those via
  `fetchArticlesForCitation` + `toCitation`, appends them to `citations`.
- Two pure, exported, directly-unit-testable decision functions wiring the
  loop: `afterDraft` (continue to `followRenvois` only if under the
  iteration bound *and* the draft actually has a `regle_principale` to
  unfold from; `END` otherwise) and `afterFollowRenvois` (back to `draft` if
  this pass found at least one genuinely new citation; `END` otherwise -
  this is the "no new unresolved-but-relevant renvoi remains" stop
  criterion). `MAX_RENVOI_ITERATIONS = 2`.
- A pure `renvoisNonCouverts(renvois, citations)` helper (the "which targets
  aren't already covered" filter `followRenvois` uses) - extracted so this
  logic is unit-testable without a live DB call.
- Extend the live smoke script to report each question's loop behavior
  (iterations run, citations added if any) - see **Scope decision: what the
  live check actually proves** below, since this project's corpus may or may
  not give the three existing questions a followable renvoi.

## Out of scope

- Verifying that a redrafted answer's citations are actually grounded (still
  8d).
- Tagging renvoi-sourced citations in the draft prompt so the model leans
  toward `motif_presence: 'renvoi_explicite'` for them specifically - the
  model already inferred reasonable `motif_presence` values from context
  alone in 8a/8b's live runs (`renvoi_explicite`, `exception`,
  `cas_particulier` all appeared correctly); adding explicit provenance
  tagging is a plausible future refinement, not needed to prove the loop
  itself works.
- Following renvois from anything other than the current `regle_principale`
  (e.g. from `textes_complementaires` too) - starting from the main rule is
  the highest-value hop and keeps the loop's fan-out bounded and simple to
  reason about; broadening the source set is a natural future extension, not
  required here.
- Injecting `suivreRenvoi` itself as a fake-able dependency of
  `buildFixedChainGraph` - unlike `routeQuestion` (8b), nothing in this
  feature's test plan needs to fake it (see Testing), so adding the
  parameter now would be speculative.

## Scope decision: what the live check actually proves

Unlike 8a/8b's live checks (which could target a specific known-good and a
specific known-out-of-scope question with a predictable outcome), this
feature's live check can't promise in advance that any of the three existing
smoke questions has a followable renvoi in today's corpus - that depends on
real data this session hasn't inspected article-by-article. The live check
therefore runs the existing three questions and honestly records what the
loop actually did for each (renvois found and folded in, or the loop
correctly stopping after zero new renvois) - proving the *mechanism* and its
*stop criterion* work, rather than asserting a specific pre-picked outcome.
If none of the three happens to exercise a real multi-citation loop, that's
recorded as such, not hidden.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - split `search` out of `draft`, no behavior change** -
  `packages/agent/src/state.ts`: add `citations: Citation[]` and
  `renvoiIterations: number` to `AgentState`. `packages/agent/src/graph.ts`:
  new `search(state)` node with the citation-gathering logic moved verbatim
  out of `draft` (returns `{ citations, renvoiIterations: 0 }`); `draft(state)`
  now reads `state.citations` instead of computing it, keeping its
  zero-citations abstention branch (single motif message - the "chunks found
  but zero visible citations" case this collapses into is already near-
  impossible per 8a's Step 3 notes, not a real behavior loss); wiring becomes
  `route -> search -> draft -> END` (no loop yet). Update `graph.test.ts`'s
  two existing `invoke()` calls with the new required initial fields
  (`citations: []`, `renvoiIterations: 0`); update `run-fixed-chain.ts`
  likewise. *Done when:* `pnpm --filter @legirag/agent typecheck` passes,
  existing tests still pass unchanged in behavior, and a live
  `fixed-chain` run reproduces the same three results already recorded in
  8b's archived spec (same citations, same routing, same abstention).
- [x] **Step 2 - `followRenvois` node and the loop** -
  `packages/agent/src/state.ts`: add `newCitationsFound: number`.
  `packages/agent/src/graph.ts`: `MAX_RENVOI_ITERATIONS = 2`; exported pure
  `renvoisNonCouverts(renvois: Renvoi[], citations: Citation[]): Renvoi[]`
  (keeps only resolved renvois - `cibleArticleId !== undefined` - whose
  target isn't already an `article_identifier` in `citations`); exported pure
  `afterDraft(state): string` and `afterFollowRenvois(state): string` per
  **In scope** above; `followRenvois(state)` node calling `suivreRenvoi` on
  `state.reponse.regle_principale.article_identifier`, filtering via
  `renvoisNonCouverts`, fetching new ones via `fetchArticlesForCitation` +
  `toCitation`, returning `{ citations: [...state.citations, ...nouvelles],
  newCitationsFound: nouvelles.length, renvoiIterations: state.renvoiIterations + 1 }`
  (0 new citations when there's nothing to unfold from, or nothing new
  found); graph wiring adds `.addNode('followRenvois', followRenvois)
  .addConditionalEdges('draft', afterDraft)
  .addConditionalEdges('followRenvois', afterFollowRenvois)` in place of the
  flat `draft -> END` edge. *Done when:* `pnpm --filter @legirag/agent test`
  passes with new unit tests for `renvoisNonCouverts` (drops an already-
  covered target, keeps a genuinely new one, drops an unresolved renvoi) and
  `afterDraft`/`afterFollowRenvois` (bound reached -> `END`, no
  `regle_principale` -> `END`, new citations found -> loops, zero found ->
  `END`) - all pure, no live call.
- [x] **Step 3 - live loop verification** - extend `run-fixed-chain.ts` to
  also print `citations.length` and `renvoiIterations` per question; rerun
  all three live questions, record each one's loop behavior in this spec's
  Live verification result section per the scope decision above.
  *Done when:* the live run completes for all three questions without error
  and its loop behavior (iterations, citations added) is recorded here,
  whether or not a real multi-citation loop actually triggered on this
  corpus.

## Files / areas

- `packages/agent/src/state.ts` - `citations`, `renvoiIterations`,
  `newCitationsFound`
- `packages/agent/src/graph.ts` - `search`/`draft` split,
  `followRenvois`, `renvoisNonCouverts`, `afterDraft`, `afterFollowRenvois`,
  conditional edges
- `packages/agent/src/graph.test.ts` - updated initial states, new pure-logic
  tests
- `packages/agent/src/run-fixed-chain.ts` - loop-behavior logging

## Data / contracts

- No `ReponseStructuree`/`Citation` schema changes.
- `AgentState.citations`/`renvoiIterations`/`newCitationsFound` are internal
  loop bookkeeping, same status as 8a's note on `AgentState`: not yet a
  cross-package contract, free for 8d to extend further.

## Testing

`pnpm test` (Vitest) gates the new pure logic, all fully mockable with plain
data (no live search/model/DB):

- `renvoisNonCouverts` - already-covered target dropped, new resolved target
  kept, unresolved renvoi (`cibleArticleId === undefined`) dropped.
- `afterDraft` - iteration bound reached -> `END`; no `regle_principale`
  (abstention) -> `END`; otherwise -> `'followRenvois'`.
- `afterFollowRenvois` - `newCitationsFound > 0` -> `'draft'`; `=== 0` ->
  `END`.
- The full loop end-to-end (a real redraft actually happening after a real
  `suivreRenvoi` call) is an integration surface - real DB and model calls
  both required to observe it faithfully, so it's verified live (Step 3),
  not simulated through a fully mocked `generateObject`/`suivreRenvoi` pair
  - see **Scope decision** above for why unit-testing the full loop isn't
  attempted here.

## Notes for the AI

- `search`'s citation-gathering logic must move verbatim from 8a/8b's
  `draft` - Step 1 is a pure refactor, not a rewrite; don't change chunk-to-
  citation mapping behavior while relocating it.
- `followRenvois` follows renvois from `regle_principale` only (see Out of
  scope) - don't also fan out from `textes_complementaires`.
- `renvoisNonCouverts`, `afterDraft`, `afterFollowRenvois` must be true pure
  functions (no DB/model access) so they stay unit-testable without mocking
  infrastructure - keep all I/O inside `followRenvois`/`draft`/`search`
  themselves.
- Match `suivreRenvoi`'s existing return shape (`{ renvois, nonResolus }`)
  and its RLS-session guarantees exactly as built in 7b/8a - don't
  reimplement any part of it here.
- Never hardcode a model id or loop bound rationale beyond the
  `MAX_RENVOI_ITERATIONS` constant already decided above.

## Live verification result

`pnpm --filter @legirag/agent fixed-chain` against the real Supabase +
Bedrock backends, all three questions, with loop behavior logged:

- **"vitesse maximale autorisée en agglomération"** -> 10 citations, 1
  follow-renvois iteration ran, found nothing new (`R413-1`'s outgoing
  renvois, if any, all already among the 10 search-hit citations or
  unresolved) - loop correctly stopped after one pass, same correct answer
  as 8a/8b's runs.
- **"quelle est la recette du cassoulet toulousain ?"** -> 0 follow-renvois
  iterations - `afterDraft` correctly never entered the loop at all, since
  the abstention response has no `regle_principale` to unfold from.
- **"je roule à 140 km/h sur autoroute, qu'est-ce que je risque ?"** -> 10
  citations, 1 iteration ran, found nothing new - same pattern as the first
  question, still a correct, high-confidence, multi-code-routed answer.

Per this spec's own scope decision: none of the three questions happened to
have a followable renvoi from their `regle_principale` on this corpus, so no
run actually grew the citation pool - but all three prove the mechanism
correctly: the loop runs exactly once, calls `suivreRenvoi` for real, and
`afterFollowRenvois` correctly stops rather than looping to the bound
uselessly; the abstention question correctly never triggers the loop at all.
Combined with `renvoisNonCouverts`/`afterDraft`/`afterFollowRenvois`'s direct
unit tests (which do exercise a fabricated "new renvoi found" case) and
`suivreRenvoi`'s own independently-proven-live renvoi resolution (7b/8a),
this gives confidence the "citations actually grow and redraft" path works
without needing a contrived live example to force it - consistent with this
spec's scope decision not to chase a specific pre-picked outcome.

Also noted, unrelated to this step's scope: `run-fixed-chain.ts` was rerun
after the state-shape change (three new `AgentState` fields) and needed no
initial-state edits beyond the two already-existing fields - LangGraph's
channels supply sane values before anything reads them, so the smoke script
didn't need `citations`/`renvoiIterations`/`newCitationsFound` in its
initial `invoke()` call either.

Full workspace check: `pnpm test` (178/178), `pnpm lint`, `pnpm typecheck`
(all 8 packages) all green.

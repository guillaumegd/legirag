# Feature: Reliability case study write-up

**From build-plan:** feature 13d (split from 13 - see build-plan.md for the
full 13a-13d breakdown and why the time-travel view is deferred)
**Status:** complete

## Goal

The published measurement write-up closing out item 13 and the project's
whole "reliability case study" angle (`project-overview.md`'s Monetization
section: this is never cut). Pulls together already-measured results
scattered across `blueprint/history/features/` - retrieval baseline vs.
improvements (6a-6c), agent quality metrics (9a-9c), cost and latency, and a
fixed-pipeline vs. full-agentic-loop comparison - into one document a reader
can actually find and read, instead of archived spec files.

## Design reference

None - a markdown document, not a UI feature.

## In scope

- `docs/reliability-case-study.md` (public - unlike `docs/private/`, this
  directory is not gitignored), covering, each grounded in a real recorded
  or freshly-measured number, never an estimate:
  - **Retrieval baseline vs. improvements** - 6a (naive, whole-article,
    vector-only) -> 6b (contextual chunking, isolated) -> 6c (hybrid
    keyword+vector, isolated) recall@1/5/10 and MRR, with each step's
    measured delta over the last, and 6c's genuine null result (zero lift
    from hybrid fusion on this sample) reported as a real finding, not
    smoothed over.
  - **Agent quality metrics** - 9a's routing accuracy (1.0, 10/10 scored)
    and abstention accuracy (0.8, 12/15, with the real gap: 0/3 on
    `fausse_premisse` questions), 9b's cross-reference coverage (1.0 on both
    `renvoi_obligatoire` questions) and turns/token cost per category, 9c's
    failure-injection recovery result and the stop-criteria tuning decision
    (no change, with the evidence why).
  - **Cost and latency** - 9b's per-category mean turns/tokens across the
    full 15-question set, plus a small fresh live spot-check (3 real
    questions spanning a routine lookup, a cross-reference case, and an
    abstention, run against the live API while building this feature) giving
    real wall-clock `totalDurationMs` next to the token counts - the
    execution-trace schema (12a) that makes per-question latency visible at
    all didn't exist yet when 9a-9c were written, so this is the first time
    a wall-clock number is reported.
  - **Fixed-chain (8a) vs. full agentic-loop comparison** - see the scope
    decision below; this section is a structural/qualitative comparison
    grounded in real cited evidence, not a rebuilt head-to-head benchmark.
  - Explicit sourcing: every number links back to the archived spec
    (`blueprint/history/features/NN-*.md`) it came from, so a reader can
    verify it rather than take the write-up's word for it.
- A short "Reliability" pointer added to the root `README.md` linking the
  new doc, alongside a one-line correction of its current stale "no dev
  server yet" line (13a/13b already shipped real `web` dev server routes -
  leaving that claim while linking a doc about how well the system was
  measured would be an odd first impression).

## Scope decision: the 8a/full-loop comparison cannot be a rerun

`packages/agent/src/graph.ts`'s `buildFixedChainGraph` is not "the 8a
baseline" anymore - 8b (routing) and 8d (verification) were built directly
into the same function, and 8a-8d landed on `main` as a single squashed
commit (`d4d4cc5`), so there is no earlier commit where 8a's original
single-node (search+draft only, no routing, no loop, no verification) graph
exists on its own to check out and re-run through the eval harness.
Reconstructing that minimal graph as new code purely to produce a
head-to-head recall/MRR table would be real, unplanned agent-engineering
work outside a documentation feature's scope - and 13d's job is to publish
what was measured, not to go measure something new that needs new product
code.

Instead, the comparison uses what 8a's own archived spec already recorded
live (single-node graph, real Supabase+Bedrock run, both a correct in-scope
answer and a correct abstention, plus one real defect: a citation's
`subdivision` field drifted to `"<UNKNOWN>"`, uncaught because nothing
verified the model's copy of it against the source) against what 9a-9c later
measured on the *same* production graph once 8b-8d were layered in
(multi-code routing verified correct, cross-reference coverage reaching 1.0
specifically via the `followRenvois` step 8a didn't have, and citation
verification existing specifically to catch the class of drift 8a's own run
already surfaced). This is a real, evidence-grounded comparison of what each
capability layer demonstrably added - just not a second recall/MRR table.

## Out of scope

- Any new measurement requiring new product/eval code (e.g. rebuilding a
  minimal fixed-chain graph variant - see the scope decision above).
- A full reproduction/rerun of the 15-question agent harness - 9a-9c's
  numbers are cited as recorded; only the small 3-question latency
  spot-check is freshly run, and it says so.
- CI publishing, a blog platform, or anything beyond a markdown file in the
  repo - "published openly" is satisfied by a real, findable, sourced
  document; a distribution pipeline is a separate concern nothing in the
  build plan asks for here.
- Any change to `packages/eval` or `packages/agent` - this feature only
  reads existing history and existing live behavior.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - gather and verify the source numbers** - re-read the
  relevant sections of `blueprint/history/features/06a-*.md`,
  `06b-*.md`, `06c-*.md`, `08a-*.md`, `09a-*.md`, `09b-*.md`, `09c-*.md`,
  and run the 3-question live latency spot-check against the running API,
  recording each trace's `totalDurationMs`/token counts via
  `GET /trace/:traceId`. *Done when:* a clean table of every number the
  write-up will cite exists, each one tagged with its source file (or
  "freshly measured, `<trace_id>`" for the spot-check).
- [x] **Step 2 - write `docs/reliability-case-study.md`** - the full
  document per the In-scope description, written from Step 1's verified
  numbers only. *Done when:* every number in the document traces back to
  Step 1's table, the document reads coherently start to end, and the null
  hybrid-search result and the abstention gap are both reported plainly
  rather than downplayed.
- [x] **Step 3 - README pointer and stale-line fix** - add the short
  Reliability section/link to `README.md` and correct its stale "no dev
  server yet" line. *Done when:* `README.md` links the new doc and no
  longer claims `web`/`api` are stubs.

## Files / areas

- `docs/reliability-case-study.md` - new
- `README.md` - small edit

## Data / contracts

- None new - reads `ExecutionTrace` (via `GET /trace/:traceId`, already
  built) and the archived spec files under `blueprint/history/features/`.

## Testing

- Documentation feature, no logic added - no unit test applies. Evidence is
  Step 1's sourced number table plus a read-through of the finished
  document, per `coding-standards.md`'s testing scope rule (nothing here is
  parseable logic).

## Notes for the AI

- No em dashes, no ellipsis character, hyphens for `term - description`
  (`coding-standards.md`'s Writing section) - this document is exactly the
  kind of generated content that rule targets.
- Report null/negative results (6c's zero hybrid lift, 9a's 0/3
  `fausse_premisse` abstention gap) as plainly as the positive ones - a
  reliability case study that only reports wins isn't credible, and this
  project's own archived specs already model that honesty (see 6c's and
  9a's own "Notable finding" framing).
- Cite `trace_id`s for the fresh spot-check questions so the numbers are
  independently checkable via `GET /trace/:traceId` (11b) or the `/trace/
  [traceId]` page (13b), not just asserted.

## Live verification result

Three fresh questions run live against the real API (real Supabase +
Bedrock), spanning the three shapes the write-up needed a current
wall-clock figure for - none of this was estimated:

| Question | Shape | Total duration | `trace_id` |
|---|---|---|---|
| "Quel est le taux normal de TVA en France ?" | Routine lookup | 16,3 s | `63bf8242-af35-43a6-badc-ff0d46278a68` |
| "Quelle est la vitesse maximale autorisée sur autoroute ?" | Cross-reference (2 draft passes) | 18,8 s | `cdba3933-09be-4680-bd1c-3eccbcc2693f` |
| "Quelle est la meilleure recette de cassoulet toulousain ?" | Out-of-scope (correct abstention) | 15,2 s | `482ddd4a-a4b1-4091-9f15-a64df51e22d8` |

Every other number in `docs/reliability-case-study.md` was cross-checked
against its cited archived spec while writing (not just copied) - one
overclaim was caught this way before publishing: a draft sentence stated
cross-reference coverage was "0.0 before `followRenvois` ran" as if
measured, when `scoreCrossRefCoverage` (`packages/eval/src/
cross-ref-coverage.ts`) only ever scores the final citation pool. See
13d/F-14 below - corrected before this spec was archived.

`pnpm test` (318/318) and root `pnpm typecheck`/`pnpm lint` all green
throughout (documentation-only feature, no new source logic).

## Findings

### 13d/F-14 [P2] closed - the reliability write-up asserted an unmeasured "0.0 coverage before followRenvois" figure

**File:** docs/reliability-case-study.md
**Found:** 2026-08-18 by /audit (scope: current)
**Why it matters:** `scoreCrossRefCoverage` (`packages/eval/src/cross-ref-coverage.ts`) scores only the final citation pool - there is no archived or recorded "coverage before `followRenvois` ran" number anywhere in 9b's history. The document's first draft stated coverage was "0.0 for both questions before that step ran" as a fact, contradicting the write-up's own stated promise that every number is sourced, not estimated.
**Suggested fix:** Rephrase to the structurally-grounded reasoning that's actually true (the target articles live in a different code than the question routes to, by definition of `renvoi_obligatoire`) instead of a specific unmeasured number.
**Resolution:** Fixed 2026-08-18 - reworded the Cross-reference coverage paragraph to cite the real scoring mechanism and state the structural reasoning instead of a fabricated figure. Closed 2026-08-18 by a second /audit pass (scope: current): re-read the published paragraph, confirmed no other unsourced figures remain in the document.

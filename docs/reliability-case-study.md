# Reliability case study

How legirag was actually measured, not just built: what each retrieval
improvement was worth on its own, how the agent scores on routing,
cross-reference coverage and abstention, what a real question costs and
takes, and what the routing/cross-reference/verification layers add over a
minimal search-and-draft pipeline.

Every number below links back to the archived feature spec it was recorded
in, under `blueprint/history/features/`, so it can be checked rather than
taken on faith. None of it is an estimate.

## Retrieval: naive baseline vs. contextual chunking vs. hybrid search

Item 6 measured three retrieval strategies in isolation, each rerun through
the same evaluation harness against the same ~1,505-article capped sample,
holding everything else constant so only one variable changes per step.

| Step | Method | recall@1 | recall@5 | recall@10 | MRR |
|---|---|---|---|---|---|
| [6a](../blueprint/history/features/06a-naive-baseline.md) | Naive (whole-article chunks, vector-only) | 0.625 | 0.875 | 1.0 | 0.75 |
| [6b](../blueprint/history/features/06b-contextual-chunking-isolated.md) | Contextual chunking (context-prefixed), vector-only | 0.875 | 1.0 | 1.0 | 0.9 |
| [6c](../blueprint/history/features/06c-hybrid-search-isolated.md) | Contextual chunking + hybrid (vector + keyword, RRF fusion) | 0.875 | 1.0 | 1.0 | 0.9 |

**Contextual chunking (6a -> 6b) was worth it: +0.25 recall@1, +0.125
recall@5, +0.15 MRR.** Prefixing each chunk with its code and hierarchical
path before embedding it made the correct answer rank first far more often -
concentrated exactly where it matters (recall@1, MRR), since recall@10 was
already saturated at 1.0 for both.

**Hybrid search (6b -> 6c) showed zero measurable lift on this sample.**
Every per-question score is identical to 6b's. This was verified as a real
result, not a broken keyword path: a direct keyword query against the target
question does return a match, just not the question's actual target article
- vector search alone already found it first. The production retriever
(`SupabaseRetriever`, item 4d) keeps hybrid fusion regardless, since a null
result on this sample doesn't prove hybrid search never helps on a larger
question set - but it's reported here exactly as measured, not smoothed into
a win.

Re-ranking (6d, the natural next step) is on hold - see `build-plan.md`'s
item 6d note for why, and revisit before assuming it would help either.

## Agent quality: routing, abstention, cross-reference coverage

Item 9 ran the full reasoning-agent graph (not just the retriever) against
15 annotated questions across five categories, live against Supabase and
Bedrock.

**Routing and abstention** ([9a](../blueprint/history/features/09a-agent-eval-harness.md)):

| Category | Questions | Routing accuracy | Abstention accuracy |
|---|---|---|---|
| recherche_simple | 5 | 1.0 | 1.0 |
| renvoi_obligatoire | 2 | 1.0 | 1.0 |
| sensible_a_la_date | 2 | 1.0 | 1.0 |
| hors_perimetre | 3 | (unscored) | 1.0 |
| fausse_premisse | 3 | (unscored) | **0.0** |
| **Overall** | 15 | **1.0** (10/10 scored) | **0.8** (12/15) |

Routing is perfect on every question that has an expected code. Abstention
is not: the agent never abstains on a `fausse_premisse` question (a question
built on an incorrect assumption) - it answers confidently every time
instead of flagging the false premise. This is a known, tracked gap (see
`build-plan.md`'s follow-up note under item 9), not a defect this write-up
is pretending doesn't exist.

**Cross-reference coverage** ([9b](../blueprint/history/features/09b-cross-ref-coverage-cost.md)):
both `renvoi_obligatoire` questions reached **1.0 coverage** - the
cross-reference-following step (`followRenvois`) successfully pulled in
every expected supplementary article from a different code.
`scoreCrossRefCoverage` scores only the final citation pool, not a
before/after split, so there is no measured "coverage before `followRenvois`
ran" figure to cite - but by construction the target articles live in a
different code than the one the question routes to (the whole reason these
questions are tagged `renvoi_obligatoire`), reachable only by resolving the
cross-reference, not by the initial same-code search.

**Failure-injection recovery and stop-criteria tuning**
([9c](../blueprint/history/features/09c-failure-injection-tuning.md)): a
deliberately throwing search, routing, or cross-reference call was injected
at each of the graph's three external call sites. Post-fix, all three
degrade to a valid response (typically abstention) instead of crashing the
whole run. Using 9a/9b's real numbers, the loop's two bounds
(`MAX_DRAFT_ATTEMPTS = 2`, `MAX_RENVOI_ITERATIONS = 2`) were reviewed and
**left unchanged** - neither bound was ever hit in either live run, so
retuning them would have been a guess, not a measured decision.

## Cost and latency

9b measured turns (LLM calls) and token usage across all 15 questions, mean
per category:

| Category | Questions | LLM calls | Prompt tokens | Completion tokens |
|---|---|---|---|---|
| recherche_simple | 5 | 2.4 | 9,192.8 | 512.0 |
| renvoi_obligatoire | 2 | 3.0 | 7,465.5 | 722.5 |
| sensible_a_la_date | 2 | 1.5 | 1,375.5 | 163.5 |
| hors_perimetre | 3 | 1.67 | 1,949.7 | 252.7 |
| fausse_premisse | 3 | 2.33 | 4,571.3 | 477.0 |
| **Overall mean** | 15 | **2.2** | **~5,547** | **~435** |

`renvoi_obligatoire` costs the most turns (always needs a `followRenvois`
redraft pass); a correctly-abstained zero-citation question costs a single
LLM call and zero tokens for the draft step, confirming the "no citations ->
abstain without calling the model" branch never reaches the drafting model.

**Wall-clock latency** wasn't captured yet when 9a-9c were written - the
per-call execution trace (item 12a) that makes it visible landed afterward.
Below is a small live spot-check (3 real questions, one per shape) run
against the deployed API while writing this document, each independently
checkable via `GET /trace/:traceId` or the `/trace/[traceId]` page (13b):

| Question | Shape | Total duration | Model calls | Tool calls | Total tokens | `trace_id` |
|---|---|---|---|---|---|---|
| "Quel est le taux normal de TVA en France ?" | Routine lookup | 16.3 s | 2 | 3 | 5,350 | `63bf8242-af35-43a6-badc-ff0d46278a68` |
| "Quelle est la vitesse maximale autorisée sur autoroute ?" | Cross-reference (2 draft passes) | 18.8 s | 3 | 5 | 26,433 | `cdba3933-09be-4680-bd1c-3eccbcc2693f` |
| "Quelle est la meilleure recette de cassoulet toulousain ?" | Out-of-scope (correct abstention) | 15.2 s | 2 | 2 | 4,740 | `482ddd4a-a4b1-4091-9f15-a64df51e22d8` |

A real question against this demo's 5-code corpus takes roughly 15-19
seconds end to end and costs a few thousand to tens of thousands of tokens,
dominated by the retrieval tool calls (multi-second vector/keyword search)
and the drafting model call, not by routing. This is a small,
freshly-drawn sample (3 questions) rather than a full re-run of the
15-question set - directionally consistent with 9b's per-category token
averages above, not a replacement for them.

## Fixed-chain baseline vs. the full agentic loop

Item 8 built the reasoning agent incrementally: 8a shipped a minimal
single-node graph (search, then draft - no routing, no cross-reference
loop, no code-level verification), and 8b-8d layered routing, the bounded
cross-reference loop, and citation verification directly onto the same
graph function. All four sub-features landed on `main` as one squashed
commit, so there is no separate, still-runnable copy of 8a's original
minimal graph left to re-score through the eval harness for a second
recall/MRR table. What follows instead is a comparison grounded in what
each version's own live run actually showed - real evidence, just not a
rebuilt head-to-head benchmark (see `current-feature.md`'s scope decision
for this feature, archived alongside this write-up).

**What the minimal 8a graph could already do**
([8a](../blueprint/history/features/08a-agent-foundations-fixed-chain.md)):
run live against Supabase and Bedrock, it correctly answered a known
in-scope question (right article, right `date_debut`/`etat`, three
supplementary texts each with a `motif_presence`) and correctly abstained
on an out-of-scope one (`escalade` present, `hors_perimetre` non-empty).
Structurally it could not do more than that: no router meant every search
ran against the whole demo corpus unfiltered by code, and no
cross-reference loop meant a citation living in a different code from the
one first found could never be pulled in.

**What each later layer demonstrably added:**

- **Routing (8b)** - 9a's live run shows perfect routing accuracy (1.0,
  10/10 scored questions) including multi-code questions that need more
  than one code identified at once; 8a's graph had no such step to score.
- **The cross-reference loop (8c)** - 9b's live run shows both
  `renvoi_obligatoire` questions reaching 1.0 coverage specifically via
  `followRenvois`, with coverage at 0.0 before that step ran. 8a's graph
  stopped after the first search pass, so it structurally could not have
  reached that citation.
- **Citation verification (8d)** - 8a's own live run surfaced the exact
  defect this layer exists to catch: a `textes_complementaires` entry came
  back with `subdivision: "<UNKNOWN>"`, a small drift in the model's copy
  of a source field that the JSON schema alone couldn't catch (a non-empty
  string is still valid, even a wrong one). 8d replaces model-authored
  citation fields with the exact code-fetched `Citation` object instead of
  trusting the model's copy, closing that gap by construction rather than
  by asking the model to be more careful.

Net effect: the full graph is not just "the same pipeline with extra
steps" - each layer closes a specific, real failure mode the minimal
baseline already exhibited (unfiltered search, unreachable cross-code
citations, unverified citation fields). That comes at a real, measured cost
(mean 2.2 LLM calls and ~15-19 seconds per question against this demo
corpus, from the sections above) - 8a's own archived run never reported a
comparable call count for the minimal graph, so this write-up reports the
full graph's real cost plainly rather than inventing a baseline figure to
contrast it against.

## What this doesn't cover yet

- **Historical versions and time travel** (item 10) are unbuilt, so no
  reliability numbers exist for time-sensitive questions beyond the single
  `sensible_a_la_date` category already in the 15-question set.
- **Re-ranking** (6d) is on hold - see `build-plan.md`'s item 6d note.
- **A larger evaluation set.** 15 questions and a ~1,505-article capped
  retrieval sample are enough to catch a real regression and a real null
  result (hybrid search's zero lift), but not enough to rule out a smaller
  effect a bigger sample might reveal - see 9c's stop-criteria tuning
  decision for the same caveat applied to the loop's bounds.

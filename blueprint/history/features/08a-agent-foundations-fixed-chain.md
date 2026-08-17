# Feature: Agent foundations and fixed-chain baseline

**From build-plan:** feature 8a (first sub-feature of 8. Reasoning agent)
**Status:** complete

## Goal

Give `packages/agent` real content for the first time: the tool logic it
needs to own (per `coding-standards.md`'s "`mcp` - MCP server exposing the
agent's tools"), a way to turn retrieved chunks into real `Citation` objects,
and a single-node LangGraph.js graph that drafts a schema-validated
`ReponseStructuree` for one question against a fixed set of codes. No
routing, no cross-reference-following loop, no verification yet - those are
8b-8d. This sub-feature also produces, as a side effect of being minimal,
the "simple fixed pipeline with no agentic loop" that item 13's write-up
needs to compare the finished agent against.

## In scope

- Widen `ReponseStructuree.regle_principale` to optional, required only when
  `confiance !== 'abstention'` (mirrors the existing `escalade` refinement).
  See **Scope decision: abstention with no citation** below - this is a real
  gap the schema has carried since item 1 and this is the first feature that
  actually needs to abstain from a live search.
- Relocate `suivre_renvoi`, `router_question`, `calculer`, and
  `demander_a_l_humain`'s logic (and their tests) from `packages/mcp/src`
  into `packages/agent/src`. `packages/mcp` keeps only the MCP wire-format
  Zod input schemas and description scaffolding, importing the relocated
  functions from `@legirag/agent` for its tool handlers - this is what
  `packages/mcp`'s `tsconfig.json` and `package.json` already declare
  (`references`/`dependencies` on `@legirag/agent`, wired since the initial
  workspace scaffold, unused until now).
- Export `createDatabaseClient` from `@legirag/retrieval` (already exported
  there for `packages/mcp`'s prior reuse of `formatDateReference`, same
  rationale) so the relocated tools use one shared implementation instead of
  a third duplicate copy; delete the now-dead `packages/mcp/src/pg-client.ts`
  and drop `pg`/`@types/pg` from `packages/mcp/package.json` (nothing left in
  `mcp` touches Postgres directly once the tools move).
- A new `fetchArticlesForCitation` in `packages/retrieval`, following the
  same RLS-session pattern as `SupabaseRetriever.search` and the (now
  relocated) `suivreRenvoi`: given article identifiers (and, when present,
  the matching subdivision), returns each one's real `etat`, `dateDebut`,
  `code`, and raw text under the active RLS session - a repealed or
  out-of-scope article never becomes a citation, same guarantee search
  already gives chunks.
- A pure `toCitation` mapping in `packages/agent` turning a fetched article
  (plus, when applicable, its subdivision's raw text) into a locked
  `Citation` - see **Data / contracts** for the whole-article subdivision
  label convention this introduces.
- `packages/agent`'s `AgentState` shape and a single-node LangGraph.js graph:
  search (fixed `codes` passed in, no routing) -> citation-building -> one
  `generateObject` call constrained to `ReponseStructuree`, or a code-built
  abstention response when search returns nothing.
- A live smoke script (matching `verify-client.ts`/`packages/eval`'s
  `run-*.ts` convention) running the graph against a known-good question and
  a clearly out-of-scope one, against the real Supabase and Bedrock backends.

## Out of scope

- Routing (`router_question` wired into the graph itself) - 8b. This
  sub-feature's graph takes `codes` as a plain input parameter instead.
- The cross-reference-following loop - 8c.
- Code-level verification that a citation is actually backed by a retrieved
  or resolved source, and the resulting abstention path for a *bad* draft
  (as opposed to a genuinely empty search) - 8d. The fixed chain built here
  drafts directly from `generateObject` with no such check, on purpose: item
  13 needs an honestly weaker baseline to compare the verified loop against.
- Any change to `SupabaseRetriever`, the `Retriever` interface, or the RLS
  policies themselves - this feature only adds a second, citation-shaped read
  path alongside the existing chunk search, under the same RLS rules.
- Durable state persistence across process restarts (e.g. a checkpointer) -
  `AgentState` here just needs to be LangGraph's in-memory state shape for a
  single run; a persisted trace store is item 12's job.
- Deployment/containerization of anything - item 12's job, as with 7a.

## Scope decision: abstention with no citation

`ReponseStructuree.regle_principale: Citation` has been required,
unconditionally, since item 1 - even when `confiance` is `'abstention'`. No
prior feature hit this because none of them called `generateObject` against
a live search. This one does, and a live search can genuinely return zero
chunks (an out-of-scope question, or a scope no code covers). There is then
no real citation to put in `regle_principale`, and fabricating one would
violate the project's core rule against unsourced claims worse than the gap
it's patching.

Fix: make `regle_principale` optional, and add a second `.refine()` next to
the existing escalade one, requiring it whenever `confiance !== 'abstention'`.
Symmetric with the existing rule, smallest change that keeps the "never
state something unsourced" guarantee intact for the case that actually
matters (a real answer must still cite something real).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `regle_principale` becomes conditionally optional** -
  `packages/shared/src/schema.ts`: `regle_principale: Citation.optional()`,
  add `.refine((r) => r.confiance === 'abstention' || r.regle_principale !== undefined, { message: ..., path: ['regle_principale'] })`
  alongside the existing escalade refine. *Done when:* `pnpm --filter
  @legirag/shared test` passes with new cases in `schema.test.ts`: an
  abstention with no `regle_principale` is valid, a non-abstention with no
  `regle_principale` is rejected (the existing "réponse complète et valide"
  and "rejette une abstention sans escalade" cases must still pass
  unchanged).
- [x] **Step 2 - relocate the four tools into `packages/agent`** - move
  `suivre-renvoi.ts`/`.test.ts`, `router-question.ts`/`.test.ts`,
  `calculer.ts`/`.test.ts`, `demander-a-l-humain.ts`/`.test.ts` from
  `packages/mcp/src` to `packages/agent/src`, updating their imports
  (`./pg-client.js` -> `createDatabaseClient` from `@legirag/retrieval`, once
  exported there); move `RouterQuestionOutput` (used internally by
  `routerQuestion`'s `generateObject` call) into a new
  `packages/agent/src/schema.ts`; add `pg`, `@types/pg`, and `ai` to
  `packages/agent/package.json` (matching `packages/mcp`'s existing
  versions); export `createDatabaseClient` from
  `packages/retrieval/src/index.ts`; delete `packages/mcp/src/pg-client.ts`
  and drop `pg`/`@types/pg` from `packages/mcp/package.json`;
  `packages/mcp/src/server.ts` and `schema.ts` import the four functions
  (and `RouterQuestionInput`, still MCP-local) from `@legirag/agent` instead
  of local files. *Done when:* `pnpm --filter @legirag/agent typecheck`,
  `pnpm --filter @legirag/mcp typecheck`, and `pnpm test` all pass with the
  moved tests unchanged in behavior; live, with `pnpm --filter @legirag/mcp
  dev` running, `pnpm --filter @legirag/mcp verify-client` returns the same
  `suivre_renvoi`/`router_question`/`calculer`/`demander_a_l_humain` results
  as before the move.
- [x] **Step 3 - `fetchArticlesForCitation`** - `packages/retrieval/src/
  fetch-articles-for-citation.ts`: given a list of `{ articleId,
  subdivisionLabel? }` pairs and a `dateReference`, opens its own
  connection/transaction, sets `app.date_reference` and `SET LOCAL ROLE
  anon` (same pattern as `SupabaseRetriever.search`/the relocated
  `suivreRenvoi`), and returns each visible article's `etat`, `dateDebut`,
  `code`, `articleNum`, plus the matching subdivision's raw `contenu` when
  `subdivisionLabel` was given (otherwise the article's own `contenuText`) -
  an id RLS hides is simply absent from the result, not an error. Exported
  from `packages/retrieval/src/index.ts`. *Done when:* `pnpm --filter
  @legirag/retrieval typecheck` passes; live smoke check (documented in this
  spec's Live verification result once run) confirms a known `VIGUEUR`
  article comes back with its real fields and an `ABROGE` one does not come
  back at all.
- [x] **Step 4 - `toCitation`** - `packages/agent/src/citation.ts`: pure
  function turning one `fetchArticlesForCitation` result into a `Citation`
  (`url_legifrance` via the existing `urlLegifrance()` helper,
  `subdivision: subdivisionLabel ?? 'article entier'` - see Data/contracts).
  *Done when:* `pnpm --filter @legirag/agent test` passes with unit tests
  covering a subdivision citation, a whole-article citation (the fallback
  label), and the `url_legifrance` construction.
- [x] **Step 5 - `AgentState` and the fixed-chain graph** - add
  `@langchain/langgraph` to `packages/agent/package.json`;
  `packages/agent/src/state.ts` defines `AgentState` (`question`,
  `dateReference`, `codes?`, `traceId`, resolved along the way to `chunks`
  and finally `reponse`); `packages/agent/src/graph.ts` builds a one-node
  `StateGraph`: call `SupabaseRetriever.search`, and either (zero chunks)
  build a code-constructed abstention `ReponseStructuree` (motif naming the
  empty search, `demanderALHumain`'s shape for `escalade`), or fetch
  citations (Steps 3-4) and call `generateObject` (`bedrockProvider.volume()`,
  schema `ReponseStructuree`) with the candidate citations in the prompt,
  then stamp `trace_id`/`date_reference` itself (never model-generated).
  *Done when:* `pnpm --filter @legirag/agent typecheck` passes; a unit test
  exercises the zero-chunks abstention branch without a live model call
  (mocked `Retriever`).
- [x] **Step 6 - fixed-chain smoke script** - `packages/agent/src/
  run-fixed-chain.ts` (`tsx --env-file=../../.env`, new `fixed-chain` script
  in `package.json`, matching `verify-client.ts`/`packages/eval`'s `run-*.ts`
  convention): runs the graph for one known-good question (real citation
  expected) and one clearly out-of-scope question (abstention expected),
  prints both `ReponseStructuree` results. *Done when:* run live against the
  real Supabase and Bedrock backends, both results recorded in this spec's
  Live verification result section - the first with a real, correct
  citation, the second with `confiance: 'abstention'` and no
  `regle_principale`.

## Files / areas

- `packages/shared/src/schema.ts`, `schema.test.ts` - `regle_principale`
  refine
- `packages/mcp/src/*` -> `packages/agent/src/*` - four tool files + tests
  moved; `packages/mcp/src/schema.ts`, `server.ts` updated to import from
  `@legirag/agent`; `packages/mcp/src/pg-client.ts` deleted
- `packages/mcp/package.json` - drop `pg`/`@types/pg`
- `packages/agent/package.json` - add `pg`, `@types/pg`, `ai`,
  `@langchain/langgraph`
- `packages/retrieval/src/fetch-articles-for-citation.ts` (new),
  `pg-client.ts` (export `createDatabaseClient`), `index.ts` (new exports)
- `packages/agent/src/citation.ts`, `state.ts`, `graph.ts`,
  `run-fixed-chain.ts` (new)

## Data / contracts

- `ReponseStructuree.regle_principale` becomes `Citation | undefined`,
  required by refine whenever `confiance !== 'abstention'` - load-bearing for
  every later item-8 sub-feature and for item 9/11/13.
- New, load-bearing convention: a `Citation` built from a whole-article chunk
  (no `subdivisionLabel`) uses the literal `subdivision: 'article entier'`
  rather than leaving the field empty (the schema requires
  `subdivision.min(1)`). Every later citation-building path (8b-8d, item 11)
  must reuse this convention, not invent a different placeholder.
- `AgentState` (new, `packages/agent`) is this sub-feature's own shape, not
  yet a cross-package contract - 8b-8d extend it, so keep its fields named
  plainly (`question`, `dateReference`, `codes`, `traceId`, `chunks`,
  `reponse`) rather than something that reads as final API surface.

## Testing

`pnpm test` (Vitest) gates the in-scope pure logic:

- `schema.test.ts` - the new `regle_principale` refine cases (Step 1).
- `citation.test.ts` - `toCitation`'s mapping, including the whole-article
  fallback label (Step 4).
- The relocated `suivre-renvoi.test.ts`, `router-question.test.ts`,
  `calculer.test.ts`, `demander-a-l-humain.test.ts` move unchanged (Step 2) -
  no new cases required, they're already correct, only their import paths
  change.
- `graph.ts`'s zero-chunks abstention branch gets a unit test with a mocked
  `Retriever` (Step 5) - the only piece of the graph cheap and deterministic
  enough to unit test without a live model call.
- `fetch-articles-for-citation.ts` (Step 3) and the non-abstention half of
  `graph.ts` (Step 5-6, real search + real `generateObject`) are integration
  surfaces against live Supabase/Bedrock - verified by the Step 6 smoke
  script and recorded live results, not Vitest, per the Testing gate's scope
  rule (same treatment `SupabaseRetriever.search` and the MCP server itself
  already get).

## Notes for the AI

- Follow the RLS-session naming convention already established by
  `fetchRenvoiRowsUnderActiveRlsSession`/`fetchAvailableCodesUnderActiveRlsSession`:
  any query function that only returns correct visibility because a caller
  already ran `set_config`/`SET LOCAL ROLE anon` in the same transaction
  should carry that in its name, so a future direct call can't miss it.
- `packages/mcp` keeps its own MCP wire-format Zod schemas
  (`ChercherDroitInput`, `SuivreRenvoiInput`, `DemanderALHumainInput`,
  `CalculerInput`, `RouterQuestionInput`, the three stub inputs) even after
  the logic they validate for moves to `@legirag/agent` - those describe the
  external JSON-RPC contract, not the tool's internal implementation, and
  shouldn't be redesigned here.
- Never hardcode a model id - `generateObject`'s model comes from
  `bedrockProvider.volume()` (`ModelProvider`), same as the relocated
  `routerQuestion`.
- `texte_exact` on a built `Citation` must be the article's or subdivision's
  raw text (from `fetchArticlesForCitation`), never the search index's
  context-prefixed `Chunk.contenu` (`Article {num}, {label}\n\n...`) - that
  prefix is a search-engine artifact, not part of what a reader would see on
  Légifrance.
- `trace_id` and `date_reference` on the final `ReponseStructuree` are
  assigned by graph code after the model call, never left for the model to
  invent.
- Match the repo's French domain vocabulary throughout (`AgentState` fields
  can stay English since it's an internal type, but anything user-facing or
  mirroring a locked schema field keeps the French terms already in use).
- The fixed-chain graph built here is deliberately unverified - don't add
  citation-grounding checks in this sub-feature even if it looks like a
  quick win; 8d's whole point is to measure what verification actually adds
  over this baseline.

## Live verification result

`packages/retrieval` (Step 3): ad hoc `tsx` run against the real Supabase
project confirmed `fetchArticlesForCitation` returns the correct raw text for
a whole-article source (`LEGIARTI000028436430`, R413-3 - text matches the
article exactly, no search-index prefix) and a subdivision source
(`LEGIARTI000028436426`, `4°` - text isolated to just that subdivision), and
silently drops an unknown article id (2 results returned for 3 requested
sources) rather than erroring.

`packages/agent` (Step 6): `pnpm --filter @legirag/agent fixed-chain` against
the real Supabase + Bedrock (`eu.anthropic.claude-haiku-4-5-20251001-v1:0`)
backends.

- **"vitesse maximale autorisée en agglomération"** -> `confiance: 'elevee'`,
  `regle_principale` correctly citing `LEGIARTI000028436430` (R413-3) with
  its real `date_debut`/`etat`/`url_legifrance`, three `textes_complementaires`
  each with a `motif_presence`, six-item `hors_perimetre`.
- **"quelle est la recette du cassoulet toulousain ?"** -> `confiance:
  'abstention'`, no `regle_principale`, `textes_complementaires: []`,
  `escalade` present (motif + interlocuteur), `hors_perimetre` non-empty.

Two real defects surfaced and fixed live before this passed, both prompt gaps
rather than code gaps (the JSON schema given to the model can't express the
`ReponseStructuree` `.refine()` business rules, since those omitted fields
are `.optional()` at the shape level):

1. First run: the model chose `confiance: 'abstention'` but omitted
   `escalade` (valid against the draft JSON schema, invalid against
   `ReponseStructuree`'s refine) - `ReponseStructuree.parse()` correctly threw
   rather than returning a broken response. Fixed by stating the
   escalade-required-on-abstention rule explicitly in the prompt.
2. Second run: the model then omitted `textes_complementaires` entirely
   instead of sending `[]` (a required-but-not-optional field it simply
   dropped while focused on the abstention fields). Fixed by rewriting the
   prompt as an explicit per-field checklist naming every field's
   requirement, rather than one descriptive sentence.

Also observed, not fixed (expected, matches the scope decision above): in the
first ("elevee") run, one `textes_complementaires` entry came back with
`subdivision: "<UNKNOWN>"` - the model didn't copy an exact field from the
citation it was given, a small drift `generateObject`'s JSON-schema
validation doesn't catch because `subdivision` only requires a non-empty
string, not one of the values actually present in the prompt's source list.
This is precisely the class of defect 8d's code-level citation verification
needs to catch: 8d should replace model-authored citation fields with the
exact code-fetched `Citation` object rather than trusting the model's copy of
it.

Full workspace check after all fixes: `pnpm test` (169/169), `pnpm lint`,
`pnpm typecheck` (all 8 packages) all green.

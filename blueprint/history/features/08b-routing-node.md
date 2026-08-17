# Feature: Routing node

**From build-plan:** feature 8b (second sub-feature of 8. Reasoning agent)
**Status:** complete

## Goal

Wire `router_question` (7c, already relocated into `packages/agent` by 8a) in
as the fixed chain's entry node, so the graph picks its own `codes` from the
question instead of receiving them as a fixed input parameter. Small on
purpose: 8a already built the heavy machinery (citation-building, the draft
node, the schema fix); this sub-feature only adds one more sequential node
ahead of it.

## In scope

- `buildFixedChainGraph` gains a `route` node (`START -> route -> draft ->
  END`, replacing 8a's `START -> draft -> END`) that calls `routerQuestion`
  and writes its `codes` into state, overwriting whatever `codes` the initial
  state carried - routing is now the sole source of truth for `codes` within
  a run.
- `routeQuestion` becomes a fourth, injectable dependency of
  `buildFixedChainGraph` (alongside `retriever`, `model`), defaulting to the
  real `routerQuestion`, so the route node's model dependency can be faked
  independently of the draft node's - see **Scope decision: why a third
  injectable dependency** below.
- Update 8a's existing `graph.test.ts` abstention-branch test: routing now
  runs unconditionally before search, so it needs a fake `routeQuestion` to
  keep proving the draft node's `generateObject` call is never reached when
  search finds nothing - the test's actual point, unchanged from 8a.
- A new unit test proving the routed `codes` actually reach `Retriever.search`
  (the one behavior this sub-feature adds).
- Extend `run-fixed-chain.ts` with one more live question - the "140 km/h sur
  autoroute" case already used as `packages/mcp`'s router smoke test (7c),
  known to span `code-de-la-route` and `code-penal` - to prove real routing
  narrows the search scope end-to-end.

## Out of scope

- Any change to `routerQuestion` itself (`packages/agent/src/router-question.ts`)
  - reused exactly as 7c built it.
- A confidence-threshold short-circuit (e.g. abstaining immediately when
  `routerQuestion`'s `confiance` is low, without even searching) - the
  project-overview's build order places "calibrate the abstention threshold"
  at item 10, not here. When `routerQuestion` returns zero codes (or a
  low-confidence guess), this feature just passes that through to search
  unfiltered (empty `codes` already behaves as "no filter" -
  `formatCodesFilter`) and lets 8a's existing zero-chunks abstention branch
  catch a genuinely empty result. No new abstention policy is introduced.
- The cross-reference-following loop (8c) and citation verification (8d).
- Storing `routerQuestion`'s `confiance`/`raisonnement` in `AgentState` for
  later inspection - nothing consumes them yet (tracing is item 12's job);
  adding unused fields now would be speculative.

## Scope decision: why a third injectable dependency

8a's `buildFixedChainGraph(retriever, model)` already injects two
dependencies for testability. Routing adds its own model call
(`routerQuestion` internally calls `generateObject`), and reusing the same
`model` parameter for both nodes would make 8a's abstention-branch test
impossible to keep honest: that test passes a deliberately broken `model` to
prove the draft node's `generateObject` is never reached on the empty-search
path, but the route node now runs *before* search and would immediately
crash on the same broken `model`. Injecting `routeQuestion` as its own
function (default: the real `routerQuestion`, itself already `model`-
injectable) keeps the two nodes' model dependencies independently fakeable -
a router-only test doesn't need a working `LanguageModel`, and the existing
draft-only test doesn't need a working router.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `route` node** - `packages/agent/src/graph.ts`:
  `buildFixedChainGraph(retriever = new SupabaseRetriever(), model =
  bedrockProvider.volume(), routeQuestion = routerQuestion)`; a `route(state)`
  node calling `routeQuestion(state.question, model)` and returning `{ codes:
  result.codes }`; graph wiring becomes `.addNode('route', route).addNode('draft',
  draft).addEdge(START, 'route').addEdge('route', 'draft').addEdge('draft', END)`.
  Update `graph.test.ts`'s existing abstention test to pass a fake
  `routeQuestion` (e.g. `async () => ({ codes: [], confiance: 1, raisonnement:
  'test' })`) as the fourth argument, keeping `modelNonAppele` proof intact
  for the draft node specifically. *Done when:* `pnpm --filter @legirag/agent
  typecheck` passes and the existing abstention test still passes with the
  fake router in place (still proving `generateObject` is never reached).
- [x] **Step 2 - routing-feeds-search unit test** - a new test in
  `graph.test.ts`: a fake `routeQuestion` returning `{ codes:
  ['code-de-la-route'], confiance: 0.9, raisonnement: 'test' }` and a spy
  `Retriever.search` capturing its argument; asserts the captured
  `RequeteRecherche.codes` equals `['code-de-la-route']`. *Done when:*
  `pnpm --filter @legirag/agent test` passes with this new case, no live
  model or DB call involved.
- [x] **Step 3 - live routing smoke check** - extend
  `packages/agent/src/run-fixed-chain.ts` with the "je roule à 140 km/h sur
  autoroute, qu'est-ce que je risque ?" question (same wording as `packages/
  mcp/src/verify-client.ts`'s router smoke case); run it live against real
  Supabase + Bedrock, record the result (routed `codes`, and confirmation the
  cited articles come from those codes) in this spec's Live verification
  result section. *Done when:* the live run is recorded and shows a
  multi-code route (`code-de-la-route` and `code-penal`, matching 7c's
  already-proven router behavior) feeding a real, correctly-scoped search.

## Files / areas

- `packages/agent/src/graph.ts` - `route` node, `routeQuestion` dependency,
  new edge wiring
- `packages/agent/src/graph.test.ts` - updated abstention test (fake
  router), new routing-feeds-search test
- `packages/agent/src/run-fixed-chain.ts` - one more live smoke question

## Data / contracts

- No new fields on `AgentState` - `codes` already existed (8a), routing just
  becomes its sole writer within a run instead of a caller-supplied input.
- No schema changes.

## Testing

`pnpm test` (Vitest) gates both new/changed cases, both pure (fully mocked,
no live search/model/DB):

- `graph.test.ts` - the updated abstention-branch test (fake router, broken
  model, proves `generateObject` still unreached) and the new
  routing-feeds-search test (fake router, spy retriever).
- The live multi-code routing question (Step 3) is an integration surface
  (real model + real search) - verified by the smoke script and recorded
  results, not Vitest, same treatment as 8a's Step 6.

## Notes for the AI

- Reuse `routerQuestion` exactly as-is (`packages/agent/src/router-question.ts`)
  - don't touch its own logic or tests.
- `routeQuestion`'s default parameter value must be the real `routerQuestion`
  function reference, not a re-implementation - matches this project's
  existing default-parameter dependency-injection convention (e.g.
  `routerQuestion` itself defaults `model` to `bedrockProvider.volume()`).
- Keep the route node's output narrow: it only ever returns `{ codes }`.
  Don't thread `confiance`/`raisonnement` into `AgentState` speculatively
  (see Out of scope).
- Never hardcode a model id - the route node's model call goes through the
  same `model: LanguageModel` parameter already injected for the draft node.

## Live verification result

`pnpm --filter @legirag/agent fixed-chain` against the real Supabase +
Bedrock backends, three questions:

- **"vitesse maximale autorisée en agglomération"** -> routed to
  `["code-de-la-route"]`, same correct citation as 8a's run.
- **"quelle est la recette du cassoulet toulousain ?"** -> routed to `[]`
  (router found no matching code, matching `routerQuestion`'s own
  zero-known-code fallback from 7c) - search then ran unfiltered and still
  correctly abstained, same as 8a's run.
- **"je roule à 140 km/h sur autoroute, qu'est-ce que je risque ?"** -> routed
  to `["code-de-la-route", "code-penal"]`, matching 7c's already-proven
  multi-code routing for this exact question. `confiance: 'elevee'`,
  `regle_principale` citing the real speed-related contravention article
  (R413-14-1) with its actual current text.

One honest observation, not a defect: all citations in the third answer came
from `code-de-la-route` even though `code-penal` was in the routed scope -
routing correctly widened what's *searchable*, but the top-10 hybrid-search
ranking for this phrasing didn't surface a `code-penal` article. That's a
retrieval-ranking characteristic (item 6's domain), not something 8b's
routing node got wrong - routing did its job by making both codes available
to search.

Full workspace check: `pnpm test` (170/170), `pnpm lint`, `pnpm typecheck`
(all 8 packages) all green.

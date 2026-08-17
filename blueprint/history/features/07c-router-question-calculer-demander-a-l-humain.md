# Feature: router_question, calculer, demander_a_l_humain

**From build-plan:** feature 7c
**Status:** complete

## Goal

Add the three remaining real MCP tools to `packages/mcp`, completing the agent's
tool set except for the three stubs deferred to 7d. `router_question` gives the
agent multi-code routing with an LLM call; `calculer` gives it a deterministic
arithmetic escape hatch so it never computes a legal date or threshold itself;
`demander_a_l_humain` gives it a trivial, structured way to hand off. All three
follow the same wiring pattern 7a/7b already established: a versioned
`ToolDescription`, a Zod input schema in `schema.ts`, a pure/testable core, and
registration in `server.ts`.

## In scope

- `router_question(question)` -> `{ codes, confiance, raisonnement }`, backed by
  a real Bedrock call (`bedrockProvider.volume()`) via `generateObject`, using
  the live list of `code_slug`/`code` pairs from `articles` as the candidate
  set, and able to return more than one code (the doc's own "140 km/h" example
  depends on this).
- `calculer(type, params)` -> `{ resultat, formule, sourceArticle }`, fully
  deterministic (no DB, no model call), covering the four documented types
  (`delai`, `prescription`, `anciennete`, `seuil`) with real, unit-tested
  arithmetic - see **Scope decision: `calculer`'s formulas** below for the
  exact behavior, since the source docs name the four types but never specify
  their formulas.
- `demander_a_l_humain(motif, questionOuverte)` -> `{ escalade, interlocuteur }`,
  a trivial deterministic formatter.
- Extending `verify-client.ts` to exercise all three live, same pattern as 7a/7b.

## Out of scope

- `version_a_la_date`, `resoudre_convention`, `analyser_document` (stubs, 7d).
- Wiring these tools into an actual agent loop (item 8).
- Real human-routing logic for `demander_a_l_humain`'s `interlocuteur` (no such
  system exists yet - see the scope decision below).
- Business-day-aware date arithmetic for `calculer` (calendar days/months/years
  only - see the scope decision below).

## Scope decision: `calculer`'s formulas

The technical brief (`docs/private/2-CAHIER-DES-CHARGES-TECHNIQUE.md` §5.3)
locks `calculer`'s signature and return shape but never specifies what each of
the four `type`s actually computes - there is no formula reference anywhere in
the private docs. Rather than inventing substantive legal formulas the project
hasn't verified (a `délai de rétractation` is not the same number of days as a
`délai de recours`, and guessing one would be worse than not building it), this
feature scopes `calculer` as a small, honest **date/number arithmetic engine**
that the caller parameterizes with the specific figures it already found via
`chercher_droit` - it delegates the arithmetic, not the legal knowledge:

| `type` | `params` | `resultat` | Meaning |
|---|---|---|---|
| `delai` | `{ dateDepart, duree, unite, sourceArticle }` | ISO date string | `dateDepart` + `duree` calendar `unite`s (`jours`\|`mois`\|`annees`) |
| `prescription` | same shape as `delai` | ISO date string | Structurally identical to `delai` - a prescription deadline is a start date plus a duration, same as any other legal deadline |
| `anciennete` | `{ dateDebut, dateReference?, sourceArticle }` | integer (whole calendar days) | Days elapsed between `dateDebut` and `dateReference` (defaults to now) |
| `seuil` | `{ valeur, seuil, sourceArticle }` | `'atteint'` \| `'non atteint'` | Whether `valeur >= seuil` |

`sourceArticle` is a required **input**, not something the tool resolves - only
the caller (having already called `chercher_droit`) knows which article grounds
the calculation. The tool just echoes it into the output, matching the locked
`{ resultat, formule, sourceArticle }` return shape without pretending to look
anything up. `formule` is a short human-readable string documenting the exact
arithmetic performed (e.g. `"2026-01-15 + 8 jours"`, `"1200 >= 1000"`).

This keeps `calculer` genuinely deterministic and unit-testable today. If the
evaluation harness (item 9) later shows the agent needs domain-specific
formulas (e.g. a fixed 8-day rétractation baked in), that's a follow-up, not a
silent gap here - flag it rather than building it speculatively.

Calendar arithmetic only, no business-day/holiday awareness - flagged as a
known simplification, consistent with `anciennete`'s day-count granularity
(exact days, not years/months, to stay unambiguous without a calendar library).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `demander_a_l_humain`** - `packages/mcp/src/demander-a-l-humain.ts`
  (pure function `demanderALHumain(input): { escalade: string; interlocuteur: string }`,
  `escalade` formats `motif` + `questionOuverte` into one readable string,
  `interlocuteur` is a single fixed placeholder string), `DemanderALHumainInput`
  Zod schema in `schema.ts`, `descriptions/demander-a-l-humain.ts`
  (`ToolDescription`, version 1), registered in `server.ts`, unit tests. *Done
  when:* `pnpm --filter @legirag/mcp test` passes with new tests covering the
  formatting and the fixed `interlocuteur`, and the tool is registered
  alongside the existing two in `createLegiragMcpServer()`.
- [x] **Step 2 - `calculer`** - `packages/mcp/src/calculer.ts` implementing the
  engine from the scope decision above as a `CalculerInput` Zod discriminated
  union (`type` as the discriminant, each branch's `params` fully typed - a
  safer, still wire-compatible refinement of the doc's loose
  `Record<string, unknown>` sketch) plus a pure `calculer(input, now?)`
  function; UTC-based date parsing/arithmetic (dates are `'YYYY-MM-DD'`, no
  time-of-day, so UTC avoids DST/timezone drift the way `formatDateReference`
  already has to reason about elsewhere); `descriptions/calculer.ts` (version
  1); registered in `server.ts`. *Done when:* unit tests cover all four types
  (including a `mois`/`annees` case that crosses a month/year boundary, an
  `anciennete` case, and both sides of `seuil`), `pnpm --filter @legirag/mcp
  test` passes, and the tool is registered.
- [x] **Step 3a - `router_question` pure core** - `packages/mcp/src/router-question.ts`:
  pure `buildRouterPrompt(question, available)` and pure
  `filterKnownCodes(modelCodes, available)` (drops any code the model names
  that isn't in the live list - the router equivalent of "never state an
  unsourced claim"), plus `fetchAvailableCodes(client)` (queries `select
  distinct code_slug, code from articles`, mirrors
  `packages/eval/src/build-naive-cache.ts`'s `loadCodeSlugs`); `schema.ts`
  gains `RouterQuestionInput` and `RouterQuestionOutput` (`{ codes: string[],
  confiance: number, raisonnement: string }`, the locked §5.3 shape, used both
  as the wire output type and as the `generateObject` schema in Step 3b). *Done
  when:* unit tests cover `buildRouterPrompt` and `filterKnownCodes` in
  isolation (mocked `available` list, no DB/model) and
  `pnpm --filter @legirag/mcp test` passes; `fetchAvailableCodes` is exercised
  live in Step 3b, not unit tested here (same DB-integration boundary as
  `suivre_renvoi`'s DB calls in 7b).
- [x] **Step 3b - `router_question` orchestration and registration** - add the
  impure `routerQuestion(question, model?)` to `router-question.ts`: opens the
  package's own `pg-client.ts`, calls `fetchAvailableCodes`, calls
  `generateObject` from `ai` with `bedrockProvider.volume()` and the
  `RouterQuestionOutput` schema, then filters the result through
  `filterKnownCodes` before returning it (if filtering empties `codes`, return
  `confiance: 0` with the original `raisonnement` plus a note that no known
  code matched). Add `ai` as a direct dependency in `packages/mcp/package.json`
  (`^4.0.0`, matching `packages/shared`). `descriptions/router-question.ts`
  (version 1), registered in `server.ts`. Extend `verify-client.ts` with a
  multi-code call against the live 5-code demo corpus (e.g. a highway-speeding
  question expected to touch `code-de-la-route` and `code-penal`). *Done when:*
  `pnpm --filter @legirag/mcp test` still passes, and `verify-client.ts` (run
  via `pnpm --filter @legirag/mcp verify-client` against the running dev
  server) proves a real Bedrock round-trip returns more than one code.
- [x] **Repair F-01** - `fetchAvailableCodes` queries `articles` under the
  RLS-exempt `DATABASE_URL` role, unlike every other RLS-sensitive read in
  this package. Wrap the query the same way `suivreRenvoi` does:
  `set_config('app.date_reference', ...)` + `SET LOCAL ROLE anon` inside a
  transaction. *Done when:* `fetchAvailableCodes` runs under the same RLS
  session every other DB read in this package uses, `pnpm --filter
  @legirag/mcp test` still passes, and `verify-client.ts`'s `router_question`
  call still succeeds live.

## Files / areas

- `packages/mcp/src/demander-a-l-humain.ts`, `.test.ts` (new)
- `packages/mcp/src/calculer.ts`, `.test.ts` (new)
- `packages/mcp/src/router-question.ts`, `.test.ts` (new)
- `packages/mcp/src/descriptions/demander-a-l-humain.ts`,
  `descriptions/calculer.ts`, `descriptions/router-question.ts` (new)
- `packages/mcp/src/schema.ts` (add `DemanderALHumainInput`, `CalculerInput`,
  `RouterQuestionInput`, `RouterQuestionOutput`)
- `packages/mcp/src/server.ts` (register the three new tools)
- `packages/mcp/src/verify-client.ts` (extend with three more live calls)
- `packages/mcp/package.json` (add `ai` as a direct dependency - `router_question`
  imports `generateObject` from it directly, same way `bedrock-smoke.ts` does
  in `packages/shared`; it's already a transitive dependency via
  `@ai-sdk/amazon-bedrock`, but direct use needs a direct entry)

## Data / contracts

- `router_question` output shape `{ codes: string[], confiance: number,
  raisonnement: string }` is the locked contract from the technical brief §5.3 -
  unchanged.
- `calculer`'s `params` shape per `type` is new (not previously typed anywhere)
  and is this feature's call - see the scope decision above. `resultat`,
  `formule`, `sourceArticle` stay the locked top-level shape.
- `demander_a_l_humain` output shape `{ escalade: string, interlocuteur: string
  }` is the locked contract - unchanged. Note this is a different, looser
  shape than `packages/shared`'s `Escalade` Zod object (`{ motif,
  interlocuteur }`), which belongs to `ReponseStructuree` (item 8) - the two
  are related but not the same contract, and this feature does not touch
  `Escalade`.

## Testing

`pnpm test` (Vitest) is the gate; this feature adds real unit-testable logic in
all three tools:

- `demander-a-l-humain.test.ts` - string formatting, fixed `interlocuteur`.
- `calculer.test.ts` - all four types, a month/year-boundary case for `delai`/
  `prescription`, both sides of `seuil`, `anciennete` day counting including a
  same-day (0) case.
- `router-question.test.ts` - `buildRouterPrompt` and `filterKnownCodes` only
  (pure, no network/DB). The Bedrock call itself is integration-only, verified
  live via `verify-client.ts`, consistent with `bedrock-smoke.ts` already being
  excluded from the Vitest suite for the same reason (needs real AWS
  credentials, not deterministic input/output).
- Live verification: extend `verify-client.ts` to call all three tools through
  a real MCP round-trip (server already running via
  `pnpm --filter @legirag/mcp dev`), run with
  `pnpm --filter @legirag/mcp verify-client`.

## Notes for the AI

- Follow 7a/7b's established shape exactly: `ToolDescription` in
  `descriptions/`, Zod input schema in `schema.ts`, a pure core function
  separated from any impure orchestration (DB/model call), registration in
  `createLegiragMcpServer()`.
- `calculer` must never call the DB or a model - that's the whole point of the
  tool (R6 in the business brief: "l'agent ne calcule jamais lui-même"). Keep
  it a pure function.
- `router_question`'s own `pg-client.ts` already exists in this package (from
  7b) - reuse it, don't duplicate it again.
- Reuse the bigint-safety lesson from 7b's F-02: if any new SQL query touches
  an `id`/`bigint` column, cast it (`::int`) rather than trusting `pg`'s
  default string coercion. (`fetchAvailableCodes` doesn't select an id column,
  so this likely doesn't apply here, but check before assuming.)
- Dates in `calculer` are plain `'YYYY-MM-DD'` strings, no time-of-day - parse
  and do arithmetic in UTC to avoid the timezone class of bug
  `formatDateReference` exists to prevent elsewhere.
- `demander_a_l_humain`'s `interlocuteur` being a fixed placeholder is a known,
  documented simplification (see Out of scope) - don't try to invent a routing
  taxonomy for it.

## Live verification result

Ran `pnpm --filter @legirag/mcp dev` then `pnpm --filter @legirag/mcp
verify-client` (real MCP round-trip, real Bedrock call) twice: once after
Step 3b, once after the F-01 repair.

- `demander_a_l_humain` -> clean `escalade` string combining `motif` +
  `questionOuverte`, fixed `interlocuteur`.
- `calculer` (`delai`, 2026-01-15 + 14 jours) -> `resultat: "2026-01-29"`,
  correct.
- `router_question` on *"je roule à 140 km/h sur autoroute, qu'est-ce que je
  risque ?"* -> `codes: ["code-de-la-route", "code-penal"]`, `confiance: 0.95`,
  a coherent `raisonnement` - the exact multi-code behavior the project's own
  technical brief uses as this tool's litmus test. Reproduced identically
  after the F-01 repair (RLS role switch), confirming the fix changed nothing
  observable for the current corpus while closing the latent gap.

## Findings

### 07c/F-01 [P2] closed - fetchAvailableCodes bypasses the anon/RLS role every other DB read in this package uses

**File:** packages/mcp/src/router-question.ts:14
**Found:** 2026-08-17 by /audit (scope: current, feature 7c)
**Why it matters:** Every other RLS-sensitive read in this codebase
(`SupabaseRetriever.search` in packages/retrieval/src/supabase-retriever.ts:82-88,
`suivreRenvoi`/`fetchRenvoiRowsUnderActiveRlsSession` in packages/mcp/src/
suivre-renvoi.ts) explicitly sets `app.date_reference` and switches to
`SET LOCAL ROLE anon` before querying, because the connecting `DATABASE_URL`
role (postgres) is RLS-exempt by design - confirmed by supabase-retriever.ts's
own comment ("Bascule vers le rôle réellement soumis à la RLS"). `fetchAvailableCodes`
queried `articles` directly under the RLS-exempt role, with no role switch and
no `app.date_reference` set. Unobservable against the current corpus (zero
`ABROGE`/historical rows), so `router_question` and `chercher_droit` still
agreed on which codes exist. But if a whole code's articles ever became
entirely non-current (repealed or not yet in force), `router_question` would
have kept recommending it as a routing target while `chercher_droit` correctly
returned nothing for it under RLS - a silent drift from the project's stated
invariant that visibility filtering is enforced by the database itself, not
trusted to application code. Not a content-leak risk (the query only returns
code slugs/titles, not article text), which is why this was P2 and not P1: no
concrete broken behavior existed against the current corpus, only a latent one
once historical data lands (item 10).
**Suggested fix:** Wrap the query the same way `suivreRenvoi` wraps its
RLS-relevant query: `set_config('app.date_reference', ...)` + `SET LOCAL ROLE
anon` inside a transaction.
**Resolution:** Fixed 2026-08-17. `routerQuestion` now opens a transaction,
sets `app.date_reference` and `SET LOCAL ROLE anon` before calling the renamed
`fetchAvailableCodesUnderActiveRlsSession` (name change mirrors
`fetchRenvoiRowsUnderActiveRlsSession` in suivre-renvoi.ts, encoding the
precondition in the function name). Verified live via `verify-client.ts`:
`router_question` on the 140 km/h question still returns both
`code-de-la-route` and `code-penal` under the new RLS session. Re-reviewed
2026-08-17 by /audit (scope: current): `routerQuestion` matches
`suivreRenvoi`'s BEGIN/set_config/SET LOCAL ROLE anon/COMMIT-or-ROLLBACK
pattern exactly, `available` is safely assigned before use under TS control
flow, no new defect introduced. Closed.

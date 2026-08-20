# Current Feature

## Title

Mocked backend dev mode for `packages/web`

## Type: Fix

## The problem

Testing `web`'s UI locally (answer rendering, history, trace view, article
expansion) currently forces the whole real chain to run (`api`, `agent`,
Bedrock, Cohere, Supabase) through `proxyToApi`
(`packages/web/src/lib/api-proxy.ts`), which costs real money even for tests
that only exercise rendering and don't need the answer to be correct.

## The fix

Add a dev-only env var, `LEGIRAG_MOCK_BACKEND=true`, that short-circuits the
three Next.js server routes involved **before** `proxyToApi` runs:
`app/api/question`, `app/api/trace/[traceId]`, `app/api/article/
[articleIdentifier]`. When it's active, none of these routes call
`proxyToApi` or `requireEnv('LEGIRAG_API_URL' | 'LEGIRAG_ACCESS_TOKEN')` -
`pnpm --filter @legirag/web dev` must start and respond without those
variables set at all.

**Prod guard**: the flag only takes effect when `process.env.NODE_ENV !==
'production'` in addition to being `'true'` - an accidental toggle in prod
stays a no-op.

**Scenarios** (more than one, not a single happy path), selected by a
case/accent-insensitive keyword in the question text sent to `POST
/api/question`:

- contains `"abstention"` -> `confiance: 'abstention'` response with
  `escalade`, no `regle_principale`
- contains `"erreur"` -> the SSE stream emits a `route` event then an `error`
  event (`{ message }`), no `done` - simulates a failure the graph itself
  couldn't recover from
- otherwise -> nominal case: `regle_principale` + `textes_complementaires` +
  `hors_perimetre`, `confiance: 'elevee'`

The mocked SSE stream mirrors the real shape
(`packages/api/src/question/stream-question.ts`): node events (`route`,
`search`, `draft`, `followRenvois`) spaced out by a short artificial delay
(300-500 ms) so the UI's activity log is actually observable, then `done`
(or `error`).

**Fixtures must read as genuine, not as placeholder data.** Whoever eyeballs
the UI in mock mode is judging rendering quality, so a citation reading
`"Lorem ipsum"` or `article_num: "TODO"` defeats the point. Use plausible
French legal content in the same shape the real corpus produces: real code
names (e.g. `"Code du travail"`, `"Code civil"`), article numbers in the
project's real numbering style (e.g. `"L1226-2"`, `"1240"`), a `texte_exact`
that reads like an actual (if illustrative, not necessarily verbatim-current)
article, valid `url_legifrance` URLs pointing at legifrance.gouv.fr, and a
`verdict`/`hors_perimetre` written the way the real agent phrases them - not
obviously synthetic strings like `"mock citation 1"`.

Each nominal/abstention scenario fixes its own mocked `trace_id` (e.g.
`mock-trace-nominal`, `mock-trace-abstention`) and its citations'
`article_identifier`s point at fixed mocked ids (e.g. `mock-article-1`).
`GET /api/trace/:traceId` and `GET /api/article/:articleIdentifier` recognize
those known ids and return the matching fixture; any other id returns 404,
same as the real API would - this also lets the "not found" state be tested
by visiting an unknown id.

**Must not break**: default behavior (flag absent/`false`) - every route
keeps going through `proxyToApi` exactly as it does today.

## Build steps

1. [x] **Mock-mode detection, scenario selection, and fixtures** -
   `packages/web/src/lib/mock-backend.ts`: `isMockBackendEnabled()` (reads
   `LEGIRAG_MOCK_BACKEND` + `NODE_ENV`), `selectScenario(question: string)`
   (pure function, keyword -> `'nominal' | 'abstention' | 'erreur'`), and the
   `ReponseStructuree`/`ExecutionTrace`/`Article`+`Subdivision[]` fixtures,
   valid against the existing Zod schemas and written to read as genuine
   legal content (see above). `selectScenario` is pure, testable logic (the
   test-scope rule in `coding-standards.md`) -> a unit test covers all three
   branches plus case/accent-insensitivity.
   Done when: `pnpm test` passes with the new test, and the fixtures pass
   `ReponseStructuree.parse(...)` / `ExecutionTrace.parse(...)` without
   throwing.

2. [x] **Wire the three routes + docs** - in `app/api/question/route.ts`,
   `app/api/trace/[traceId]/route.ts`, `app/api/article/
   [articleIdentifier]/route.ts`: when `isMockBackendEnabled()`, respond
   directly from the fixtures (streamed SSE for `/question`, JSON for the
   other two, 404 via `Response` for an unknown id) without touching
   `proxyToApi`. Add `LEGIRAG_MOCK_BACKEND` to `.env.example` (commented,
   dev-only) and a note in `AGENTS.md` (Commands section) explaining how to
   run `web` standalone in mocked mode.
   Done when: `LEGIRAG_MOCK_BACKEND=true pnpm --filter @legirag/web dev`
   starts with no `LEGIRAG_API_URL`/`LEGIRAG_ACCESS_TOKEN`/any other backend
   var set, and asking a question containing "abstention" / "erreur" / plain
   text from the main screen in the browser produces the three expected
   behaviors, clicking a citation opens the mocked article, and the trace
   link shows the mocked trace.

## Verify

- `pnpm test` and `pnpm typecheck` green.
- Manual: `LEGIRAG_MOCK_BACKEND=true pnpm --filter @legirag/web dev --port
  3001`, open the main screen, ask a plain question (nominal), one
  containing "abstention", one containing "erreur" - check each case
  renders correctly and looks like a real answer, that expanding a citation
  opens the mocked article, and the trace view (`/trace/mock-trace-nominal`).
- Confirm that with `LEGIRAG_MOCK_BACKEND` unset, existing behavior (proxy to
  the real API) is unchanged.

## Outcome

Both build steps completed and verified against a live dev server
(`LEGIRAG_MOCK_BACKEND=true`): curl against all three routes for all three
scenarios, plus Playwright screenshots of the nominal answer, the expanded
mocked article, and the trace panel/full trace page, all rendering credible
French legal content rather than placeholder text. `pnpm build`,
`pnpm typecheck`, `pnpm test` (55 files / 384 tests), and `pnpm lint` all
green.

Documentation went further than the build steps' original "add a note"
scope, at the user's explicit request: a dedicated "Mocked dev mode"
subsection in `AGENTS.md` (scenario table, 404 behavior, what the flag does
and doesn't affect) and an explicit mention in the root `README.md`.

One repair surfaced by a post-implementation `/audit` pass, not anticipated
by the original spec: the mocked trace's `question` field was a fixed string
per scenario, unrelated to whatever the user actually typed - directly
undercutting this fix's own "must read as genuine" requirement, reproducible
by asking any nominal question and opening the full trace page. Fixed with an
in-memory per-scenario question record (`packages/web/src/lib/
mock-fixtures.ts`), re-verified live and re-reviewed by a second `/audit`
pass. See Findings below (`F-12`). A second, lower-severity finding
(`F-13`, duplicated fixture data) was fixed in the same pass.

## Findings

### mocked-backend-dev-mode/F-12 [P2] closed - mocked trace's `question` field never reflects the question actually asked

**File:** packages/web/src/lib/mock-fixtures.ts:159-211
**Found:** 2026-08-20 by /audit (scope: current)
**Why it matters:** `nominalTrace`/`abstentionTrace` hardcode a fixed `question` string, independent of whatever question the user actually typed into `POST /api/question`. The full trace page (`packages/web/src/app/trace/[traceId]/page.tsx:39`) renders that field prominently: `Trace <id> pour « {trace.question} »`. Reproduce: with `LEGIRAG_MOCK_BACKEND=true`, ask any nominal question other than the one baked into the fixture (e.g. "Puis-je rouler à 140 sur l'autoroute ?"), open "Voir le raisonnement" -> "Ouvrir la page complète de la trace" - the page shows an unrelated question about a work-accident dismissal instead of what was typed. This directly contradicts the current-feature.md spec's own requirement that mock fixtures "must read as genuine, not as placeholder data" - it's the one place in the mocked flow where the illusion breaks in an easily-reproduced way during exactly the kind of manual QA this feature exists to support.
**Suggested fix:** Record the real question text against its scenario's fixed trace id at `POST /api/question` time (in-memory is enough for single-process local dev - no persistence needed), and have `mockTraceFor` substitute it in over the fixture's default `question` when present.
**Resolution:** Added an in-memory `Map<traceId, question>` in `mock-fixtures.ts`, written by `mockQuestionStream` (now takes `question` as a second argument) and read by `mockTraceFor`, which overlays the recorded question onto the fixture when present. `question/route.ts` updated to pass the real question through. Verified live: asked "Puis-je rouler à 140 sur l'autoroute ?" via curl, `GET /api/trace/mock-trace-nominal` returned that exact text. Two new tests cover the nominal and abstention cases. `pnpm test`/`typecheck` green. Re-reviewed 2026-08-20 by /audit (scope: current): defect confirmed gone, `recordMockQuestion`'s Map holds at most 2 entries (one per scenario's fixed trace id) so no leak, no new defect introduced by the repair - closed.

### mocked-backend-dev-mode/F-13 [P3] closed - `sectionPath` fixture array duplicated verbatim between two mock articles

**File:** packages/web/src/lib/mock-fixtures.ts:229-235,250-256
**Found:** 2026-08-20 by /audit (scope: current)
**Why it matters:** `mockArticles['mock-article-1']` and `mockArticles['mock-article-2']` both hardcode the identical 5-element `sectionPath` array (both articles genuinely sit under the same Code du travail section in real life, so the duplication is accurate, not wrong - but it's copy-pasted rather than shared, so an edit to one during a future fixture update could silently diverge from the other).
**Suggested fix:** Extract a shared `const accidentDuTravailSectionPath = [...]` and reference it from both fixtures.
**Resolution:** Extracted `accidentDuTravailSectionPath` in `mock-fixtures.ts`, both `mock-article-1` and `mock-article-2` now reference it. `pnpm typecheck` green. Re-reviewed 2026-08-20 by /audit (scope: current): confirmed the two fixtures share the same array reference; checked no code in `packages/web/src` reads or mutates `Article.sectionPath` outside this file, so the shared reference carries no risk - closed.

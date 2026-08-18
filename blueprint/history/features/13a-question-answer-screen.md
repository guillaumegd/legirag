# Feature: Next.js scaffold and the question/answer screen

**From build-plan:** feature 13a (split from 13 - see build-plan.md for the
full 13a-13d breakdown and why the time-travel view is deferred)
**Status:** complete

## Goal

Turn `packages/web` from an empty stub into a real Next.js app with the
project's one live screen so far: ask a legal question in plain French, watch
the agent work, and read the sourced answer - the main rule, the graph of
supplementary texts, and the always-visible out-of-scope panel - streamed
from `POST /question` as it's produced. Every cited source stays checkable in
place: its exact excerpt, its full article text on demand, and a direct link
to Légifrance.

## Design reference

`prototypes/question-answer.html` (structure and copy) and
`prototypes/theme.css` (the locked design tokens - colors, type, spacing,
radii). Port `theme.css`'s CSS custom properties into the app's global
stylesheet before building any component against the mockup. The prototype's
nav also links to `time-travel.html` and `agent-trace.html`; only the
question/answer screen exists after this feature (see Out of scope), so the
shared header ships without a nav bar for now - a nav appears once there's a
second real route.

## In scope

- Bootstrap `packages/web` as a real Next.js App Router app (replacing the
  `tsc`-only stub), strict TypeScript, matching the monorepo's pnpm workspace
  conventions.
- Port `theme.css` tokens into the app's global stylesheet; shared header
  (brand mark + tagline, no nav yet) and page shell matching the prototype.
- CORS on the API so the browser can call it directly, and a
  `NEXT_PUBLIC_API_URL`-driven client for `POST /question`.
- A small SSE parser (pure function: raw `text/event-stream` chunks in,
  typed `{ event, data }` records out) - this is the one piece of real logic
  in this feature and gets a unit test.
- Question input, submit, and a live activity log rendering each streamed
  node update in plain French while the agent works.
- Rendering the final answer on the `done` event: `regle_principale`
  citation (verdict, code, article, état, date, Légifrance link),
  `textes_complementaires` with their `motif_presence`, cross-code entries
  visually distinct from same-code ones, and the always-visible
  `hors_perimetre` panel.
- A visible error state when the stream emits an `error` event or the
  connection fails.
- Trace-id footer line, styled per the prototype, linking to `/trace/[id]`
  (route not built until 13b - see Out of scope).
- An in-place "voir l'article entier" expander under every cited source
  (`regle_principale` and each `textes_complementaires` entry): fetches
  `GET /article/:articleIdentifier` and unfolds the full article text and
  subdivisions directly under the citation, without leaving the page.

## Out of scope

- The agent-trace page itself (`/trace/[traceId]`) and any technical/metrics
  summary (cost, duration, per-tool calls) - 13b, reached only through the
  footer's trace link. This screen stays the plain-language user view; the
  technical/demo view lives entirely in 13b (confirmed 2026-08-18). The
  footer link is built now and will 404 until 13b lands.
- The time-travel view and its footer link - deferred until item 10 (see
  build-plan.md's note under item 13); not part of any 13x sub-item yet.
- End-to-end smoke test - 13c.
- The measurement write-up - 13d.
- Any auth, accounts, or per-user scoping - the product is anonymous per
  `project-overview.md`.
- Mobile-specific layout polish beyond what the prototype already shows
  (the prototype is desktop-first; basic responsiveness is fine, a dedicated
  mobile pass is not required).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight
   on. Checkpoints are optional; `/complete` makes the real feature-level
   commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the
step was too big, so split it.

## Build steps

- [x] **Step 1 - Next.js scaffold, design tokens, page shell** - replace the
  `packages/web` stub (`src/index.ts`, the `tsc`-only `package.json`) with a
  real Next.js App Router app: `next`, `react`, `react-dom` dependencies,
  `dev`/`build`/`start`/`lint`/`typecheck` scripts, root layout, and a global
  stylesheet carrying `theme.css`'s custom properties. Add the shared header
  (brand mark + tagline) and page wrapper matching the prototype's `.wrap`/
  `.site-header` structure, with a placeholder "Posez votre question"
  heading and no functionality yet. *Done when:* `pnpm --filter @legirag/web
  dev` serves a page visually matching the prototype's header and empty page
  shell, and `pnpm --filter @legirag/web build` succeeds.
- [x] **Step 2 - CORS, shared-schema exports, and the streaming API client**
  - enable CORS in `packages/api/src/main.ts` (public, unauthenticated API,
  no cookies involved); add explicit subpath exports to
  `packages/shared/package.json` (`./schema`, `./types`) so the browser
  bundle can import `ReponseStructuree`/`Citation`/`TexteComplementaire`
  without pulling in the Bedrock/AWS SDK code the package's root barrel
  re-exports; add `packages/web/.env.example` with `NEXT_PUBLIC_API_URL`;
  write the SSE parser (pure function) and an `askQuestion` client function
  that `POST`s to `${NEXT_PUBLIC_API_URL}/question` and yields parsed
  events. *Done when:* the SSE parser's unit test passes (`pnpm test`), and
  a manual `curl -N -X POST http://localhost:3000/question` (API dev server)
  still streams events unaffected by the CORS change.
- [x] **Step 3 - question form and live activity log** - client component:
  input (empty, with an example question as placeholder text, not a
  pre-filled submittable value) + submit calling `askQuestion`, a "Nouvelle
  question" control that resets to the initial empty state, and an activity
  log rendering each streamed node update (`route`, `search`, `draft`,
  `followRenvois`, ...) as a plain-French line while the agent works, per
  the prototype's `.activity` list. Before any question is submitted, only
  the form renders - no activity log, no answer sections. *Done when:*
  loading the page shows just the form; submitting a question against a
  running API shows the activity log updating live as the agent progresses;
  "Nouvelle question" clears everything back to the initial state.
- [x] **Step 4 - final answer: main rule, and the abstention path** - on the
  `done` event, parse the payload with the imported `ReponseStructuree`
  schema and render the `regle_principale` citation block (verdict, code,
  article, état, date, Légifrance link) per the prototype's
  `.answer-block`/`.citation` styles. `regle_principale` is only present
  when `confiance !== 'abstention'` (the schema's own refine rule) - when
  `confiance` is `'abstention'`, render the `escalade` (`motif` +
  `interlocuteur`) instead of a citation block; the prototype has no
  abstention mockup, so style it consistently with the rest of the theme
  (e.g. the existing `.scope-panel` treatment) rather than inventing new
  tokens. *Done when:* a real high-confidence question renders a correctly
  sourced main-rule block matching the prototype's layout, and a real
  question the agent abstains on renders the escalade message instead of a
  missing/broken citation block.
- [x] **Step 5 - textes complémentaires, hors périmètre, footer bar, error
  state** - render each `textes_complementaires` entry with its
  `motif_presence`, visually distinguish entries whose `code` differs from
  the main citation's, render the always-visible `hors_perimetre` list, and
  the footer bar per the prototype's `.footer-bar` (confidence badge from
  `confiance`, `date_reference`, and the trace-id line linking to
  `/trace/[traceId]`), plus a visible error state for the stream's `error`
  event or a failed fetch. *Done when:* the full answer (main rule +
  supplementary texts + out-of-scope panel + footer bar) renders correctly
  for a real multi-citation question, and triggering a stream error (e.g.
  API stopped) shows the error state instead of a silent hang.
- [x] **Step 6 - full article, in place, per source** - a "voir l'article
  entier" toggle under each citation (`regle_principale` and every
  `textes_complementaires` entry) that calls
  `GET /article/:articleIdentifier?dateReference=<date_reference>` and
  unfolds the full `contenuText`/`contenuMarkdown` plus its `subdivisions`
  (ordered by `ordre`) directly beneath the citation, collapsible again
  without a page change. Handle the loading state and the 404 case
  (`NotFoundException` - article not found or not visible for that date).
  *Done when:* clicking the toggle under a real citation unfolds the
  article's full text in place, collapses back on a second click, and an
  article the API reports not found renders a clear inline message instead
  of breaking the layout.
- [x] Repair F-09 - AskQuestion never cancels the in-flight stream, so a
  stale response can overwrite fresh state after "Nouvelle question" or a
  new submit. *Done when:* an `AbortController` is created per submission,
  passed to `askQuestion()`, aborted in `reset()` and at the start of the
  next `handleSubmit`, and `AbortError` is swallowed silently in the catch
  block instead of showing the connection-error banner.
- [x] Repair F-10 - ArticleExpander can silently re-expand after the user
  collapses it mid-load, because the async fetch has no cancellation guard.
  *Done when:* a per-invocation token (or `AbortController`) means a
  response arriving after the user has since collapsed (or re-toggled) the
  panel no longer overrides that state.

## Files / areas

- `packages/web/` - new Next.js app structure (`app/`, `next.config.ts`,
  updated `package.json`/`tsconfig.json`), replacing the stub.
- `packages/web/.env.example` - new, `NEXT_PUBLIC_API_URL`.
- `packages/api/src/main.ts` - add `app.enableCors()`.
- `packages/shared/package.json` - add `./schema` and `./types` subpath
  exports.

## Data / contracts

Reuses the already-locked shared contracts, no new ones:

- `ReponseStructuree`, `Citation`, `TexteComplementaire`, `MotifPresence`,
  `Confiance`, `Escalade` (`packages/shared/src/schema.ts`) for the `done`
  payload.
- `Article`, `Subdivision` (`packages/shared/src/types.ts`, exposed via the
  same `./types` subpath as above) for `GET /article/:articleIdentifier`'s
  `{ article, subdivisions }` response, used by Step 6. No API change
  needed - the endpoint already exists (11b).
- The SSE envelope itself is informal today (`formatSseEvent`, `packages/
  api/src/question/sse.ts`): `event: <node-name | 'done' | 'error'>` +
  `data: <JSON>`. This feature's SSE parser treats intermediate node events
  generically (`{ event: string; data: unknown }`) rather than typing every
  node's `partialState` shape - only the `done` payload gets strict Zod
  validation. Load-bearing for 13b, which will read the same envelope shape
  from persisted `ExecutionTrace` steps instead of the live stream.

## Testing

`pnpm test` (Vitest) is configured and the gate is on. In-scope logic here
is the SSE parser (`text/event-stream` chunks -> typed records) - pure,
testable, gets a unit test covering a multi-event chunk, a chunk split
mid-event (partial read), and a malformed/empty chunk. Everything else in
this feature (layout, streaming UI, live rendering) is UI/integration and
rides on the done-when evidence above (dev server screenshots, a real run
against the API) rather than unit tests, per `coding-standards.md`'s testing
scope rule.

## Notes for the AI

- `packages/web` currently has no client dependencies at all (`tsc`-only
  stub) - Step 1 is a real scaffold, not a config tweak. Keep it minimal:
  App Router, TypeScript, no UI framework/component library beyond what the
  prototype already implies (plain CSS with custom properties, matching
  `theme.css`).
- Next.js needs `moduleResolution: "bundler"` (or Next's own generated
  tsconfig defaults), which differs from the rest of the monorepo's
  `NodeNext` convention in `tsconfig.base.json` - that's an intentional,
  contained exception for this package, not a monorepo-wide change.
- Do not import `@legirag/shared` (the root barrel) from any client-rendered
  code - it re-exports `bedrockProvider`, which pulls in the AWS Bedrock SDK
  and would bloat or break the browser bundle. Import only via the new
  `@legirag/shared/schema` and `@legirag/shared/types` subpaths added in
  Step 2.
- `POST /question` streams via `text/event-stream` but is a `POST`, so the
  browser's native `EventSource` (GET-only) doesn't apply - use `fetch` with
  a `ReadableStream` reader and the hand-written parser.
- CORS: this is a public, anonymous API with no cookie/session auth
  (confirmed in `project-overview.md` - no accounts in v1), so an open
  `app.enableCors()` is appropriate; don't build a credentialed/origin-locked
  setup that has nothing to protect yet.
- Match `coding-standards.md`: no `any`, Zod validation for the `done`
  payload, French domain vocabulary (`verdict`, `regle_principale`, ...)
  left untranslated in code and UI copy alike.

## Post-implementation notes

- **Citation contract gap found and fixed during Step 4:** `Citation`
  (`packages/shared/src/schema.ts`) never carried a human-readable article
  number, only the opaque LEGIARTI `article_identifier`, even though the
  underlying data (`ArticleForCitation.articleNum`) was already available
  one layer up in `packages/retrieval`. Added `article_num` to `Citation`
  and threaded it through `toCitation()` (`packages/agent/src/citation.ts`)
  - confirmed safe with the user first, since the drafting LLM never touches
  `Citation` fields directly (index-based selection, item 8d's grounding
  design), so this was pure plumbing with no prompt risk. Touched
  `packages/shared`, `packages/agent`, and three test fixtures
  (`citation.test.ts`, `graph.test.ts`, `cross-ref-coverage.test.ts`).
- **`prototypes/` kept intact, by explicit user decision (2026-08-18)**,
  deviating from this skill's default "discard consumed prototypes" step -
  `agent-trace.html` and `time-travel.html` are still needed as design
  references for 13b and the deferred time-travel sub-feature. Revisit once
  all of item 13's sub-features are built.
- **Branding simplified during manual review (2026-08-18):** the user
  dropped the "— Le déplieur" tagline everywhere it appeared (site header,
  page `<title>`, all three `prototypes/*.html` mockups,
  `project-overview.md`'s own heading) after trying the running app - kept
  as-is, not reverted.
- **New open question surfaced during manual testing, recorded in
  `project-overview.md`:** direct "que dit l'article X" questions can
  falsely abstain when semantic search doesn't surface the named article,
  because none of the agent's tools (item 7) support a direct lookup by
  article identifier/number - the front end's own
  `GET /article/:articleIdentifier` (used by this feature's Step 6) isn't
  exposed to the agent. Flagged as a follow-up, not fixed here (out of
  13a's scope - this is an agent/retrieval gap, not a front-end one).

## Findings

### 13a/F-09 [P1] closed - AskQuestion never cancels the in-flight stream, so a stale response can overwrite fresh state

**File:** packages/web/src/components/ask-question.tsx:29-65
**Found:** 2026-08-18 by /audit (scope: current)
**Why it matters:** `askQuestion()` (`packages/web/src/lib/api-client.ts`) already accepts an optional `AbortSignal` for exactly this purpose, but `ask-question.tsx` never creates or passes one. `reset()` ("Nouvelle question", rendered any time `status !== 'idle'`, including `'asking'`) sets the UI back to idle, but the `for await` loop inside the in-flight `handleSubmit` call keeps running in the background - when it later receives `done`/`error`/an activity event, it calls `setReponse`/`setStatus`/`setActivity` again, silently resurrecting the old answer (or a stray activity line) after the user explicitly asked for a clean slate. The same gap means a state update can also fire after the component unmounts (e.g. the user follows the trace link mid-stream), since nothing aborts the fetch when its caller goes away.
**Suggested fix:** Create an `AbortController` per submission (e.g. via `useRef`), pass its `signal` to `askQuestion()`, call `.abort()` at the start of `reset()` and again at the start of `handleSubmit` before starting the next request, and treat `AbortError` in the `catch` block as a silent no-op instead of showing the connection-error banner.
**Resolution:** Fixed 2026-08-18 in `ask-question.tsx`: an `AbortController` (`useRef`) is created per submission and passed as `askQuestion()`'s signal, aborted at the start of `reset()` and at the start of the next `handleSubmit`, and also aborted on unmount via a `useEffect` cleanup. The `catch` block now checks `error instanceof DOMException && error.name === 'AbortError'` and returns silently instead of showing the connection-error banner. Verified live: aborting mid-stream via the real API throws `AbortError` as expected and stops event consumption immediately. Closed 2026-08-18 by /audit (scope: current): re-read the repaired file in full, traced every abort path (reset, resubmit, unmount) against the code, confirmed no new race is introduced (each submission's controller/catch are scoped to that invocation only), and re-ran typecheck/lint/test/build - all green.

### 13a/F-10 [P2] closed - ArticleExpander can silently re-expand after the user collapses it mid-load

**File:** packages/web/src/components/article-expander.tsx:23-38
**Found:** 2026-08-18 by /audit (scope: current)
**Why it matters:** `toggle()` only inspects `state.kind` synchronously at click time; there is no request token or cancellation guard. Collapsing the panel while `state.kind === 'loading'` sets state back to `'collapsed'`, but the in-flight `fetchArticle` promise still resolves afterward and unconditionally calls `setState({ kind: 'loaded' | 'not-found' | 'error' })`, reopening the panel against the user's explicit action. The same lack of a guard lets a rapid double-click fire two concurrent `fetchArticle` calls for the same article before the first re-render lands.
**Suggested fix:** Guard the async callback with a per-invocation token (e.g. a ref incremented on every `toggle()`, only `setState` if the token is still current) or an `AbortController` per expand, so a stale response can no longer override a state the user has since changed.
**Resolution:** Fixed 2026-08-18 in `article-expander.tsx`: a `requestToken` ref is incremented on every `toggle()` call (both collapse and expand paths), and the async `fetchArticle` callback only applies its result via `setState` if the ref still matches the token captured at call time. A collapse-during-load or a rapid double-click can no longer have a stale response reopen or overwrite the panel. Closed 2026-08-18 by /audit (scope: current): re-read the repaired file, traced the token increment/compare through the collapse, re-expand, and double-click cases (last-write-wins semantics hold in every case), confirmed no new defect, and re-ran typecheck/lint/test/build - all green.

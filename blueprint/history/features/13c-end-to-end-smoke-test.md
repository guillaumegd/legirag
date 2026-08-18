# Feature: End-to-end smoke test

**From build-plan:** feature 13c (split from 13 - see build-plan.md for the
full 13a-13d breakdown and why the time-travel view is deferred)
**Status:** complete

## Goal

A scripted check of the full question-to-answer path exercised through the
real front end (`packages/web`) talking to a real running API, so a
regression that breaks the browser-side flow (SSE parsing, rendering, the
trace link) gets caught the same way `scripts/smoke-test.sh` (item 11d)
already catches an API-only regression.

## Design reference

None - this is a test-infrastructure feature, not a visual one. It exercises
the screens already built in 13a/13b against their existing design.

## In scope

- Playwright (`@playwright/test`) as a `packages/web` devDependency, with a
  `playwright.config.ts` reading the web app's URL from an `E2E_BASE_URL`
  env var (default `http://localhost:3001`, matching how the web and API
  dev servers are actually run side by side - the API already defaults to
  port 3000, so the web app can't share it). No `webServer` auto-start
  block - like `scripts/smoke-test.sh`, this check runs against whatever
  instance (dev server or 11d's Docker container) is already up, it doesn't
  spin one up itself.
- One Playwright spec, `packages/web/e2e/question-answer.spec.ts`, covering
  the full path in one flow: load the home page, ask a real question,
  observe the live activity log update, wait for the final sourced answer
  to render, follow the footer's "voir la trace" link, and confirm the
  trace page (13b) loads and shows a matching, non-empty timeline.
- A `test:e2e` script on `packages/web/package.json`, and a line under
  `AGENTS.md`'s Commands section documenting it.

## Out of scope

- Any CI wiring for this check (unlike `pnpm test`, this needs a live,
  costed Bedrock/Supabase-backed API instance running, so it is not a
  candidate for the existing `ci.yml` the way unit tests are - out of scope
  here, same reasoning `12b` already applied to the eval harness's cadence).
- Testing the time-travel view (not built - deferred to item 10).
- Multiple browsers/devices, visual regression screenshots, or a broader
  Playwright suite beyond this one flow - a smoke test proves the path
  works end to end, it is not a full E2E regression suite.
- Docker orchestration (building/starting the 11d container from the test) -
  the check targets whatever's already running, mirroring
  `scripts/smoke-test.sh`.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Playwright setup** - add `@playwright/test` as a
  `packages/web` devDependency, install its browser binaries, and add
  `playwright.config.ts` (`E2E_BASE_URL`-driven `baseURL`, no `webServer`
  auto-start, Chromium only - a smoke test needs one real browser, not a
  cross-browser matrix). *Done when:* `pnpm --filter @legirag/web exec
  playwright --version` runs successfully and the config loads without
  error.
- [x] **Step 2 - the smoke spec, `test:e2e` script, and command doc** -
  write `question-answer.spec.ts` per the In-scope description, add the
  `test:e2e` script, and document the command in `AGENTS.md`. *Done when:*
  running `pnpm --filter @legirag/web test:e2e` against the real running web
  app (`localhost:3001`) and API (`localhost:3000`) passes, proving the
  question-to-answer path and the 13b trace link both work end to end
  through a real browser.

## Files / areas

- `packages/web/package.json` - `@playwright/test` devDependency and
  `test:e2e` script
- `packages/web/playwright.config.ts` - new
- `packages/web/e2e/question-answer.spec.ts` - new
- `AGENTS.md` - documented the `test:e2e` command under Commands, and
  corrected its stale "no dev server yet" line

## Data / contracts

- None new - this feature only drives the UI already built against the
  already-locked `ReponseStructuree`/`ExecutionTrace` contracts.

## Testing

- This feature *is* the test - no unit test applies. Evidence is the
  Playwright run itself against the real running services, per
  `coding-standards.md`'s browser-verification guidance.

## Notes for the AI

- Matched the question asked in the smoke spec loosely to
  `scripts/smoke-test.sh`'s own question style (a real, answerable
  question) rather than an edge case - this is a smoke test, its job is
  proving the happy path works.
- The Bedrock/Supabase call this spec triggers is real and has real
  cost/latency (same tradeoff `scripts/smoke-test.sh` already accepts for
  11d) - a generous timeout (15 s) is used for the first activity event,
  since the route step alone took ~4 s in the real trace observed live
  during 13b.
- Reused the existing `.env.local` (`NEXT_PUBLIC_API_URL`) rather than
  adding a second way to point the browser at the API.

## Live verification result

`pnpm exec playwright test` run twice against the real, running `web` dev
server (`localhost:3001`) and `api` dev server (`localhost:3000`, real
Supabase + Bedrock backends) - both real passes, not mocked:

- First pass (after Step 2): 1 passed in 19.6 s. Caught and fixed one real
  timing issue along the way: the default 5 s Playwright assertion timeout
  was too tight for the first activity-log event (~4 s in practice, per the
  real route-step duration observed in 13b's own live trace) - raised to
  15 s.
- Second pass (after the audit-fix commit touching `trace.css`): 1 passed
  in 20.5 s, confirming the CSS fix (13b/F-13) didn't regress the flow.

`pnpm test` (318/318), `pnpm --filter @legirag/web typecheck`, and
`pnpm --filter @legirag/web build` all green throughout.

## Findings

### 13c/F-12 [P2] closed - `packages/web`'s own `lint` script (`next lint`) was broken under Next.js 16

**File:** packages/web/package.json:10
**Found:** 2026-08-18 by /audit (scope: current)
**Why it matters:** running `pnpm --filter @legirag/web lint` failed outright ("Invalid project directory provided, no such directory: .../web/lint"), discovered while touching this exact file to add the `test:e2e` script. The project's actual documented Lint gate (root `pnpm lint`, `eslint .`) already covers `packages/web` and passes clean, so nothing was silently slipping past CI - but the per-package script itself was dead, and a developer following the monorepo's established convention (every other package's own scripts run directly) would hit a confusing failure.
**Suggested fix:** Point `packages/web`'s `lint` script at `eslint .` directly, matching the root script and the rest of the monorepo.
**Resolution:** Fixed 2026-08-18 - changed the script to `eslint .`; verified via `pnpm --filter @legirag/web lint` (clean) and root `pnpm lint` (clean, unaffected). Closed 2026-08-18 by a second /audit pass (scope: current): re-ran both, both clean, no new defect introduced.

### 13c/F-15 [P3] closed - AGENTS.md's E2E command doc implied port 3001 was `web`'s own default

**File:** AGENTS.md
**Found:** 2026-08-18 by /audit (scope: current)
**Why it matters:** the original line ("set `E2E_BASE_URL` if `web` isn't on its default `http://localhost:3001`") reads as if Next.js itself defaults `web` to 3001, when the real default (`next dev`/`next start`) is 3000 - the same port `api` already listens on. A developer reading only this line could hit a confusing port collision instead of understanding they need to explicitly choose a different port for `web`.
**Suggested fix:** State explicitly that `api` occupies the real default (3000) and that `web` needs an explicit alternate port.
**Resolution:** Fixed 2026-08-18 - reworded the line to explain the port collision and the explicit `--port 3001` convention. Closed 2026-08-18 by a second /audit pass (scope: current): re-read `AGENTS.md`, confirmed the corrected wording, no new defect introduced.

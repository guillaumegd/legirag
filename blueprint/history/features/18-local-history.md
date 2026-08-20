# Feature: Client-side local history of questions, answers, and traces

**From build-plan:** feature 18
**Status:** all build steps done, ready for `/complete`
**GitHub issue:** [#19](https://github.com/guillaumegd/legirag/issues/19)

## Goal

Let a returning visitor revisit questions they've already asked, in the same
browser, without re-asking and re-spending quota/tokens. Storage is
browser-only (localStorage) - no backend persistence, no accounts, matching
the project's existing anonymous model. Primary use case: demos, so a
reviewer isn't blocked by item 17's per-IP quota when replaying already-asked
questions.

## In scope

- A browser-only history store (localStorage) of the last `MAX_HISTORY_ENTRIES`
  (20) successfully completed questions, each holding the question text, the
  full persisted `ReponseStructuree`, and when it was asked.
- Auto-save: a question is added to history the moment its answer finishes
  streaming successfully (SSE `done` event). Errored or aborted questions are
  never saved.
- A `/historique` page listing saved entries (newest first, question excerpt,
  formatted date, confiance badge) where selecting one renders the full
  stored answer by reusing the existing `MainRule` / `SupplementaryTexts` /
  `HorsPerimetre` / `FooterBar` components - no new `/api/question` call.
- The trace stays reachable from a history entry the same way it already is
  from a fresh answer (`FooterBar` -> `TracePanel` / `/trace/[traceId]`,
  keyed on the stored `trace_id`) - trace and article data are fetched live
  from the existing free-read endpoints, not duplicated into storage.
- A visible "archived answer" notice on each history entry's answer view,
  since the cited text may have changed since it was recorded.
- Per-entry delete and a "clear all" control (with confirmation), both
  persisting across reload.
- An empty state when there's no history yet.
- A "Historique" link in `site-header.tsx`.
- Graceful degradation when storage is corrupted, blocked (private
  browsing), or full (quota exceeded): the app keeps working, it just
  doesn't save/list history.

## Out of scope

- Any backend or account-based persistence, or sync across devices/browsers -
  the no-accounts, anonymous model is unchanged.
- Storing trace payloads client-side - always fetched live via the existing
  `GET /trace/:traceId` free-read endpoint.
- Revalidating whether a stored citation's `etat` or text is still current
  (no live re-check against Légifrance beyond the existing Légifrance link).
- Cross-tab live sync of the history list (no `storage` event listener).
- Import/export of history data.

## Build steps

- [x] **Step 1 - History storage module** - add `packages/web/src/lib/history.ts`
  exporting a `HistoryEntry` type (`{ id, question, reponse, askedAt }`, `id`
  is the answer's `trace_id`), `MAX_HISTORY_ENTRIES = 20`, and
  `saveHistoryEntry`, `listHistoryEntries`, `removeHistoryEntry`,
  `clearHistory`. Store as a JSON array under a versioned localStorage key
  (e.g. `legirag.history.v1`), newest first, capped at `MAX_HISTORY_ENTRIES`
  (oldest dropped past the cap). On read, re-validate each stored answer with
  `ReponseStructureeSchema.safeParse` and silently drop entries that fail
  (corrupted or schema-drifted data). Catch and swallow `setItem` failures
  (quota exceeded, storage blocked) rather than throwing. Add
  `packages/web/src/lib/history.test.ts` following the existing
  `trace-summary.test.ts` style, with `localStorage` stubbed via
  `vi.stubGlobal` (an in-memory `Storage`-shaped mock).
  *Done when:* `pnpm test` passes with new tests covering newest-first
  ordering, the cap dropping the oldest entry, remove, clear, corrupted JSON
  producing an empty list instead of throwing, an invalid/dropped malformed
  entry, and a simulated `setItem` throw being caught without propagating.

- [x] **Step 2 - Auto-save on completion** - in
  `packages/web/src/components/ask-question.tsx`, when the SSE `done` event
  lands and `ReponseStructureeSchema.parse` succeeds, call
  `saveHistoryEntry({ id: reponse.trace_id, question: trimmed, reponse,
  askedAt: new Date().toISOString() })`.
  *Done when:* asking a question in the running app and inspecting
  devtools localStorage shows a new entry under the history key; triggering
  an error or aborting a question creates no entry.

- [x] **Step 3 - History page and nav entry** - add
  `packages/web/src/app/historique/page.tsx` (client component) listing
  `listHistoryEntries()` newest first (question excerpt, formatted date,
  confiance badge), with a "Voir la réponse" action per entry that renders
  the stored `reponse` through the existing `MainRule`, `SupplementaryTexts`,
  `HorsPerimetre`, and `FooterBar` components unchanged, plus a small
  "archived answer, may be out of date" notice. Add a confirmed per-entry
  delete and a confirmed "Vider l'historique" clear-all control, both
  calling into the Step 1 module and re-rendering the list. Show an empty
  state when there
  are no entries. Add a "Historique" link to
  `packages/web/src/components/site-header.tsx`.
  *Done when:* after asking a few questions, `/historique` lists them;
  opening one renders the full three-block answer and its trace panel using
  only locally stored data (no new `/api/question` request in the network
  tab); delete and clear-all work and survive a reload; the empty state
  renders with no history; the nav link reaches the page from `/`.

- [x] **Step 4 - Recent-history preview on the home screen** - a plain header
  nav link proved too low-visibility on its own (user feedback after Step 3:
  "au niveau UX c'est catastrophique"). Add
  `packages/web/src/components/recent-history-preview.tsx`, shown only in
  `AskQuestion`'s idle state (below the example pills), listing the 3 most
  recent entries as links to `/historique?entry=<id>`, plus a "Tout voir →"
  link to `/historique`. `HistoryView` reads the `entry` query param on
  mount (via `window.location.search`, not `useSearchParams`, so
  `/historique` stays a static route) and pre-selects that entry.
  *Done when:* with saved history, the home screen (idle state) shows "Vos
  dernières questions" with up to 3 clickable entries; clicking one opens
  `/historique?entry=<id>` with that answer already selected; with no
  history the preview renders nothing.

## Files / areas

- `packages/web/src/lib/history.ts` (new)
- `packages/web/src/lib/history.test.ts` (new)
- `packages/web/src/components/ask-question.tsx` (edit - call
  `saveHistoryEntry` on success)
- `packages/web/src/app/historique/page.tsx` (new)
- `packages/web/src/components/site-header.tsx` (edit - add nav link)
- `packages/web/src/components/history-view.tsx` (new - list/detail view,
  reads the `entry` query param)
- `packages/web/src/components/recent-history-preview.tsx` (new - home
  screen preview)
- `packages/web/src/lib/format.ts` / `format.test.ts` (edit - added
  `formatDateTimeFr`)

## Data / contracts

- `HistoryEntry` (web-only type, not shared with the API since it's derived
  entirely from the already-shared `ReponseStructuree`):
  `{ id: string; question: string; reponse: ReponseStructuree; askedAt: string }`.
- localStorage key is versioned (`legirag.history.v1`); if the stored shape
  ever needs to change, bump the key suffix rather than migrating old data -
  this is disposable client cache, not a system of record.
- No new backend/API contracts.

## Testing

- `pnpm test` (Vitest) gates `history.ts`'s save/list/cap/remove/clear/
  corrupted-data/quota-error logic per Step 1's done-when - this is the
  in-scope pure logic per the project's testing gate.
- The history page and nav link are UI/integration surfaces (exempt from unit
  tests per `coding-standards.md`); verify with the running dev server per
  Step 3's done-when and a screenshot of the populated and empty states.

## Notes for the AI

- `historique/page.tsx` and any interactive subcomponents are client
  components (`'use client'`) since localStorage only exists in the browser;
  guard reads with a `typeof window === 'undefined'` check so SSR doesn't
  throw.
- Reuse `MainRule` / `SupplementaryTexts` / `HorsPerimetre` / `FooterBar`
  exactly as they render a live answer today - drive them from the persisted
  `reponse` instead of duplicating rendering logic.
- Item 17 already makes `GET /trace/:traceId` and `GET /article/:id` free
  reads, so no additional quota handling is needed for history's trace/
  article links.
- Match existing French UI copy tone (see `hors-perimetre.tsx`,
  `footer-bar.tsx`) for new strings (history list, empty state, archived
  notice, delete/clear confirmation).
- Follow the existing `packages/web/src/lib/*.test.ts` style for
  `history.test.ts` (plain `describe`/`it`/`expect`, `.js` extension on the
  relative import).

## Findings

### 18/F-12 [P1] closed - Blocked/inaccessible localStorage crashes the answer flow instead of degrading gracefully

**File:** packages/web/src/lib/history.ts:14-40
**Found:** 2026-08-20 by /audit (scope: current)
**Why it matters:** `readRaw()` and `writeRaw()` guard only the `undefined` case (`typeof localStorage === 'undefined'`, true in SSR/Node) and wrap only `JSON.parse`/`setItem` in try/catch. They do not guard the `localStorage` property access itself, which the HTML spec allows to throw a `SecurityError` synchronously (sandboxed iframe without `allow-same-origin`, or storage blocked by browser privacy settings - exactly item 18's own declared in-scope case, "blocked (private browsing)"). Reproduced directly: with a throwing `localStorage` getter (simulating that browser condition), both `listHistoryEntries()` and `saveHistoryEntry()` propagate the exception uncaught rather than returning `[]`/no-op. Two concrete consequences: (1) in `ask-question.tsx`, `saveHistoryEntry(...)` is called inside the same `try` block wrapping the SSE loop (lines 79-92); the thrown `SecurityError` is caught by the generic `catch` at line 93, which overwrites the just-set `status: 'done'` with `status: 'error'` and shows the fake "La connexion avec l'agent a été interrompue." message - a successfully received, correctly parsed answer is fully hidden behind a misleading error. This is the same class of bug the project just fixed at build-plan item 19 (a generic catch masking the real cause), reintroduced here for a different code path. (2) `HistoryView` and `RecentHistoryPreview` call `listHistoryEntries()` directly inside `useEffect` with no try/catch of their own (the safety is expected to live inside `history.ts`); with no error boundary in `layout.tsx`, the same throw during initial mount can crash rendering of `/` or `/historique` entirely for a user in that browser context.
**Suggested fix:** Move the `typeof localStorage === 'undefined'` check inside the existing `try` blocks in `readRaw()` and `writeRaw()` (or wrap each function body in one `try { ... } catch { return [] / return; }`) so any storage-access failure - not just a failed write - degrades to "no history" instead of throwing. Add a regression test using a throwing `localStorage` getter (e.g. `Object.defineProperty(globalThis, 'localStorage', { get() { throw new DOMException('...', 'SecurityError'); } })`) asserting `listHistoryEntries()` returns `[]` and `saveHistoryEntry()` does not throw.
**Resolution:** Wrapped the full body of `readRaw()`/`writeRaw()` in `try/catch` (the `typeof` check moved inside), so any storage-access failure - not just a failed `setItem` - degrades to no-op/empty list. Added a regression test in `history.test.ts` using `Object.defineProperty(globalThis, 'localStorage', { get() { throw ... } })` to reproduce the exact throw-on-access condition; `listHistoryEntries()` returns `[]` and `saveHistoryEntry()` no longer throws. `pnpm test` (364/364), typecheck, lint, and build all green. Re-examined 2026-08-20 by /audit (scope: current): re-read the patched `history.ts` and independently re-ran the throwing-getter reproduction against the patched code (outside the test suite, standalone script) - confirmed both `listHistoryEntries()` and `saveHistoryEntry()` now degrade cleanly instead of throwing. No new defect introduced by the fix. Closed.

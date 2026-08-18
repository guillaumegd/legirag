# Feature: Restyle front-end (design handoff)

**From build-plan:** feature 15
**Status:** complete

## Goal

Report the new visual direction from the design handoff into the existing
Next.js front end: oklch color tokens, Libre Franklin typography, a vertical
"rail" treatment for cross-references, staggered activity-log icons, and the
agent trace moved into a slide-in overlay panel reachable from the answer
screen. Restyle only - same data, same routes, same behavior.

## Design reference

`packages/web/design_handoff_restyle/` (delivered by the user, high
fidelity - colors, typography, spacing, and component structure are final):

- `README.md` - the handoff spec: tokens, typography scale, per-screen states,
  component specs, interactions
- `Legirag – Écrans.dc.html` - interactive mockup of both screens (state
  selector for `vide`/`streaming`/`reponse`/`abstention`/`erreur`)
- `Legirag – Tokens & Composants.dc.html` - style board: colors, type,
  buttons, badges, rail, citation block, hors-périmètre panel, activity log

Treat this folder the same way the workflow treats `prototypes/`: source of
truth for exact values, first build step ports the tokens, and the folder is
discarded at `/complete` once the real components carry the look (see Notes).
The folder was deleted as part of this feature's completion commit.

## In scope

- New `:root` token block in `globals.css` (oklch colors, bordeaux accent,
  Libre Franklin, updated radius/shadow scale), font loaded via
  `next/font/google`.
- Question/answer screen (`ask-question.tsx`, `page.tsx`, `site.css`): a
  visible H1 ("Posez une question juridique.") + subtitle shown only in the
  `idle` state (replaces `page.tsx`'s always-`visually-hidden` H1 - falls
  back to a visually-hidden H1 once a question is in flight/answered, so the
  page always has exactly one H1), 3 clickable example-question pills
  replacing the placeholder-only input, a question recap row
  (`« {question} »` + "Nouvelle question") replacing the form once a
  question is in flight, SVG icons + staggered fade/rise animation on the
  activity log, warning-triangle icon on the hors-périmètre and abstention
  panels, alert icon on the error banner.
- Cross-reference rail (`ref-item.tsx`, `supplementary-texts.tsx`,
  `site.css`): replaces the stacked-card list with a vertical rail - filled
  node for internal references, dashed-ring SVG node for cross-code ones.
- Trace panel overlay (`trace-panel.tsx`, new; `footer-bar.tsx`;
  `trace.css`): a slide-in side panel opened from a "Voir le raisonnement"
  button, reusing `TraceTimeline`, closable via scrim click / `×` / `Escape`,
  with a fallback link to the full `/trace/[traceId]` page. Trace rail
  styling aligned with the same "rail + nodes" vocabulary used for
  cross-references.

## Out of scope

- Any change to `ReponseStructuree`, `Citation`, `ExecutionTrace`, or any
  other shape in `@legirag/shared`.
- Any change to existing routes (`/`, `/trace/[traceId]`) or to the SSE flow
  (`lib/sse.ts`, `lib/api-client.ts`).
- The time-travel view - not built yet (deferred to item 10/13e per
  build-plan), nothing to restyle.
- Changing the 3 example questions' *content* beyond what the handoff
  specifies (rouler à 140, augmentation de loyer, délai de contestation
  d'amende) - copy is fixed by the mockup, not up for invention here.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - design tokens and typography** - replace `globals.css`'s
  `:root` block with the handoff's oklch tokens (surfaces, text, accent,
  semantic, reference-graph, trace colors), load Libre Franklin (weights
  400/500/600/700/800) via `next/font/google` in `layout.tsx` and wire it to
  `--font-sans`, update `--radius` (8px), `--radius-sm` (4px), add
  `--radius-lg` (10px) and the trace-panel `--shadow`. *Done when:* every
  existing screen (`/`, `/trace/[traceId]`) renders with the new palette and
  typeface with no structural/behavioral change, `pnpm --filter @legirag/web
  build` and `pnpm typecheck` stay green.
- [x] **Step 2 - headline, example pills, and question recap** - move the
  page H1 into `ask-question.tsx`: visible `"Posez une question
  juridique."` + subtitle (`"Réponse sourcée dans les codes en vigueur,
  article par article — avec ce qu'elle ne couvre pas."`) when `status ===
  'idle'`, falling back to a `visually-hidden` H1 otherwise so the page
  always has exactly one H1 (`page.tsx`'s static hidden H1 is removed); add
  the 3 clickable example-question pills below the input in the `idle` state
  (click sets the input value and focuses it, no auto-submit); once `status
  !== 'idle'`, replace the form with a recap row (`« {question} »` +
  "Nouvelle question" button) separated by a bottom border, instead of
  leaving the form active. *Done when:* the headline/subtitle show only
  before a question is asked; clicking a pill fills and focuses the input
  without submitting; after asking a question, the input form is replaced by
  the recap row; "Nouvelle question" still resets to the empty state exactly
  as `reset()` does today.
- [x] **Step 3 - activity log icons and stagger animation** - map each SSE
  event kind (`route`, `search`, `followRenvois`, `draft`, plus a default
  fallback for any other) to one of the handoff's inline SVG icons
  (18×18, `stroke: currentColor` unless the handoff specifies a color, as
  for `search`/`followRenvois`); add the `lg-rise` keyframes and apply an
  `animation-delay` of `index * 110ms` per activity line, pure CSS (no
  `setTimeout`). *Done when:* asking a real question shows each activity
  line entering with a staggered rise/fade, the correct icon renders for
  each of the 4 known event kinds, and an unrecognized event still renders
  (fallback icon, no crash).
- [x] **Step 4 - response panel styling** - apply `--radius-lg` to
  `.answer-block`/`.scope-panel`/`.error-banner`, add the warning-triangle
  icon (shared between `hors-perimetre.tsx`'s panel and
  `main-rule.tsx`'s `EscaladeNotice`, both already on `.scope-panel`) and the
  alert-circle icon + flex layout on the error banner in `ask-question.tsx`.
  *Done when:* the hors-périmètre panel, an abstention response, and a
  triggered error banner all show the new icon/radius styling with unchanged
  content and props.
- [x] **Step 5 - cross-reference rail** - replace `.ref-list`/`.ref-item`/
  `.ref-tag`'s stacked cards with a vertical rail (`ref-item.tsx`,
  `supplementary-texts.tsx`, `site.css`): a thin line at `left: 9px`, a
  filled circular node for an internal reference, a dashed-ring SVG node for
  a cross-code one, node content at `padding-left: 34px`, `ArticleExpander`
  unchanged beneath each node. *Done when:* a response with both internal
  and cross-code `textes_complementaires` renders as a rail with the correct
  node style per reference, and each `ArticleExpander` still opens/closes
  independently.
- [x] **Step 6 - trace panel overlay** - new `trace-panel.tsx` (client
  component): a fixed slide-in `<aside>` (`width: min(460px, 92vw)`) reusing
  `TraceTimeline`, fetching the trace the same lazy/request-token way
  `article-expander.tsx` fetches an article; open/close as local
  `useState<boolean>`, closable via scrim click, `×` button, or `Escape`,
  returning focus to the trigger button on close. `footer-bar.tsx` gets the
  "Voir le raisonnement" outline button that opens it (replacing the current
  "voir la trace" text link), with `"Ouvrir la page complète de la trace ↗"`
  linking to `/trace/[traceId]` kept inside the panel as a fallback.
  `trace.css`'s rail/dot styling tightened to match the vocabulary from Step
  5 (shared by both the panel and the standalone `/trace/[traceId]` page,
  since both render `TraceTimeline`). *Done when:* from a finished answer,
  "Voir le raisonnement" opens the panel without navigating away; scrim
  click, `×`, and `Escape` each close it and return focus to the button; the
  panel's fallback link still opens `/trace/[traceId]` as a normal page
  navigation, and that page still renders standalone with the same
  `TraceTimeline` component.

## Files / areas

- `packages/web/src/app/globals.css`, `site.css`, `trace/trace.css`
- `packages/web/src/app/layout.tsx`, `page.tsx`
- `packages/web/src/components/ask-question.tsx`
- `packages/web/src/components/hors-perimetre.tsx`, `main-rule.tsx`
- `packages/web/src/components/ref-item.tsx`, `supplementary-texts.tsx`
- `packages/web/src/components/footer-bar.tsx`
- `packages/web/src/components/trace-panel.tsx` (new)

## Data / contracts

None new. `ReponseStructuree`, `Citation`, `ExecutionTrace` (`@legirag/shared`)
are read-only inputs to restyled components, unchanged. `trace-panel.tsx`
calls the existing `fetchTrace` from `lib/api-client.ts` - no new endpoint.

## Testing

Presentational restyle - no new parseable logic. `describeActivity` in
`lib/activity.ts` is untouched (its return value already carries the event
kind via `event.event`, which Step 3 reads directly in `ask-question.tsx`
rather than adding a new function), so `activity.test.ts` needs no changes.

Verified live: `packages/api` and `packages/web` were both run locally
against real Bedrock/Supabase, driven with Playwright (Chromium) through the
full question -> answer -> trace-panel flow for three real questions
(a routine lookup with real cross-references, an out-of-scope question that
produced a genuine abstention, and a forced connection error), confirming:

- the new tokens/typography/pills/recap render correctly (screenshots)
- all 4 activity-log icons render with the correct shape and color from
  real SSE events (route, search, draft, followRenvois), with the stagger
  animation wired
- the hors-périmètre, abstention, and error-banner panels all show the new
  icon/radius styling on real data
- the cross-reference rail renders internal nodes correctly (the live
  answer's supplementary texts were same-code, so the dashed-ring
  cross-code node variant was checked by code review, not observed live)
- the trace panel opens via the button, the scrim measurably dims the
  background (pixel check), `Escape` closes it and returns focus to the
  trigger button, and the fallback link navigates to a working
  `/trace/[traceId]` page
- no console errors or failed network requests during the whole flow

`pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` (318 tests, 45
files) all green. `e2e/question-answer.spec.ts` was updated to match the new
"Voir le raisonnement" button/panel flow and verified to parse and list
correctly via `playwright test --list`; not re-run end-to-end in this session
since the manual `/check` pass already exercised the identical path live.

## Notes for the AI

- High fidelity: reproduce the handoff's values (colors, spacing, sizes)
  rather than approximating - it says so explicitly and this is exactly the
  kind of visual feature where prose-only specs go wrong.
- Reuse existing CSS classes and modify their rules in place
  (`site.css`, `trace.css`) rather than inventing a parallel set, per the
  handoff's own instruction.
- Mirror `article-expander.tsx`'s discriminated-union state + request-token
  pattern for `trace-panel.tsx`'s fetch (`collapsed`/`loading`/`loaded`/
  `not-found`/`error` equivalent), for consistency with the one other
  client-side fetch-on-demand component in this codebase.
- No em dashes, no ellipsis character, hyphens for `term - description`
  (`coding-standards.md`'s Writing section).
- At `/complete`, delete `packages/web/design_handoff_restyle/` - like
  `prototypes/`, it's throwaway reference material once the real components
  carry the look, not permanent app code.

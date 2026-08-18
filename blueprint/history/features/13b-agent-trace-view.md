# Feature: Agent-trace view

**From build-plan:** feature 13b (split from 13 - see build-plan.md for the
full 13a-13d breakdown and why the time-travel view is deferred)
**Status:** complete

## Goal

A route reachable from the answer screen's footer trace link
(`/trace/[traceId]`, wired but 404ing since 13a) that fetches
`GET /trace/:traceId` and renders the chronological technical view of one
agent run: routing decision, every model/tool call with its duration and
token usage, and the run's final outcome - the demo/audit-facing counterpart
to the plain-language answer screen.

## Design reference

`prototypes/agent-trace.html` for structure and copy, `prototypes/theme.css`
for tokens (already ported into `packages/web/src/app/globals.css` by 13a,
including the `--trace-ok`/`--trace-fail`/`--trace-line` tokens the mockup
uses but 13a had no page to spend them on yet).

**The mockup outruns the real data - build from `ExecutionTrace`
(`packages/shared/src/schema.ts`), not from the mockup's copy.** Fields the
mockup shows that the real schema does not carry, and that this feature must
not fabricate:

- **"Plan initial" box** - no such field exists (`ExecutionTrace` has no
  free-text plan). Drop it.
- **Per-call `ok`/`échec`/`nouvelle tentative` badges** - `AgentCall`
  (`packages/agent/src/state.ts`) has no status field; every call the trace
  records already succeeded (a build failure aborts the graph run before a
  trace is persisted). Render one neutral style for every call, not three.
- **"Décision de routage" / "Critère d'arrêt" prose boxes** - no narrative
  field exists. Replace with a small, honestly-derived "Résultat" summary
  built only from real fields: `codes` (routing) and the last `draft` step's
  `summary.confiance` (outcome).
- **"Coût : 0,014 €"** - this codebase's cost convention is token counts,
  not currency (`coding-standards.md`, confirmed by `cost-guard.service.ts`
  using `MAX_DAILY_TOKENS`). Show summed prompt/completion tokens instead.

Everything else in the mockup (timeline layout, step dots, monospace call
names, duration chips) maps directly to real data and should be followed.

## In scope

- `fetchTrace(traceId)` in `packages/web/src/lib/api-client.ts`, mirroring
  `fetchArticle`'s `undefined`-on-404 pattern (404 is a normal "trace not
  found" state, not an error).
- A pure `summarizeTrace(trace)` helper (`packages/web/src/lib/`) computing
  the totals bar's numbers - model call count, tool call count, total
  prompt+completion tokens - from `ExecutionTrace.steps`. Unit tested.
- `packages/web/src/app/trace/[traceId]/page.tsx` - async server component:
  fetch the trace, `notFound()` on a missing trace, render the page per the
  adapted design above (context line with question + trace id, totals bar,
  Résultat summary, chronological step timeline with nested calls).
- Page-scoped CSS (new stylesheet imported only by this route) porting the
  mockup's `.trace`/`.step`/`.step-dot`/`.totals`/box styles, reusing the
  already-ported tokens and the existing `.badge`/`.badge-*` classes rather
  than redefining them.
- A visible error state for a backend failure other than 404 (API down,
  malformed payload) - consistent with how the question/answer screen
  already handles stream errors.

## Out of scope

- Any change to the trace's data shape or to how `packages/api` builds/
  persists it - this feature only reads and renders the existing
  `ExecutionTrace`.
- The time-travel view - deferred until item 10 (per build-plan.md's note
  under item 13).
- End-to-end smoke test - 13c.
- The measurement write-up - 13d.
- A top-nav link to this route - unlike the mockup's static nav, a trace is
  only reachable with a specific `traceId` (no "list traces" page exists),
  so there is nothing generic to link to from the shared header. The footer
  trace link built in 13a remains the only entry point.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `fetchTrace` client + `summarizeTrace` helper** - add
  `fetchTrace` to `api-client.ts` and the pure `summarizeTrace` aggregator
  with a unit test covering: a trace with only node-level steps and no
  `calls` (older/minimal traces), a trace with nested model+tool calls, and
  token summation across multiple `draft` attempts. *Done when:* `pnpm test`
  passes including the new test.
- [x] **Step 2 - route scaffold, context line, totals, Résultat summary,
  404/error states** - the `/trace/[traceId]` server component fetching and
  rendering the top of the page (context line, `h1`, totals bar via
  `summarizeTrace`, Résultat box), `notFound()` on a missing trace, and a
  visible error state on a non-404 fetch failure. *Done when:* visiting
  `/trace/<real-id>` against a running API shows the correct question,
  totals, and Résultat; visiting `/trace/does-not-exist` renders Next.js's
  404; stopping the API and reloading shows the error state instead of a
  blank page or crash.
- [x] **Step 3 - chronological step timeline** - the full `ol.trace`-style
  list: one entry per `ExecutionTrace.steps` node (name, duration, summary
  rendered in plain terms per node type - routed codes, citations found,
  confiance/attempt, new citations from renvois), with each step's nested
  `calls` (if present) as a sub-list showing call kind, name, duration, and
  token usage. Page-scoped CSS matching the mockup's timeline visuals
  (reusing existing tokens/badge classes). *Done when:* a real multi-step
  trace for a question that triggered `followRenvois` renders the full
  timeline with correctly nested calls, and `pnpm build` succeeds.

## Files / areas

- `packages/web/src/lib/api-client.ts` - add `fetchTrace`
- `packages/web/src/lib/trace-summary.ts` + `.test.ts` - new
- `packages/web/src/lib/trace-step-summary.ts` + `.test.ts` - new (Step 3:
  per-node French summary line and node label, reusing `activity.ts`'s
  exported `humanizeCodeSlug`/`pluralize` rather than duplicating them)
- `packages/web/src/lib/format.ts` - `asConfiance`/`formatDurationMs` added
  (Step 3), reused by both the page and `trace-step-summary.ts`
- `packages/web/src/app/trace/[traceId]/page.tsx` - new
- `packages/web/src/app/trace/trace.css` - new, page-scoped stylesheet
- `packages/web/src/components/trace-timeline.tsx` - new (Step 3)

## Data / contracts

- `ExecutionTrace` / `ExecutionTraceStep` / `ExecutionTraceCall`
  (`packages/shared/src/schema.ts`) - already locked, read-only consumer.
  No changes.

## Testing

- `summarizeTrace` is pure aggregation logic with real edge cases (missing
  `calls`, multiple draft attempts, zero calls) - gets a unit test per
  Step 1, consistent with the testing gate (`test` command already declared
  in `AGENTS.md`).
- The route itself is a render/integration surface - verified with the dev
  server against a real trace id (from a real question asked on the running
  API) and its rendered HTML, not a component test, per
  `coding-standards.md`'s testing scope rule.

## Notes for the AI

- Server component, not client - no interactivity needed on this page
  (contrast with `article-expander.tsx`'s on-demand client fetch), so a
  plain `async function Page({ params })` fetching at request time keeps it
  simple and avoids a loading spinner.
- Follow `fetchArticle`'s `undefined`-on-404 convention for `fetchTrace`
  exactly (`api-client.ts`) rather than inventing a different error shape.
- Do not add a "list all traces" page or any trace search/index - traces are
  addressed only by `trace_id`, per `project-overview.md`'s "no accounts or
  access tiers" / anonymous-by-`trace_id` design.
- Reuse `--trace-ok`/`--trace-line` tokens and the existing `.badge`/
  `.badge-success` etc. classes already in `globals.css`/`site.css` instead
  of redefining equivalents.

## Live verification result

Built and verified against the real, running API and Supabase/Bedrock
backends (not mocked), reusing a real question asked live during this
feature: "Quelle est la vitesse maximale autorisée sur autoroute ?"
(`trace_id cdba3933-09be-4680-bd1c-3eccbcc2693f`) - a 5-step run including
two `draft` attempts and two `followRenvois` passes.

- `GET /trace/<real-id>` via the dev server rendered the correct question,
  trace id, totals (18,8 s total, 3 model calls, 5 tool calls, 26 433
  tokens), and a Résultat box (`code-de-la-route`, Confiance élevée).
- The full chronological timeline rendered all 5 real steps in order
  (route -> search -> draft -> followRenvois -> draft) with each step's
  nested calls, correctly reflecting a real re-draft triggered by a newly
  resolved cross-reference.
- `/trace/does-not-exist-id` rendered Next.js's standard 404.
- `pnpm test` (318/318), `pnpm --filter @legirag/web typecheck`, and
  `pnpm --filter @legirag/web build` all green.

## Findings

### 13b/F-13 [P3] closed - `.call-tokens` CSS class referenced in the trace timeline with no matching rule

**File:** packages/web/src/components/trace-timeline.tsx:26
**Found:** 2026-08-18 by /audit (scope: current)
**Why it matters:** the per-call token count used `className="call-tokens"`, but `trace.css` only defined `.call-kind`/`.call-name` - harmless today (it just inherits `.step-calls`'s color/size), but a real gap between the component and its stylesheet that would confuse the next person styling this area.
**Suggested fix:** Add a `.call-tokens` rule to `trace.css` so every class the component references is actually styled.
**Resolution:** Fixed 2026-08-18 - added `.call-tokens { color: var(--faint); }` to `packages/web/src/app/trace/trace.css`; re-verified live via the trace page and the passing Playwright e2e run (13c). Closed 2026-08-18 by a second /audit pass (scope: current): re-confirmed the rule is present and the page renders correctly, no new defect introduced.

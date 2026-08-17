# Feature: Evaluation suite as a blocking CI regression check

**From build-plan:** feature 12b (second sub-item of 12, "Observability and
infrastructure automation")
**Status:** complete

## Goal

The agent-level eval harness (item 9) already scores routing accuracy,
abstention correctness, and cross-reference coverage against 15 annotated
questions, but only by a human reading console output after a manual run.
Nothing stops a future change from silently making the agent worse. This
feature makes the harness self-checking: it runs against a committed
baseline of today's known scores and fails the build if any quality metric
drops below it, wired into a dedicated GitHub Actions workflow.

## In scope

- Extracting the live-run loop in `run-agent-harness.ts` into a reusable
  function so both the existing console script and a new check script share
  it without duplicating live Bedrock/Supabase calls.
- A `Baseline` shape and a pure `checkRegression` comparison function.
- A new `run-regression-check` script that runs the harness, compares
  against the committed baseline, and exits non-zero on any regression.
- Capturing today's actual scores as the committed baseline
  (`eval/baseline.json`) - including today's known gap (false-premise
  questions never correctly abstain, 9a/9c) as the honest starting line, not
  a target to silently launder.
- A new, separate GitHub Actions workflow (`eval.yml`), path-filtered so it
  only runs when retrieval/agent-affecting code changes.

## Out of scope

- Fixing the false-premise abstention gap itself (flagged in build-plan
  item 9's follow-up note as a `/fix` candidate, not this feature - this
  feature must not silently raise the baseline to hide it either).
- Gating on cost/latency (`cost-metrics.ts`'s `llmCalls`/token averages).
  Project-overview.md frames this suite as blocking *quality* regressions
  specifically; cost naturally drifts with model/provider changes and stays
  informational-only in the workflow's output.
- Folding this into `pnpm test`/the local `Verify` loop. Every run costs a
  small real amount (live Bedrock + Supabase calls) and takes real wall
  time - it belongs in its own CI workflow, not the fast local gate
  developers run on every save.
- Re-running the harness multiple times to smooth over LLM
  non-determinism. See the flakiness note below - accepted for now.

## Decision: what counts as "the baseline"

The baseline is **today's actually-measured scores**, not an idealized
target. 9a already found the fixed chain answers 0/3 `fausse_premisse`
questions correctly (a real, documented gap, still open). Baking that in as
the baseline's `fausse_premisse` abstention accuracy (`0`) means: this gate
cannot get worse than today, but does not pretend the gap is fixed. A
metric already at its floor (`0`) simply can never trigger a false
regression on that category - that's a correct, not a missed, consequence
of comparing against reality instead of a wishlist.

## Decision: regression rule and flakiness

`checkRegression` flags a category (or overall) metric as regressed only
when `current < baseline - EPSILON` (a tiny floating-point tolerance, not a
real quality allowance). With only 15 questions and a live model call per
question, a single run can occasionally flip a borderline answer - this
gate accepts that risk for now (a rare false failure that a re-run clears)
rather than adding retry/majority-vote logic, which is real complexity for
a 15-question suite at this project's stage. Flag this openly if a flaky
failure is ever seen in practice; revisit then, not preemptively.

## Decision: trigger cadence

`eval.yml` runs on pull requests and pushes to `main`, but only when the
diff touches `packages/agent/**`, `packages/retrieval/**`,
`packages/eval/**`, `packages/shared/**`, or `eval/questions.json` - the
paths that can actually move these scores. A per-run cost of roughly
$0.10-$0.20 (15 questions, 1-2 model calls each) makes "every push" tolerable
in absolute terms, but path-filtering still avoids paying it on web-only or
docs-only changes, which is free to do and strictly better.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Extract a reusable harness-run function** - move
  `run-agent-harness.ts`'s live-run loop into an exported
  `runAgentHarness(): Promise<{ agentReport: AgentHarnessReport; costRows:
  CostRow[]; coverageRows: CoverageRow[] }>` (new file, e.g.
  `packages/eval/src/agent-harness.ts`), with `run-agent-harness.ts`'s
  `main()` calling it and keeping its existing console output unchanged. No
  behavior change to the existing script. *Done when:* running
  `run-agent-harness.ts` live produces identical console output to before
  the refactor (manual comparison), and `pnpm typecheck`/`pnpm build` pass.
- [x] **Step 2 - `Baseline` shape and `checkRegression`** - a `Baseline` Zod
  schema (per-category `routingAccuracy?`/`abstentionAccuracy`, `overall`
  same shape, `crossRefCoverageMean?`) in `packages/eval/src/schema.ts`, and
  a pure `checkRegression(baseline: Baseline, current: Baseline):
  { ok: boolean; regressions: string[] }` (new file
  `packages/eval/src/regression.ts`) comparing every metric with the
  `current < baseline - EPSILON` rule, producing a human-readable message
  per regressed metric. *Done when:* unit tests cover a clean pass (equal or
  better), a single regressed category, a regressed overall metric, and a
  metric already at `0` in both baseline and current correctly reporting no
  regression.
- [x] **Step 3 - `run-regression-check` script** - a new script
  (`packages/eval/src/run-regression-check.ts`) that calls
  `runAgentHarness()`, separately computes the mean cross-reference coverage
  for `renvoi_obligatoire` questions (reusing `scoreCrossRefCoverage`),
  builds a `Baseline`-shaped "current" object, loads and parses
  `eval/baseline.json`, calls `checkRegression`, prints a clear pass/fail
  summary (naming every regressed metric with its baseline vs. current
  value), and sets `process.exitCode = 1` when `ok` is false or the run
  itself throws. *Done when:* running it live against the real baseline
  (once Step 4 creates that file) exits `0` and prints "no regression".
- [x] **Step 4 - Capture the baseline and wire CI** - run the harness live
  once, persist its scores as `eval/baseline.json` (committed, mirroring
  `eval/questions.json`'s location), then add `.github/workflows/eval.yml`:
  triggers on `pull_request` and `push: [main]` with the path filters from
  the "trigger cadence" decision above, installs deps, and runs the
  regression-check script with `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/
  `AWS_REGION`/`MODEL_VOLUME`/`MODEL_ESCALADE`/`SUPABASE_URL`/
  `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/`DATABASE_URL` from GitHub
  Actions secrets (named exactly like the local `.env` keys). *Done when:*
  `eval/baseline.json` exists and matches a real live run's numbers, the
  workflow YAML is valid, and a comment/note in the workflow file states
  plainly that these secrets must exist in the repo's GitHub Actions
  settings before this check can pass remotely (this feature cannot
  provision or verify GitHub secrets from inside the repo - a manual step,
  same category as the AWS billing quota gap already flagged in
  `project-overview.md`'s Open questions).

## Files / areas

- `packages/eval/src/agent-harness.ts` - new, extracted from
  `run-agent-harness.ts`.
- `packages/eval/src/run-agent-harness.ts` - thinned to call the extracted
  function.
- `packages/eval/src/schema.ts` - new `Baseline` schema.
- `packages/eval/src/regression.ts` - new, `checkRegression`.
- `packages/eval/src/run-regression-check.ts` - new script.
- `eval/baseline.json` - new, committed.
- `.github/workflows/eval.yml` - new.
- No changes to `run-harness.ts`/`run-naive-baseline.ts`/`run-vector-only.ts`/
  `run-hybrid-capped.ts` (item 6's retrieval-only harnesses, unrelated to
  this agent-level gate) or `.github/workflows/ci.yml`.

## Data / contracts

- `Baseline` (new, `packages/eval/src/schema.ts`): mirrors
  `AgentHarnessReport`'s per-category/overall shape plus one added field,
  `crossRefCoverageMean?: number`. Not consumed by any other package - pure
  eval-internal contract.
- `eval/baseline.json` is data, not code - regenerating it (after a
  deliberate, reviewed quality change) is a manual re-run of Step 4's
  capture, never silently automated by this feature.

## Testing

- `pnpm test` (Vitest) gate applies to Step 2 (`checkRegression` is pure
  logic with real edge cases: pass, per-category regression, overall
  regression, floor-metric no-false-positive) - ships its test in that step,
  following `agent-scoring.test.ts`'s existing patterns.
- Steps 1, 3, and 4 are live-call/I/O scripts and CI wiring, verified by a
  real run and its printed output (same evidence style as 9a/9c's harness
  work), not unit tests.

## Notes for the AI

- Never hand-adjust `eval/baseline.json` to make a real regression
  disappear - if a change legitimately improves a score, recapture the
  baseline via a fresh live run (Step 4's method), don't hand-edit numbers.
- Keep `run-agent-harness.ts`'s existing console output byte-for-byte
  equivalent after Step 1's extraction - it's still the primary human-facing
  script from item 9, this feature only adds a second consumer alongside it.
- `eval.yml` is a new, separate workflow file - do not add these live-call
  steps to the existing fast `ci.yml` (lint/typecheck/test), which stays as
  the zero-cost, always-run gate.
- Secrets referenced in `eval.yml` must exactly match the `.env.example`
  variable names already established in this project - don't invent new
  names.

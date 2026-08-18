# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-08 [P3] unverified - `lambda-entrypoint.mjs` contains branching logic with no test coverage

**File:** infra/docker/lambda-entrypoint.mjs
**Found:** 2026-08-17 by /audit (scope: current)
**Why it matters:** The script has real conditional behavior with distinguishable correct/incorrect outcomes (secret fetched and parsed vs. skipped when `APP_SECRET_ID` is unset, exit-code propagation from the spawned child, error handling on a failed `GetSecretValue` call) - the kind of thing `coding-standards.md`'s testing gate normally requires a test for when the project's test command is declared (it is). Logged `unverified` rather than `open`: the file sits outside `packages/*/src` and outside `vitest.config.ts`'s glob, and the project's own precedent (Terraform, Dockerfiles) already treats infra bootstrap plumbing as outside the test gate's scope - a genuine boundary judgment call, not a clear-cut violation, worth a second opinion rather than an assertion either way.
**Suggested fix:** Either add a small Vitest-style test for this script's branching (would need including it in a test glob or moving the logic into a tested location) or explicitly confirm in `coding-standards.md`/the spec that Lambda bootstrap scripts under `infra/docker/` are out of the test gate's scope by policy, so this doesn't get re-flagged as a fresh gap by a future audit.
**Resolution:**

### F-11 [P3] unverified - packages/web has no React-specific lint coverage (hooks rules, a11y) despite being the monorepo's first React package

**File:** eslint.config.js
**Found:** 2026-08-18 by /audit (scope: current)
**Why it matters:** The shared flat config only applies `@eslint/js` + `typescript-eslint` recommended configs - there is no `eslint-plugin-react-hooks` (rules-of-hooks, `exhaustive-deps`) or `eslint-plugin-jsx-a11y` coverage. No current violation was found (all hook calls in this feature are unconditional, top-level), so this is a preventive gap rather than a live bug: as `packages/web` grows past this first feature, common React mistakes (stale closures in effects, missing dependency arrays, inaccessible interactive elements) won't be caught automatically the way they are in most React codebases.
**Suggested fix:** Add `eslint-plugin-react-hooks` (and optionally `eslint-plugin-jsx-a11y`) scoped to `packages/web/**` in `eslint.config.js`, as a follow-up outside this feature's declared scope - not something 13a's spec asked for.
**Resolution:**

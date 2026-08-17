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

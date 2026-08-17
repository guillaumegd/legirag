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

### F-09 [P2] open - Stale comments still describe the abandoned "Parameters and Secrets Lambda Extension" design

**File:** infra/lambda.tf:9-14, infra/secrets.tf:8-14, blueprint/history/features/12d-terraform-provisioning.md (archived spec, its Architecture/In-scope sections)
**Found:** 2026-08-17 by /audit (scope: current, second pass)
**Why it matters:** The actual implementation (confirmed correct: `packages/api/Dockerfile`, `packages/mcp/Dockerfile`, `infra/docker/lambda-entrypoint.mjs`, and `infra/README.md` all consistently describe it) fetches the app-env secret via a direct `@aws-sdk/client-secrets-manager` call at cold start - the originally-planned "AWS Parameters and Secrets Lambda Extension" was abandoned mid-build after discovering it is only distributed as a Lambda Layer (zip), not a container image, so it can't be copied into a container-image Lambda function without real AWS credentials at build time. That correction was never propagated backward into `infra/lambda.tf`'s header comment or `infra/secrets.tf`'s comment - both still describe the extension as the active mechanism. The feature's spec (originally `current-feature.md`, now archived to `blueprint/history/features/12d-terraform-provisioning.md`) has the same stale description in its Architecture/In-scope sections as first written, left uncorrected at 12d's `/complete` - the user chose to proceed straight to completion rather than have this fixed first, so it is carried forward here instead of silently dropped.
**Suggested fix:** Update `infra/lambda.tf`'s header comment and `infra/secrets.tf`'s comment to describe the direct SDK call (matching the accurate wording already in `packages/api/Dockerfile` and `infra/README.md`). The archived spec is historical record and does not need editing after the fact.
**Resolution:**

# Fix: Simplify Terraform state and automate the Lambda image deploy

**Type:** Fix

## Revision note (2026-08-18)

This fix grew well past its original three-item scope. After the first
three steps were built (still `terraform validate`-only, never applied),
the user asked to actually deploy for real and test it - `/complete` was
deliberately not run first specifically so this could happen on the same
branch. That real deployment surfaced a chain of real bugs that no offline
check (`terraform validate`, `docker build`) could have caught, each fixed
and re-verified against the live AWS account before moving to the next:

1. `deploy-images.sh` failed on a first-time deploy - it assumed the
   Lambda functions already existed.
2. Images built by `docker build` were rejected by Lambda outright
   (Buildx attestations producing a manifest-list image format Lambda
   doesn't support).
3. Both functions crashed at cold start (`exec format error`) - built as
   `arm64` on this Apple Silicon machine, deployed against Lambda's
   `x86_64` default.
4. Function URLs returned `403 Forbidden` even with the correct resource
   policy - a second permission (`lambda:InvokeFunction` +
   `invoked_via_function_url`) has been required since an AWS policy
   change in October 2025, requiring an AWS provider upgrade (`~> 5.0` →
   `~> 6.0`) since the argument didn't exist yet in the installed version.
5. The real deployed secret was missing `MODEL_EMBEDDING` entirely (never
   in `infra/secrets.tf`'s key list to begin with) - would have broken
   every real question, since the retriever embeds the query at request
   time, not just at ingestion. Meanwhile `COHERE_API_KEY` was present but
   genuinely unused by any code in this repo today - removed.
6. The root browser-login credential flow (`aws login`) couldn't coexist
   with the `credential_process` bridge Terraform needed on the same
   profile - split into two profiles (`default` for `aws login`,
   `terraform` reading from it live) so refreshing an expired session
   never requires editing `~/.aws/config` again.

Once all of that was fixed, a real question was sent through the deployed
API (`POST /question`) and produced a correct, real, non-cached answer
(routing → real Bedrock embedding → real Supabase vector search →
drafting → verification → a correctly-triggered abstention, since the
demo corpus doesn't index labor law) - genuine end-to-end proof, not an
offline claim.

The user then asked for two more things once this was working: (1)
`infra/README.md` rewritten for someone with zero context on the project,
not just accurate; (2) every command used during this real deployment
turned into a script under `infra/`, not left as chat history - added
`infra/push-secrets.sh` (`.env.prod` → the real secret) and
`infra/bootstrap.sh` (orchestrates the full first-deploy sequence,
including the expected first-apply failure).

## The problem

Three related gaps in 12d's just-merged infra, surfaced by the user after
asking how deployment actually works:

1. **Remote Terraform state is overkill for this project.** `infra/state.tf`
   provisions an S3 bucket + DynamoDB lock table for remote state, which
   exists to let multiple operators or a CI pipeline run `terraform apply`
   concurrently without clobbering each other. This project has exactly one
   operator running `apply` occasionally from their own machine - remote
   state buys nothing here and is the direct cause of the two-phase
   bootstrap process (`infra/README.md`'s section 2) that's already been
   flagged as confusing. User's explicit call: drop it for local state.
2. **The Docker build/push/redeploy sequence is fully manual**, and worse,
   `terraform apply` alone silently cannot detect that a new image was
   pushed to ECR's mutable `:latest` tag (archived finding
   `12d/F-06` in `blueprint/history/features/12d-terraform-provisioning.md`
   documented this as a real gap, then only patched it with a *documented*
   manual command sequence, not automation). The user now wants this
   scripted rather than typed by hand every time.
3. **`infra/README.md` has a real, undocumented ordering trap.** A
   from-scratch `terraform apply` will fail creating
   `aws_lambda_function.api`/`.mcp`: `image_uri` points at a `:latest` tag
   in an ECR repo Terraform just created in the same apply, but no image
   has ever been pushed to it - Terraform cannot push a Docker image
   itself. The real first-deploy sequence is `apply` (fails on the Lambda
   functions, succeeds on everything else) → build+push both images →
   `apply` again (succeeds). Discovered this session, never written down.

## The fix

- Delete `infra/state.tf`. Remove the commented `backend "s3"` block from
  `infra/versions.tf` (local state is now the deliberate choice, not a
  placeholder waiting to be activated) - replace it with a short comment
  explaining why, so a future reader doesn't wonder if it was forgotten.
- Add `infra/outputs.tf`: the two ECR repository URLs and the two Lambda
  function names, so the deploy script never hardcodes an account ID or
  region - it reads them from Terraform itself.
- Add `infra/deploy-images.sh`: builds both Docker images, logs into ECR,
  tags and pushes both, then calls `aws lambda update-function-code` for
  both functions. Reads its target repo URLs/function names from
  `terraform output` (via the new `infra/outputs.tf`). Must not run
  `terraform apply`/`plan` itself - it only pushes images and updates
  already-existing functions, keeping the "never applies Terraform"
  boundary this project holds everywhere else.
- Rewrite `infra/README.md`: remove the two-phase S3 bootstrap section,
  document local state instead (where the `.tfstate` file lives, that it
  must never be committed, back it up like any other important local
  file), document the real apply → build+push → apply-again first-deploy
  sequence, and document `infra/deploy-images.sh` as the redeploy path for
  every subsequent code change (replacing 12d's old manually-typed
  command block).
- Update `blueprint/context/findings.md`: none of this maps to an *open*
  finding (12d/F-06 already archived as closed - it was correctly fixed
  for what it asked, documentation), so no ledger entry changes; note this
  explicitly at completion rather than silently touching nothing.
- Must not touch `infra/lambda.tf`, `infra/iam.tf`, `infra/ecr.tf`,
  `infra/secrets.tf`, or either Dockerfile - none of those are part of
  this fix.

**Surfaced while testing (not in the original ask, added the same way):**
walking through the real deploy steps with the user surfaced that
`infra/providers.tf` required a Supabase personal access token
(`var.supabase_access_token`) purely to satisfy the provider block - no
resource anywhere uses it. Supabase access tokens are account-wide with no
scoping mechanism (unlike AWS IAM), so requiring one for a provider with
zero real usage was pure risk for no benefit. Removed the `provider
"supabase"` block, its two variables (`supabase_access_token`,
`supabase_project_ref`), and the `supabase` entry from
`versions.tf`'s `required_providers` - confirmed by the user before
removing. Add it back deliberately if a future feature actually manages a
Supabase resource through Terraform.

## Build steps

- [x] **Step 1 - Drop remote state, add outputs** - delete `infra/state.tf`,
  clean up `infra/versions.tf`'s commented backend block with an
  explanatory comment, add `infra/outputs.tf` (ecr_api_repository_url,
  ecr_mcp_repository_url, lambda_api_function_name,
  lambda_mcp_function_name). *Done when:* `terraform validate` passes,
  `terraform init -backend=false` reflects the local-state-only setup, and
  `terraform output` (against a throwaway local apply-free state check via
  `terraform console` or plan, not a real apply) shows the right output
  names.
- [x] **Step 2 - Write the deploy script** - `infra/deploy-images.sh`,
  reading targets from `terraform output`, building both images (reusing
  the exact commands already used to verify this session's builds),
  logging into ECR, pushing both, then `aws lambda update-function-code`
  for both. *Done when:* the script is shellcheck-clean (or manually
  reviewed line by line if shellcheck isn't available) and dry-run
  reasoning confirms each command matches infra/README.md's documented
  manual sequence exactly, since it can't be run end-to-end without a
  real AWS account.
- [x] **Step 3 - Rewrite infra/README.md** - remove the two-phase S3
  section, add local-state guidance, document the real
  apply/build-push/apply-again first-deploy order, document
  `infra/deploy-images.sh` as the standing redeploy path. *Done when:* the
  README no longer references `infra/state.tf` or the S3 bootstrap, and a
  fresh read-through of the deploy section matches exactly what Steps 1-2
  actually built. Superseded by Step 9's full rewrite once real deployment
  was underway.
- [x] **Step 4 - Remove the unused Supabase provider requirement** -
  surfaced mid-session (see Revision note). Deleted `provider "supabase"`
  (`infra/providers.tf`), `supabase_access_token`/`supabase_project_ref`
  (`infra/variables.tf`), and the `supabase` entry from
  `versions.tf`'s `required_providers`. *Done when:* `terraform validate`
  passes with no supabase provider referenced anywhere - confirmed, plus
  `.terraform.lock.hcl` regenerated with only `aws` listed.
- [x] **Step 5 - Real first deployment, fix what breaks** - ran
  `terraform init`/`apply` for real against a real AWS account (root
  credentials, user's explicit choice after being warned), found and
  fixed the six real bugs listed in the Revision note, one at a time,
  each verified against the live account before moving to the next:
  `deploy_function()` existence check in `deploy-images.sh`;
  `--provenance=false --sbom=false` on both `docker build` calls;
  `architectures = ["arm64"]` on both `aws_lambda_function` resources;
  `aws_lambda_permission.*_function_url_invoke` (the `InvokeFunction` +
  `invoked_via_function_url` grant) plus the AWS provider bump to `~> 6.0`
  (`terraform init -upgrade`, confirmed no breaking changes for any
  resource type this config uses); `MODEL_EMBEDDING` added to
  `infra/secrets.tf`'s key list, `COHERE_API_KEY` removed (confirmed via
  repo-wide grep - unused by any current code). *Done when:*
  `GET /health` returns `{"status":"ok"}` on both a cold and a warm
  request - confirmed, 24.4s cold / 0.22s warm.
- [x] **Step 6 - Fix the F-09 stale comments while already in these
  files** - `infra/lambda.tf`'s header comment and `infra/secrets.tf`'s
  comment still described the abandoned Parameters and Secrets Lambda
  Extension design (open finding `F-09` from the post-12d audit).
  Corrected both to describe the actual direct-SDK-call mechanism while
  editing these exact files for Step 5's permission fix anyway. *Done
  when:* both comments match what `infra/docker/lambda-entrypoint.mjs`
  and `infra/README.md` already correctly say - confirmed. `F-09` itself
  stays in the live ledger for a future `/audit` pass to formally close;
  this fix doesn't touch `findings.md` directly.
- [x] **Step 7 - Fix the credential bridge for repeatable use** - the
  `credential_process` line added directly under `~/.aws/config`'s
  `[default]` profile (to let Terraform use the user's root browser-login
  session) blocked `aws login` from refreshing that same session -
  confirmed live when the session expired mid-work. Split into two
  profiles: `default` stays purely `aws login`-managed, a new
  `[profile terraform]` reads from it live via
  `aws configure export-credentials --profile default --format process`.
  `AWS_PROFILE=terraform` added to the top of all three scripts so this
  is automatic. *Done when:* `AWS_PROFILE=terraform aws sts
  get-caller-identity` succeeds after a fresh `aws login`, with zero
  `~/.aws/config` edits needed - confirmed.
- [x] **Step 8 - Real end-to-end test** - sent a real question through
  the deployed API (`POST /question`) after all fixes landed. *Done
  when:* a complete, correctly-formed response streams back through all
  four SSE events (route/search/draft/done) - confirmed: real Bedrock
  routing call, real Supabase vector search (proving `MODEL_EMBEDDING`
  works), real draft/verification, and a correctly-triggered abstention
  (the demo corpus doesn't index labor law, the test question's domain) -
  genuine proof the deployed stack works, not an inferred claim.
- [x] **Step 9 - Scripts for reproducibility, README for a newcomer** -
  added `infra/push-secrets.sh` (`.env.prod` → the real secret, validates
  every expected key is present before pushing) and `infra/bootstrap.sh`
  (orchestrates the full first-deploy sequence end to end, including the
  expected first-`apply` failure). `.env.prod` created (copy of `.env`,
  via `cp` so its contents were never read into this session) and added
  to `.gitignore` (was previously uncovered - only `.env`/`.env.local`/
  `.env.*.local` existed, not `.env.prod`). `infra/outputs.tf` gained
  `secret_id` (read by `push-secrets.sh`, same "never hardcode what
  Terraform already knows" rule as the rest of the outputs). Rewrote
  `infra/README.md` end to end for a reader with zero project context: a
  Quickstart table, one-time setup (including the credential bridge),
  first deployment, redeploying, updating secrets, then the "why" sections
  (first-apply failure, Lambda/arm64/permissions specifics, local state,
  cost profile) below for whoever wants the detail. *Done when:* all
  three scripts tested for real against the live account (not just syntax
  review) - confirmed: `push-secrets.sh` correctly rejected an incomplete
  `.env.prod` once, then succeeded once fixed; `bootstrap.sh` reviewed
  step-by-step against the same sequence already proven manually in Step
  5 (not independently re-run end-to-end, since the infra already exists
  - re-running it against an existing deployment was unnecessary risk for
  no new information).
- [x] **Step 10 - Critical re-review of Step 9's README, register scripts
  in package.json** - the user pushed back on both points: asked for a
  genuine critical re-read against everything that came up this session
  (not a self-assessment of "good enough"), and pointed out the three
  scripts were only reachable as `./infra/*.sh`, never registered as
  `pnpm` scripts the way every other project command already is
  (`AGENTS.md`'s Commands section). Re-reading Step 9's README against
  the full session surfaced six real gaps it was missing: no inventory of
  what actually gets created, no teardown instructions at all, no
  explicit list of which `.env.prod` keys are required, no carry-forward
  of the root-credentials warning given verbally earlier, no verification
  example for the MCP function (its correct response looks like an
  error), and no mention of the account's low Lambda concurrency limit
  (found via `get-account-settings` during Step 5, never surfaced).
  Fixed all six. Also found `terraform destroy` would fail outright on
  both ECR repositories (real images, no `force_delete`) while writing
  the new teardown section - fixed with `force_delete = true`
  (`infra/ecr.tf`), applied and confirmed via `terraform plan` showing an
  in-place update. Added `deploy:bootstrap`/`deploy:images`/
  `deploy:secrets` to the root `package.json` (thin `bash infra/*.sh`
  wrappers) and a `Deploy` line to `AGENTS.md`'s Commands section,
  matching the existing Build/Lint/Typecheck/Test pattern exactly; also
  fixed a stale AGENTS.md line still describing `api` as an unbuilt stub.
  *Done when:* every `curl`/command shown in the rewritten README tested
  verbatim, exactly as a copy-paste reader would run it, not just
  reasoned about - confirmed for the health check (with and without
  `AWS_PROFILE` pre-set, since the doc doesn't mention setting it) and
  the MCP verification command, both matching the documented output
  exactly; `pnpm deploy:secrets` re-run for real through the new
  `package.json` wrapper, succeeded.
- [x] **Step 11 - Audit, fix, re-audit** - a genuine `/audit` pass (scope:
  current), not a re-check of what was already known. Closed `F-09`
  (already fixed in Step 6, but never updated in the ledger - caught and
  corrected). Found two new real issues: `F-10` (P2) -
  `bootstrap.sh`'s closing instructions told the user to run
  `./push-secrets.sh`, which doesn't exist at the repo root now that
  everything is documented as `pnpm deploy:secrets`; `F-11` (P3) -
  `deploy_function()` in `deploy-images.sh` didn't wait for
  `update-function-code`'s asynchronous update to finish, a real
  `ResourceConflictException` risk on a second concurrent/rapid call.
  Both fixed and re-verified in the same pass: `bootstrap.sh`'s message
  corrected, `aws lambda wait function-updated-v2` added after each
  update. *Done when:* `deploy-images.sh` re-run for real against the
  live deployment (not a syntax check) with the wait in place - both
  functions updated cleanly, both waits completed without error,
  `GET /health` confirmed still `{"status":"ok"}` afterward; full
  `terraform validate` + `pnpm lint`/`typecheck`/`test`/`build` re-run
  clean.

## Verify

Proven against the real, live AWS account this session deployed to - not
just offline checks. `terraform fmt -check -recursive` + `terraform
validate` clean from `infra/`; `pnpm lint`/`typecheck`/`test`/`build`
staying green throughout (nothing in `packages/*` was touched by any of
this); both Lambda functions confirmed live via direct HTTP requests
(cold and warm); a real question sent through `POST /question` produced a
correct, fully-formed response. What remains genuinely unverified: a
second real deployment from scratch on a *different* AWS account (this
session only ever had one account to test against) - `bootstrap.sh`'s
first-apply-fails-then-succeeds sequence is proven by the manual version
of those exact steps, not by an independent run of the script itself.

## Findings

Findings raised by `/audit` against this fix, resolved before it closed.
IDs prefixed `simplify-deploy-automation/` for global uniqueness -
unresolved findings stay in the live ledger instead of archiving here.

### simplify-deploy-automation/F-09 [P2] closed - Stale comments still described the abandoned "Parameters and Secrets Lambda Extension" design

**File:** infra/lambda.tf:9-14, infra/secrets.tf:8-14, blueprint/history/features/12d-terraform-provisioning.md (archived spec, its Architecture/In-scope sections)
**Found:** 2026-08-17 by /audit (scope: current, second pass)
**Why it matters:** The actual implementation (confirmed correct: `packages/api/Dockerfile`, `packages/mcp/Dockerfile`, `infra/docker/lambda-entrypoint.mjs`, and `infra/README.md` all consistently describe it) fetches the app-env secret via a direct `@aws-sdk/client-secrets-manager` call at cold start - the originally-planned "AWS Parameters and Secrets Lambda Extension" was abandoned mid-build after discovering it is only distributed as a Lambda Layer (zip), not a container image, so it can't be copied into a container-image Lambda function without real AWS credentials at build time. That correction was never propagated backward into `infra/lambda.tf`'s header comment or `infra/secrets.tf`'s comment - both still described the extension as the active mechanism.
**Suggested fix:** Update `infra/lambda.tf`'s header comment and `infra/secrets.tf`'s comment to describe the direct SDK call (matching the accurate wording already in `packages/api/Dockerfile` and `infra/README.md`). The archived spec is historical record and does not need editing after the fact.
**Resolution:** Fixed while addressing an unrelated real bug in the same files (the `InvokeFunction` permission fix) - both comments now correctly describe the direct SDK call, with an explicit note that they used to describe the extension. Re-reviewed this pass: re-read both files in full, wording is accurate and consistent with `infra/README.md`. The archived spec (`blueprint/history/features/12d-terraform-provisioning.md`) still has the original stale text - left as-is by design, it's historical record of what the spec said at the time, not live documentation. Closed.

### simplify-deploy-automation/F-10 [P2] closed - `bootstrap.sh`'s final instruction didn't work as printed

**File:** infra/bootstrap.sh
**Found:** 2026-08-18 by /audit (scope: current)
**Why it matters:** After a successful run, the script's closing message told the user to run `./push-secrets.sh`. But `bootstrap.sh` itself is documented and invoked everywhere else (`infra/README.md`, `AGENTS.md`) as `pnpm deploy:bootstrap` from the repo root - and there is no `push-secrets.sh` at the repo root, only `infra/push-secrets.sh`. A user following the printed instruction verbatim from repo root would get "no such file or directory."
**Suggested fix:** Change the echoed instruction to `pnpm deploy:secrets`, matching the rest of the documentation.
**Resolution:** Fixed and re-reviewed same pass: the line now reads `pnpm deploy:secrets`, matching `infra/README.md` and `AGENTS.md`. Closed.

### simplify-deploy-automation/F-11 [P3] closed - `deploy_function()` didn't wait for the Lambda code update to finish

**File:** infra/deploy-images.sh
**Found:** 2026-08-18 by /audit (scope: current)
**Why it matters:** `aws lambda update-function-code` is asynchronous - it returns immediately while AWS applies the update in the background. Running `deploy-images.sh` twice in quick succession (or any future automation invoking it concurrently) would hit `ResourceConflictException` on the second call for a function still mid-update. Low likelihood at this project's current manual, single-operator usage, but a real, easily-closed gap.
**Suggested fix:** Add `aws lambda wait function-updated-v2 --function-name "$function_name"` after each `update-function-code` call in `deploy_function()`.
**Resolution:** Fixed and re-reviewed same pass: `aws lambda wait function-updated-v2` added after each `update-function-code` call. Verified against the real, live deployment (not just syntax) - ran the full script for real, both functions updated and both waits completed without error, then confirmed `GET /health` still returns `{"status":"ok"}` afterward. Closed.

Findings **not** archived here, still unverified in the live ledger:
`F-08` (P3, unverified - `lambda-entrypoint.mjs` test coverage boundary
question, out of this fix's scope).

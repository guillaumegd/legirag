# Feature: Terraform provisioning the stack from scratch

**From build-plan:** feature 12d (fourth sub-item of 12, "Observability and
infrastructure automation")
**Status:** complete (revised mid-feature from ECS Fargate to AWS Lambda,
see Revision note below; all steps rebuilt and verified on the Lambda
design).

## Revision note (2026-08-17)

The feature was originally built end-to-end on ECS Fargate (2 services,
always-on, ~20-25 $/month at idle) and fully verified (`terraform validate`
clean, both Dockerfiles building, audit findings closed). The user then
challenged that design given the project's actual expected traffic - a demo
site, on the order of 10 visits/month, a few questions each - and asked for
a cheaper architecture better matched to that load. Agreed direction:
**AWS Lambda (container images)**, near-zero cost at idle, in exchange for
a few seconds of cold-start latency on the first request after an idle
period. This note documents the pivot rather than silently rewriting
history; the original Fargate work is still recoverable from this
feature's git history if ever needed.

## Goal

`infra/` today is a provider-only skeleton (`providers.tf`, `variables.tf`,
`versions.tf` - AWS + Supabase providers declared, no resources). This
feature writes the actual Terraform resources so `terraform apply` on a
clean AWS account can stand up the real stack: the containerized API
(11d already gave it a `Dockerfile`) and the MCP tool server (7a-7d, never
containerized until this feature), sized for genuinely low, spiky demo
traffic rather than continuous load.

**This feature writes and validates Terraform config. It never runs
`terraform apply`, `terraform plan` against real credentials, or creates
any cloud resource.** That is a separate, explicit decision for the user to
make outside this session, exactly like the AWS billing quota and GitHub
Actions secrets gaps already flagged elsewhere in this project. Everything
here is proven by `terraform validate` (fully offline, no AWS/Supabase API
calls) and local `docker build`.

## Scope correction from the build-plan line

The build-plan text says "containers for API/tool server/observability".
There is no separate "observability" service anywhere in this codebase or
`project-overview.md`'s Tech stack to containerize - observability here
means the tracing data item 12a already writes to the `traces` table,
read back through the existing `GET /trace/:trace_id` endpoint on the API
container itself. This feature provisions compute for **API and MCP tool
server only**; inventing a third, fictitious service would be scope creep
against nothing real.

## Architecture (Lambda, revised)

- **Compute:** two `aws_lambda_function` resources, `package_type = "Image"`,
  pointing at the same two ECR images the Fargate design already used.
- **Ingress:** one `aws_lambda_function_url` per function,
  `invoke_mode = "RESPONSE_STREAM"` - keeps `POST /question`'s streamed
  response working, no API Gateway and no load balancer (both would add a
  fixed monthly cost this traffic level doesn't justify).
- **Networking:** none. Lambda functions with no VPC configuration reach
  the internet natively; Supabase, Bedrock, and Cohere are all public
  endpoints, so there is nothing private to reach. `infra/network.tf`
  (VPC/subnets/IGW/security groups) is removed entirely - not just unused,
  genuinely unnecessary for this design.
- **IAM:** one Lambda execution role per function (simpler than Fargate's
  execution-role/task-role split, which existed to separate ECS's own
  platform permissions from the application's) - `AWSLambdaBasicExecutionRole`
  (CloudWatch Logs) + `bedrock:InvokeModel` + `secretsmanager:GetSecretValue`
  scoped to the one app-env secret.
- **Container -> Lambda bridge:** the AWS Lambda Web Adapter (an official
  AWS-provided layer/binary) lets the existing NestJS/MCP HTTP servers run
  inside Lambda essentially unmodified, instead of rewriting them as Lambda
  handler functions - both Dockerfiles gain a small addition, not a rewrite.
- **Secrets:** still AWS Secrets Manager (unchanged shape/keys). Each image
  runs `infra/docker/lambda-entrypoint.mjs` as its `ENTRYPOINT`, which calls
  `GetSecretValue` on the app-env secret directly via
  `@aws-sdk/client-secrets-manager` (using the credentials Lambda injects
  automatically into the execution environment), exports the result into
  the process environment, then execs the real server. The originally
  planned "AWS Parameters and Secrets Lambda Extension" was abandoned mid-
  build: it is only distributed as a Lambda Layer (zip), not a container
  image, so it cannot be copied into a container-image Lambda function
  without real AWS credentials at build time - discovered live while
  building Step 2, corrected to the direct SDK call instead. No secret
  value is ever present in the Lambda function's own configuration,
  matching this project's "never a credential in the resource definition"
  standard (coding-standards.md).
- **Unchanged:** `infra/ecr.tf` (still need the images stored somewhere),
  `infra/state.tf` (S3 + DynamoDB remote-state bootstrap, same two-phase
  process, still never activated), `infra/providers.tf`, `infra/variables.tf`.

**Explicitly unverifiable without a real AWS account:** the exact ARN of
the AWS Lambda Web Adapter's public ECR image is region/architecture-
specific (confirmed resolvable via real `docker build`, since that
requires an actual image pull - unlike a Terraform layer ARN, which
`terraform validate` cannot resolve). What remains unverifiable end-to-end:
whether a deployed function actually receives traffic correctly through
the Web Adapter (port wiring, response streaming), and whether the
entrypoint script's `GetSecretValue` call succeeds with the real execution
role's permissions at cold start - both only checkable against a real
deployed function, flagged plainly in `infra/README.md`.

## In scope

- `packages/api/Dockerfile`, `packages/mcp/Dockerfile` - add the Lambda Web
  Adapter layer copy step and a secrets-bootstrap entrypoint script; no
  change to the application build stages themselves.
- Terraform: remove `infra/network.tf` and `infra/ecs.tf`, rewrite
  `infra/iam.tf` for Lambda execution roles, add `infra/lambda.tf`
  (functions + function URLs), keep `infra/ecr.tf`/`infra/state.tf` as-is,
  adjust `infra/secrets.tf`'s comment for the new access pattern (the
  resource itself is unchanged).
- `infra/README.md` - rewritten for the Lambda architecture and its cost
  profile, keeping the existing manual-steps sections (billing quota,
  state bootstrap, secret population) since those are unaffected by the
  compute choice.
- `terraform validate` and `docker build` (build-only) re-run as the
  verification evidence, same ceiling as before.

## Out of scope

- Any `terraform apply`/`plan` against real credentials, or any other real
  AWS/Supabase resource creation.
- API Gateway, a custom domain, or TLS beyond the default Function URL
  HTTPS endpoint - a stable, branded API URL is item 13's concern (the
  front end), not this one.
- Autoscaling tuning, provisioned concurrency (to avoid cold starts), or
  CI/CD wiring for image builds/pushes - none justified at 10 visits/month;
  provisioned concurrency in particular would reintroduce a fixed monthly
  cost, defeating the point of this pivot.
- Populating the Secrets Manager secret's actual values, or any other
  manual AWS console action.
- Rewriting `packages/api` or `packages/mcp` as native Lambda handlers -
  the Web Adapter approach is chosen specifically to avoid that.

## Build steps

- [x] **Step 1 (superseded)** - original Fargate-based steps 1-4, fully
  built and verified, then superseded by the revision above. Left recorded
  in git history rather than deleted from the record.
- [x] **Step 2 - Dockerfiles: Lambda Web Adapter + secrets bootstrap** -
  added the AWS Lambda Web Adapter layer (copied from its public ECR
  image, confirmed live) to both Dockerfiles. The originally-planned
  "Parameters and Secrets Lambda Extension" turned out to be
  layer-only, not distributable as a container image without real AWS
  credentials at build time - discovered live, corrected to a small
  `infra/docker/lambda-entrypoint.mjs` that calls Secrets Manager
  directly via `@aws-sdk/client-secrets-manager` instead (own
  `infra/docker/package.json`, isolated from the pnpm workspace). *Done
  when:* both `docker build` commands succeed locally - confirmed, plus a
  smoke test of the entrypoint script with no secret configured.
- [x] **Step 3 - Remove Fargate networking/compute, add Lambda Terraform** -
  deleted `infra/network.tf` and `infra/ecs.tf`, rewrote `infra/iam.tf`
  for per-function Lambda execution roles, added `infra/lambda.tf` (two
  `aws_lambda_function` + two `aws_lambda_function_url` resources, each
  function with an explicit `depends_on` on its own execution role's
  policies - same reasoning as the original Fargate design's F-04 fix),
  updated `infra/secrets.tf`'s comment. Also fixed `.dockerignore`, which
  excluded all of `infra/` (including the new `infra/docker/` the
  Dockerfiles now need) - added a `!infra/docker` negation, same class of
  gap as Step 1's original `.dockerignore` fix. *Done when:* `terraform
  validate` passes across the whole `infra/` directory - confirmed.
- [x] **Step 4 - README and findings update** - rewrote `infra/README.md`
  for the Lambda architecture (why Lambda, how the containers run, cost
  profile, unverifiable end-to-end risk, unchanged manual steps), and
  updated `blueprint/context/findings.md`'s F-04 entry (applied to
  `aws_ecs_service.api`/`.mcp`'s `depends_on`; both resources were
  deleted by this revision - closed with a note explaining the code was
  superseded, not that the finding was invalid, and noting the analogous
  `depends_on` was re-applied on the new Lambda resources). *Done when:*
  `terraform validate` output and both `docker build` outputs captured as
  evidence, `infra/README.md` reflects the current architecture, and
  `findings.md` is accurate - confirmed.
- [x] **Step 5 - Repair F-05, F-06, F-07 from the post-pivot audit** -
  lowercase `AWS_LWA_INVOKE_MODE` in `infra/lambda.tf` (F-05: wrong case
  silently disabled response streaming), document the real manual
  redeploy path in `infra/README.md` given ECR's mutable `:latest` tag
  (F-06: `terraform apply` alone never picks up a newly pushed image), and
  pin `@aws-sdk/client-secrets-manager` with a committed lockfile plus
  `npm ci` (F-07: was unpinned, no lockfile, inconsistent with the rest of
  both Dockerfiles' build-determinism discipline). F-01 (rate limiting
  degrading to one shared bucket behind the Web Adapter) - user's explicit
  call: accepted as-is, not fixed - at ~10 visits/month expected traffic, a
  single shared 20 req/min budget is still far more headroom than needed,
  and the fix touches a file outside this feature's declared scope. *Done
  when:* `terraform validate`, `pnpm lint`/`typecheck`/`test`/`build`, and
  both `docker build` commands all still pass - confirmed, re-verified
  fresh in a second `/audit` pass.

## Files / areas

- `packages/api/Dockerfile`, `packages/mcp/Dockerfile` - modified (Lambda
  Web Adapter + secrets bootstrap entrypoint, later switched to `npm ci`
  against a committed lockfile - F-07).
- `infra/network.tf`, `infra/ecs.tf` - deleted.
- `infra/iam.tf` - rewritten for Lambda.
- `infra/lambda.tf` - new.
- `infra/secrets.tf` - comment only, resource unchanged.
- `infra/README.md` - rewritten, later extended with the manual redeploy
  path (F-06).
- `infra/docker/lambda-entrypoint.mjs`, `infra/docker/package.json`,
  `infra/docker/package-lock.json` - new.
- `.dockerignore` - fixed to keep `infra/docker/` while excluding the rest
  of `infra/`.
- `blueprint/context/findings.md` - see Findings section below.
- `infra/ecr.tf`, `infra/state.tf`, `infra/providers.tf`,
  `infra/variables.tf` - unchanged.

## Data / contracts

- None. Infrastructure-only feature; no `packages/shared` type or schema
  changes.

## Testing

- No unit-testable logic - Terraform HCL, Dockerfiles, and a small shell
  entrypoint script, none of which this project's Vitest gate covers.
  Verified by `terraform validate` (offline) and `docker build` (real
  local build, no cloud dependency), named explicitly in each step's
  done-when. `infra/docker/lambda-entrypoint.mjs`'s lack of test coverage
  was flagged by the second `/audit` pass as a genuine scope-boundary
  judgment call (F-08, left `unverified`, carried forward in the live
  ledger) rather than a clear-cut gap.

## Notes for the AI

- Never run `terraform plan` or `terraform apply`, even with `-target`.
  `terraform validate` is the ceiling, same as the original Fargate design.
- Secrets Manager, not plaintext environment variables, for every
  credential - matches this project's existing "fail fast on missing
  config, never hardcode a credential" convention (coding-standards.md).
- The entrypoint script is deliberately minimal Lambda-specific bootstrap
  plumbing, not application logic - it does not belong in
  `packages/api/src` or `packages/mcp/src`.
- Two full `/audit` passes ran on this feature (first pass on the initial
  Fargate design, second and third on the Lambda revision) - see Findings
  below for what each caught and how it was resolved.

## Findings

Findings raised by `/audit` against this feature (and, for 12d/F-02-F-04,
against 12a-12c code re-examined during this feature's "full item-12 span"
audit pass), resolved before this feature closed. IDs prefixed `12d/` for
global uniqueness - unresolved findings stay in the live ledger instead of
archiving here.

### 12d/F-01 [P1] accepted - Per-IP rate limiting collapses to a single global bucket behind the Lambda Web Adapter

**File:** packages/api/src/app.module.ts:16-22, packages/api/src/main.ts
**Found:** 2026-08-17 by /audit (scope: current)
**Why it matters:** Originally logged as `unverified`/P3 - "no reverse proxy exists yet, so there is no concrete exploitable path today." That premise no longer holds. 12d's Lambda revision puts the AWS Lambda Web Adapter in front of this exact server: the adapter receives the real Lambda Function URL invocation and proxies it to the NestJS app over a local HTTP connection (`AWS_LWA_PORT`), so the app's HTTP server no longer sees real client sockets at all, regardless of what headers the adapter does or does not forward. `main.ts` never calls `app.set('trust proxy', ...)` (confirmed by reading the file in full this pass), so Express's default (`trust proxy: false`) applies: `req.ip` resolves to the direct TCP peer, which under this architecture is always the adapter's local loopback connection, not the end user. Concrete effect once deployed: `ThrottlerGuard`'s per-IP tracker (documented in `app.module.ts`'s own comment as "20 req/min/IP") degrades to one shared 20 req/min bucket for every real client combined - a busy user exhausts the budget for everyone else. This is a functional regression (over-restriction, not a bypass, since `trust proxy` being off also means a spoofed `X-Forwarded-For` is ignored), directly triggered by 12d's own architecture choice, not a pre-existing app bug that 12d merely inherited unchanged.
**Suggested fix:** In `packages/api/src/main.ts`, call `app.set('trust proxy', 1)` (or the NestJS-equivalent `app.getHttpAdapter().getInstance().set('trust proxy', 1)`) so Express reads the one hop of forwarding the Web Adapter introduces, and confirm (can only be verified against a real deployed function, not offline) that the adapter does populate `X-Forwarded-For` with the real client IP from the Function URL invocation event - if it does not, a different fix is needed (e.g. reading the IP from a header the adapter is confirmed to set). Out of scope for 12d itself to fix (packages/api/src is explicitly untouched by this feature per its Files/areas section).
**Resolution:** `accepted` - user's explicit decision, 2026-08-17: not fixing now. Reasoning given: expected real traffic is ~10 visits/month, a few questions each, so even one shared 20 req/min budget across every visitor combined is far more headroom than this project will use in practice - not worth the complexity of touching `packages/api/src/main.ts` (outside 12d's declared scope) for a limit that will not realistically bind at this traffic level. Re-open if real usage ever approaches the shared limit, or before any traffic projection changes materially.

### 12d/F-02 [P1] closed - `router_question` MCP tool leaked internal token usage to third-party clients

**File:** packages/mcp/src/server.ts:86-87
**Found:** 2026-08-17 by /audit (scope: since 41d34ba, full item-12 span)
**Why it matters:** 12a added `usage` to `routerQuestion`'s return value (`packages/agent/src/router-question.ts`) so the fixed-chain graph could trace the router's own model call. That function is also called directly by the MCP server's `router_question` tool handler, which serializes the *entire* return value back to any third-party MCP client with `JSON.stringify(result, null, 2)`. The tool's documented contract is `RouterQuestionOutput` (`{ codes, confiance, raisonnement }`) - `graph.ts`'s own comment calls this "a locked contract (§5.3, 9b)". `usage` silently riding along as an extra field is contract drift on a locked, externally-facing contract, introduced as a side effect of an internal tracing feature, never a deliberate decision to expose token accounting to third parties.
**Suggested fix:** Strip `usage` before returning to the MCP client; keep it flowing to `graph.ts`'s `route()` node unchanged.
**Resolution:** Fixed same session - `server.ts`'s `router_question` handler now destructures `usage` out before serializing (`const { usage: _usage, ...result } = await routerQuestion(...)`). Verified: `pnpm typecheck`/`pnpm lint` pass; the only two call sites of `routerQuestion` in the repo are this handler and `graph.ts`'s `route()`, confirmed by repo-wide grep, so no other leak path exists. Re-reviewed in the second `/audit` pass (scope: since 41d34ba): diff re-read, destructuring is correct, introduces no new issue. Closed.

### 12d/F-03 [P3] closed - Initial chunk load left redundant entries in `reindex_queue`

**File:** packages/ingest/src/cold/load-chunks.ts (now :138-145)
**Found:** 2026-08-17 by /audit (scope: since 41d34ba, full item-12 span)
**Why it matters:** 12c's trigger enqueues every `INSERT` into `articles`, including the very first bulk load on a from-scratch database. `load-chunks.ts` (4b) already correctly chunks/embeds those same articles in the same run, but never cleared their `reindex_queue` entries - a from-scratch bootstrap would leave the queue full of articles already correctly indexed, and a later `process:reindex-queue` run would silently re-embed all of them a second time (real Cohere cost, no correctness impact). Narrow window (only a truly fresh database triggers it - the existing demo corpus predates the 12c migration and was unaffected), so kept at P3 rather than P1/P2.
**Suggested fix:** Have `load-chunks.ts` delete the `reindex_queue` rows for each batch it just processed.
**Resolution:** Fixed same session - `load-chunks.ts`'s batch loop now deletes `reindex_queue` rows for `batch.map(a => a.articleIdentifier)` right after `processBatch` succeeds. Verified: `pnpm typecheck`/`pnpm build` pass. Re-reviewed in the second `/audit` pass (scope: since 41d34ba): the `delete ... where article_identifier = any($1)` call is correctly parameterized (matches this package's existing patterns, e.g. `prune-corpus.ts`), placed after `processBatch` so a failed batch never deletes queue rows for articles that weren't actually re-chunked. Not re-run live against a real from-scratch database (the demo corpus is not disposable) - closed on code-review confidence, not a live rerun; flag if a real fresh-DB bootstrap ever surfaces a problem.

### 12d/F-04 [P3] closed - ECS services had no explicit dependency on their execution role's IAM policies

**File:** infra/ecs.tf (removed - see Resolution)
**Found:** 2026-08-17 by /audit (scope: since 41d34ba, full item-12 span)
**Why it matters:** `aws_ecs_service.api`/`.mcp` reference their task definitions, which reference `aws_iam_role.execution` by ARN - but Terraform's implicit dependency graph only orders the *role* before the task definition, not the `aws_iam_role_policy`/`aws_iam_role_policy_attachment` resources granting that role its actual permissions. ECS validates execution-role permissions when it launches a task, not when the task definition is created, so a first `terraform apply` could plausibly try to launch tasks before the secrets-read policy is attached, a known common ECS+Terraform ordering gotcha. Never applied in this session, so this was never observed failing - a real but unconfirmed risk (P3, not P1/P2, since AWS retries typically self-heal it).
**Suggested fix:** Add explicit `depends_on` from each `aws_ecs_service` to the relevant `aws_iam_role_policy`/`aws_iam_role_policy_attachment` resources.
**Resolution:** Fixed and closed once (ECS `depends_on` added, re-reviewed, `terraform validate` clean). Then, in the same session, 12d's whole design was replaced: ECS Fargate was dropped for AWS Lambda after the user challenged Fargate's always-on cost against the project's actual traffic (~10 visits/month). `infra/ecs.tf` (and `infra/network.tf`) were deleted outright, so the original finding's file no longer exists in any form - not fixed-in-place, genuinely gone. The analogous risk was re-considered for the new design: `infra/lambda.tf`'s `aws_lambda_function.api`/`.mcp` now carry their own explicit `depends_on` on each function's execution-role policy attachment/policies, for the same reason (avoid a function referencing a role whose permissions haven't propagated yet). Marking this entry `closed` rather than `invalid`: the original defect and fix were real and correctly reviewed against code that existed at the time; it is the code itself that was superseded, not the finding.

### 12d/F-05 [P1] closed - `AWS_LWA_INVOKE_MODE` is set to the wrong case, silently disabling response streaming

**File:** infra/lambda.tf:28, infra/lambda.tf:62
**Found:** 2026-08-17 by /audit (scope: current)
**Why it matters:** Both Lambda functions set `AWS_LWA_INVOKE_MODE = "RESPONSE_STREAM"` (uppercase). Confirmed against the Lambda Web Adapter's own documented configuration (fetched this pass): the adapter's accepted values are lowercase - `'buffered'` or `'response_stream'` - defaulting to `'buffered'` when unset or unrecognized. `"RESPONSE_STREAM"` (uppercase) does not match either accepted value, so the adapter would silently fall back to buffered mode rather than erroring. This directly undermines 12d's own stated design goal ("keeps `POST /question`'s streamed response working") - the Lambda Function URL resource's own `invoke_mode = "RESPONSE_STREAM"` (uppercase) is correct for that separate AWS API/Terraform attribute, which is likely how the two got conflated: two different systems, two different casing conventions, same string copied into both.
**Suggested fix:** Change both `AWS_LWA_INVOKE_MODE` values in `infra/lambda.tf` to `"response_stream"` (lowercase), leaving the `aws_lambda_function_url` resources' `invoke_mode = "RESPONSE_STREAM"` (uppercase) unchanged - that one is correct as-is.
**Resolution:** Fixed same session - both occurrences lowercased to `"response_stream"`, with a comment explaining the deliberate casing difference from the Function URL's own `invoke_mode`. Verified via `terraform fmt -recursive` + `terraform validate` (clean). Re-reviewed in this second `/audit` pass: re-read `infra/lambda.tf` in full, both values are lowercase, the `aws_lambda_function_url` resources' `invoke_mode = "RESPONSE_STREAM"` correctly remains uppercase, `terraform validate` re-run clean. Closed.

### 12d/F-06 [P2] closed - ECR's mutable `:latest` tag means Terraform never detects a newly pushed image

**File:** infra/lambda.tf:20, infra/lambda.tf:54 (interacts with infra/ecr.tf's `image_tag_mutability = "MUTABLE"`)
**Found:** 2026-08-17 by /audit (scope: current)
**Why it matters:** Both `aws_lambda_function` resources set `image_uri = "${repo_url}:latest"`. Terraform tracks that attribute as a plain string; pushing a new image to the same `:latest` tag on ECR changes what the tag *points to* but does not change the string Terraform compares against state, so a later `terraform apply` after a new image push reports "no changes" and the deployed function keeps running the old image. Redeploying a new build would need an out-of-band step (`aws lambda update-function-code --image-uri ...`, `terraform taint`, or pinning by digest) that exists nowhere in this feature or its README. Distinct from the already-accepted "no CI/CD pipeline" exclusion (Out of scope above) - that exclusion is about automating the build+push, not about whether a manual `terraform apply` alone can ever pick up a new image once pushed, which today it cannot.
**Suggested fix:** Document the real redeploy path in `infra/README.md` (either the `update-function-code` command, or switch to referencing the image by digest and documenting how the digest gets updated) so a future manual deploy doesn't quietly no-op.
**Resolution:** Fixed same session - added a "Redeploying a new image after the first apply" section to `infra/README.md` with the exact `docker build`/`docker push`/`aws lambda update-function-code` sequence for both functions. Documentation fix, no code/Terraform change. Re-reviewed in this second `/audit` pass: section reads correctly, the commands and image URIs are consistent with `infra/ecr.tf`'s repository names and `infra/lambda.tf`'s function names. Closed.

### 12d/F-07 [P3] closed - `infra/docker/package.json`'s dependency is unpinned with no committed lockfile

**File:** infra/docker/package.json, packages/api/Dockerfile, packages/mcp/Dockerfile
**Found:** 2026-08-17 by /audit (scope: current)
**Why it matters:** `@aws-sdk/client-secrets-manager` is declared with a caret range (`^3.700.0`) and no `package-lock.json` is committed for `infra/docker/`; both Dockerfiles run `npm install` (not `npm ci`) for it. Inconsistent with this project's build-determinism discipline enforced two steps earlier in the same Dockerfiles (`corepack prepare pnpm@9.15.9 --activate` pinned exactly, `pnpm install --frozen-lockfile` against a committed lockfile) - rebuilding either image weeks or months from now can silently resolve a different SDK minor/patch version with no diff in this repo to show why.
**Suggested fix:** Commit a `package-lock.json` for `infra/docker/` and switch the Dockerfile step to `npm ci --omit=dev`, matching the reproducibility guarantee the rest of both Dockerfiles already have.
**Resolution:** Fixed same session - `@aws-sdk/client-secrets-manager` pinned to the exact version npm resolved (`3.1112.0`, no caret), `infra/docker/package-lock.json` generated and committed, both Dockerfiles switched from `npm install --omit=dev` to `npm ci --omit=dev` against the now-copied lockfile. Verified: both `docker build` commands succeed, `npm ci` output confirms it installed from the lockfile (`added 24 packages... found 0 vulnerabilities`). Re-reviewed in this second `/audit` pass: both Dockerfiles re-read in full, `COPY` correctly includes both `package.json` and `package-lock.json` before `npm ci`, `package.json`'s dependency has no caret, both `docker build` commands re-run clean. Closed.

Findings **not** archived here, still open/unverified in the live ledger:
`F-08` (P3, unverified - `lambda-entrypoint.mjs` test coverage boundary
question) and `F-09` (P2, open - stale comments describing the abandoned
Parameters and Secrets Lambda Extension design, in `infra/lambda.tf`,
`infra/secrets.tf`, and this very file's Architecture/In-scope sections
above, left uncorrected at the user's choice to proceed straight to
`/complete`).

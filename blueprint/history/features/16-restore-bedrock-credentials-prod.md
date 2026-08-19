# Feature: Restore valid Bedrock credentials in prod

**From build-plan:** feature 16
**GitHub issue:** #17 (reused, already open)
**Status:** all build steps done, ready for `/complete`

## Goal

The `legirag/app-env` Secrets Manager secret was updated with real AWS
credentials via `infra/push-secrets.sh` (confirmed applied - `LastChangedDate`
`2026-08-19T03:34:25+01:00`), but both prod Lambdas (`legirag-api`,
`legirag-mcp`) only read that secret once, at container cold start
(`infra/docker/lambda-entrypoint.mjs`). Verified live this session: both
Lambdas' `LastModified` is `2026-08-19T02:16-02:17 UTC`, before the secret
update, and CloudWatch still shows `APICallError: The security token
included in the request is invalid` from both the `route` and `draft` nodes
of `packages/agent/src/graph.ts` - the bug is confirmed still live, not
already resolved. This feature forces both Lambdas to cold-start again so
they pick up the valid credentials, then proves it end-to-end so the
demo-blocking question works again.

**Revision note (2026-08-19, mid-implementation):** Step 1 (redeploy) was
completed and verified, but the Step 3 replay still failed with the exact
same `security token invalid` error on a brand-new cold start. Diagnosis:
the secret's `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` pair, tested
directly against the same Bedrock `converse` call the app makes (same
model, same region), works perfectly. The real bug is in
`infra/docker/lambda-entrypoint.mjs`: it overwrites `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` from the secret at cold start, but never clears
`AWS_SESSION_TOKEN` - a value AWS Lambda automatically injects for the
execution role's own temporary credentials. The AWS SDK then signs Bedrock
requests with the new (static, secret-sourced) key pair combined with the
stale (role-sourced) session token, an invalid credential triple that
Bedrock rejects as "security token invalid" - unrelated to whether the
Lambda is warm or freshly cold-started. This is why the original
"just force a redeploy" theory (the only thing build-plan item 16
described) could never have fixed it. Scope was extended, with explicit
approval, to include the one-line fix. What was originally "no application
source changes" is now a single line in `infra/docker/lambda-entrypoint.mjs`.

## In scope

- Force fresh execution environments (cold starts) for `legirag-api` and
  `legirag-mcp` so `lambda-entrypoint.mjs` re-reads `legirag/app-env`
  (done - see Step 1)
- Fix `infra/docker/lambda-entrypoint.mjs` to clear the Lambda-injected
  `AWS_SESSION_TOKEN` after applying the secret's static credentials
- Redeploy with the fix and confirm no new `"security token"` errors in
  CloudWatch
- Replay "Puis-je rouler à 140 sur l'autoroute ?" end-to-end against the real
  prod API and confirm a genuine structured answer, not the generic
  verification-failure abstention

## Out of scope

- **Item 19** - persisting the real underlying error in the trace record
  instead of a generic abstention message. Separate build-plan item.
- **Item 17** - the shared per-IP rate limit that can 429 a second replay
  attempt. Separate build-plan item; noted as a risk below, not fixed here.
- Any broader redesign of the cold-start-only secret read pattern (no live
  secret rotation/refresh) - only the `AWS_SESSION_TOKEN` leak is fixed,
  the once-per-cold-start read model itself stays as is.
- Any `terraform apply` / infra config change - only the running Lambda code
  image is being touched (via `update-function-code`), not Terraform-managed
  resources or the secret itself.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any AWS command runs.
2. The AI runs just that step's command(s).
3. It shows the real command output (there is no diff to review - this
   feature changes no source files); you read it and confirm the done-when.
4. You approve, then move to the next step. No commits happen mid-feature -
   there is nothing to commit until `/complete`'s archive/build-plan update.

## Build steps

- [x] **Step 1 - Force fresh Lambda cold starts** - run `pnpm deploy:images`
  (rebuilds and pushes both images from current, unchanged source, calls
  `update-function-code` on `legirag-api` and `legirag-mcp`, waits for
  `function-updated-v2`). This is a real deploy against the prod AWS account
  (confirmed live this session: account `197583139051`) - stop and get an
  explicit, separate "yes" in chat before running it, per AGENTS.md's
  Deployment guardrail. *Done when:* `aws lambda get-function-configuration
  --function-name legirag-api` and `--function-name legirag-mcp` both report
  `LastModified` after `2026-08-19T02:34:25Z` (the secret's
  `LastChangedDate` in UTC).
- [x] **Step 2 - Diagnose the still-failing replay** - replayed the "140
  km/h" question against prod post-redeploy; still failed with `security
  token invalid` on a fresh cold start. Tested the secret's exact
  `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` directly against the same
  Bedrock `converse` call (same model, same region) from outside the
  Lambda - it succeeded, proving the credential values themselves are
  valid. Root cause: `infra/docker/lambda-entrypoint.mjs` never clears the
  Lambda-injected `AWS_SESSION_TOKEN`, so the SDK signs with a mismatched
  key/token pair. *Done when:* root cause identified and confirmed with
  evidence (done - see Revision note above).
- [x] **Step 3 - Fix `lambda-entrypoint.mjs`** - after applying the
  secret's values to `process.env`, add `delete process.env.AWS_SESSION_TOKEN;`
  so the AWS SDK signs with the secret's static key pair alone, not mixed
  with the Lambda role's stale session token. One-line change, both
  `legirag-api` and `legirag-mcp` share this same entrypoint file. *Done
  when:* the diff is exactly that one line (plus maybe a short comment
  explaining why, matching the file's existing comment style) and it's
  approved.
- [x] **Step 4 - Redeploy with the fix** - run `pnpm deploy:images` again
  (same real-deploy confirmation as Step 1). *Done when:* both Lambdas'
  `LastModified` is newer than Step 3's commit-adjacent redeploy time.
- [x] **Step 5 - Confirm no more credential errors** - trigger one cold
  invocation of `legirag-api` (the Step 6 replay does this; don't invoke it
  twice just to check logs), then run `aws logs filter-log-events
  --log-group-name /aws/lambda/legirag-api --filter-pattern '"security
  token"' --start-time <step-4-completion, epoch ms>`. *Done when:* zero
  matching events in `legirag-api`'s log group since the Step 4 redeploy.
- [x] **Step 6 - Replay the demo-blocking question end-to-end** - `POST` the
  exact question "Puis-je rouler à 140 sur l'autoroute ?" to the prod API
  function URL
  (`terraform -chdir=infra output -raw api_function_url`, currently
  `https://3yf3w7vryz2akptzeydmv44fqa0snwfx.lambda-url.eu-west-3.on.aws/question`),
  consuming the SSE stream to completion, with the `Authorization: Bearer
  <LEGIRAG_ACCESS_TOKEN>` header (the API requires this on every non-public
  route - `packages/api/src/common/access-token.guard.ts`; the token is the
  `LEGIRAG_ACCESS_TOKEN` value in the `legirag/app-env` secret). *Done
  when:* the response is a genuine `ReponseStructuree` reflecting the
  agent's real assessment of the question (whatever `confiance` it lands
  on), not the generic "la vérification des citations a échoué" abstention
  caused by a caught exception.

## Files / areas

- `infra/docker/lambda-entrypoint.mjs` - one-line fix (clear
  `AWS_SESSION_TOKEN` after applying the secret)
- `packages/api`, `packages/mcp`, and `infra/*.tf` stay unchanged. The rest
  of this feature runs existing scripts (`pnpm deploy:images`) and AWS CLI
  read commands against the already-deployed stack.

## Data / contracts

None.

## Testing

`lambda-entrypoint.mjs` is plain Lambda bootstrapping glue outside
`packages/*` (no test runner wired to it, consistent with how the rest of
that file is treated - see its own top-of-file comment). The fix is
verified live end-to-end (Steps 4-6: redeploy, clean CloudWatch logs, a
real successful prod answer) rather than a unit test. Evidence is live AWS
command output (Lambda `LastModified` timestamps, `filter-log-events`
results) plus one real end-to-end prod API response. `AGENTS.md` has no
`Verify` command step relevant here since nothing in `packages/*` changes.

## Notes for the AI

- Step 1 is the one risky action in this feature (a real prod deploy).
  Everything else is read-only (AWS CLI queries, log filtering, one API
  call that only reads/answers, doesn't mutate state). Don't bundle Step 1
  with Step 3's replay in the same uninterrupted run - get the Step 1
  confirmation first, on its own.
- Rate limits: item 17 isn't fixed yet, so `PersistentRateLimitGuard`
  applies the same strict per-IP budget
  (`RATE_LIMIT_PER_MINUTE_PER_IP`/`RATE_LIMIT_PER_DAY_PER_IP`) to every
  route. If Step 3 gets a 429 instead of a real answer, that's item 17's
  known bug, not a regression from this feature - note it and don't debug
  it here. Space out Step 2/3 invocations to avoid burning the budget
  before Step 3's real replay.
- `infra/deploy-images.sh` needs `AWS_PROFILE=terraform` (it sets this
  itself) and a valid AWS session - if credentials have expired, `aws
  login` first (see the script's own comments on this friction).
- Step 4 is a second real prod deploy - it needs its own explicit,
  separate "yes" in chat too, same as Step 1. Don't assume Step 1's
  approval covers it.
- Verified read-only before writing this spec: secret `LastChangedDate`
  2026-08-19T03:34:25+01:00; both Lambdas' `LastModified`
  2026-08-19T02:16-02:17 UTC (stale, predates the secret update); CloudWatch
  still shows `"security token"` errors as of this session on both the
  `route` and `draft` agent nodes. The bug is confirmed still live.
- Verified during implementation (see Revision note): the secret's
  credential values are valid on their own (tested directly against
  Bedrock); the bug is the leftover `AWS_SESSION_TOKEN` in
  `lambda-entrypoint.mjs`, not the credential values or cold-start timing.
- The prod API requires `Authorization: Bearer <LEGIRAG_ACCESS_TOKEN>` on
  `POST /question` (build-plan item 23, already shipped) - fetch that
  token's value from the `legirag/app-env` secret at replay time, don't
  print the full token value to any output, and don't persist it to a
  file.

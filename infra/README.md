# Infrastructure (Terraform)

Provisions the legirag stack on AWS: container registries, IAM, secrets, and
two AWS Lambda functions (container images) running the API (`packages/api`)
and MCP tool server (`packages/mcp`), invoked through Lambda Function URLs.
The Supabase database itself stays externally managed (already provisioned) -
the `supabase` provider is declared for future project-level config, not used
by any resource yet.

## Why Lambda, not a container service

The original design (built and fully verified first) used ECS Fargate: two
services running continuously, at an estimated ~20-25 $/month regardless of
traffic. The project's actual expected load is a demo site - on the order of
10 visits/month, a few questions each - so an always-on service was
disproportionate to the traffic it would serve. Lambda (container images,
pay-per-invocation) was chosen instead: near-zero cost at this traffic level
(well within the AWS Lambda free tier), in exchange for a few seconds of
cold-start latency on the first request after an idle period, acceptable at
this usage.

Consequence of this choice: no VPC, no networking Terraform at all. Lambda
functions with no VPC configuration reach the internet natively, and
Supabase, Bedrock, and Cohere are all public endpoints - there is nothing
private to route to. No load balancer either; each function gets its own
Function URL with response streaming enabled (`invoke_mode = RESPONSE_STREAM`),
which keeps `POST /question`'s streamed response working without the fixed
monthly cost of an ALB or API Gateway.

## How the containers run in Lambda

Both Dockerfiles copy the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)
binary (`public.ecr.aws/awsguru/aws-lambda-adapter`) into `/opt/extensions/` -
a Lambda Extension that bridges the Lambda invocation API to the existing
NestJS/MCP HTTP servers, so those servers run essentially unmodified instead
of being rewritten as Lambda handler functions.

Secrets: Lambda has no equivalent of ECS's `secrets` container-definition
field, and the AWS-managed "Parameters and Secrets Lambda Extension" is only
distributed as a Lambda Layer (zip), not a container image - it cannot be
copied into a container-image Lambda function without pulling the layer via
the AWS CLI with real credentials at build time, which this feature
deliberately avoids (see current-feature.md's revision note). Instead, each
image runs `infra/docker/lambda-entrypoint.mjs` as its `ENTRYPOINT`: it calls
`GetSecretValue` on the app-env secret directly via the AWS SDK (using the
credentials Lambda injects automatically into the execution environment),
exports the result into the process environment, then execs the real server
(`node dist/main.js` / `node dist/index.js`). No secret value is ever present
in the Lambda function's own configuration.

## Nothing here has ever been applied

Every resource is written and `terraform validate`-checked only, same as the
original Fargate design. Before a real `terraform apply` would work, the
following manual steps are required - none of them can be done from inside
this repository:

## 1. AWS billing quota

Set an account-level Budgets alert and/or a Bedrock Service Quota, as
already flagged in `blueprint/context/project-overview.md`'s Open questions.
Defense in depth alongside the app-level cost guard
(`packages/api/src/question/cost-guard.service.ts`).

## 2. Two-phase remote state activation

`infra/state.tf` defines the S3 bucket and DynamoDB lock table Terraform
state would eventually live in, but `versions.tf`'s `backend "s3"` block
stays commented out - the bucket doesn't exist yet, and Terraform can't use
a backend that isn't there.

1. `terraform apply` once with the default local state (`backend "s3"`
   still commented out) - this creates the bucket and lock table.
2. Uncomment and fill in `versions.tf`'s `backend "s3"` block with the real
   bucket name/region.
3. Run `terraform init -migrate-state` to move the local state file into
   the new S3 backend.

## 3. Secret values

`infra/secrets.tf` creates the Secrets Manager secret *container* with
placeholder `"REPLACE_ME"` values (`lifecycle.ignore_changes` on
`secret_string` so a future `apply` never overwrites real values with the
placeholder again). Populate the real values via the AWS console or CLI
after the first apply - same category of manual action as the eval CI
secrets flagged in `.github/workflows/eval.yml` (item 12b).

## 4. Unverifiable-without-a-real-account risk

`docker build` confirmed the Lambda Web Adapter's public ECR reference
resolves and both images build cleanly with it. What `docker build` and
`terraform validate` together still cannot confirm: that a deployed function
actually receives traffic correctly end-to-end through the Web Adapter (port
wiring via `AWS_LWA_PORT`, response streaming via `AWS_LWA_INVOKE_MODE`), and
that the entrypoint script's `GetSecretValue` call succeeds with the real
execution role's permissions at cold start. Both are only checkable against
a real deployed function - flagged here rather than presented as verified.

## 5. Redeploying a new image after the first apply

`aws_lambda_function.api`/`.mcp` reference their image as `"<repo_url>:latest"`.
Terraform tracks that as a plain string: pushing a new image to the same
`:latest` tag on ECR changes what the tag points to, but not the string
Terraform compares against its state - so a plain `terraform apply` after a
new image push reports "no changes" and the function keeps running the old
code (found by /audit, F-06). To actually deploy a new build:

```
docker build -f packages/api/Dockerfile -t <account>.dkr.ecr.<region>.amazonaws.com/legirag-api:latest .
docker push <account>.dkr.ecr.<region>.amazonaws.com/legirag-api:latest
aws lambda update-function-code --function-name legirag-api --image-uri <account>.dkr.ecr.<region>.amazonaws.com/legirag-api:latest
```

Repeat for `legirag-mcp`. No CI/CD wiring for this exists (deliberately out
of scope, see current-feature.md) - it is a manual step every time.

## 6. First real apply

Only after 1-3 above, and only with explicit approval - this repository's
workflow (`AGENTS.md`) never applies Terraform on its own.

## What's deliberately not here

- No API Gateway, custom domain, or TLS beyond the Function URL's default
  HTTPS endpoint - a stable, branded API URL is item 13's concern (the
  front end), not this one.
- No provisioned concurrency (would eliminate cold starts, but reintroduces
  a fixed monthly cost - defeats the point of moving off Fargate at this
  traffic level).
- No autoscaling tuning, no staging/prod separation, no CI/CD image
  build+push pipeline. Single environment, manually built and pushed images.

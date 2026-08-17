# Infrastructure (Terraform)

Provisions the legirag stack on AWS: container registries, IAM, secrets, and
two AWS Lambda functions (container images) running the API (`packages/api`)
and MCP tool server (`packages/mcp`), invoked through Lambda Function URLs.
The Supabase database itself stays externally managed (already provisioned),
outside this Terraform config entirely - no `supabase` provider is declared
(it had no resource using it, and a Supabase personal access token grants
full account-wide access with no way to scope it down, so requiring one for
nothing would be a real risk for no benefit).

This document assumes no prior context on this project. If you're resuming
work later and just need the commands, jump to **Quickstart**.

## What this deploys

Two AWS Lambda functions (container images), running the API
(`packages/api`) and MCP tool server (`packages/mcp`) already in this repo.
Running `terraform apply` from scratch creates:

| Resource | What / why |
|---|---|
| 2x ECR repository | Stores the two Docker images |
| 2x Lambda execution role + policies | CloudWatch Logs, `bedrock:InvokeModel`, read access to the one secret below |
| 2x Lambda function (container image, `arm64`) | The actual running code |
| 2x Lambda Function URL | Public HTTPS endpoint per function, response streaming enabled |
| 2x Lambda resource-based permission (x2 each) | Grants public invoke access - see **How the containers run in Lambda** for why there are two per function |
| 1x Secrets Manager secret | Holds the real credentials/config (`MODEL_VOLUME`, `SUPABASE_URL`, etc.) |

Nothing else - no VPC, no load balancer, no database (Supabase is external
and unmanaged by this Terraform config). See **Cost profile** for what this
actually costs to run, and **Tearing it down** for how to remove all of it.

## Quickstart

Everything below is a `pnpm` script (see `package.json`/`AGENTS.md`), each a
thin wrapper around a script under `infra/` you can also run directly. None
of them run `terraform apply` silently or spend money without you having
already run the previous step - read **One-time setup** first if this is
your first time.

| Situation | Command |
|---|---|
| Brand new AWS account, nothing deployed yet | `pnpm deploy:bootstrap` |
| You changed `packages/api` or `packages/mcp` and want the deployed functions to pick it up | `pnpm deploy:images` |
| You need to update the real secret values (API keys, DB URL...) | `pnpm deploy:secrets` |
| Just checking things still work | see **Verifying it works** below |
| You want to remove everything this created | see **Tearing it down** below |

## One-time setup

Do this once per machine, before `pnpm deploy:bootstrap`.

### 1. Install the tools

- [Terraform](https://developer.hashicorp.com/terraform/install) (`>= 1.9`)
- [Docker](https://www.docker.com/) (must be running)
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- Node.js (already required by the rest of this repo)

### 2. AWS credentials

You need a way for both the `aws` CLI and Terraform to authenticate. How you
sign in depends on your AWS setup (IAM user with access keys, SSO, or the
newer browser-based root/IAM login flow via `aws login`) - any of them work,
with one catch:

**Avoid using root credentials if you can.** The root user has unrestricted
access to the entire AWS account - billing, account closure, everything -
and AWS's own guidance is to avoid using it for day-to-day work. Prefer an
IAM user (or role) with the permissions this project actually needs
(`AdministratorAccess` is the simplest fit for a solo demo account like this
one, though narrower is better if you're willing to maintain a scoped
policy). This project's own first real deployment was done with root
credentials as a deliberate, informed, one-off risk acceptance - not a
recommendation.

**If you use `aws login` (browser-based session login):** that session lives
on the `default` profile in `~/.aws/config` and is short-lived (it expires
and needs `aws login` again periodically). Terraform's AWS provider doesn't
understand that session format directly, so this repo bridges it through a
second profile that re-reads the `default` session on every call:

```ini
# ~/.aws/config
[default]
login_session = arn:aws:iam::<your-account-id>:root
region = eu-west-3

[profile terraform]
credential_process = aws configure export-credentials --profile default --format process
region = eu-west-3
```

Add the `[profile terraform]` block once. Every script in `infra/` sets
`AWS_PROFILE=terraform` itself, so after this one-time setup, refreshing an
expired session is just `aws login` in your terminal - nothing here ever
needs editing again.

**If you use access keys or SSO instead**, this bridge isn't needed - `aws
configure` or your normal SSO login is enough, and you can ignore the
`terraform` profile entirely (or point the scripts' `AWS_PROFILE` at your
own profile name if you use a non-default one).

Verify either way with:
```
aws sts get-caller-identity
```

### 3. AWS billing quota

Set an account-level [Budgets](https://console.aws.amazon.com/billing/home#/budgets)
alert (a "zero spend budget" template is the simplest fit for this project's
near-zero expected cost) before creating any real resource. Nothing in this
repo can do this for you or check that you've done it - see **Cost profile**
below for what you're actually protecting against.

## First deployment

```
pnpm deploy:bootstrap
```

This runs, in order: `terraform init`, a first `terraform apply` (this
**will report an error partway through** - read on, it's expected), builds
and pushes both Docker images, then a second `terraform apply`. See **Why
the first apply always fails** below if you want to understand why rather
than just trust it.

When it finishes, the two functions exist but will error on every real
request: the secret they read still holds placeholder `"REPLACE_ME"` values.
Finish with:

```
cp .env .env.prod   # only if .env.prod doesn't exist yet
pnpm deploy:secrets
```

`.env.prod` is your own file, gitignored, never committed. It starts as a
copy of your local dev `.env` - edit it if production values should ever
differ (a different Supabase project, different model IDs, etc.). The exact
keys `push-secrets.sh` requires (it fails loudly if any are missing, rather
than pushing an incomplete secret): `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `MODEL_VOLUME`, `MODEL_ESCALADE`,
`MODEL_EMBEDDING`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` - the same set `.env.example`
documents, minus `COHERE_API_KEY` (see **What's deliberately not here**).

## Verifying it works

```
curl $(terraform -chdir=infra output -raw api_function_url)health
```
Expect `{"status":"ok"}`. The first request after any period of inactivity
takes 15-25 seconds (cold start - the container has to boot); a second
request right after is well under a second.

The MCP function is harder to eyeball: it speaks the MCP Streamable HTTP
protocol, not plain REST, so a bare request without the right headers gets
rejected on purpose:
```
curl $(terraform -chdir=infra output -raw mcp_function_url)
```
Expect `{"jsonrpc":"2.0","error":{"code":-32000,"message":"Not Acceptable: Client must accept text/event-stream"}...}`
with HTTP 406 - that response *is* the function working correctly (proof
it's alive and enforcing its real protocol), not an error to chase. Testing
it properly needs a real MCP client, not curl.

To confirm the whole pipeline end to end (routing, real vector search
against Supabase, drafting, verification), send a real question - this
makes real Bedrock calls and costs a small, real amount:
```
curl -N -X POST $(terraform -chdir=infra output -raw api_function_url)question \
  -H "Content-Type: application/json" \
  -d '{"question": "<a real legal question>", "dateReference": "2026-01-01"}'
```
A streamed response ending in a `done` event is success, whatever the
`confiance` value - an `abstention` is a correct answer when the question is
outside the demo corpus's indexed codes, not a failure.

## Redeploying after a code change

```
pnpm deploy:images
```

Builds both images, pushes them to ECR, and updates both Lambda functions to
run the new code. This is the only command you need for routine updates -
`terraform apply` is not part of your normal workflow once the infrastructure
exists, only for changing the infrastructure itself (a new environment
variable, a different memory size, and so on).

## Updating secrets

```
pnpm deploy:secrets
```

Edit `.env.prod`, run this, done. It validates that every key
`infra/secrets.tf` expects is present before pushing anything, so a typo or
a missing key fails loudly instead of silently deploying a broken secret.

## Tearing it down

```
cd infra && terraform destroy
```

Removes every resource listed in **What this deploys**. Both ECR
repositories are configured with `force_delete = true`, so `destroy` works
in one pass even though they hold real images - without that, `destroy`
would simply fail on them (found and fixed the same way as everything else
in this document: by actually running it).

One thing `destroy` does *not* do immediately: the Secrets Manager secret
enters a 30-day pending-deletion window by default (AWS's own safety net
against accidental deletion) rather than disappearing instantly. If you
need to recreate a secret with the exact same name (`legirag/app-env`)
right away, delete it immediately instead:
```
aws secretsmanager delete-secret --secret-id legirag/app-env --force-delete-without-recovery
```
Otherwise, just leave it - the 30-day window costs nothing and expires on
its own.

## Why the first apply always fails

`aws_lambda_function.api`/`.mcp` reference their image as
`"<ecr_repo_url>:latest"`. On a clean account, that ECR repository is
created in the very same `apply` that's trying to create the function - so
at the moment AWS tries to create the Lambda function, no image has ever
been pushed to that repository, and it rejects the function with "image not
found". Terraform cannot push a Docker image itself. `bootstrap.sh` handles
this correctly: `apply` (fails on the two functions, succeeds on everything
else: ECR, IAM, the secret) → build and push both images →`apply` again
(the images now exist, both functions are created). You'd hit the exact
same thing running the commands by hand; the script just does it for you.

## Why Lambda, not a container service

The original design (built and fully verified first) used ECS Fargate: two
services running continuously, at an estimated ~20-25 $/month regardless of
traffic. This project's actual expected load is a demo site - on the order
of 10 visits/month, a few questions each - so an always-on service was
disproportionate to the traffic it would serve. Lambda (container images,
pay-per-invocation) was chosen instead: near-zero cost at this traffic level
(well within the AWS Lambda free tier), in exchange for the cold-start
latency described above.

Consequence of this choice: no VPC, no networking Terraform at all. Lambda
functions with no VPC configuration reach the internet natively, and
Supabase and Bedrock are both public endpoints - there is nothing private to
route to. No load balancer either; each function gets its own Function URL
with response streaming enabled, which keeps `POST /question`'s streamed
response working without the fixed monthly cost of an ALB or API Gateway.

## How the containers run in Lambda

Both Dockerfiles copy the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)
binary into `/opt/extensions/` - a Lambda Extension that bridges the Lambda
invocation API to the existing NestJS/MCP HTTP servers, so those servers run
essentially unmodified instead of being rewritten as Lambda handler
functions. `docker build` runs with `--provenance=false --sbom=false`
(`infra/deploy-images.sh`): Docker Buildx attaches provenance/SBOM
attestations by default, which turns the pushed image into a multi-manifest
index that Lambda's container image support rejects outright - confirmed
against a real deployment, not a defensive guess.

Both functions run on `arm64` (`infra/lambda.tf`), not Lambda's `x86_64`
default - matching what gets built locally on Apple Silicon without cross-
compilation, and cheaper on Lambda besides.

Secrets: Lambda has no equivalent of ECS's `secrets` container-definition
field, and the AWS-managed "Parameters and Secrets Lambda Extension" is only
distributed as a Lambda Layer, not a container image - it can't be copied
into a container-image Lambda function without pulling it via the AWS CLI
with real credentials at build time. Instead, each image runs
`infra/docker/lambda-entrypoint.mjs` as its `ENTRYPOINT`: it calls
`GetSecretValue` on the app-env secret directly via the AWS SDK (using the
credentials Lambda injects automatically into the execution environment),
exports the result into the process environment, then execs the real
server. No secret value is ever present in the Lambda function's own
configuration.

Public access: a Function URL with `authorization_type = "NONE"` is not
enough by itself. Two separate resource-policy permissions are required
(`infra/lambda.tf`) - `lambda:InvokeFunctionUrl`, and, since an AWS policy
change in October 2025, also `lambda:InvokeFunction` scoped to
`invoked_via_function_url`. Missing the second one produces a `403
Forbidden` that looks identical to a missing-permission or wrong-`AuthType`
problem, which is what it was mistaken for the first time - confirmed by
testing against a real deployment, not found in a changelog first.

## Terraform state is local, on purpose

No remote backend (no S3 bucket, no DynamoDB lock table). Remote state and
locking exist to let multiple people or a CI pipeline apply concurrently
without clobbering each other; neither applies to a single operator running
`terraform apply` occasionally from their own machine, and a remote setup
would add a real bootstrapping step for no benefit at this scale.

The state file (`infra/terraform.tfstate`) lives only on whichever machine
runs `terraform apply`. It is gitignored (`*.tfstate*`) and must never be
committed - back it up like any other important local file, since it's the
only record of what actually exists on AWS. Revisit this choice if a second
operator or a CI-driven `apply` is ever added.

## Cost profile

At the traffic this project expects (a demo site, ~10 visits/month), the
running cost is near-zero - well within the Lambda free tier (1M requests +
400,000 GB-seconds/month). Nothing here is provisioned to run continuously.
The main real cost risk isn't this infrastructure at all - it's Bedrock
token usage from actual questions, already bounded by the app-level cost
guard (`packages/api/src/question/cost-guard.service.ts`), with the account-
level Budgets alert (step 3 above) as a second line of defense.

Separately from cost: this account's Lambda concurrency limit was 10 at the
time of the first real deployment (`aws lambda get-account-settings`) - a
low default some AWS accounts start with. Irrelevant at this project's real
traffic (both functions together would need to be invoked 11+ times
genuinely simultaneously to hit it), but worth knowing before assuming any
number of concurrent requests works - request a quota increase via Service
Quotas if this ever actually becomes a constraint.

## What's deliberately not here

- No API Gateway, custom domain, or TLS beyond the Function URL's default
  HTTPS endpoint - a stable, branded API URL is item 13's concern (the
  front end), not this one.
- No provisioned concurrency (would eliminate cold starts, but reintroduces
  a fixed monthly cost - defeats the point of moving off Fargate at this
  traffic level).
- No autoscaling tuning, no staging/prod separation, no CI-triggered
  deploys - `infra/deploy-images.sh` automates the build/push/redeploy
  *commands*, but nothing invokes it automatically; running it is still a
  manual decision, on purpose, at this project's current scale.
- `COHERE_API_KEY` is deliberately absent from the deployed secret - no code
  in this repo reads it today (Cohere embeddings run through Bedrock via
  `MODEL_EMBEDDING`; direct Cohere access is only needed for re-ranking,
  build-plan item 6d, never merged). Add it back if 6d ships.

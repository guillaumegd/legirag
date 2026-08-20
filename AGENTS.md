# AGENTS.md

Instructions for AI coding agents working in this project. This is the cross-tool
entry point: Codex, Cursor, GitHub Copilot, Gemini CLI, Aider, Zed, Windsurf, and
others read `AGENTS.md`. Claude Code reads `CLAUDE.md`, which imports this file, so
there is a single source of truth.

## What this is

legirag ("Legirag") is a French legal AI agent: given a legal question in
plain French, it identifies the relevant code(s), unfolds the graph of
cross-references between articles and codes, dates each text, cites the precise
article, and states explicitly what it cannot cover. Corpus: the 73 French legal
codes in force, open data. See `docs/private/0-BRIEF-PROJET.md` for the full
brief (not tracked in git - local/private working document).

This project is built with the **AI Blueprint**, a workflow layer, not an
app skeleton. To start a new project, scaffold the app first in an empty folder
(create-next-app, Vite, etc.), then overlay these files on top. Never run a
framework scaffolder inside a directory that already holds the blueprint files
(`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `blueprint/`); it fails
because the directory isn't empty.

New here? `blueprint/README.md` explains the whole Blueprint workflow.

## Read these for full context

- `blueprint/context/project-overview.md` - the project's source of truth
- `blueprint/context/coding-standards.md` - conventions to follow
- `blueprint/context/ai-interaction.md` - how to work with the user on this project
- `blueprint/context/current-feature.md` - the one feature, fix, or rollback being built right now

## Workflow

Build one feature, fix, or rollback at a time, behind review gates. Each step's instructions
are plain markdown skills any capable agent can read and follow. The workflow is
exposed through tool-specific adapters:

- Codex: `.agents/skills/<skill>/SKILL.md`
- Claude Code: `.claude/skills/<skill>/SKILL.md`

Unused adapters can be removed. Codex-only projects can delete `CLAUDE.md` and
`.claude/`. Claude Code-only projects can delete `.agents/`, but should keep
`AGENTS.md` because `CLAUDE.md` imports it.

When changing shared workflow behavior, update the matching skill in both
adapter folders so Codex and Claude Code stay aligned.

Core skills:

- `onboard` - tune commands, standards, visibility, ignore rules, and tool adapters after overlaying the Blueprint onto a freshly scaffolded or early project
- `doctor` - read-only Blueprint health check for setup, adapters, plans, overview freshness, and workflow drift
- `adopt` - bootstrap the Blueprint into an existing brownfield app with shipped features
- `overview` - distill the two planning docs into `blueprint/context/project-overview.md`
- `brief` - read-only briefing on an upcoming build-plan feature (scope, dependencies, size) before you spec it
- `feature` - turn a build-plan item into a spec, or propose a reviewed plan addition for a genuinely new feature
- `fix` - document an ad-hoc bug or change into `blueprint/context/current-feature.md`
- `tests` - add or normalize unit testing and turn on the test gate
- `ci` - explicitly set up one project-specific Verify command and matching automatic GitHub checks
- `implement` - build the current spec one small, reviewed step at a time
- `check` - prove the current spec against the running app
- `try` - read-only manual review guide: where to go, what to click, what to expect
- `audit` - branch-aware or full-project review for code quality, security, performance, tests, and standards drift; records findings with durable IDs and statuses in `blueprint/context/findings.md`, where open or fixed P0/P1 findings block `complete`
- `rollback` - plan a safe reversal of a completed feature from its archive and exact git commit, with later-dependency review before code changes
- `complete` - run the final safety pass, log features, fixes, or rollbacks under `blueprint/history/`, then merge with approval
- `release` - optional Render or Vercel deployment readiness, local config, env review, and smoke-test planning
- `prototype` - optional, pre-build static mockups to lock the look
- `status` - read-only progress summary, workflow drift warning, and suggested next action

In Codex, invoke these as skills (`$onboard`, `$overview`, `$feature`,
`$implement`, and so on) or ask naturally, such as "run the overview." In Claude
Code, use the slash commands (`/onboard`, `/overview`, `/feature`, and so on). In
tools without native skills, follow the matching `SKILL.md` manually. The
conventions in `blueprint/context/` apply however a step is invoked.

Optional explicit-only skill: `autopilot` can run one bounded spec/build/check
and targeted-audit pass when directly invoked. It may create checkpoint commits
on the feature or fix branch after passing steps, repair confirmed P0/P1 findings
within scope, and rerun affected checks. It stops before `/complete`, merge, push,
deploy, or destructive actions.

Deployment is also explicit. `/release` can prepare local Render or Vercel config
and run readiness checks, but it must stop before deploy, remote service changes,
push, or publish unless the user gives a separate yes in the current chat.

## Automatic verification

Automatic GitHub checks are a separate explicit setup. `/onboard` and `/adopt`
only report existing checks and point to `/ci` or `$ci` when none exist. Running
`/ci` inspects the real project and defines one `Verify` command from checks that
already exist. Use this order when available: typecheck, tests, then build. Never
invent a test runner or another check just to fill the command.

For JavaScript and TypeScript projects, prefer a package script such as `verify`
and use the detected package manager. For other stacks, use the native task
runner or exact combined command. Record the exact command under Commands below.

The optional `.github/workflows/verify.yml` must run that same command for pull
requests and pushes to the default branch. Preserve existing workflows, use the
project's real runtime and install command, and grant only `contents: read` by
default. This setup does not add local git hooks, coverage, browser tests,
security scans, or version matrices. Those remain later project choices.

GitHub branch protection or a ruleset can require the check after the repository
is pushed, but that is a separate remote setting. Missing automatic GitHub
checks do not make the Blueprint unusable.

### Cost-gated check: eval regression (`.github/workflows/eval.yml`)

Unlike `ci.yml` (lint/typecheck/test, always free and automatic), the eval
regression check makes real Bedrock and Supabase calls (~$0.10-0.20 per run).
It does **not** run automatically on push or on every PR. It only runs when:

- a PR carries the `run-eval` label (checked on `opened`, `synchronize`,
  `reopened`, and `labeled` events - meaning once the label is on a PR, every
  further push to that PR reruns and respends until the label is removed), or
- someone manually triggers it from the Actions tab (`workflow_dispatch`).

**Rule for any AI coding agent working in this repo: never add the `run-eval`
label yourself.** Before requesting it, ask the developer explicitly in the
current conversation, state why the change plausibly affects agent/retrieval
quality enough to warrant it, and remind them that the label stays active on
every subsequent push until removed. Only add the label after they give an
explicit yes. This follows the same explicit-action pattern as the AWS billing
cap and `infra/push-secrets.sh` (see `project-overview.md`'s Open questions).

## Commands

TypeScript monorepo (pnpm workspaces: `packages/*`). `web` (Next.js,
DSFR-inspired UI) has a real dev server now (question/answer screen and
agent-trace view); `api` (NestJS) and `mcp` are built and deployed (see
Deploy below).

- Build: `pnpm build`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test` (Vitest, runs `packages/*/src/**/*.test.ts`)
- E2E smoke test: `pnpm --filter @legirag/web test:e2e` (Playwright, runs
  `packages/web/e2e/*.spec.ts` through a real browser against an already
  running `web` dev server and `api` instance - `api` claims the port 3000
  Next.js defaults to, so run `web` on another port, e.g. `pnpm --filter
  @legirag/web dev --port 3001`, and set `E2E_BASE_URL` if you pick a port
  other than the config's `3001` fallback)
- Deploy: `pnpm deploy:bootstrap` (first deploy on a clean AWS account),
  `pnpm deploy:images` (redeploy after a code change), `pnpm deploy:secrets`
  (push `.env.prod` to the real secret) - see `infra/README.md` for the full
  walkthrough, one-time setup, and how to tear it down

### Mocked dev mode (`web` only)

Run `web` standalone with a fully mocked backend, no network calls at all -
no `api`, no `agent`, no Bedrock, no Cohere, no Supabase, so zero cost and no
need for any of those services' env vars to be set:

```
LEGIRAG_MOCK_BACKEND=true pnpm --filter @legirag/web dev
```

Every response comes from a fixture in `packages/web/src/lib/mock-fixtures.ts`.
Only affects the three server routes under `app/api/*`
(`question`, `trace/[traceId]`, `article/[articleIdentifier]`); every other
route (`/`, `/historique`, `/trace/[traceId]` page) behaves normally, reading
whatever those mocked routes return. The flag is a no-op when
`NODE_ENV=production` (see `packages/web/src/lib/mock-backend.ts`).

The scenario is picked by a case/accent-insensitive keyword in the question
text sent to `POST /api/question` - useful for exercising the UI states that
a real question rarely produces on demand:

| Question contains | Scenario |
| --- | --- |
| `"abstention"` | `confiance: 'abstention'` with `escalade`, no `regle_principale` |
| `"erreur"` | SSE stream emits `route` then `error`, no `done` (simulated backend failure) |
| anything else | nominal case: full answer with citations and sources |

`GET /api/trace/:traceId` and `GET /api/article/:articleIdentifier` only
recognize the fixed mocked ids used by the fixtures above (e.g.
`mock-trace-nominal`, `mock-article-1`) and return them; any other id returns
a real 404, so the "not found" UI state is also testable by visiting an
unknown id directly.

Testing is already configured with real tests (`packages/shared/src/*.test.ts`),
so it is a gate for logic-bearing build steps. GitHub Actions
(`.github/workflows/ci.yml`) already runs lint, typecheck, and test on every PR
and push to `main`. Run `/ci` or `$ci` if you want these combined into one
documented `Verify` command.

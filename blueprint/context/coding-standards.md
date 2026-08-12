# Coding Standards

> Your conventions. Tuned by `/onboard` to the real project stack; edit further
> as conventions solidify.

## TypeScript

- Strict mode enabled (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride` - see `tsconfig.base.json`)
- ESM throughout: `module`/`moduleResolution: NodeNext`, `.js` extensions in
  relative imports (NodeNext resolution requirement, even though source is `.ts`)
- No `any` types - use proper typing or `unknown`
- Runtime shapes (API payloads, structured LLM output) get a Zod schema in
  `schema.ts`, with the TS type inferred via `z.infer<typeof X>`; shapes with no
  runtime validation need get a plain `interface` in `types.ts`
- Use type inference where obvious, explicit types where helpful

## Monorepo structure

pnpm workspaces (`packages/*`), each package built independently with
`tsc -b` and referenced from the root `tsconfig.json`:

- `shared` - Zod schemas, types, cross-package interfaces, model/provider
  wiring (`ModelProvider`, `Retriever`)
- `ingest` - COLD/LEGI XML/KALI ingestion, chunking, embeddings
- `retrieval` - Supabase implementation of the `Retriever` interface
- `agent` - LangGraph.js graph, prompts, the fixed-chain path
- `mcp` - MCP server exposing the agent's tools
- `api` - NestJS HTTP layer (`POST /question`, rate limiting, cost guards)
- `web` - Next.js frontend, DSFR-inspired UI (not the DSFR's reserved visual
  identity - see `project-plan.md` §7)

Package boundaries stay swappable behind interfaces defined in `shared`
(`Retriever`, `ModelProvider`) rather than importing a concrete implementation
directly - see `packages/shared/src/interfaces.ts`.

> TODO: `web` (Next.js) and `api` (NestJS) are still stubs. Component, routing,
> and styling conventions belong here once those packages have real code
> (see `docs/private/3-FEUILLE-DE-ROUTE.md` for the build order - not tracked
> in git, local/private working document).

## File Organization

- Package source: `packages/<name>/src/*.ts`
- Zod schemas: `packages/shared/src/schema.ts`
- Cross-package types: `packages/shared/src/types.ts`
- Cross-package interfaces/contracts: `packages/shared/src/interfaces.ts`
- Provider implementations: `packages/shared/src/providers/*.ts`
- Tests: colocated as `*.test.ts` next to the source file

## Naming

- Files: kebab-case or match the primary export
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces/Zod schema exports: PascalCase (no prefix)
- Domain terms (`Etat`, `Citation`, `regle_principale`, ...) follow the French
  vocabulary fixed in `docs/private/1-CAHIER-DES-CHARGES-METIER.md` and
  `docs/private/2-CAHIER-DES-CHARGES-TECHNIQUE.md` (not tracked in git,
  local/private working documents) - don't translate them to English
  mid-codebase

## Database

- Supabase Postgres, no ORM - access goes through the `Retriever` interface,
  implemented in `packages/retrieval` (not yet built)
- Schema/infra changes go through Terraform (`infra/`) and Supabase migrations,
  not ad-hoc SQL in application code

## Data Validation & Provider Access

- Validate all structured LLM output and external payloads with Zod
  (`packages/shared/src/schema.ts`); encode business rules as `.refine()`
  checks with an explicit message (see `ReponseStructuree`)
- Required config (model IDs, credentials) is read from environment variables
  and must fail fast if missing - see `requireEnv` in
  `packages/shared/src/providers/bedrock.ts`; never hardcode a model ID or key

## Error Handling

- Fail fast on missing required configuration (throw, don't default silently)
- Structured/user-facing responses use `confiance: 'abstention'` plus an
  `escalade` reason rather than swallowing uncertainty (see `ReponseStructuree`
  in `schema.ts`) - this is a domain rule, not just an error-handling detail

## Testing

**Status: gate is ON.** Vitest is already configured (`pnpm test`, root
`vitest.config.ts`) with real tests under `packages/shared/src/*.test.ts`.

The blueprint installs no test runner; testing is opt-in at the project level,
because the overlay can't know your stack. Adding unit testing is an explicit
setup task the AI can do through the normal workflow, either as a build-plan item
or with `/tests`. The setup should choose the stack-native runner, wire the
scripts or commands, add a small example test, and update the Commands section
of `AGENTS.md`.

When `AGENTS.md` declares a `Verify` command, treat it as the umbrella automated
gate. It combines only the checks this project actually has, in this order when
available: typecheck, tests, then build. The command does not enable an absent
test runner or replace focused evidence. It gives local work and optional CI one
exact command to run. `/ci` owns Verify and CI setup. `/tests` adds the real test
command to Verify when it already exists, but never creates CI only because
testing was configured.

**The opt-in switch is one signal: a `test` command in the Commands section of
`AGENTS.md`.** Declare one and **tests become a gate for logic-bearing steps**,
not an optional extra; leave it out and the loop verifies logic with the evidence
it already uses (run it, a screenshot, the build). Adding the runner is itself a
deliberate step, never a silent mid-step install. This is the single definition
of the switch; the skills and `ai-interaction.md` only point back here.

- **What to test (the scope rule):** pure logic where a wrong answer is possible -
  parsers, formatters, validators, id/slug builders, server actions. These have
  assertable inputs and outputs and real edge cases (empty, missing, malformed).
- **What not to test:** UI components and integration-level surfaces (render or
  export routes, anything driving a real browser or external service). Verify those
  with a screenshot and the build, not brittle unit tests.
- **The gate (when a runner is configured):** a build step that adds in-scope logic
  must ship a passing test in the same reviewable diff. The project's test command
  must be green before the step is approved, before any checkpoint commit, and
  before `/complete` merges. UI and integration-only steps are exempt and ride on
  screenshot plus build evidence.
- **When it's named:** the `/feature` spec's Testing section predicts the coverage,
  `/implement` writes the test with the step, and if a step surfaces logic the spec
  didn't foresee, add a focused test then.
- An empty suite should fail, not pass, so "no tests ran" never looks like "passed".
- Test files live next to source files (for example `feature.test.ts`).
- Run them via the project's test command (see Commands in `AGENTS.md`), not a
  hardcoded tool name.

Stack binding: Vitest, `vi.mock()` for external dependencies (Bedrock,
Supabase, Cohere), and `vi.useFakeTimers()` for time-dependent logic
(`dateReference` filtering, article validity windows).

## Browser Verification

For UI and integration behavior, prefer real browser evidence over reading the
code and assuming it works.

- If Playwright is already installed, or the Commands section of `AGENTS.md`
  declares a Playwright script, use Playwright for browser checks, screenshots,
  console-error checks, and user-flow verification.
- If Playwright is not installed, do not add it silently in the middle of an
  unrelated feature. Use the available dev server, browser screenshots, build
  output, API output, or manual verification evidence instead.
- Add Playwright only when the user asks for it, or when the current spec is
  explicitly about setting up browser automation.
- Browser evidence is especially important for flows that click, type, submit,
  navigate, download files, render complex layouts, or depend on client-side
  state.

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.

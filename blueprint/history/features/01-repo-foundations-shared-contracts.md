# Feature: Repo foundations and shared contracts

**From build-plan:** feature 1
**Status:** complete

## Goal

Close out the shared-package foundation everything else builds on, and confirm
the base CI gate (lint, typecheck, test) is actually reliable - not just
configured - before data ingestion (feature 2) starts consuming these
contracts.

## In scope

- **Already built, being confirmed not rebuilt:** `ReponseStructuree`,
  `Citation`, `TexteComplementaire`, `Escalade`, `Etat`, `Confiance`
  (`schema.ts`); `Article`, `Subdivision`, `Renvoi`, `Chunk`,
  `RequeteRecherche` (`types.ts`); `Retriever`, `ModelProvider`
  (`interfaces.ts`); `bedrockProvider` reading `MODEL_VOLUME`/`MODEL_ESCALADE`
  via `requireEnv` (`providers/bedrock.ts`). All present, typechecked, and
  (schema/legifrance) already unit-tested.
- The one real gap: `requireEnv`/`bedrockProvider`'s fail-fast behavior has no
  test yet, despite being exactly the kind of validator logic the testing gate
  requires coverage for.
- `.env.example` accuracy: fix its stale reference to the old (now moved,
  gitignored) private-doc path, and confirm it still lists every environment
  variable the code actually reads.
- Confirm `.github/workflows/ci.yml` runs the same `lint` / `typecheck` /
  `test` sequence as the local commands in `AGENTS.md`, so "green in CI" and
  "green locally" mean the same thing.

## Out of scope

- Any new data model, ingestion, or retrieval code (feature 2+).
- Verifying the actual GitHub Actions run on `origin` - that happens once this
  branch is pushed and merged at `/complete`; this feature's done-when is the
  local command sequence CI runs.
- Wiring a `verify` script or changing the CI workflow file itself - both
  already match; nothing to add.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Test the Bedrock provider's fail-fast wiring** - add
  `packages/shared/src/providers/bedrock.test.ts`: mock `@ai-sdk/amazon-bedrock`'s
  `bedrock` export with `vi.mock`, then assert `requireEnv` throws a clear error
  when `MODEL_VOLUME` (or `MODEL_ESCALADE`) is unset, and that `bedrockProvider.volume()`
  / `.escalade()` call through to `bedrock(modelId)` with the right id when the
  var is set. *Done when:* `pnpm test` passes including the new file, covering
  both the throw path and the success path.
- [x] **Step 2 - Close out secret handling and confirm the CI gate** - fix the
  stale `cf. 3-FEUILLE-DE-ROUTE.md` reference in `.env.example` (that doc now
  lives at `docs/private/3-FEUILLE-DE-ROUTE.md`, gitignored); confirm every
  `process.env[...]` read in `packages/*/src` has a matching entry in
  `.env.example` (currently: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_REGION`, `MODEL_VOLUME`, `MODEL_ESCALADE`, `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
  `COHERE_API_KEY`); confirm `.github/workflows/ci.yml`'s steps match
  `AGENTS.md`'s Commands exactly. *Done when:* `pnpm lint`, `pnpm typecheck`,
  and `pnpm test` all pass locally in one run, and `.env.example`'s doc
  reference resolves to a real path.
- [x] **Step 3 - Load `.env` automatically for the smoke script** - manual
  testing surfaced a real gap: `pnpm --filter @legirag/shared smoke` reads
  `process.env.MODEL_VOLUME`/`MODEL_ESCALADE` but nothing loads `.env` into the
  process, so a correctly-filled `.env` still fails with "Variable
  d'environnement manquante". Add Node's native `--env-file=../../.env` flag
  to the `smoke` script in `packages/shared/package.json` (no new dependency -
  Node 20.6+, already the project's minimum, supports this natively; verified
  `pnpm --filter` runs package scripts with cwd in the package directory, so
  the relative path resolves to the root `.env`). *Done when:* with a real
  `.env` filled in, `pnpm --filter @legirag/shared smoke` picks up
  `MODEL_VOLUME`/`MODEL_ESCALADE` without the caller having to export them
  manually first.

## Files / areas

- `packages/shared/src/providers/bedrock.test.ts` (new)
- `.env.example` (one-line path fix)
- `packages/shared/package.json` (smoke script env loading)

## Data / contracts

None new. This feature confirms and locks the contracts already present in
`packages/shared/src/schema.ts`, `types.ts`, and `interfaces.ts` - later
features (ingestion, retrieval, agent) depend on these shapes as-is.

## Testing

Test gate is ON (`pnpm test`, Vitest, declared in `AGENTS.md`). Step 1 is the
in-scope logic this feature adds a test for: `requireEnv`'s fail-fast
validation, mocked per `coding-standards.md`'s stack binding (`vi.mock()` for
Bedrock). Step 2 has no new logic - it's a doc/config accuracy fix - and rides
on the full `lint`/`typecheck`/`test` run as its evidence, per the gate's
UI/integration exemption extended to config-only changes.

## Notes for the AI

- `packages/shared/package.json` already declares `@ai-sdk/amazon-bedrock` and
  `vitest`'s types are available repo-wide via `vitest.config.ts` - no new
  dependencies needed for Step 1.
- Match the existing test style in `packages/shared/src/schema.test.ts` and
  `legifrance.test.ts` (`describe`/`it`, French test descriptions, `vitest`
  imports) rather than introducing a new convention.
- Don't touch `docs/private/` content - only the one stale path reference in
  `.env.example` gets corrected.

## Post-implementation notes

Manual verification during setup surfaced that the build-plan item's original
model choice (`gpt-5.6-luna`/`sol` on Bedrock) is unusable for this project:
unavailable in the required EU region and only exposed via an API
(`bedrock-mantle`) the installed SDK (`@ai-sdk/amazon-bedrock`) doesn't speak.
Resolved to Claude Haiku 4.5 (volume) / Claude Sonnet 5 (escalade) via Bedrock's
EU geo inference profiles, verified live with a real smoke-test call from
`eu-west-3`. `docs/private/REFERENCE-choix-techniques.md` was updated to match
(untracked by git, so this doesn't appear in the branch diff).

# Feature: Upgrade to Node 24

**From build-plan:** feature 20
**Status:** built, pending review/complete
**GitHub issue:** [#21](https://github.com/guillaumegd/legirag/issues/21)

## Goal

Every Node pin in the repo is still on Node 20 with no `.nvmrc` for local
`nvm use`. Bump every pin to Node 24 (current Active LTS) so local dev, CI,
and the two Lambda container images all run the same version, and local
`nvm use` matches automatically.

## In scope

- Root `.nvmrc` (`24`)
- Root `package.json` `engines.node` (`">=20"` -> `">=24"`)
- Root `package.json` and `packages/web/package.json` `@types/node`
  (`^20.16.0` -> `^24.13.0`, the latest 24.x release)
- Adding `engines.node` (`">=24"`) to `packages/web/package.json`, which
  today has no `engines` block - this is the local half of steering Vercel
  onto Node 24 (Vercel reads `engines.node` from the package it builds);
  the dashboard project setting itself is a separate, manual check (see Out
  of scope)
- `.github/workflows/ci.yml` and `.github/workflows/eval.yml`
  `node-version: 20` -> `24`
- `packages/api/Dockerfile` and `packages/mcp/Dockerfile`: `FROM
  node:20-slim` -> `node:24-slim` in both the `build` and `runtime` stages
  of each, plus the stale comment above `corepack enable` in both files
  ("fails outright on this image's Node 20") which becomes inaccurate once
  the base image is 24
- Regenerating `pnpm-lock.yaml` for the `@types/node` bump
- Confirming the four packages build, typecheck, and test clean under a
  local Node 24 (via `nvm install 24`), since Node 24 is not currently
  installed locally (only 20.18.2, 20.20.2, 22.22.3 are)

## Out of scope

- Confirming Vercel's Node.js Version dashboard setting for `packages/web`
  actually resolves to 24 and building there. Adding `engines.node` to
  `packages/web/package.json` (Step 2) is the local half of steering
  Vercel; whether Vercel's project actually picks it up, and whether 24 is
  even selectable in its dashboard yet (Vercel's supported majors can lag
  the latest LTS), is a remote check outside what local repo changes can
  verify. Flagging this as a manual follow-up in the review packet.
- Any other dependency version bumps unrelated to the Node upgrade itself
  (pnpm stays pinned at 9.15.9 via `corepack prepare`, which is unaffected
  by this change)
- Node 24 runtime behavior changes beyond what CI/tests/build already cover
  (no known breaking changes affect this codebase; nothing in
  `pnpm-lock.yaml`'s `engines` fields caps below 24)

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Local Node 24 + `.nvmrc`** - run `nvm install 24` (not yet
  installed locally), add root `.nvmrc` containing `24`, bump root
  `package.json` `engines.node` to `">=24"`. *Done when:* `.nvmrc` exists,
  `nvm use` in the repo root selects Node 24, and `node -v` reports a 24.x
  version.
- [x] **Step 2 - `@types/node` bump + reinstall** - bump `@types/node` to
  `^24.13.0` in root `package.json` and `packages/web/package.json`, add
  `engines: { "node": ">=24" }` to `packages/web/package.json`, then run
  `pnpm install` (under Node 24) to regenerate `pnpm-lock.yaml`. *Done
  when:* both `package.json` files show `^24.13.0`, `packages/web/package.json`
  has the new `engines` block, `pnpm-lock.yaml` is updated and
  committed-ready, and `pnpm typecheck` passes across all packages.
- [x] **Step 3 - CI workflows** - change `node-version: 20` to `node-version:
  24` in `.github/workflows/ci.yml` and `.github/workflows/eval.yml`. *Done
  when:* both files pin 24 and a local run of the project's Verify command
  (typecheck, test, build) passes under Node 24.
- [x] **Step 4 - Dockerfiles** - change `FROM node:20-slim` to `FROM
  node:24-slim` in both stages of `packages/api/Dockerfile` and
  `packages/mcp/Dockerfile`, and update the comment above `corepack enable`
  in both files so it no longer claims Node 20 is the pinned base image.
  *Done when:* both Dockerfiles reference `node:24-slim` throughout, the
  comments are accurate, and `docker build -f packages/api/Dockerfile .`
  and `docker build -f packages/mcp/Dockerfile .` both complete
  successfully from repo root.

## Files / areas

- `.nvmrc` (new)
- `package.json` (root)
- `packages/web/package.json`
- `pnpm-lock.yaml`
- `.github/workflows/ci.yml`
- `.github/workflows/eval.yml`
- `packages/api/Dockerfile`
- `packages/mcp/Dockerfile`

## Data / contracts

None. Purely a toolchain/version-pin change, no runtime types or schemas
touched.

## Testing

No new logic is introduced, so no new unit tests are needed - this is a
pure infra/version-pin change. Verification is the existing test/build
pipeline re-run under Node 24:

- `pnpm typecheck`, `pnpm test`, and `pnpm build` (the project's Verify
  command) all green under local Node 24, per `AGENTS.md` Commands.
- Both Dockerfiles build successfully with the new base image.
- CI itself (`.github/workflows/ci.yml`, `.github/workflows/eval.yml`)
  turning green on the feature branch's PR is the real end-to-end proof
  that GitHub Actions' Node 24 runtime works too - check this after
  pushing, since it can't be verified locally.

## Notes for the AI

- No dependency in `pnpm-lock.yaml` caps its `engines.node` above 24 -
  confirmed by grep before writing this spec, so no library upgrade is
  forced by this change.
- pnpm itself stays pinned at 9.15.9 (via `corepack prepare pnpm@9.15.9
  --activate`) in both Dockerfiles - do not bump pnpm as part of this
  feature; only the Node base image and the explanatory comment change.
- The Dockerfile comment currently says the pin exists because a bare
  `corepack enable` "requires Node >=22.13 and fails outright on this
  image's Node 20" - that specific claim becomes false once the base image
  is 24, so reword it to explain the pin without asserting a Node-20
  failure that will no longer be true (the reproducibility reason - pinning
  to the exact version CI and local dev use - still holds and should stay).
- After Step 1, all later steps' shell commands (`pnpm install`,
  `pnpm typecheck`, etc.) should run under the Node 24 selected via
  `nvm use` in the repo root, not whatever Node happens to be default.
- Vercel's dashboard Node.js Version setting for `packages/web` is a
  manual, remote check - call it out explicitly in the final review packet
  as a follow-up the user needs to do outside this repo, per the Out of
  scope note above.

## Verification evidence

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (364 tests), `pnpm build` (8
  packages) all green under local Node 24 (`nvm use` -> v24.19.0).
- `docker build -f packages/api/Dockerfile .` and `docker build -f
  packages/mcp/Dockerfile .` both succeed on `node:24-slim`.
- `/audit` (scope: current) found no findings against this change.

## Manual follow-up (outside this repo)

- Confirm Vercel's Node.js Version dashboard setting for `packages/web`
  actually offers and selects 24 (Vercel's supported majors can lag the
  latest LTS) - `engines.node` was added locally as the steering signal,
  but the dashboard itself needs a manual check.

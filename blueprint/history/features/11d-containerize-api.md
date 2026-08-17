# Feature: Containerization and end-to-end validation

**From build-plan:** feature 11d
**Status:** complete

## Goal

Package `packages/api` as a self-contained Docker image that runs with no
monorepo, pnpm, or source tree present at runtime, and prove it actually
works end-to-end: a smoke-test script hitting all three real endpoints
(`GET /health`, `POST /question`, `GET /article/:id`, `GET /trace/:id` -
four calls across the three endpoint families) against the running
container. This closes item 11 (Public API).

## In scope

- `packages/api/Dockerfile` - multi-stage build, `node:20-slim` (Debian-based,
  not alpine - avoids native-module surprises for a first container; revisit
  only if image size becomes an actual constraint). Build stage: Node 20 +
  pnpm, install the full workspace (`pnpm install --frozen-lockfile`),
  compile `@legirag/api` and its workspace dependencies
  (`pnpm --filter @legirag/api... build` - the `...` includes
  `shared`/`retrieval`/`agent`, skips `ingest`/`eval`/`mcp`/`web`), then
  `pnpm --filter @legirag/api deploy --prod` to extract a self-contained
  runtime folder (real `node_modules`, no workspace symlinks, no pnpm
  needed to run it). Runtime stage: a slim Node 20 base image, just the
  deployed folder, `CMD ["node", "dist/main.js"]`. Built with the repo root
  as build context (`docker build -f packages/api/Dockerfile .`) since a
  pnpm workspace install needs the whole workspace, even though only one
  package ships.
- `.dockerignore` (repo root) - excludes `node_modules`, `dist`,
  `.git`, `docs/private`, and anything else that shouldn't reach the build
  context.
- `scripts/smoke-test.sh` - a bash script taking a base URL (default
  `http://localhost:3000`), calling `GET /health`, `POST /question` (a real
  question against live Supabase + Bedrock), `GET /article/:id` (a known,
  currently-visible article), and `GET /trace/:id` (the `trace_id` from the
  `POST /question` call, chained), asserting the expected status code and a
  minimal shape on each, and exiting non-zero with a clear message on the
  first failure. This is the durable "smoke test" artifact the build-plan
  line names - not a throwaway manual check.
- Live proof: build the image, run it standalone
  (`docker run --env-file .env -p 3000:3000 <image>`) with no bind mount
  and no other project files reachable, and run `scripts/smoke-test.sh`
  against it - the actual acceptance criterion for both "runnable
  standalone" and "smoke test hitting all three endpoints in the
  container."

## Out of scope

- Publishing the image to any registry - built and run locally only.
- CI wiring to build/run this Dockerfile automatically on every push -
  belongs with item 12's infrastructure automation, not this item.
- Terraform / cloud provisioning, HTTPS/TLS termination, a reverse proxy in
  front of the container - item 12.
- Horizontal scaling or orchestration (Kubernetes, ECS, etc.) - nothing in
  project-overview.md's deployment section asks for it yet, and 11c's
  in-memory rate-limit/cost-guard state is explicitly single-process only.
- Containerizing any other package (`mcp`, `web`, ...) - `packages/api`
  only, matching the build-plan line's scope ("Public API").
- Any change to application code - this feature packages what 11a-11c
  already built; it does not add or modify endpoint behavior.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Dockerfile and .dockerignore** - the multi-stage build
  described above. *Done when:* `docker build -f packages/api/Dockerfile -t
  legirag-api .` completes successfully from the repo root.
- [x] **Step 2 - smoke-test script, validated against the local dev
  server first** - write `scripts/smoke-test.sh`, run it against
  `pnpm --filter @legirag/api dev` (not the container yet) to shake out
  script bugs against a target already known to work, cheaper to debug
  than container logs. *Done when:* the script passes end-to-end against
  the local dev server and fails clearly (non-zero exit, readable message)
  when pointed at a port nothing is listening on.
- [x] **Step 3 - run the built image standalone and smoke-test it** -
  `docker run --env-file .env -p 3000:3000 legirag-api` in the background,
  then run Step 2's script against `http://localhost:3000`. *Done when:*
  the script passes end-to-end against the actual running container, and
  `docker logs` shows no unexpected errors during the run.

## Files / areas

- `packages/api/Dockerfile` (new).
- `.dockerignore` (repo root, new).
- `scripts/smoke-test.sh` (new).

## Data / contracts

- None new. This feature packages existing endpoints; it defines no new
  types, routes, or stored shapes.

## Testing

- No new unit-testable logic - a Dockerfile and a shell script are
  infrastructure/integration surface, not logic (`coding-standards.md`'s
  carve-out: "UI or integration-level surfaces... Verify those with a
  screenshot and the build, not brittle unit tests" - the same principle
  applied to a container instead of a browser).
- `scripts/smoke-test.sh` *is* the testing artifact for this feature - it
  gets validated in Step 2 against a known-good target before being
  trusted in Step 3 against the container, rather than being trusted
  untested on its first real run.

## Notes for the AI

- `pnpm deploy` needs the target package's `dist/` already built *before*
  `deploy` runs (it copies the package's own files as-is, not just
  `node_modules`) - build must happen first in the Dockerfile's build
  stage, `deploy` second.
- Real env vars (`DATABASE_URL`, `MODEL_VOLUME`, `MODEL_ESCALADE`,
  `COHERE_API_KEY`, AWS/Supabase credentials) come from the existing local
  `.env` at `docker run` time (`--env-file .env`) - never baked into the
  image, matching this project's fail-fast env-var convention
  (`requireEnv`).
- If `pnpm deploy`'s exact flags or behavior don't match what's assumed
  above once actually run, treat that the same way the 11c DI gotcha was
  handled: fix it live, verify with a real `docker build`/`docker run`, and
  record what was actually true in this spec's build-step notes rather
  than leaving the assumption uncorrected.

**What was actually true, confirmed live:**
- `pnpm --filter @legirag/api... build` and `pnpm --filter @legirag/api
  deploy --prod /deploy` both worked exactly as assumed above, no
  correction needed there.
- A bare `corepack enable` (no version pin) fetches the *latest* pnpm
  (11.22.0 at build time), which requires Node >=22.13 and crashes outright
  on `node:20-slim` (`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`). Fixed with
  `corepack prepare pnpm@9.15.9 --activate`, pinned to the exact version
  `.github/workflows/ci.yml` and local dev already use. Any future
  Dockerfile in this repo needs the same explicit pin.
- `pnpm deploy --prod` correctly excludes devDependencies - verified the
  running container's `node_modules` has no `vitest`/`eslint`/`tsx`/
  `typescript`.
- Successful `POST /question` returns HTTP `201`, not `200` - NestJS's
  default for a POST handler even when the body is fully hand-managed via
  `@Res()`.

## Findings

### 11d/F-02 [P3] closed - .dockerignore didn't exclude packages the Dockerfile never touches

**File:** .dockerignore
**Found:** 2026-08-17 by /audit (scope: current)
**Why it matters:** `packages/api/Dockerfile` only ever `COPY`s `packages/shared`, `packages/retrieval`, `packages/agent`, and `packages/api` - but `.dockerignore` had no exclusion for `packages/ingest`, `packages/eval`, `packages/mcp`, or `packages/web`, so Docker sent all of them into the build context on every build regardless. Confirmed concretely: `packages/eval/.data` alone is ~19MB of embeddings cache, plus the source of four unused packages, all needlessly hashed and transferred on every build. Not a correctness issue (the build succeeded and produced a correct image either way) - pure build-time waste.
**Suggested fix:** Add the four unused package directories to `.dockerignore`.
**Resolution:** Added `packages/ingest`, `packages/eval`, `packages/mcp`, `packages/web` to `.dockerignore`. Re-ran `docker build` after the change - succeeded, image content byte-identical (same manifest hash as before the fix). Re-reviewed fresh 2026-08-17: `.dockerignore`'s full contents re-read, exclusion list correct and cannot break a future build (a genuinely-needed path would fail loudly with a clear COPY error, not silently) - closed.

Note: this feature's audit also touched `F-01` (unverified lead, originally
raised during 11c, about rate-limiting's IP tracking under a future reverse
proxy - relevant here since 11d is exactly what stands the container up).
It stays in the live findings ledger, not archived here, per its
`unverified` status - still waiting on real reverse-proxy infra (item 12)
before it can be confirmed or invalidated.

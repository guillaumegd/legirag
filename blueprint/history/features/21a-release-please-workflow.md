# Feature: release-please workflow and config

**From build-plan:** feature 21a
**Status:** complete

## Goal

Automate release versioning and changelog generation from the repo's already
conventional-commit-shaped git history, so merges to `main` produce a
release PR (version bump + `CHANGELOG.md`) instead of nothing happening.
Single repo-wide version, confirmed with the user 2026-08-19: no package
under `packages/*` is published independently to npm, so one version/tag for
the whole repo is simplest and sufficient.

## In scope

- A `version` field on the root `package.json` (release-please needs a
  tracked version to bump from; there isn't one today).
- `release-please-config.json` at the repo root, single-package (`"."`)
  simple mode, `release-type: node`.
- `.release-please-manifest.json` at the repo root, seeded to match the new
  `package.json` version.
- `.github/workflows/release-please.yml`, triggered on push to `main`,
  running `googleapis/release-please-action@v4`.

## Out of scope

- Enforcing conventional commits (Husky `commit-msg` hook, commitlint CI
  check) - that's 21b, deliberately split out because it's a different
  concern (local/PR-time enforcement vs. release automation) with its own
  verification story.
- Actually pushing to `main` or merging any release-please-opened PR -
  `/complete`'s normal push gate applies, same as every other feature.
- Retroactively tagging or backfilling past releases.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Root version field** - add `"version": "0.1.0"` to
  `package.json` (root of the pnpm workspace). *Done when:* `package.json`
  has the field, `pnpm install` runs clean with no unexpected
  `pnpm-lock.yaml` churn, and `pnpm lint`/`pnpm typecheck` stay green.
- [x] **Step 2 - release-please config and manifest** - add
  `release-please-config.json` (`"release-type": "node"`, `"packages": {
  ".": {} }"`, no per-package entries - single-version mode) and
  `.release-please-manifest.json` (`{ ".": "0.1.0" }`, matching Step 1's
  version) at the repo root. *Done when:* both files exist, both parse as
  valid JSON, and the manifest's version matches `package.json`'s.
- [x] **Step 3 - release-please GitHub Actions workflow** - add
  `.github/workflows/release-please.yml`: triggers on `push` to `main`,
  grants exactly `contents: write` and `pull-requests: write` (the minimum
  release-please needs to open/update its release PR and create the
  GitHub release + tag), pins `googleapis/release-please-action@v4`
  (matching this repo's existing `@v4`-pinned actions in `ci.yml`), and
  points at the Step 2 config/manifest files. *Done when:* the file exists,
  the YAML is syntactically valid, and its trigger/permissions/action
  version match what's specified here.

## Files / areas

- `package.json` (root) - add `version`
- `release-please-config.json` (new)
- `.release-please-manifest.json` (new)
- `.github/workflows/release-please.yml` (new)

## Data / contracts

None - this is workflow/config only, no application code, types, or API
shapes touched.

## Testing

No test runner applies here (no logic-bearing TypeScript changes - see the
Testing gate in `coding-standards.md`). Verify with:

- `pnpm lint` / `pnpm typecheck` / `pnpm build` stay green after Step 1's
  `package.json` edit.
- Both new JSON files parse (`node -e "JSON.parse(require('fs').readFileSync('release-please-config.json','utf8'))"`,
  same for the manifest).
- The workflow YAML is well-formed (parse it with a YAML loader, or
  `actionlint` if available) and its `permissions`/`on`/`uses` match the
  spec above.
- **Known evidence gap, unavoidable locally:** whether release-please
  actually opens a release PR can only be confirmed after this branch is
  merged and a further conventional-commit push lands on `main` - that's
  outside what this feature's local build steps can prove. Say so plainly
  rather than claiming it's verified end-to-end.

## Notes for the AI

- This workflow deliberately grants `contents: write` and
  `pull-requests: write`, wider than `AGENTS.md`'s "grant only
  `contents: read` by default" rule for CI checks - that rule is written for
  the lint/typecheck/test `Verify` gate (`ci.yml`); release-please's entire
  job is to open PRs and create releases/tags, so it structurally needs
  write access. Don't "fix" this down to read-only.
- No git tags exist yet, so on its first run release-please will scan the
  full commit history and propose an initial release PR (`v0.1.0`) covering
  everything so far. That's the intended behavior here (this genuinely is
  the project's first release) - don't add a `bootstrap-sha` to truncate
  history unless the user asks for a clean-slate first release instead.
- Match this repo's existing commit-type vocabulary (`feat`, `fix`, `chore`,
  `docs`, ... - see recent `git log` and `ai-interaction.md`'s Commits
  section) rather than inventing new types; release-please's default
  changelog-type mapping already covers these, so no custom
  `changelog-sections` config is needed.
- Don't push to `main`, don't merge any release-please-opened PR, and don't
  create a GitHub release or tag by hand - this step only wires the
  automation.

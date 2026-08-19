# Feature: Commitlint enforcement

**From build-plan:** feature 21b
**Status:** complete

## Goal

Turn the repo's existing conventional-commit *convention* (already documented
in `ai-interaction.md`, already how commits actually look) into an enforced
*rule*: a bad commit message gets caught locally before it's even made, and
again on the PR if the local hook was skipped. This keeps release-please
(21a) reliable - its changelog generation depends on commit messages
actually following the convention.

## In scope

- `@commitlint/cli` + `@commitlint/config-conventional` as devDependencies.
- `commitlint.config.js` at the repo root (ESM, matching this repo's
  `"type": "module"` and its `eslint.config.js` precedent), extending
  `@commitlint/config-conventional`'s default rules unmodified.
- `husky` as a devDependency, a `"prepare": "husky"` script, and a single
  `.husky/commit-msg` hook running commitlint against the message being
  committed - applies repo-wide to every local `git commit`, including
  `/complete`'s squash-merge commit.
- `.github/workflows/commitlint.yml`: a PR-triggered check
  (`wagoid/commitlint-github-action@v6`) linting the PR's commits, as
  defense-in-depth for a commit made without the local hook installed (e.g.
  before a fresh clone's first `pnpm install`).

## Out of scope

- Any other Husky hook (`pre-commit`, `pre-push`) - this feature wires up
  `commit-msg` only.
- Custom commitlint rules beyond `@commitlint/config-conventional`'s
  defaults (e.g. a scope enum matching `packages/*` names) - the build-plan
  item asks for "enforce conventional commits," which the default ruleset
  already does; a custom scope enum is a follow-up if it turns out to be
  wanted.
- Retroactively validating or rewriting past commit history.
- Changing how `/complete` merges (still local `git merge --squash` + a
  manual commit, not GitHub's PR-merge UI) - see Notes for the AI on what
  that means for the PR-check's actual coverage in this project.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - commitlint install and config** - add `@commitlint/cli` and
  `@commitlint/config-conventional` as root devDependencies, and
  `commitlint.config.js` (`export default { extends: ['@commitlint/config-conventional'] }`).
  *Done when:* `echo "feat: something" | pnpm exec commitlint` exits `0`,
  and `echo "not a conventional message" | pnpm exec commitlint` exits
  non-zero with a rule violation reported.
- [x] **Step 2 - Husky commit-msg hook** - add `husky` as a devDependency,
  a `"prepare": "husky"` script in `package.json`, run it once to create
  `.husky/`, and add an executable `.husky/commit-msg` running
  `pnpm exec commitlint --edit "$1"`. *Done when:* running the hook script
  directly against a temp file containing a bad message
  (`sh .husky/commit-msg <tmpfile>`) exits non-zero, and against a temp file
  containing `"fix: something"` exits `0` - proven without creating any real
  commit.
- [x] **Step 3 - commitlint GitHub Actions check** - add
  `.github/workflows/commitlint.yml`: triggers on `pull_request`, checks out
  with enough history to see the PR's commits (`fetch-depth: 0`), grants
  only the default `contents: read`, and runs
  `wagoid/commitlint-github-action@v6`. *Done when:* the file exists, its
  YAML is syntactically valid, and its trigger/permissions/action version
  match what's specified here.

## Files / areas

- `package.json` (root) - add 3 devDependencies, add `"prepare"` script
- `commitlint.config.js` (new)
- `.husky/commit-msg` (new)
- `.github/workflows/commitlint.yml` (new)

## Data / contracts

None - config and tooling only, no application code, types, or API shapes
touched.

## Testing

No test runner applies here (no logic-bearing TypeScript changes - see the
Testing gate in `coding-standards.md`). Verify with:

- Piping known-good and known-bad commit messages into `pnpm exec
  commitlint` and the `.husky/commit-msg` script directly (Steps 1-2's
  done-whens above) - deliberately not through real `git commit` calls, so
  verification never risks leaving a stray commit in this repo's history.
- The workflow YAML parses and its `on`/`permissions`/`uses` match the spec
  (same check used for 21a's workflow file).
- `pnpm lint` / `pnpm typecheck` / `pnpm build` stay green throughout (no
  reason for config-only, non-TS changes to break them, but confirm anyway).
- **Known evidence gap, unavoidable locally:** the GitHub Actions check
  itself only really runs on an actual GitHub pull request - there's no
  local way to trigger `pull_request` events. Say so rather than claiming
  it's been proven end-to-end.

## Notes for the AI

- This repo doesn't currently merge through GitHub's own PR-merge UI -
  `/complete` does a local `git merge --squash` plus a manually written
  commit, then a separate explicit push. That commit still runs through the
  local Husky `commit-msg` hook (hooks are repo-wide, not branch-scoped), so
  it's still covered - the GitHub Actions check in this feature mainly
  guards commits made without the hook installed (e.g. a fresh clone before
  its first `pnpm install`), not `/complete`'s own commit. Keep writing
  `/complete`'s commit messages in conventional-commit form regardless
  (already the existing rule in `ai-interaction.md`); this feature adds a
  safety net, it doesn't change who's responsible for that.
- `package.json` has `"type": "module"`, so `commitlint.config.js` must use
  `export default`, not `module.exports` - matches this repo's existing
  `eslint.config.js` precedent, not a new convention.
- Don't add a `pre-commit` or `pre-push` hook while doing this - out of
  scope, and `husky init` (if used instead of the manual steps above)
  scaffolds an unwanted default `pre-commit` file running `npm test` that
  would need to be deleted; simpler to create only `.husky/commit-msg`
  directly.
- No git commits, pushes, or merges as part of proving this feature works -
  all verification in the Testing section is CLI/script-level, not through
  real `git commit`.

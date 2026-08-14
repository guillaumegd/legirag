# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P3] closed - `.env.example` model-ID format comment is inaccurate

**File:** .env.example:6
**Found:** 2026-08-13 by /audit (scope: full)
**Why it matters:** The comment says the Bedrock model ID format is
`region.provider.model-id`, but the values actually verified live in this
session are geo-prefixed inference profile IDs (`eu.anthropic.claude-...`),
not a literal AWS region. A future contributor filling in `.env` from this
comment alone would look for the wrong shape and could plug in a bare model ID
that isn't region-pinned to the EU, which matters given the project's EU
data-residency requirement.
**Suggested fix:** Reword the comment to reference the Geo/Global inference
profile ID convention (e.g. `eu.<provider>.<model>` for EU-pinned inference),
and point at the Bedrock model card's "Programmatic Access" table as the
source of truth per model rather than a fixed pattern.
**Resolution:** Reworded the `MODEL_VOLUME`/`MODEL_ESCALADE` comment to
describe the real Geo/Global inference profile ID convention
(`eu.<provider>.<model>` for EU-pinned inference) instead of the inaccurate
`region.provider.model-id` pattern, and pointed at the Bedrock model card's
"Programmatic access" table as the source of truth per model. Also replaced
an em dash on the neighboring `AWS Bedrock` comment line with a hyphen, per
`coding-standards.md`'s writing rule, while touching the file. Not itself
code, so no build/test signal beyond `pnpm lint` (clean) and `pnpm test`
(29/29, unaffected). Re-reviewed 2026-08-14 by a fresh `/audit` pass (scope:
changed): the user hand-trimmed the comment afterward, dropping the
"Programmatic access" table pointer and the "jamais en dur" reminder,
leaving just "IDs de profil d'inférence Geo/Global (ex.
eu.<provider>.<modele> pour du EU-only)". Re-checked against the original
defect: the inaccurate `region.provider.model-id` pattern is still gone and
the real Geo/Global convention is still stated with a concrete EU example -
the core fix holds, the trim only removed supplementary guidance, not the
correction itself. No new defect introduced.

### F-12 [P3] closed - Em dashes remain outside `packages/ingest` (agent, api, retrieval, shared, mcp, web)

**File:** packages/shared/src/{schema,legifrance,types,interfaces}.ts,
packages/shared/src/providers/{bedrock,bedrock-smoke}.ts,
packages/agent/src/index.ts, packages/api/src/index.ts,
packages/retrieval/src/index.ts, packages/mcp/src/index.ts,
packages/web/src/index.ts
**Found:** 2026-08-14 by /audit (scope: current) - carved out of 02b/F-11
rather than fixed there, since these files are unrelated to feature 2b's
branch (mostly feature 1's stub/foundation code).
**Why it matters:** Same `coding-standards.md` "no em-dash" rule as 02b/F-11,
just outside that branch's legitimate diff surface.
**Suggested fix:** Fix in a `full`-scope `/audit` pass, or a small dedicated
`/fix`, on a branch that legitimately touches those packages.
**Resolution:** Replaced every em dash with a hyphen (all space-flanked, so a
straight ` — ` to ` - ` substitution was safe) across `packages/shared/src/`
(`schema.ts`, `legifrance.ts`, `types.ts`, `interfaces.ts`,
`providers/bedrock.ts`, `providers/bedrock-smoke.ts`) and the stub
`index.ts` in `packages/agent`, `packages/api`, `packages/retrieval`,
`packages/mcp`, `packages/web`. All comment-only changes, no logic touched.
Verified: `pnpm typecheck` (all 7 packages), `pnpm test` (29/29, unaffected),
`pnpm lint` (clean), `pnpm build` (all 7 packages) all pass. A repo-wide
`grep -rln "—" packages/*/src/` now finds nothing. Re-reviewed 2026-08-14 by
a fresh `/audit` pass (scope: changed): re-ran the same repo-wide `grep`
(plus `.env.example`) and confirmed zero em dashes remain; spot-checked the
`schema.ts`/`types.ts` diff line by line, confirmed comment-only changes
with no logic altered. No new defect introduced.

### F-13 [P3] accepted - Ellipsis character used in comments, against the same "no ellipsis" writing rule

**File:** packages/shared/src/types.ts:5,
packages/ingest/src/cold/inspect-cold.ts:20
**Found:** 2026-08-14 by /audit (scope: changed) - spotted while re-reviewing
`types.ts` for the F-12 closure; `packages/ingest/src/cold/inspect-cold.ts`
is unrelated to this branch's diff (untouched, already on `main` since
feature 2b), carved out the same way F-12 was carved out of F-11.
**Why it matters:** `coding-standards.md`'s Writing section bans "the
ellipsis character" alongside em/en dashes, in the same "docs, comments,
commit messages, READMEs, specs" scope. `types.ts:5` has
`// LEGIARTI…` (a truncated example ID) and `inspect-cold.ts:20` has
`(arrêté, décret, loi, code…)` (ellipsis used as "etc."). Pure style, no
functional impact. (Not flagging `packages/shared/src/schema.test.ts:8`'s
`texte_exact: '...limitée à…'` - that's a test fixture representing a
deliberately truncated legal-text quote, not prose/comment content the
writing rule targets.)
**Suggested fix:** Replace `…` with `...` or reword to avoid truncation
markers in comments (e.g. spell out "etc." or drop the parenthetical) in a
`full`-scope `/audit` pass or a small dedicated `/fix`.
**Resolution:** User's explicit decision 2026-08-14: not pertinent in this
case, declined to fix. Left as-is.

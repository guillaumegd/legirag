# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P3] open - `.env.example` model-ID format comment is inaccurate

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
**Resolution:**

### F-12 [P3] open - Em dashes remain outside `packages/ingest` (agent, api, retrieval, shared, mcp, web)

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
**Resolution:**

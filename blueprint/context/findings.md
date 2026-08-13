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

### F-07 [P3] fixed - ensureShardsDownloaded can cache a truncated shard as if it were complete

**File:** packages/ingest/src/cold/hf-source.ts:60-79
**Found:** 2026-08-13 by /audit (scope: current)
**Why it matters:** Same failure class as F-02, one file over, not caught in
the first pass. `writeFile(dest, buffer)` (line 73) is not atomic - if the
process is interrupted while it's writing (kill, OOM, container preemption,
machine sleep) partway through a ~200MB shard, a truncated file can be left
at `dest` with nonzero size. The cache check on the next run
(`cached.size > 0`, line 67) only tests for *presence*, not completeness, so
that truncated shard would be treated as already-cached and reused rather
than re-downloaded. The failure is loud when it happens - `parquetMetadataAsync`
throws `parquet file invalid (footer != PAR1)`, reproduced for real while
verifying F-02's fix by truncating a shard on purpose - but the error message
doesn't point at the cache or say what to delete, so whoever hits it (a future
session, possibly without this conversation's context) has to work that out
from a bare hyparquet parse error. Narrower window than F-02 (a single
buffered write vs. a multi-minute incremental stream) and self-recovering
once diagnosed, hence P3 rather than P1.
**Suggested fix:** Same pattern as F-02: write each shard to a `.tmp` path and
rename on success, or write to `dest` and then verify (e.g. re-stat, or a
cheap `parquetMetadataAsync` sanity check) before trusting a cached file.
**Resolution:** Each shard now writes to `<dest>.tmp` and renames to `dest`
only on success; on error the `.tmp` is removed and the error rethrown -
same pattern as F-02. Verified for real: deleted a cached shard and reran
`inspect:cold`, which re-downloaded it correctly (fresh timestamp, correct
size, no `.tmp` left, diagnostics unchanged). Verified the failure path with
an isolated repro of the same write/rename/catch/rm sequence forcing the
rename to fail - confirms neither `.tmp` nor a corrupted `dest` is left
behind.

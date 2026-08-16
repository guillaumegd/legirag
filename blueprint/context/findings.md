# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P3] closed - Row-mapping helpers duplicated verbatim between run-vector-only.ts and run-hybrid-capped.ts

**File:** packages/eval/src/run-vector-only.ts:9-18,31-49 and packages/eval/src/run-hybrid-capped.ts:9-18,54-72
**Found:** 2026-08-17 by /audit (scope: feature 6 - 6a/6b/6c, packages/eval)
**Why it matters:** `CachedEntry`/`loadSampleArticleIds`, `toPgVector`, and
`toChunk` (over structurally identical `ChunkRow`/`HybridRow` row shapes) are
byte-for-byte identical across both files. Unlike `VECTOR_ONLY_SQL`/
`HYBRID_CAPPED_SQL` themselves - deliberately copied per each file's own
comment, so a measurement script can never affect the production query if
edited later - these three helpers carry no such SQL-formula safety rationale;
they're pure row-marshaling utilities. If the `chunks` table's row shape ever
changes (a new column, a renamed field), an edit could update one script's
`toChunk` and miss the other, and nothing would catch the drift: neither
script has unit tests (by design, matching `SupabaseRetriever`'s own untested
`toChunk` precedent), so a mismatch would only surface as a wrong or crashing
live run. Confirmed by reading both files side by side; not yet a live
mismatch (both currently produce identical, verified-correct results).
**Suggested fix:** Extract `loadSampleArticleIds`, `toPgVector`, and `toChunk`
into a small shared `packages/eval/src/chunk-row.ts`, imported by both
scripts. Leave `VECTOR_ONLY_SQL`/`HYBRID_CAPPED_SQL` exactly as duplicated as
they are now - only the row-mapping utilities should move, not the search
formulas.
**Resolution:** Fixed 2026-08-17 - extracted `loadSampleArticleIds`,
`toPgVector`, `toChunk`, and the shared `ChunkRow` type into new
`packages/eval/src/chunk-row.ts`; both `run-vector-only.ts` and
`run-hybrid-capped.ts` now import from it instead of each defining their own
copy. `VECTOR_ONLY_SQL`/`HYBRID_CAPPED_SQL` themselves untouched, still
duplicated as designed. `pnpm --filter @legirag/eval typecheck`, `pnpm lint`,
`pnpm test` (129/129) all green. Re-ran both scripts live against the real
Supabase project post-refactor: identical numbers to the pre-refactor
recorded results (recall@1 0.875, recall@5/10 1.0, MRR 0.9 for both) -
confirms the extraction didn't change behavior. Closed 2026-08-17 -
re-read `chunk-row.ts`, `run-vector-only.ts`, `run-hybrid-capped.ts` fresh:
no leftover local `toChunk`/`toPgVector`/`CachedEntry`/`HybridRow`
definitions in either script (grep-confirmed), both SQL formulas remain
independently duplicated exactly as intended, net diff shrinks the two
scripts by ~35 lines each with no behavior change. No new defect introduced
by the repair.

### F-02 [P3] closed - cosineSimilarity divides by zero on an all-zero embedding vector

**File:** packages/eval/src/naive-retriever.ts:15
**Found:** 2026-08-17 by /audit (scope: feature 6 - 6a/6b/6c, packages/eval)
**Why it matters:** `dot / (Math.sqrt(normA) * Math.sqrt(normB))` produces
`NaN` if either input vector is all-zero (magnitude 0). Real Cohere
embed-v4 output is never observed to be all-zero, and no current caller
(6a's cache, or any test) feeds a zero vector in, so this has no known live
trigger today - flagging as a lead, not a confirmed defect. Worth watching
if `cosineSimilarity`/`rankByCosineSimilarity` (already exported from
`packages/eval/src/index.ts` "for 6b to import if useful") gets a new caller
later with less-trusted input.
**Suggested fix:** No action needed unless a real trigger appears; if one
does, decide then whether to guard (e.g. treat a zero-magnitude vector as
similarity 0) or let it propagate as `NaN` (which sorts predictably last in
practice, since comparisons against `NaN` are always `false`).
**Resolution:** Fixed 2026-08-17 - `cosineSimilarity` now returns `0` when
either vector has zero magnitude, instead of propagating `NaN`. Regression
test added in `naive-retriever.test.ts` covering both directions and the
both-zero case. `pnpm test` (129/129) green. Closed 2026-08-17 - re-read
the repaired `naive-retriever.ts` fresh: the guard is correct (`magnitude
=== 0` catches both single-zero and both-zero cases), `rankByCosineSimilarity`
still sorts and slices correctly with a 0-similarity entry mixed in (no
special-casing needed there), and the new test's three assertions genuinely
exercise the guard rather than restating existing coverage. No new defect
introduced by the repair.

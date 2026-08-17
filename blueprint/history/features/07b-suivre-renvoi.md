# Feature: `suivre_renvoi` (cross-reference following)

**From build-plan:** feature 7b (sub-feature of 7. Tool server)
**Status:** not started

## Goal

Add the second MCP tool, `suivre_renvoi(articleId) → { renvois: Renvoi[],
nonResolus: string[] }` (locked contract, cahier des charges technique §5.3):
given a source article, return the references it makes to other articles,
split into those that resolve to a currently-visible target and those that
don't (never extracted a match, or extracted but the target isn't currently
visible).

The visibility half is the point of this feature, not a detail: the RLS
migration from 4c (`add_search_rls.sql`) deliberately left `renvois`
publicly readable and flagged that cross-reference following "differs
per-source/per-target instead of following a single article" - unlike
`chercher_droit`, which filters its whole result set by one `dateReference`/
`codes` pair, this tool must check each *target* article's visibility
individually, because a renvoi can point anywhere (including a different
code, including - once item 10 adds history - a since-repealed version).
The project's core rule ("a repealed article must never be returned, even
when a query names it explicitly," project-overview.md item 4) extends to
this tool: a renvoi resolved at extraction time to an article that isn't
currently visible must not be reported as followable.

## In scope

- `packages/mcp/src/descriptions/suivre-renvoi.ts` - the tool's versioned
  description, following 7a's `ToolDescription` scaffold. Also updates
  `chercher-droit.ts`'s existing description to name `suivre_renvoi` now
  that it exists (it previously described what it doesn't do without being
  able to point anywhere).
- `suivreRenvoi(articleId, now?)`: queries `renvois` for the given source,
  left-joins each target against `articles` under the same RLS role/session
  variables `SupabaseRetriever` already uses (`anon`, `app.date_reference`),
  so a target's visibility is decided by the database, not application
  code. Splits rows into `renvois: Renvoi[]` (resolved and visible) and
  `nonResolus: string[]` (never resolved, or resolved but not currently
  visible - both surfaced the same way: "cannot be followed right now").
- Checks the *source* article's own visibility first (same RLS role/session
  vars) and throws a clear error if it isn't visible or doesn't exist -
  consistent with `chercher_droit` never revealing whether a hidden
  article exists.
- Registers `suivre_renvoi` as a second tool on the existing MCP server
  (`createLegiragMcpServer()`), alongside `chercher_droit`.
- Live verification, extending 7a's `verify-client.ts`: a normal call
  proving real resolved/unresolved data comes back, and a second call (via
  the underlying function directly, with an injected past date) proving the
  per-target visibility filter genuinely works - the same "query with an
  ancient `dateReference`" technique 4d's `validate-search.ts` already used
  to prove `chercher_droit`'s own date filter.

## Out of scope

- Fetching the *content* of a resolved target article - no tool returns
  full article text for an arbitrary ID yet (`version_a_la_date`, the tool
  that will do this, is a 7d stub, real at item 10). `suivre_renvoi` only
  tells the caller which articles are referenced and whether each is
  currently followable.
- A `date` or `codes` parameter on the exposed tool - the locked contract is
  `suivre_renvoi(articleId: string)` only. The tool always resolves against
  today's date; no code filter applies (a renvoi can legitimately cross into
  any code).
- Pagination or a result cap on `renvois`/`nonResolus` - not in the locked
  contract; the cross-reference-loop's own depth/count/turn budget (item 8)
  is what bounds this later, not this tool.
- `router_question`, `calculer`, `demander_a_l_humain` (7c); the three
  stubs and the real third-party-client check (7d).
- Any change to `renvois`' RLS policy (still `using (true)`, per 4c's note -
  the table itself carries no sensitive content, only reference metadata;
  visibility is enforced by joining to `articles`, which does carry RLS).
- Any schema or migration change - reads existing tables as-is.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Description scaffold** - add
  `packages/mcp/src/descriptions/suivre-renvoi.ts` (`ToolDescription`,
  `version: 1`, French description explaining it follows references from an
  already-known article and does not fetch target content or search); edit
  `chercher-droit.ts`'s existing description to reference `suivre_renvoi` by
  name for cross-referencing. *Done when:* `pnpm --filter @legirag/mcp
  typecheck` passes with the new file in place.
- [x] **Step 2 - Split logic (pure)** - extend `packages/mcp/src/schema.ts`
  with `SuivreRenvoiInput { articleId: string }` (Zod); add
  `packages/mcp/src/suivre-renvoi.ts` with a pure function taking rows
  shaped `{ ...Renvoi fields, cibleVisible: boolean }` and returning
  `{ renvois: Renvoi[], nonResolus: string[] }` - a row lands in `renvois`
  only when `resolu && cibleVisible`; everything else's `cibleArticleNum`
  (prefixed with `cibleCode` when inter-code, e.g. `"893 (code civil)"`)
  lands in `nonResolus`. *Done when:* `pnpm test` passes, with new unit
  tests covering: resolved+visible, resolved+not-visible, never-resolved,
  inter-code vs same-code `nonResolus` formatting, and a zero-rows input
  (an article with no renvois at all - the common case, since most articles
  reference nothing) returning `{ renvois: [], nonResolus: [] }`.
- [x] **Step 3 - DB query and wiring** - add `packages/mcp/src/pg-client.ts`
  (mirrors `packages/retrieval`/`packages/eval`'s own, per this codebase's
  existing per-package duplication convention for this exact file); export
  `formatDateReference` from `@legirag/retrieval`'s `index.ts` (reused, not
  duplicated, since it fixed a real Europe/Paris boundary bug - F-01/4c -
  worth not re-deriving); implement `suivreRenvoi(articleId: string, now:
  Date = new Date())` in `suivre-renvoi.ts`: opens a transaction, sets
  `app.date_reference` via the reused formatter, leaves `app.codes` unset,
  `SET LOCAL ROLE anon`; checks the source article is visible (throws
  `Article ${articleId} introuvable ou non en vigueur à la date de
  référence.` if not); runs the left-join query against `renvois`/`articles`;
  maps rows through Step 2's splitter. *Done when:* `pnpm --filter
  @legirag/mcp build` succeeds.
- [x] **Step 4 - Server wiring** - register `suivre_renvoi` in
  `createLegiragMcpServer()` (`server.ts`), using Step 1's description +
  Step 2's Zod schema + Step 3's function; returns one text content block
  (`JSON.stringify({ renvois, nonResolus }, null, 2)`). *Done when:* the
  server builds and starts; `verify-client.ts`'s `tools/list` call (Step 5)
  lists both `chercher_droit` and `suivre_renvoi`.
- [x] **Step 5 - End-to-end verification** - extend `verify-client.ts`: (a)
  call `suivre_renvoi` with a known real article that has a resolved renvoi
  (e.g. `LEGIARTI000006313236`, article 1840 R of the code général des
  impôts, which resolves to article 893) and confirm the real resolved
  target comes back in `renvois`; (b) call the underlying `suivreRenvoi()`
  function directly (not through the MCP round-trip, since the exposed tool
  takes no date) with `now` set to an ancient date (e.g. `1900-01-01`) on
  the same article, and confirm its normally-resolved renvoi now lands in
  `nonResolus` instead - proving the per-target RLS visibility filter is
  real, not a no-op. *Done when:* both live checks pass and their output is
  shown as this step's evidence.
- [x] Repair F-01 - fetchRenvoiRows exported without enforcing its RLS-session precondition
- [x] Repair F-02 - Chunk.id is silently a string, not a number (packages/retrieval)

## Files / areas

- `packages/mcp/src/descriptions/suivre-renvoi.ts` - new
- `packages/mcp/src/descriptions/chercher-droit.ts` - edit (cross-reference)
- `packages/mcp/src/schema.ts` - edit (add `SuivreRenvoiInput`)
- `packages/mcp/src/suivre-renvoi.ts` - new
- `packages/mcp/src/pg-client.ts` - new
- `packages/mcp/src/server.ts` - edit (register second tool)
- `packages/mcp/src/verify-client.ts` - edit (two new live checks)
- `packages/retrieval/src/index.ts` - edit (export `formatDateReference`)

## Data / contracts

- Reuses `Renvoi` from `@legirag/shared` as-is - the tool's `renvois: Renvoi[]`
  output is exactly this locked shape, no new type.
- New, local to `packages/mcp`: `SuivreRenvoiInput { articleId: string }`
  (Zod). Not cross-package, so no `shared/schema.ts` entry, matching 7a's
  precedent for `ChercherDroitInput`.
- No schema or migration change - reads `renvois` and `articles` as they
  exist today.

## Testing

- `pnpm test` (Vitest) gates Step 2's pure split function: the four cases
  in its done-when, each asserting which array a row lands in and (for
  `nonResolus`) the exact formatted string.
- Step 3 (the DB query itself) is an integration surface - no Vitest test,
  same reasoning as `SupabaseRetriever.search()` and 7a's server wiring:
  verified by the live checks in Step 5.
- Step 5's ancient-date check is the test for the RLS-visibility behavior
  specifically. It's the only way to exercise that path today: the corpus
  has zero `ABROGE`/historical rows (project-overview.md, item 10's open
  question), so there is no real repealed article to point a renvoi at yet
  - an ancient `dateReference` is the same substitute technique already
  established and reviewed in `packages/retrieval/src/validate-search.ts`.

## Notes for the AI

- `cibleVisible` (Step 2) is not a field on `Renvoi` - it's an internal,
  query-only signal (from the `LEFT JOIN articles`) consumed only by the
  splitter, never part of the tool's output shape. Don't add it to `Renvoi`
  in `@legirag/shared`.
- Treat "resolved but not currently visible" and "never resolved" as the
  *same* outcome (`nonResolus`) in the output - the caller doesn't need to
  distinguish "extraction couldn't find a match" from "found a match but
  it's hidden," both mean "can't follow this one right now." Do not add a
  third bucket.
- `packages/mcp/src/pg-client.ts` deliberately duplicates
  `packages/retrieval`/`packages/eval`'s own tiny pg-client wrapper (project
  convention, already true of eval vs. retrieval) - don't refactor this into
  a shared package as part of this feature.
- `formatDateReference` is the one exception to that duplication instinct:
  it fixed a real bug (F-01 during 4c, UTC-vs-Europe/Paris boundary near
  midnight), so it gets exported and reused, not re-derived. Import it from
  `@legirag/retrieval`, don't copy its logic.
- One tool, one job, same as 7a's `chercher_droit`: `suivre_renvoi` never
  fetches article content and never searches - it only reports the
  reference graph's shape from one node.

## Live verification result

Ran end-to-end against the real Supabase project (server + verify-client,
same shape as 7a):

- `tools/list` returned both `chercher_droit` and `suivre_renvoi`.
- `suivre_renvoi` called on `LEGIARTI000006313236` (article 1840 R, code
  général des impôts) returned its real, resolved renvoi to article 893
  (`LEGIARTI000022174342`) in `renvois`, with `nonResolus: []`.
- The RLS-visibility proof: calling the underlying fetch function directly
  with `dateReference` forced to `1900-01-01` (bypassing `suivreRenvoi()`'s
  own source-visibility guard, which would otherwise reject on the same
  ancient date since the corpus has no historical rows) - the *same* renvoi
  that resolved normally moved to `nonResolus: ["893"]`. This is the
  feature's central claim, proven against live data, not just asserted by
  a unit test.

Two real bugs were found and fixed via this live testing, not caught by
type-checking or unit tests:

- `renvois.id` (a Postgres `bigint`) came back as a JSON string instead of
  a number, silently violating the locked `Renvoi.id: number` contract -
  `pg` returns `bigint` as a string by default for precision safety. Fixed
  with an explicit `r.id::int` cast in the query.
- While fixing that, discovered the identical bug in already-shipped code:
  `chunks.id` (also `bigint`) has the same issue in
  `packages/retrieval/src/supabase-retriever.ts` (item 4d) - confirmed live,
  fixed with the same `::int` cast pattern (see Findings, 07b/F-02).

Full check suite green throughout: `pnpm lint`, `pnpm typecheck` (8
packages), `pnpm test` (143/143, +6 tests for `suivre-renvoi.ts`).

## Findings

### 07b/F-01 [P2] closed - fetchRenvoiRows is exported without enforcing its RLS-session precondition

**File:** packages/mcp/src/suivre-renvoi.ts:97-100
**Found:** 2026-08-17 by /audit (scope: current - feature 7b, packages/mcp)
**Why it matters:** `fetchRenvoiRows(client, articleId)` only returns correct
`cibleVisible` values if the caller has already run `set_config('app.date_reference', ...)`
and `SET LOCAL ROLE anon` on that same `client`, in the same transaction -
documented in a comment above the function, but nothing in the type
signature or module boundary enforces it. Today's only two callers
(`suivreRenvoi()` and `verify-client.ts`'s Step 5 proof) both set this up
correctly. But the function is exported as public module surface, and 7c/7d/
item 8 will add more callers into this same file/package; a future caller
that reaches for `fetchRenvoiRows` directly - the obvious-looking "just get
me the rows" function - without replicating the session setup would silently
get `cibleVisible: true` for every row (a fresh client/role defaults to no
RLS restriction... actually defaults to the `anon`-exempt role's own view if
misused with the wrong role, or unfiltered if run without `SET LOCAL ROLE
anon` at all), defeating the exact domain rule this feature exists to
enforce ("a repealed article must never be returned"). Not a live bug today -
both current call sites are correct - but a real footgun for the next
tool built in this file.
**Suggested fix:** Make the precondition impossible to miss at the call site,
not just documented above the definition - e.g. rename to something like
`fetchRenvoiRowsUnderActiveRlsSession`, or keep the export for
`verify-client.ts`'s legitimate need but move the warning into a one-line
JSDoc `@throws`-style note referenced from both call sites. Avoid a runtime
assertion unless this actually gets misused in practice - the smallest fix
here is a naming/documentation one.
**Resolution:** Fixed 2026-08-17 - renamed to
`fetchRenvoiRowsUnderActiveRlsSession` (both call sites updated:
`suivreRenvoi()` and `verify-client.ts`) and expanded the warning comment
above its definition to spell out the exact consequence of misuse. Verified
live end-to-end after the rename: both `suivre_renvoi` via the real MCP
round-trip and the ancient-date target-visibility proof still produce the
same correct results as before. `pnpm --filter @legirag/mcp build`,
`pnpm test` (143/143), `pnpm lint`, `pnpm typecheck` (8 packages) all green.
Closed 2026-08-17 - re-read `suivre-renvoi.ts` and `verify-client.ts` fresh:
no remaining references to the old `fetchRenvoiRows` name (grep-confirmed),
both call sites use the renamed function correctly, and the warning comment
accurately states the precondition and its consequence. No new defect
introduced by the repair.

### 07b/F-02 [P2] closed - Chunk.id is silently a string, not a number, from SupabaseRetriever

**File:** packages/retrieval/src/supabase-retriever.ts:33-64 (toChunk, HYBRID_SEARCH_SQL)
**Found:** 2026-08-17 by /audit (scope: current - feature 7b; discovered
while reviewing packages/mcp/src/suivre-renvoi.ts, which hit and fixed the
identical bug for `renvois.id`. Located in packages/retrieval, item 4d
(already shipped) - not part of 7b's own diff, flagged as a directly
related lead found along the way.)
**Why it matters:** `chunks.id` is `bigint` (`create table chunks (id bigint
generated always as identity primary key, ...)`, same column-type family as
`renvois.id`, which needed an explicit `::int` cast this session to avoid
the exact same problem). `HYBRID_SEARCH_SQL` selects `c.id` with no cast,
and `HybridRow`/`toChunk` type it as `number` - but `pg` returns `bigint`
columns as JS strings by default (precision safety). Confirmed live just
now: `typeof (await query('select id from chunks limit 1')).rows[0].id ===
'string'`. This silently violates the locked `Chunk.id: number` contract
in `@legirag/shared`. No confirmed live consumer breaks today - nothing in
`chercher_droit`'s `toToolContent` or elsewhere currently reads `chunk.id`
as a number (identity/dedup logic uses `articleIdentifier` instead) - so
this is a confirmed contract violation with unconfirmed behavioral impact,
not (yet) a confirmed live bug. Worth fixing before something downstream
(item 8's agent, item 9's eval, a future API response) starts trusting
`Chunk.id` as a real number.
**Suggested fix:** Same fix as this session's `renvois.id::int` - add
`::int` to `c.id` in `HYBRID_SEARCH_SQL` (`packages/retrieval/src/
supabase-retriever.ts`). Small, scoped, no behavior change beyond making
the type honest. Out of scope for this feature to apply (different,
already-shipped package) - recorded here so it isn't lost.
**Resolution:** Fixed 2026-08-17 - added `::int` to `c.id` in
`HYBRID_SEARCH_SQL` (`packages/retrieval/src/supabase-retriever.ts`), same
fix as `renvois.id` this session, with an explaining comment. Verified live
against real Supabase data via `SupabaseRetriever.search()` directly:
`typeof result.id === 'number'` now, same correct search results as before
(`chercher_droit`'s live output unaffected). `pnpm --filter @legirag/
retrieval build`, `pnpm test` (143/143), `pnpm lint`, `pnpm typecheck`
(8 packages) all green. Closed 2026-08-17 - re-read `supabase-retriever.ts`
fresh: the cast is correctly placed on `c.id` in the final `select`
(not on the CTEs' internal `id` columns, which don't need it since they're
never returned to the caller), the explaining comment is accurate, and
`toChunk`/`HybridRow` are otherwise untouched. No new defect introduced.

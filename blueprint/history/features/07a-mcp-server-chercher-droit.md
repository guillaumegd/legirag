# Feature: MCP server skeleton and `chercher_droit`

**From build-plan:** feature 7a (first sub-feature of 7. Tool server)
**Status:** not started

## Goal

Stand up the `packages/mcp` server - a real MCP (Model Context Protocol)
server reachable over Streamable HTTP - and give it its first real tool,
`chercher_droit`, a thin wrapper around the existing `SupabaseRetriever`
(item 4d). This proves the server skeleton and the versioned
tool-description pattern end-to-end before the remaining seven tools
(7b-7d) are added on top of it.

`chercher_droit` is the tool the roadmap ranks first in priority ("le RAG
vit ici, et nulle part ailleurs") and is the only one of the eight tools
that needs no new domain logic - search already works - so it is the
cheapest way to prove the transport and description scaffold are right
before building on them.

## In scope

- `packages/mcp` gets `@modelcontextprotocol/sdk` as a dependency and a real
  HTTP server (Streamable HTTP transport, MCP spec 2026-07-28).
- A versioned tool-description scaffold: a `ToolDescription` shape (name,
  version, description text) and a `packages/mcp/src/descriptions/`
  directory holding one file per tool, starting with `chercher_droit`'s
  (nested under `src/` so `tsc -b`'s `rootDir: "src"` can build it -
  `packages/mcp/tsconfig.json` scopes compilation to `src`). Descriptions
  are data, never inlined in the server-wiring code, because item 9 will
  replay them through the eval harness to catch selection-rate regressions.
- The `chercher_droit` tool itself: Zod-validated input
  (`texte`, `codes?`, `date?`, `idcc?`, `topK?`), calling
  `SupabaseRetriever.search()` under the hood, returning the resulting
  `Chunk[]` as the tool's MCP response content.
- A minimal MCP client script to verify the server end-to-end without
  requiring a GUI client for this step.

## Out of scope

- The other seven tools (`suivre_renvoi` 7b; `router_question`, `calculer`,
  `demander_a_l_humain` 7c; the three stubs plus the real third-party-client
  [Claude Desktop] check 7d).
- Any change to `SupabaseRetriever` or the `Retriever` interface - this
  feature wraps item 4d as-is.
- Auth, rate limiting, or cost caps on the MCP server (the project has none
  planned for v1's tool server; guardrails named in project-overview.md are
  scoped to the public API, item 11).
- Deployment/containerization of the MCP server (item 12's job).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Tool-description scaffold** - add `@modelcontextprotocol/sdk`
  to `packages/mcp`'s dependencies; add a `ToolDescription` interface
  (`packages/mcp/src/tool-description.ts`); add
  `packages/mcp/src/descriptions/chercher-droit.ts` exporting the tool's
  `name`, `version: 1`, and its French description text. *Done when:*
  `pnpm install` resolves the new dependency and
  `pnpm --filter @legirag/mcp typecheck` passes with the new files in place.
- [x] **Step 2 - `chercher_droit` tool logic** - a Zod input schema
  (`packages/mcp/src/schema.ts`) for `{ texte, codes?, date?, idcc?, topK? }`
  (`date` as `z.string().date()`, matching the `Citation.date_debut`
  convention already in `shared/schema.ts`); a pure mapping function turning
  validated input into a `RequeteRecherche` (default `topK: 10`, default
  `dateReference: new Date()` when `date` is omitted, otherwise
  `new Date(date)`); a pure formatting function turning `Chunk[]` into the
  MCP tool response's `content` array (`{ type: 'text', text: ... }` entries,
  one per chunk, plus a defined output for the empty-results case - not a
  thrown error). *Done when:* `pnpm test` passes, with new unit tests
  covering the input-to-`RequeteRecherche` mapping (defaults applied,
  optional fields and an explicit `date` passed through correctly) and the
  formatting function for both a non-empty `Chunk[]` and an empty one.
- [x] **Step 3 - Server wiring** - `packages/mcp/src/server.ts` creates the
  MCP server, registers `chercher_droit` (its Zod schema + description +
  Step 2's handler backed by a `SupabaseRetriever` instance), and starts a
  Streamable HTTP transport listening on `MCP_PORT` (default `3333`);
  `packages/mcp/src/index.ts` calls it. *Done when:*
  `pnpm --filter @legirag/mcp build` succeeds and running the built server
  opens an HTTP listener on the configured port (shown by a startup log line).
- [x] **Step 4 - End-to-end verification script** - a small script
  (`packages/mcp/src/verify-client.ts`, not part of the build output's
  runtime path) that connects an MCP `Client` over
  `StreamableHTTPClientTransport` to the running server, calls `tools/list`,
  then calls `chercher_droit` with a known-good smoke question ("vitesse
  maximale autorisée en agglomération") and prints the result. *Done when:*
  running the server, then the script, in two terminals shows
  `chercher_droit` listed and returns real `Chunk[]` results from Supabase.
- [x] Repair F-03 - MCP server doesn't fail fast on a missing DATABASE_URL
- [x] Repair F-04 - Cleanup calls use bare `void` instead of catch-and-log

## Files / areas

- `packages/mcp/package.json` - add `@modelcontextprotocol/sdk` dependency
- `packages/mcp/src/tool-description.ts` - new
- `packages/mcp/src/descriptions/chercher-droit.ts` - new
- `packages/mcp/src/schema.ts` - new (Zod input schema for `chercher_droit`)
- `packages/mcp/src/chercher-droit.ts` - new (mapping + formatting + handler)
- `packages/mcp/src/server.ts` - new
- `packages/mcp/src/index.ts` - replaced stub, starts the server
- `packages/mcp/src/verify-client.ts` - new, manual verification only

## Data / contracts

- Reuses `Chunk`, `RequeteRecherche`, `Retriever` from `@legirag/shared` and
  `SupabaseRetriever` from `@legirag/retrieval` as-is - no changes.
- New, local to `packages/mcp` (not cross-package, so no `shared/schema.ts`
  entry): `ToolDescription { name: string; version: number; description:
  string }` and the `chercher_droit` Zod input schema. Both are
  load-bearing for 7b-7d, which add their own tool + description files
  next to these using the same shapes - don't redesign the pattern there.

## Testing

- `pnpm test` (Vitest) gates the two pure functions from Step 2: the
  input-to-`RequeteRecherche` mapping (default `topK`, default
  `dateReference`, pass-through of `codes`/`idcc` when present) and the
  `Chunk[]`-to-tool-response formatting. Mock nothing here - both are pure
  data transforms.
- The server itself (Steps 3-4) is an integration surface (real HTTP
  transport, real Supabase call) - verified by running it and the Step 4
  script, not by a Vitest test, per the Testing gate's scope rule.
- No test exists yet for `SupabaseRetriever.search()` failing (e.g. Supabase
  unreachable) - out of scope here; the tool call will simply reject, which
  is correct MCP behavior (the SDK reports it as a tool error), not a gap
  this feature needs to close.

## Notes for the AI

- Match the repo's French domain vocabulary: tool name `chercher_droit`,
  Zod field names `texte`/`codes`/`date`/`idcc`/`topK` (mirrors
  `RequeteRecherche`'s shape, not a rename).
- One tool, one job: `chercher_droit` only searches - it must not also
  resolve cross-references or filter by anything `SupabaseRetriever.search`
  doesn't already accept. The roadmap is explicit that a tool doing two
  things is a tool the agent picks badly.
- `MCP_PORT` gets a code default (`3333`), not a `requireEnv` - it's a local
  bind port, not a credential, so no `.env.example` entry is needed.
- Reuse `packages/retrieval`'s existing Supabase/env wiring
  (`SupabaseRetriever`, `requireEnv` inside it) - don't duplicate connection
  handling in `packages/mcp`.
- Descriptions are plain data (`ToolDescription` objects), not template
  strings assembled at call time - item 9's eval harness will diff them
  directly to catch tool-selection regressions.

## Live verification result

Ran end-to-end against the real Supabase project: started the built server
(`node --env-file=.env packages/mcp/dist/index.js`), then
`pnpm --filter @legirag/mcp verify-client` from a second terminal. The
client connected, listed `chercher_droit` as the sole available tool, then
called it with "vitesse maximale autorisée en agglomération" and received
10 real results, correctly top-ranked by article R413-3 of the Code de la
route ("En agglomération, la vitesse des véhicules est limitée à 50 km/h").

Also confirmed the F-03 fail-fast repair live: running the built server with
`DATABASE_URL` unset exits immediately with `Variable d'environnement
manquante : DATABASE_URL` instead of reporting itself as listening.

Along the way, discovered (and fixed within Step 3/4) that the MCP SDK's
stateless Streamable HTTP mode requires a fresh `McpServer`/transport per
HTTP request, not a shared one reused across requests - confirmed against
the SDK's own `simpleStatelessStreamableHttp.js` example after a live
two-request test failed on the second request.

Full check suite green throughout: `pnpm lint`, `pnpm typecheck` (8
packages), `pnpm test` (137/137, including 8 new tests for `chercher-droit.ts`).

## Findings

### 07a/F-01 [P3] closed - Row-mapping helpers duplicated verbatim between run-vector-only.ts and run-hybrid-capped.ts

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

### 07a/F-02 [P3] closed - cosineSimilarity divides by zero on an all-zero embedding vector

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

### 07a/F-03 [P2] closed - MCP server doesn't fail fast on a missing DATABASE_URL

**File:** packages/mcp/src/server.ts:29-43
**Found:** 2026-08-17 by /audit (scope: current - feature 7a, packages/mcp)
**Why it matters:** `coding-standards.md` locks a project-wide convention:
"Fail fast on missing required configuration (throw, don't default
silently)." `startServer()` never touches `DATABASE_URL` (or any other
required env var) before opening the HTTP listener and logging "à l'écoute" -
`SupabaseRetriever`'s constructor is env-agnostic, and `requireEnv
('DATABASE_URL')` only runs deep inside the first real `chercher_droit`
call, via `createDatabaseClient()`. A misconfigured deployment (missing or
wrong `.env`, wrong working directory, CI without the secret wired) reports
itself as healthy and listening, then fails on whichever request happens to
be first - a worse debugging experience than the fail-fast convention this
project otherwise follows everywhere else (e.g. `requireEnv` itself, the
Bedrock provider). This is new to 7a: `SupabaseRetriever`'s lazy-connect
design was fine for its original eval-script callers, which call `search()`
immediately and exit; `server.ts` is the first long-running process built on
it, so the gap between "server says it's ready" and "first real failure" is
now user-visible in a way it wasn't before.
**Suggested fix:** Call `requireEnv('DATABASE_URL')` (already exported from
`@legirag/shared`) once at the top of `startServer()`, before opening the
HTTP listener, so a missing/misconfigured database URL fails loudly at boot
instead of silently on the first tool call. No change to `SupabaseRetriever`
needed.
**Resolution:** Fixed 2026-08-17 - `startServer()` now calls
`requireEnv('DATABASE_URL')` as its first line, before opening the HTTP
listener. Verified live: running the built server with `DATABASE_URL`
unset now throws and exits immediately with `Variable d'environnement
manquante : DATABASE_URL` instead of logging "à l'écoute"; running it with
the real `.env` still starts and serves `chercher_droit` correctly
end-to-end (same live Supabase result as before the fix).
`pnpm --filter @legirag/mcp build`, `pnpm test` (137/137), `pnpm lint`,
`pnpm typecheck` (8 packages) all green. Closed 2026-08-17 - re-read
`server.ts` fresh in full: `requireEnv('DATABASE_URL')` is the first line
of `startServer()`, runs before the HTTP listener opens, and its
synchronous throw correctly becomes a rejected promise `index.ts`'s
top-level `.catch()` already handles (confirmed live). No new defect
introduced by the repair.

### 07a/F-04 [P3] closed - Cleanup calls on response close use bare `void`, not the project's catch-and-log pattern

**File:** packages/mcp/src/server.ts:53-56
**Found:** 2026-08-17 by /audit (scope: current - feature 7a, packages/mcp)
**Why it matters:** `res.on('close', () => { void transport.close(); void
mcpServer.close(); })` fires on every completed request, not just error
paths. Reading the installed SDK's `close()` implementations
(`webStandardStreamableHttp.js`, `protocol.js`) confirms neither currently
throws in this code path, so there is no live crash today - but `void` on a
promise means an eventual rejection (from a future SDK version, or an edge
case not exercised in this review) becomes an unhandled promise rejection at
the process level instead of a caught, logged error, which under Node's
default `--unhandled-rejections=throw` would crash the whole server for
every in-flight request, not just the one being cleaned up.
`packages/retrieval/src/supabase-retriever.ts` already establishes this
project's convention for exactly this situation - a cleanup call that "peut
lui-même échouer" - by wrapping it in `try/catch` and logging rather than
letting the rejection propagate unhandled. `server.ts` doesn't follow it.
**Suggested fix:** Replace the two bare `void` calls with `.catch((error:
unknown) => console.error(...))`, mirroring `supabase-retriever.ts`'s
existing pattern for the same class of problem (a secondary cleanup failure
that must never mask or crash past the primary request).
**Resolution:** Fixed 2026-08-17 - both `transport.close()` and
`mcpServer.close()` in the `res.on('close', ...)` handler now use
`.catch((error: unknown) => console.error(...))` instead of bare `void`,
matching `supabase-retriever.ts`'s pattern. Verified live: ran the full
end-to-end flow (server + verify-client against real Supabase data) after
the change - request completed normally, no cleanup error logged, same
correct result as before the fix. `pnpm --filter @legirag/mcp build`,
`pnpm test` (137/137), `pnpm lint`, `pnpm typecheck` (8 packages) all green.
Closed 2026-08-17 - re-read `server.ts` fresh: both `.catch()` handlers are
correctly placed, log distinct messages naming which resource failed to
close, and don't re-throw or otherwise interfere with the primary request
path. No new defect introduced by the repair.

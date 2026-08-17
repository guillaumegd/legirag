# Feature: Stub tools and third-party client verification

**From build-plan:** feature 7d
**Status:** complete

## Goal

Close out item 7 (tool server) by registering the three remaining tools from
the technical brief's locked eight-tool contract (§5.3) as honest stubs -
`version_a_la_date`, `resoudre_convention`, `analyser_document` - none of
which have the real data behind them yet (history rows, KALI corpus, document
mode), then prove the server is genuinely MCP-interoperable by driving it
with a real third-party client, not just our own `verify-client.ts` script.

## In scope

- Three stub tools, registered in `createLegiragMcpServer()` with the exact
  input signatures locked in the technical brief §5.3, each returning a
  structured MCP error (`isError: true`) with a French message naming why
  it's not implemented and what to call instead - never a fabricated
  `Article`/`SectionBalisee`/etc. See **Scope decision: stub behavior** below.
- A small shared stub-handler helper so the three registrations don't
  duplicate the same `isError` plumbing.
- Versioned `ToolDescription`s (version 1) for all three, explicit in the
  description itself that the tool is not implemented - so an agent (item 8)
  or the tool-selection eval (item 9) doesn't get misled into thinking a
  stub is a working, low-signal tool worth calling.
- Extending `verify-client.ts` with calls to all three stubs, same pattern as
  7a/7b/7c.
- A real end-to-end check with **MCP Inspector**
  (`@modelcontextprotocol/inspector`, run via `npx`, no new dependency) against
  the running dev server: list all eight registered tools and call at least
  `chercher_droit` plus one stub tool, confirming both the real and the stub
  paths work through a genuinely separate client implementation - decided
  2026-08-17 over Claude Desktop specifically because it's CLI-driveable in
  this session instead of requiring a manual desktop-app walkthrough.

## Out of scope

- Real implementations of `version_a_la_date` (needs the palier-profondeur
  history rows, item 10), `resoudre_convention` (needs the KALI corpus, the
  optional collective-bargaining branch), `analyser_document` (needs the
  optional document-upload mode). All three stay stubs until their
  prerequisite feature actually lands.
- Wiring any tool into an actual agent loop (item 8).
- Claude Desktop or any other GUI-based third-party client - MCP Inspector's
  CLI mode covers the "real third-party client" requirement for this feature;
  a GUI walkthrough can be added later via `/try` if wanted.
- Output Zod schemas mirroring the stubs' locked *success* shapes
  (`Article`/`versionsVoisines`, `SectionBalisee`/`Passage`, etc.) - see scope
  decision below.

## Scope decision: stub behavior

The technical brief locks each stub's *success* return shape but none of the
three have real data or logic behind them today. Two options: fabricate a
plausible-looking fake value matching the locked shape, or fail loudly and
explain why. This feature takes the second path, for the same reason the
project already writes `confiance: 'abstention'` instead of guessing and
`suivre_renvoi` surfaces unresolved references in `nonResolus` instead of
silently dropping them: a fake `Article` or `SectionBalisee` returned by a
"working" tool is indistinguishable from a real one to whatever calls it, and
would violate the project's core rule that nothing unsourced gets stated as
fact. So each stub:

- Still validates its input against the locked signature (a real Zod schema,
  not skipped) - a malformed call should fail on shape, not silently succeed.
- Returns `{ content: [...], isError: true }` with a message stating what's
  missing and which item builds the real thing, plus what to call instead
  (`chercher_droit`, `demander_a_l_humain`).
- Ships no output Zod schema, since no real output is ever produced - adding
  one now would be speculative typing for a shape nothing yet fills in
  (`version_a_la_date`'s real feature, item 10, is better placed to get that
  shape right against real history data).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - three stub tools** - `packages/mcp/src/stub-tool.ts`
  (pure `stubToolResult(message: string): { content: [{ type: 'text', text: string }], isError: true }`)
  with a unit test; `schema.ts` gains `VersionALaDateInput` (`{ articleNum,
  code, date }`, `date` as `z.string().date()` matching `ChercherDroitInput`'s
  convention), `ResoudreConventionInput` (`{ secteur?, idcc?, nomConvention?
  }`, all optional per the locked signature), `AnalyserDocumentInput` (`{
  contenu, question }`); `descriptions/version-a-la-date.ts`,
  `descriptions/resoudre-convention.ts`, `descriptions/analyser-document.ts`
  (each a version-1 `ToolDescription` whose description itself states the
  tool is not implemented and what to call instead); all three registered in
  `createLegiragMcpServer()`, each handler validated by its input schema then
  returning `stubToolResult(...)` with the tool-specific message from the
  scope decision above (unused validated input parameter prefixed `_input`,
  matching this repo's `argsIgnorePattern: '^_'` ESLint rule). Bundled as one
  step because all three are structurally identical (no divergent logic to
  review separately), unlike 7c's three genuinely different tools. *Done
  when:* `pnpm --filter @legirag/mcp test` passes with a new
  `stub-tool.test.ts` covering the `isError`/message shape, and
  `pnpm --filter @legirag/mcp typecheck` passes with all three tools
  registered.
- [x] **Step 2 - extend `verify-client.ts`** - add three `client.callTool(...)`
  calls (one per stub) with realistic arguments matching each locked
  signature, printing the JSON result like the existing five calls. *Done
  when:* with `pnpm --filter @legirag/mcp dev` running,
  `pnpm --filter @legirag/mcp verify-client` completes without throwing and
  prints `isError: true` plus the explanatory message for all three new
  calls, alongside the five existing tool results.
- [x] **Step 3 - MCP Inspector live verification** - with the dev server
  still running, drive it from `npx @modelcontextprotocol/inspector` in CLI
  mode (confirm the exact invocation via `--help` first - don't assume flags
  from memory) to: list tools and confirm all eight appear, call
  `chercher_droit` with a real question and confirm chunk results come back,
  and call one stub tool (e.g. `version_a_la_date`) and confirm the
  `isError: true` response comes back cleanly. Record the exact commands and
  their output in this spec's **Live verification result** section
  afterward, matching 7a/7b/7c's convention. *Done when:* all three Inspector
  calls above succeed against the real running server and are recorded here.

## Files / areas

- `packages/mcp/src/stub-tool.ts`, `.test.ts` (new)
- `packages/mcp/src/schema.ts` (add `VersionALaDateInput`,
  `ResoudreConventionInput`, `AnalyserDocumentInput`)
- `packages/mcp/src/descriptions/version-a-la-date.ts`,
  `descriptions/resoudre-convention.ts`, `descriptions/analyser-document.ts` (new)
- `packages/mcp/src/server.ts` (register the three stub tools)
- `packages/mcp/src/verify-client.ts` (extend with three stub calls)
- No `package.json` change - MCP Inspector runs via `npx`, not added as a
  project dependency (one-off verification tool, not part of the shipped code)

## Data / contracts

- The three stub input shapes are locked by the technical brief §5.3 as
  shown above - not new decisions, just typed for the first time in this
  package.
- No output contract is introduced for any of the three (see scope decision).
  Their eventual real output shapes stay whatever the brief already locked,
  to be typed for real by whichever feature actually builds them (item 10 /
  KALI branch / document mode).

## Testing

`pnpm test` (Vitest) is the gate; this feature's only in-scope logic is the
stub handler:

- `stub-tool.test.ts` - `stubToolResult` returns `isError: true` and includes
  the given message in `content`.
- No test needed for `server.ts` registration wiring itself (integration,
  proven live) or for the three `descriptions/*.ts` files (static data).
- Live verification, two layers: `verify-client.ts` (our own script, same
  pattern as 7a/7b/7c) and MCP Inspector (a genuinely separate client
  implementation, the actual "third-party" proof this feature adds).

## Notes for the AI

- Follow 7a/7b/7c's established shape exactly: `ToolDescription` in
  `descriptions/`, Zod input schema in `schema.ts`, registration in
  `createLegiragMcpServer()`.
- Do not fabricate a fake `Article`, `SectionBalisee`, or `Passage` value to
  make a stub "look like" it works - `isError: true` plus an explanatory
  message is the honest choice here, consistent with `confiance:
  'abstention'` and `suivre_renvoi`'s `nonResolus` elsewhere in this project.
- Check `npx @modelcontextprotocol/inspector --help` for the real CLI flags
  before writing Step 3's exact commands - don't assume a remembered syntax.
- Once this lands, item 7 (tool server) is fully complete - check off both
  7d and the parent item 7 checkbox in `build-plan.md` at `/complete`.

## Live verification result

`pnpm --filter @legirag/mcp dev` running (port 3333). MCP Inspector's `--help`
showed only global flags (`-e`, `--config`, `--server`, `--cli`), no
method/tool flags - those only appear once `--cli` mode actually runs, so the
exact invocation was found by trial rather than `--help` alone.

Two versions were tried:

- **v1** (`npx @modelcontextprotocol/inspector`, resolves to the deprecated
  `0.15.0`) - `--cli <url> --method tools/list` hung indefinitely with no
  output. v1 predates Streamable HTTP client support (this server only
  implements Streamable HTTP, via `StreamableHTTPServerTransport`), so it was
  almost certainly stuck attempting the older SSE transport against an
  endpoint that doesn't speak it.
- **v2** (`npx @modelcontextprotocol/inspector@latest`, resolved `2.2.0`) -
  worked once given `--transport http` explicitly (omitting it fails fast
  with `"Transport type not specified and could not be determined from
  URL"`, so this isn't a guess). npm warned `EBADENGINE` because v2 declares
  `node >=22.19.0` and this machine runs `v20.20.2` - the warning did not
  stop it from running correctly.

Commands run (server already listening on `:3333`):

```
npx @modelcontextprotocol/inspector@latest --cli http://localhost:3333/ \
  --transport http --method tools/list

npx @modelcontextprotocol/inspector@latest --cli http://localhost:3333/ \
  --transport http --method tools/call --tool-name chercher_droit \
  --tool-arg texte="vitesse maximale autorisée en agglomération"

npx @modelcontextprotocol/inspector@latest --cli http://localhost:3333/ \
  --transport http --method tools/call --tool-name version_a_la_date \
  --tool-arg articleNum=L221-18 --tool-arg code=code-de-la-consommation \
  --tool-arg date=2020-01-01
```

Results:

- `tools/list` -> all eight tools present: `chercher_droit`, `suivre_renvoi`,
  `demander_a_l_humain`, `calculer`, `router_question`, `version_a_la_date`,
  `resoudre_convention`, `analyser_document`, each with its input JSON schema
  and description (the three stubs' descriptions visibly state "Outil non
  implémenté" up front).
- `chercher_droit` call -> the same 10 ranked chunk results as the direct
  `verify-client.ts` run for the identical question (Article R413-3 and
  related speed-limit articles), proving the real search path works
  end-to-end through a genuinely separate client implementation.
- `version_a_la_date` call -> `isError: true`, `content` carrying the exact
  stub message, and Inspector's own CLI additionally surfaced
  `{"error":{"code":"tool_is_error","message":"Tool 'version_a_la_date'
  returned isError:true."}}` - confirming Inspector itself recognized and
  correctly surfaced the tool-level error, not just that a response arrived.

Item 7 (tool server) is now fully proven interoperable with a real
third-party MCP client, closing the "reachable end-to-end via a minimal MCP
client script" gap that 7a-7c left with only our own script.

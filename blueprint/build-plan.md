# Build Plan

The build order follows the natural dependency chain: shared contracts before
data, data before search, search before the agent that uses it, the agent
before the API that serves it, the API before the front end that calls it.
Reliability measurement (the evaluation dataset and harness) is built early,
right after the corpus is searchable, and is not treated as optional - it is
what lets every later change be checked for regressions instead of just
looking done.

Repo layout is already scaffolded (pnpm workspace, `packages/shared` with
Zod schemas, `Retriever`/`ModelProvider` interfaces, the Légifrance URL
builder, and a Bedrock provider; `infra/` with a Terraform skeleton). Item 1
below closes out what's left of that foundation before data work starts.

- [x] 1. **Repo foundations and shared contracts** - finish the shared package
  (`ReponseStructuree` response schema, `Citation`, article/subdivision/chunk
  types), confirm the Bedrock model wiring reads from environment variables,
  add `.env.example` and secret handling, and get base CI (lint, typecheck,
  test) green on every change
- [x] 2. **Legal corpus in the database** - ingest the open-data source of
  France's codes in force, parse each article's hierarchical path (part,
  book, title, chapter, section) and its subdivisions, and load everything
  into Postgres with the schema queryable by article number
  - [x] 2a. **COLD corpus acquisition and filtering** - fetch the COLD French
    Law dataset, keep only rows that are actual codes, drop the unused
    English columns, and persist the filtered result as a reusable
    intermediate artifact
  - [x] 2b. **Hierarchical path parser** - parse each article's `texte_contexte`
    field into its part/book/title/chapter/section segments, unit tested
    against the header combinations the source data actually contains
  - [x] 2c. **Subdivision extractor** - parse each article's markdown content
    into its `I`/`II`/`1°`/`2°`/alinéa subdivisions, unit tested against
    articles with and without subdivisions
  - [x] 2d. **Supabase schema and load** - create the `articles` and
    `subdivisions` tables with their indexes, then load the parsed corpus so
    a query for any `article_num` returns its text, code, hierarchical path,
    and subdivisions
- [x] 3. **Cross-reference graph** - extract references from one article to
  another (simple references, enumerations, ranges, references that cross
  into a different code) with the extraction accuracy measured against a
  hand-annotated sample, and populate the reference graph table
  - [x] 3a. **Renvoi extractor** - pure text-in/structured-out extraction of
    every reference form (simple, enumeration, range-expansion, cross-code,
    subdivision-target), with its accuracy measured against a hand-annotated
    sample of real articles
  - [x] 3b. **Renvois table and load** - create the `renvois` table, resolve
    each extracted reference to its target `article_identifier` where
    possible, and load the full extracted graph into Supabase
- [x] 4. **Search index and access-control policies** - contextual chunking,
  vector embeddings, keyword index, the hybrid `Retriever` implementation,
  and row-level security policies enforcing state/date/code/agreement-ID
  filtering in the database itself (a repealed article must never be
  returned, even when a query names it explicitly)
  - [x] 4a. **Contextual chunking** - pure function turning an article and its
    subdivisions into context-prefixed chunk texts (code + hierarchical path +
    article/subdivision number ahead of the content), one chunk per
    subdivision when they exist and one per article otherwise, unit tested
    and validated against the real corpus
  - [x] 4b. **Chunks table, embeddings, and indexes** - create the `chunks`
    table (`embedding vector(1024)`, generated `tsv`), generate and persist
    Cohere embed-v4 embeddings for every chunk in batches, and add the HNSW,
    GIN, and B-tree indexes
  - [x] 4c. **Access-control policies (RLS)** - session-variable-driven RLS
    on the search path enforcing `etat`/date/code/`idcc` filtering in
    Postgres itself, proved by the project's most important test: an article
    marked `ABROGE` and named explicitly by number must never come back
  - [x] 4d. **Hybrid `Retriever` implementation** - the first concrete
    `Retriever`: BM25 top 50 + vector top 50 + RRF fusion top 20, setting the
    RLS session variables per query, returning coherent results on manual
    smoke questions (reranking and the abstention threshold stay item 6's job)
- [x] 5. **Evaluation question set and harness** - a set of annotated
  questions (routine lookups, mandatory cross-references, time-sensitive
  answers, out-of-scope questions, questions with a false premise) with
  expected answers, plus a runnable harness that scores retrieval quality
  against it - built before any search tuning starts, so every later change
  has something to be measured against
- [ ] 6. **Retrieval quality improvements, each measured in isolation** - a
  deliberately naive baseline, then contextual chunking, hybrid keyword +
  vector search, and re-ranking, each rerun through the harness on its own so
  its individual effect is visible
  - [x] 6a. **Naive baseline** - a deliberately naive chunker (whole article,
    no hierarchical context prefix) plus an out-of-band, vector-only
    brute-force search (no DB persistence, given the tight Supabase size
    headroom noted under item 10), scored through the existing eval harness
    to establish the quality floor everything else is measured against
  - [x] 6b. **Contextual chunking, measured in isolation** - a vector-only
    search variant against the already-indexed, context-prefixed `chunks`
    table (4a), scored through the harness and compared against 6a to isolate
    contextual chunking's own effect, holding the search method constant
  - [x] 6c. **Hybrid keyword + vector search, measured in isolation** - the
    existing, unchanged `SupabaseRetriever` (4d) re-run through the harness
    and compared against 6b to isolate hybrid fusion's own effect, holding
    the chunking method constant
  - [ ] 6d. **Re-ranking** - add a Cohere re-ranking step to
    `SupabaseRetriever`, scored through the harness and compared against 6c;
    the one sub-feature here that changes the production retriever
    - On hold until explicit further notice (confirmed 2026-08-17): item 7
      (tool server) is being built ahead of it. Do not resume 6d via a
      no-argument `/feature` run - only pick it up again on an explicit
      `/feature 6d`.
    - Paused 2026-08-16, not abandoned: 6c already found hybrid search added
      zero measurable lift over vector-only on the eval sample, so
      re-ranking's own lift is uncertain too. Cohere Rerank 3.5 is available
      through Bedrock (not a separate Cohere account) at ~$0.002/call - cheap
      relative to the LLM generation call that follows it - but only in
      `eu-central-1`, not this project's current `eu-west-3`, and this is a
      demo project with no real users yet, so a region change isn't justified
      for an uncertain gain right now. A first exploratory step in `packages/
      shared/src/providers/rerank.ts` (direct Cohere REST API, not Bedrock)
      was built and unit tested on the abandoned `feature/re-ranking` branch,
      never merged - if resumed later, re-derive the isolated-measurement
      step first (cheap, ~15-45 calls) before deciding whether to touch
      `SupabaseRetriever` at all, and prefer the Bedrock-routed model over a
      separate Cohere account if the region question gets resolved.
    - Revisited 2026-08-17: Voyage AI and Jina AI rerankers were checked as
      cheaper, non-Bedrock alternatives (both cheaper per token than Cohere
      and available outside `eu-central-1`, sidestepping the region issue).
      Not adopted - price was never the actual blocker (re-deriving the
      isolated measurement costs under $0.10 regardless of provider); the
      open question is still whether re-ranking gives any measurable lift at
      all, which no pricing comparison answers. Direct Cohere API was also
      checked and is not a cheaper alternative to Bedrock - both are $2/1000
      queries.
- [x] 7. **Tool server** - a public server exposing search, cross-reference
  following, deterministic calculation, and the other agent tools, with
  versioned tool descriptions, working end-to-end with a third-party agent
  client
  - [x] 7a. **MCP server skeleton and `chercher_droit`** - the `packages/mcp`
    HTTP (Streamable HTTP transport) server, the versioned tool-description
    scaffold, and the first real tool - `chercher_droit`, wrapping the
    existing `SupabaseRetriever` - reachable end-to-end via a minimal MCP
    client script
  - [x] 7b. **`suivre_renvoi`** - cross-reference-following tool querying the
    `renvois` table, resolving to target articles while still respecting the
    search RLS visibility rules (state/date/code), returning resolved and
    unresolved references
  - [x] 7c. **`router_question`, `calculer`, `demander_a_l_humain`** - the
    remaining three real tools: LLM-based multi-code routing, a deterministic
    (unit-tested, no model call) calculation tool, and the trivial escalation
    tool
  - [x] 7d. **Stub tools and third-party client verification** - stubs for
    `version_a_la_date` (real at item 10), `resoudre_convention` (real if the
    KALI branch is built), and `analyser_document` (real if the optional
    document mode is built), plus the end-to-end check with a real third-party
    MCP client (e.g. Claude Desktop) answering real questions correctly
- [x] 8. **Reasoning agent** - the orchestration graph (routing, search,
  drafting, verification) with a bounded cross-reference-following loop,
  durable state, structured and schema-validated output, and code-level
  rejection of any unsourced claim
  - [x] 8a. **Agent foundations and fixed-chain baseline** - relocate the
    tool logic from `packages/mcp` into `packages/agent` (so `mcp` becomes
    the thin transport wrapper `coding-standards.md` already documents it
    as), add citation-building from retrieved chunks, and a single-node
    LangGraph.js graph producing a schema-validated `ReponseStructuree` -
    no routing, cross-reference loop, or verification yet. Also the fixed,
    non-agentic pipeline item 13 needs for its comparison write-up.
  - [x] 8b. **Routing node** - wire `router_question` as the graph's entry
    node, feeding its chosen codes into the search step
  - [x] 8c. **Bounded cross-reference-following loop** - follow `renvois`
    for supplementary texts after the first draft, bounded iteration count,
    redraft with newly resolved texts folded in
  - [x] 8d. **Verification and abstention** - code-level rejection of any
    citation not backed by an actually-retrieved or actually-resolved
    source, the abstention/escalade path, and the graph's stop criteria
- [x] 9. **Agent quality evaluation** - run the full question set through the
  agent and measure routing accuracy, cross-reference coverage, tool
  selection accuracy, turns and cost per question, recovery after an
  injected tool failure, and correct-abstention rate; tune the loop's stop
  criteria against these numbers
  - Note (from 8a-8d, confirmed while sizing 9a on 2026-08-17): item 8 built
    a *fixed-chain* graph, not a dynamically tool-selecting one - node order
    (route -> search -> draft -> followRenvois) never changes per question;
    the only runtime decision the graph itself makes is whether the
    cross-reference loop keeps running. "Tool selection accuracy" is
    reinterpreted accordingly as "did the loop correctly decide to keep
    following renvois vs. stop", folded into 9b alongside cross-reference
    coverage rather than scored as a separate metric - there is no dynamic
    tool choice to measure independently.
  - [x] 9a. **Agent-level eval harness, routing accuracy, correct-abstention
    rate** - a new eval script that runs the actual reasoning-agent graph
    (not just the `Retriever`) end-to-end per question against live
    Supabase + Bedrock, then scores whether the router chose the expected
    code(s) and whether `confiance` correctly abstained (or didn't)
  - [x] 9b. **Cross-reference coverage, loop-stop accuracy, turns and cost
    per question** - scores whether `followRenvois` actually pulled in the
    expected supplementary article for `renvoi_obligatoire` questions and
    whether the loop stopped/continued correctly, plus per-question LLM
    call count and token usage
  - [x] 9c. **Failure-injection recovery and stop-criteria tuning** - inject
    a broken retriever/model call for a subset of questions to confirm the
    graph still produces a valid abstention instead of crashing, then use
    9a-9c's combined numbers to decide whether `MAX_RENVOI_ITERATIONS` /
    `MAX_DRAFT_ATTEMPTS` (`packages/agent/src/graph.ts`) need retuning,
    documenting the decision either way; closes item 9
  - **Follow-up flagged 2026-08-17, wanted fairly soon (not deferred to
    post-MVP):** 9a's live run found the fixed chain never correctly abstains
    on a `fausse_premisse` question (0/3 - see `blueprint/history/features/
    09a-agent-eval-harness.md`'s Live verification result and 9c's own
    "Out of scope" section). This is a `buildDraftPrompt`/model-reasoning
    gap, not a stop-criteria or robustness issue, so 9c deliberately left it
    alone. Likely **doesn't** need a new LangChain node - `draft` already
    receives the question and the retrieved sources together in one prompt,
    so the more direct first fix is asking the model, in that same prompt,
    to check the question's premise against the sources before answering
    (mirrors how `confiance: 'abstention'` is already triggered when no
    source answers the question - a false premise is the same kind of "this
    doesn't actually apply" case). A dedicated verification node (a second,
    focused LLM call whose only job is checking the premise) is a valid
    fallback if prompt-only tuning proves unreliable, but costs one extra
    LLM call per question and more graph complexity - try the prompt route
    first. Candidate for `/fix` rather than a new build-plan item, since it's
    a correctness bug in already-built behavior, not a new capability.
- [ ] 10. **Historical versions, time travel, and abstention** - extend the
  corpus with full version history (in force / amended / repealed) for a
  subset of everyday codes, wire up the time-travel lookup and its date
  filtering, and calibrate the abstention threshold so the system declines
  out-of-scope questions instead of guessing
  - [ ] 10a. **Historical-version acquisition, scoping, and load** - re-check
    real DB size and pick (or narrow) the `palier: 'profondeur'` code
    subset, acquire a genuine full-version-history source for that subset
    (COLD only ever snapshots current in-force text - confirmed 2026-08-17
    in `to-article.ts` - so this needs a different source than 2a used),
    parse each past version into the existing `Article`/`Subdivision` shape,
    and load the extra rows into `articles`/`subdivisions` only, with no
    `chunks`/embeddings for historical rows
    - Note (from 4c, re-confirmed live 2026-08-17): 353 MB of Supabase's
      500 MB free-tier cap already used by the 5 demo codes with zero
      history rows; `chunks` (embeddings) is the dominant cost, not raw
      text - `code-general-des-impots` remains the heaviest of the 5
      (7 777 chunks, ~30 MB of vectors, roughly double the smallest code).
      Re-verify sizes again at the start of this step; dropping
      `code-general-des-impots` or narrowing further is the likely first
      move if space is tight even for text-only history rows.
  - [ ] 10b. **RLS time-travel predicate** - revise `article_visible()` so a
    past `app.date_reference` surfaces the version that was actually in
    force then (clearly labeled as no longer current) instead of
    unconditionally hiding `ABROGE` rows, with a migration and an RLS test
    proving both the current behavior (today's date still hides `ABROGE`)
    and the new behavior (a past date surfaces the version in force then)
    - Note (from 4c): `article_visible()` currently hides any `ABROGE` row
      unconditionally - a deliberate interim rule with no historical rows in
      the corpus yet. This sub-feature is what must revisit it. See 4c's
      spec/history for the exact predicate being replaced.
  - [ ] 10c. **Time-travel lookup wiring** - make the `version_a_la_date`
    tool (stubbed at 7d) real: a dated point-in-time lookup by
    `code_slug`/`article_num`/date returning the version in force then plus
    its neighboring versions, wired through the agent/API in place of the
    stub
  - [ ] 10d. **Abstention threshold calibration** - using the 9a-9c eval
    numbers, tune the confidence/abstention threshold so the system declines
    out-of-scope or under-evidenced questions rather than guessing, and
    document the chosen threshold and rationale
- [x] 11. **Public API** - endpoints for asking a question (streamed
  response), reading a trace, and reading an article, validated end-to-end
  against the shared schemas, with per-request and daily cost caps, rate
  limiting, and structured error handling; containerized and runnable
  standalone
  - [x] 11a. **NestJS foundations and streamed question endpoint** -
    bootstrap `packages/api` as a real NestJS app, wire `POST /question` to
    the existing reasoning-agent graph, stream the answer as it's produced,
    validate the final payload against `ReponseStructuree`, and expose a
    `GET /health` check
  - [x] 11b. **Trace and article read endpoints** - a minimal execution-trace
    record (routing decision, tool calls, timing) captured during a graph
    run and persisted keyed by `trace_id`, plus `GET /trace/:trace_id` and
    `GET /article/:article_identifier` read endpoints
  - [x] 11c. **Cost caps, rate limiting, structured errors** - per-request and
    daily cost caps with a circuit breaker, per-IP rate limiting, and
    consistent structured error responses across all three endpoints
  - [x] 11d. **Containerization and end-to-end validation** - Dockerfile,
    runnable standalone, and a smoke test hitting all three endpoints in the
    container
- [ ] 12. **Observability and infrastructure automation** - request tracing
  down to each tool and model call with cost and latency, the evaluation
  suite wired into CI as a blocking regression check, event-driven
  reindexing, and the Terraform config able to provision the stack from
  scratch
  - [x] 12a. **Per-tool and per-model-call tracing (cost, latency)** -
    extend the execution trace beyond today's one-summary-per-graph-node
    record (11b) to one entry per individual model call (route, each draft
    attempt) and per tool/DB call (search, followRenvois), each with its own
    duration and token usage
    - Note (found while sizing, 2026-08-17): 9b deliberately excluded the
      router's token usage from cost tracking ("draft carries the bulk of
      the cost, so excluding the router doesn't meaningfully skew the
      total" - `graph.ts`'s `addUsage` comment). This item's "each ... model
      call" wording revisits that exclusion for tracing (not for the
      `MAX_DAILY_TOKENS` cost cap itself, which can stay aggregate) - 12a
      must decide explicitly whether to start recording router usage too,
      not silently keep excluding it.
    - Note: "cost" in this codebase means token counts, not a dollar figure
      - `cost-guard.service.ts`'s cap is `MAX_DAILY_TOKENS`-based and there
      is no per-model $ pricing table anywhere in the repo. 12a should keep
      that convention (token usage per call) unless a $ estimate is
      explicitly wanted, which would need a new pricing table first.
  - [x] 12b. **Evaluation suite as a blocking CI regression check** - wire
    the `packages/eval` harness into CI as a check that fails the build on a
    quality regression against a stored baseline
    - Note: the harness makes real Supabase + Bedrock calls (cost and
      latency per run) - running it on every PR the way lint/typecheck/test
      already do may not be the right cadence. 12b should decide and
      document the trigger (every PR, only retrieval/agent-path changes, a
      schedule, manual dispatch) rather than default to "every push" by
      inertia.
  - [ ] 12c. **Event-driven reindexing on text updates** - when an article's
    source text changes, automatically recompute its chunk(s)/embedding(s)
    instead of requiring a manual full reload
  - [ ] 12d. **Terraform provisioning the stack from scratch** - extend
    `infra/` beyond today's provider-only skeleton (`providers.tf`,
    `variables.tf`, `versions.tf`) to define the real resources (containers
    for API/tool server/observability, database, secrets management) so
    `terraform apply` on a clean account stands up the whole stack
    - This sub-feature must stop before any real `terraform apply`,
      remote state setup, or cloud resource creation without a separate
      explicit approval in chat, same guardrail `/release` already follows
      for deploys - writing the `.tf` config itself is fine, applying it
      is not.
- [ ] 13. **Front end and reliability case study** - the question/answer
  screen with the unfolding reference graph, the time-travel view, and the
  agent-trace view; an end-to-end smoke test of the full question-to-answer
  path; and the published write-up of the measurement results (baseline vs.
  improvements, agent quality metrics, cost and latency, and a comparison
  against a simple fixed pipeline with no agentic loop)

## Post-MVP

- [ ] 14. **Item 8 deep-dive exploration** - turn the agent-reasoning
  walkthrough (`docs/private/REFERENCE-visite-guidee-item-8-agent.md`) into
  slides and/or an interactive case study demonstrating the index-based
  citation-grounding redesign and the audit-driven fix cycle - interview
  material, built once the rest of the project is further along

## Optional, not blocking

Cut first if time runs short, in this order: an automation workflow calling
the tool server, the "ask about an uploaded document" mode, the collective
bargaining agreement branch, the historical-version / time-travel layer (item
10, which also removes the time-travel screen). The evaluation dataset, the
agent quality metrics, and the fixed-pipeline comparison are never cut.

## Continuing after the initial build

This is a living roadmap, not a plan that freezes when the first release is
done. Keep completed items checked, then append new unchecked features as the
project grows. Optional milestone headings such as `## MVP` and `## Post-MVP`
keep a longer plan readable without changing how `/feature` finds the next
unchecked item.

Do not renumber completed features because their archived specs refer back to
those numbers. Continue with the next unused number. If a new feature
materially changes the product direction, users, data, stack, monetization,
UI/UX, or deployment, update the relevant part of `project-plan.md` too. Then
re-run `/overview` before spec'ing the feature.

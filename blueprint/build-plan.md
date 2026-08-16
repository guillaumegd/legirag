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
  - [ ] 6c. **Hybrid keyword + vector search, measured in isolation** - the
    existing, unchanged `SupabaseRetriever` (4d) re-run through the harness
    and compared against 6b to isolate hybrid fusion's own effect, holding
    the chunking method constant
  - [ ] 6d. **Re-ranking** - add a Cohere re-ranking step to
    `SupabaseRetriever`, scored through the harness and compared against 6c;
    the one sub-feature here that changes the production retriever
- [ ] 7. **Tool server** - a public server exposing search, cross-reference
  following, deterministic calculation, and the other agent tools, with
  versioned tool descriptions, working end-to-end with a third-party agent
  client
- [ ] 8. **Reasoning agent** - the orchestration graph (routing, search,
  drafting, verification) with a bounded cross-reference-following loop,
  durable state, structured and schema-validated output, and code-level
  rejection of any unsourced claim
- [ ] 9. **Agent quality evaluation** - run the full question set through the
  agent and measure routing accuracy, cross-reference coverage, tool
  selection accuracy, turns and cost per question, recovery after an
  injected tool failure, and correct-abstention rate; tune the loop's stop
  criteria against these numbers
- [ ] 10. **Historical versions, time travel, and abstention** - extend the
  corpus with full version history (in force / amended / repealed) for a
  subset of everyday codes, wire up the time-travel lookup and its date
  filtering, and calibrate the abstention threshold so the system declines
  out-of-scope questions instead of guessing
  - Note (from 4c): `article_visible()`'s Postgres RLS function currently
    hides any `ABROGE` row unconditionally, with no exception - a deliberate
    interim simplification since no historical/abrogated rows exist in the
    corpus yet. This item must revisit that rule so a `date_reference` in the
    past can surface the version that was actually in force then (with the
    answer clearly labeled as no longer current), instead of hiding it
    outright. See 4c's spec/history for the exact predicate.
  - Note (from 4c, checked 2026-08-16): DB size is a real constraint here,
    not a hypothetical one. The project is already at 353 MB of Supabase's
    500 MB free-tier cap (70%) with only the 5 demo codes and *zero* history
    rows - `chunks` (embeddings) is the dominant cost, not raw text. Of the 5
    demo codes, `code-general-des-impots` is the heaviest by a clear margin
    (7 777 of ~21 300 chunks, ~30 MB of vectors alone - roughly double the
    smallest code). Before or while adding history rows here, re-check real
    sizes and consider dropping `code-general-des-impots` (or narrowing the
    demo set further) rather than assuming the ~150-250 MB headroom 4b
    originally estimated is still accurate.
- [ ] 11. **Public API** - endpoints for asking a question (streamed
  response), reading a trace, and reading an article, validated end-to-end
  against the shared schemas, with per-request and daily cost caps, rate
  limiting, and structured error handling; containerized and runnable
  standalone
- [ ] 12. **Observability and infrastructure automation** - request tracing
  down to each tool and model call with cost and latency, the evaluation
  suite wired into CI as a blocking regression check, event-driven
  reindexing, and the Terraform config able to provision the stack from
  scratch
- [ ] 13. **Front end and reliability case study** - the question/answer
  screen with the unfolding reference graph, the time-travel view, and the
  agent-trace view; an end-to-end smoke test of the full question-to-answer
  path; and the published write-up of the measurement results (baseline vs.
  improvements, agent quality metrics, cost and latency, and a comparison
  against a simple fixed pipeline with no agentic loop)

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

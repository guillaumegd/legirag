# legirag - Project Overview

> A French legal AI agent: ask a legal question in plain French, and it identifies
> the relevant code(s), unfolds the graph of cross-references between articles and
> codes, dates each text, cites the precise article, and states explicitly what it
> cannot cover.

## Problem

A French legal question is easy to ask but hard to answer reliably, for three
structural reasons: the answer is scattered across cross-referenced articles
(sometimes in a different code), the answer has a date (texts change, and a
stale citation looks identical to a current one), and general-purpose AI
assistants answer with false confidence - concluding where they should only
locate, and never disclosing what they didn't check. Legirag identifies the
relevant code(s), recursively unfolds the cross-reference graph, dates every
text it cites, cites the exact article and subdivision, and explicitly states
what it does not cover.

## Users

- **General public** - individuals, small business owners, students,
  journalists with a precise legal question and no time or expertise to
  navigate official codes. Need an answer in plain French, immediate, sourced,
  and one click from the official text.
- **Developers and integrators** - add reliable legal search to their own
  tools through the public MCP server (third-party agents, automation
  workflows).
- **Advanced users** - audit the agent's reasoning (tool trace, time-travel
  view of a text's past versions) to verify an answer themselves.

No accounts or access tiers are planned for v1: the product is anonymous and
public, traces are addressed by `trace_id` rather than scoped to a user.

## Features

Build order below follows the dependency chain: shared contracts before data,
data before search, search before the agent, the agent before the API, the API
before the front end. The reasoning agent (6) is the headline feature - routing,
cross-reference unfolding, and abstention are what make an answer trustworthy
rather than merely plausible.

1. **Repo foundations and shared contracts** - finish the shared package
   (`ReponseStructuree`, `Citation`, article/subdivision/chunk types), confirm
   env-var-driven model wiring, `.env.example`, and green base CI
2. **Legal corpus in the database** - ingest France's open-data codes in
   force, parse hierarchical path and subdivisions, load into Postgres
3. **Cross-reference graph** - extract references between articles (simple,
   enumeration, range, cross-code), measured against a hand-annotated sample
4. **Search index and access-control policies** - contextual chunking, vector
   embeddings, keyword index, hybrid `Retriever`, and RLS policies enforcing
   state/date/code/agreement-ID filtering in the database itself
5. **Evaluation question set and harness** - annotated questions with expected
   answers plus a scoring harness, built before search tuning starts
6. **Retrieval quality improvements** - naive baseline, then contextual
   chunking, hybrid search, and re-ranking, each measured against the harness
   in isolation
7. **Tool server** - public MCP server exposing search, cross-reference
   following, deterministic calculation, and other agent tools, versioned
8. **Reasoning agent** - orchestration graph (routing, search, drafting,
   verification) with a bounded cross-reference loop, structured output,
   code-level rejection of unsourced claims
9. **Agent quality evaluation** - routing accuracy, cross-reference coverage,
   tool selection, cost/latency, failure recovery, correct-abstention rate
10. **Historical versions, time travel, and abstention** - full version
    history for a subset of everyday codes, time-travel date filtering,
    calibrated abstention threshold
11. **Public API** - question (streamed), trace, and article endpoints, cost
    caps, rate limiting, structured errors, containerized
12. **Observability and infrastructure automation** - per-call tracing, the
    evaluation suite as a blocking CI regression check, event-driven
    reindexing, Terraform provisioning the stack from scratch
13. **Front end and reliability case study** - question/answer screen,
    time-travel view, agent-trace view, end-to-end smoke test, published
    measurement write-up

**Optional, not blocking (cut first, in this order):** automation workflow
calling the tool server, "ask about an uploaded document" mode, collective
bargaining agreement branch, historical-version/time-travel layer (10). The
evaluation dataset, agent quality metrics, and fixed-pipeline comparison are
never cut.

## Data model

Core shapes are already locked in `packages/shared/src/types.ts` and
`schema.ts` - later features depend on these as-is.

### Article

- `articleIdentifier` (string) - LEGIARTI id
- `articleNum` (string) - e.g. `L343-11`
- `code` (string) - full code title
- `codeSlug` (string) - e.g. `code-de-la-route`
- `etat` (`Etat`: `VIGUEUR` | `MODIFIE` | `ABROGE`)
- `dateDebut`, `dateFin` (date) - `dateFin` is `2999-01-01` when still in force
- `sectionPath` (string[]) - hierarchy segments (part/book/title/chapter/section)
- `contenuText`, `contenuMarkdown?` (string)
- `palier` (`largeur` | `profondeur`) - breadth vs. depth-of-history indexing tier
- `idcc?` (string) - collective bargaining agreement id, null except KALI-sourced
- `updatedAt?` (string)

### Subdivision

- `id` (number), `articleIdentifier` (string, -> Article)
- `label` (string) - e.g. `"I, 1°"`
- `ordre` (number), `contenu` (string)

### Renvoi (cross-reference)

- `id` (number), `sourceArticle` (string, -> Article)
- `cibleArticleNum` (string) - target as written, e.g. `"L. 631-3"`
- `cibleCode?` (string) - undefined means current code
- `cibleArticleId?` (string) - undefined until resolved
- `cibleSubdivision?` (string), `forme` (`simple` | `enumeration` | `plage`)
- `interCode` (boolean) - crosses into a different code
- `offsetDebut?`, `offsetFin?` (number), `resolu` (boolean)

### Chunk (search-indexed segment)

- `id` (number), `articleIdentifier` (string, -> Article), `subdivisionLabel?` (string)
- `contenu` (string) - text prefixed with hierarchical context
- `embedding?` (number[]) - `vector(1024)`, Cohere embed-v4

### ReponseStructuree (the agent's structured answer)

Locked contract, enforced in code, not just prompted for - a domain rule
(coding-standards.md).

- `verdict` (string), `regle_principale` (`Citation`)
- `textes_complementaires` (`Citation & { motif_presence }[]`) - every
  supplementary text carries why it's present (`renvoi_explicite` |
  `exception` | `cas_particulier` | `condition`)
- `hors_perimetre` (string[], never empty) - what this answer does not cover
- `confiance` (`elevee` | `moyenne` | `abstention`)
- `escalade?` (`{ motif, interlocuteur }`) - required whenever `confiance` is
  `abstention`
- `date_reference` (date), `trace_id` (string)

`Citation` itself: `article_identifier`, `subdivision`, `code`, `texte_exact`,
`date_debut`, `etat`, `url_legifrance`.

### Evaluation question set

> TODO - not yet typed in code. Per build-plan item 5: annotated questions
> (routine lookup, mandatory cross-reference, time-sensitive, out-of-scope,
> false premise) with expected answers, used by the scoring harness.

### Execution trace

> TODO - not yet typed in code. Per project-plan §4: per-question record of
> tool calls, routing decisions, cost, and latency, keyed by `trace_id` and
> inspectable by any holder of that id (no user scoping planned).

### Collective bargaining agreement (optional branch)

Filter dimension already wired at the type level (`idcc` on `Article` and on
`RequeteRecherche`, the `Retriever.search` query shape) but the KALI
ingestion itself is not built; first in line to cut if time runs short.

Note (from 4c, 2026-08-16): the RLS `article_visible()` function originally
also filtered on an `app.idcc` session variable, but it was removed during
4c's implementation - no KALI data exists yet (`idcc` is `null` on every
article today), so wiring a live DB filter for it was speculative. Whichever
feature actually builds the KALI branch must add that RLS clause back (a
`create or replace function` migration, same shape as 4c's
`add_search_rls.sql`/`remove_idcc_rls_filter.sql`) alongside the ingestion
work - the DB must not trust application code alone to keep general-law and
sector-specific answers apart.

## Tech stack

- **Front end** - Next.js, DSFR-inspired UI (accessibility rigor and
  institutional component conventions, not the DSFR's reserved visual
  identity - legirag isn't an official `.gouv.fr` service), answer streamed
  as produced
- **API** - NestJS: input validation, rejects any unsourced claim, rate
  limiting, per-request cost cap
- **Agent** - LangGraph.js state graph (routing, search, drafting,
  verification), bounded cross-reference-following loop
- **Tools** - public MCP server exposing search, cross-reference following,
  deterministic calculation, and dated-version resolution to third-party agents
- **Language models** - Amazon Bedrock, selected via env var, never hardcoded
  (see `ModelProvider`, `requireEnv` in `packages/shared`)
- **Data** - Postgres with a vector extension and row-level security; state/
  date/code/branch filtering enforced in the database, not just the query
- **Search** - hybrid keyword + vector, with re-ranking (Cohere)
- **Observability** - per-request, per-tool, per-model-call tracing (cost,
  latency), inspectable from the agent-trace screen
- **Evaluation** - a dedicated harness replaying annotated questions, blocking
  any quality regression before a change ships
- **Infrastructure** - Terraform-provisioned (`infra/`), event-driven
  ingestion with automatic reindexing on text updates
- **Monorepo** - pnpm workspaces, strict TypeScript, independent packages for
  front end, API, agent, data access, ingestion, and the tool server

## Monetization

Not in v1. The project runs on open data and aims to be a free public-interest
service. The evaluation question set and measurement results are published
openly. Funding avenues (higher-volume professional access, partnerships)
could be explored later if usage justifies it, but none are committed to now.

## UI/UX

Understated and institutional, DSFR-inspired without reusing the DSFR's
reserved visual identity (Marianne blue, Marianne typeface, state branding are
`.gouv.fr`-only), meant to be usable without instructions. No route paths are
named yet in the plans.

- **Question and answer screen** - single centered input with example
  questions; agent activity shown in plain language while working (searching,
  reading, following a cross-reference, verifying). The answer unfolds in
  three blocks: the main rule (citation + legal state), the graph of
  supplementary texts (cross-code references visually distinct from internal
  ones), and the always-visible, never-collapsed out-of-scope panel.
- **Time-travel view** - a draggable timeline: not-yet-in-force articles
  disappear, repealed articles show struck through with their repeal date.
  Available only where full history is indexed, and says so when it isn't.
- **Agent trace** - chronological technical view: initial plan, every tool
  call (duration, result), failures and recovery, routing decisions, and the
  stop criterion that triggered. Reachable from the answer, never forced.

## Deployment

- **Front end (Next.js)** - static hosting or Vercel (undecided, see Open
  questions)
- **API, tool server, observability** - containers provisioned by Terraform,
  dedicated secrets management
- **Data ingestion** - asynchronous, event-driven, automatic reindexing on
  text updates
- **Database** - managed Postgres, EU region
- **Env vars** (see `.env.example`) - `MODEL_VOLUME`, `MODEL_ESCALADE` (Bedrock
  model ids), `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`,
  `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`,
  `DATABASE_URL`, `COHERE_API_KEY`
- **Guardrails required before any public API exposure** - per-request cost
  cap, daily cost cap with circuit breaker, per-IP rate limiting
- **Health check** - exposed by the API
- **CI** - lint, typecheck, unit tests on every contribution (already wired,
  `.github/workflows/ci.yml`); the evaluation suite is planned as an
  additional blocking check (build-plan item 12), not yet wired

> `/release` (Render or Vercel) covers the front end only. API, tool server,
> and data infra stay Terraform-driven, outside its scope.

## Open questions

- **Direct "what does article X say" questions falsely abstain when the
  named article isn't surfaced by semantic search** - observed live
  2026-08-18 with two real questions: "que dit l'Article
  LEGIARTI000030061736?" and "que dit l'Article 777 du Code général des
  impôts?" - both returned `confiance: abstention` with "l'article n'est pas
  présent dans les sources récupérées", even though the article may well
  exist in the corpus (`code-general-des-impots` is one of the 5 ingested
  demo codes per the note below). The agent's only tools (item 7:
  `chercher_droit`, `suivre_renvoi`, `router_question`, `calculer`,
  `demander_a_l_humain`) all route through semantic/hybrid retrieval or
  cross-reference following - there is no direct "fetch article by
  identifier or article number" tool the agent can call when the user
  already names the exact article, unlike the front end's own
  `GET /article/:articleIdentifier` (used only by the Step 6 in-place
  expander, not exposed to the agent). Needs investigation before deciding
  the fix: confirm whether these two articles are actually in the indexed
  `chunks` table first (retrieval miss vs. genuine ingestion gap), then
  likely add a direct-lookup tool/path for exact-article questions as a
  follow-up to item 7 or a 6d-adjacent retrieval fix.
- **Item 10 must revisit 4c's blanket `ABROGE` block** - the RLS
  `article_visible()` function hides any `ABROGE` row unconditionally today
  (no historical rows exist yet, so this is a safe interim default, not a
  final design). Time travel to a past date should surface the version that
  was actually in force then instead of hiding it - resolve this before or
  while spec'ing item 10. See build-plan.md's note under item 10 and 4c's
  archived spec for the exact predicate to change.
- **Item 10's database size headroom is tighter than 4b assumed** - checked
  live 2026-08-16: 353 MB of Supabase's 500 MB free-tier cap already used by
  the 5 demo codes with zero history rows, `chunks` (embeddings) dominating
  the cost. `code-general-des-impots` is the heaviest of the 5
  (7 777/~21 300 chunks, ~30 MB of vectors). Re-check real sizes before
  adding history rows in item 10; dropping `code-general-des-impots` or
  narrowing the demo set further is the likely first move if space is tight.
- **Front-end host undecided** - project-plan §8 leaves static hosting vs.
  Vercel open; resolve before `/release` is run for the front end.
- **Health check path** not named yet - fine to leave until the API package
  (build-plan item 11) is spec'd.
- **No route paths named** in the plans - `/feature` can define them when it
  specs item 13 (front end).
- **AWS account-level billing quota still needs to be set manually** - item
  11c built app-level cost guardrails (per-request question-length bound,
  daily token circuit breaker, `packages/api/src/question/cost-guard.service.ts`),
  but those only bound spend *within* the app. There is no hard cap at the
  AWS account level yet (Budgets alert + a spend-limiting action, or an
  account-level Service Quota on Bedrock throughput) - the user still needs
  to configure this directly in the AWS console/CLI as defense in depth, in
  case the app-level guard is ever bypassed or misconfigured. Not something
  `/implement` can do from this repo - it requires AWS account access
  outside the codebase.
- **Large build-plan items** - items 4, 6, 11, 12, and 13 each bundle several
  sub-outcomes (e.g. item 6's "each measured in isolation" naive baseline /
  chunking / hybrid / re-ranking sequence). Not a plan-shape defect - `/feature`
  is expected to split these into sub-items (4a, 4b, ...) when it specs them.

# legirag — Legirag

A French legal AI agent: ask a legal question in plain French, and it identifies
the relevant code(s), unfolds the graph of cross-references between articles and
codes, dates each text, cites the precise article, and states explicitly what it
cannot cover. Corpus: the 73 French legal codes in force, open data.

This project uses the [AI Coding Blueprint](blueprint/README.md) workflow.

## Commands

- Build: `pnpm build`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`

`web` (Next.js, DSFR-inspired UI) has a real dev server now - the question/answer
screen and the agent-trace view - and `api` (NestJS) and `mcp` are built and deployed.
See `AGENTS.md`'s Commands section for the full list, including the Playwright
end-to-end smoke test and the mocked dev mode
(`LEGIRAG_MOCK_BACKEND=true pnpm --filter @legirag/web dev`) that runs `web`
standalone with fixture responses, at zero cost and with no other package or
credentials needed.

## Reliability

See [`docs/reliability-case-study.md`](docs/reliability-case-study.md) for how
this project measures itself: retrieval quality baseline vs. improvements, agent
quality metrics (routing, cross-reference coverage, abstention), cost and latency,
and what the full agentic loop adds over a minimal search-and-draft pipeline.

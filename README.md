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

No dev server yet — the `web` package (Next.js, DSFR-inspired UI) and `api` package (NestJS)
are still stubs, scheduled later in the roadmap.

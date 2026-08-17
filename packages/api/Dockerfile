# syntax=docker/dockerfile:1
# Built with the repo root as context (pnpm workspace install needs the
# whole workspace even though only @legirag/api ships) - see AGENTS.md
# Commands. Build: docker build -f packages/api/Dockerfile -t legirag-api .

FROM node:20-slim AS build
WORKDIR /repo
# Pinned to the version CI and local dev actually use (pnpm-lock.yaml
# lockfileVersion, .github/workflows/ci.yml) - a bare `corepack enable`
# fetches the latest pnpm, which requires Node >=22.13 and fails outright
# on this image's Node 20 (confirmed live).
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/retrieval/package.json packages/retrieval/package.json
COPY packages/agent/package.json packages/agent/package.json
COPY packages/api/package.json packages/api/package.json
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared packages/shared
COPY packages/retrieval packages/retrieval
COPY packages/agent packages/agent
COPY packages/api packages/api

# ... includes @legirag/api's own workspace dependencies (shared/retrieval/
# agent) - skips ingest/eval/mcp/web, which POST /question never imports.
RUN pnpm --filter @legirag/api... build
RUN pnpm --filter @legirag/api deploy --prod /deploy

FROM node:20-slim AS runtime
WORKDIR /app
COPY --from=build /deploy .
EXPOSE 3000
CMD ["node", "dist/main.js"]

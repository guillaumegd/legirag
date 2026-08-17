# syntax=docker/dockerfile:1
# Built with the repo root as context (pnpm workspace install needs the
# whole workspace even though only @legirag/mcp ships) - see AGENTS.md
# Commands. Build: docker build -f packages/mcp/Dockerfile -t legirag-mcp .

# Item 12d (révisé Lambda) : couche AWS copiée telle quelle depuis son image
# publique - le serveur MCP tourne en Lambda (image conteneur) sans
# réécriture en handler, voir infra/lambda.tf et current-feature.md.
FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 AS lambda-adapter

FROM node:20-slim AS build
WORKDIR /repo
# Pinned to the version CI and local dev actually use (pnpm-lock.yaml
# lockfileVersion, .github/workflows/ci.yml) - a bare `corepack enable`
# fetches the latest pnpm, which requires Node >=22.13 and fails outright
# on this image's Node 20 (confirmed live, see packages/api/Dockerfile).
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/retrieval/package.json packages/retrieval/package.json
COPY packages/agent/package.json packages/agent/package.json
COPY packages/mcp/package.json packages/mcp/package.json
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared packages/shared
COPY packages/retrieval packages/retrieval
COPY packages/agent packages/agent
COPY packages/mcp packages/mcp

# ... includes @legirag/mcp's own workspace dependencies (shared/retrieval/
# agent) - skips ingest/eval/api/web, which the MCP server never imports.
RUN pnpm --filter @legirag/mcp... build
RUN pnpm --filter @legirag/mcp deploy --prod /deploy

FROM node:20-slim AS runtime
WORKDIR /app
COPY --from=build /deploy .
# Extension Lambda : auto-découverte par le runtime dans /opt/extensions -
# le Web Adapter fait le pont entre l'API d'invocation Lambda et ce serveur
# HTTP inchangé.
COPY --from=lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter
# Amorçage (lecture du secret app-env via le SDK Secrets Manager, voir le
# commentaire de lambda-entrypoint.mjs) - package.json dédié, isolé du
# workspace pnpm. npm ci contre un lockfile committé (F-07, /audit) plutôt
# que npm install : même garantie de reproductibilité que pnpm
# install --frozen-lockfile deux étapes plus haut.
COPY infra/docker/package.json infra/docker/package-lock.json /lambda-entrypoint/
COPY infra/docker/lambda-entrypoint.mjs /lambda-entrypoint/lambda-entrypoint.mjs
RUN cd /lambda-entrypoint && npm ci --omit=dev
EXPOSE 3333
ENTRYPOINT ["node", "/lambda-entrypoint/lambda-entrypoint.mjs"]
CMD ["node", "dist/index.js"]

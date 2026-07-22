# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.13.0

FROM node:${NODE_VERSION}-bookworm-slim AS dependencies

WORKDIR /app
ENV CI=true

# Added by mnswifi
RUN apt-get update && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

FROM dependencies AS api-tools

COPY apps/api apps/api
COPY docker docker

# Added by mnswifi
RUN npm run prisma:generate -w @muisbakery/api

FROM api-tools AS api-build

RUN npm run build -w @muisbakery/api
RUN npm prune --omit=dev

FROM node:${NODE_VERSION}-bookworm-slim AS api

WORKDIR /app
ENV API_PORT=3001

COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
COPY --from=api-build /app/apps/api/certs ./certs

USER node
EXPOSE 3001

CMD ["node", "apps/api/dist/src/main.js"]

FROM dependencies AS web-build

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY apps/web apps/web

RUN npm run build -w @muisbakery/web
RUN npm prune --omit=dev

FROM node:${NODE_VERSION}-bookworm-slim AS web

WORKDIR /app
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=web-build /app/node_modules ./node_modules
COPY --chown=node:node --from=web-build /app/apps/web/.next ./apps/web/.next
COPY --chown=node:node --from=web-build /app/apps/web/public ./apps/web/public
COPY --chown=node:node --from=web-build /app/apps/web/next.config.ts ./apps/web/next.config.ts

USER node
EXPOSE 3000

CMD ["node", "node_modules/next/dist/bin/next", "start", "apps/web", "--hostname", "0.0.0.0", "--port", "3000"]

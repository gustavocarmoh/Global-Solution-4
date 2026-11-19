# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app

# Manifestos de todos os workspaces: o package-lock.json da raiz cobre o monorepo inteiro
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace=@cidade-em-foco/shared --workspace=@cidade-em-foco/api

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@cidade-em-foco/shared \
 && npm run build --workspace=@cidade-em-foco/api \
 && npm prune --omit=dev --workspace=@cidade-em-foco/shared --workspace=@cidade-em-foco/api

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist

WORKDIR /app/apps/api
RUN mkdir -p uploads && chown -R node:node /app/apps/api
USER node
EXPOSE 3000

# Aplica migrations pendentes, popula o banco se estiver vazio e sobe a API
CMD ["sh", "-c", "node dist/database/migrations/run-migrations.js && node dist/database/seeds/run-seed.js && node dist/main.js"]

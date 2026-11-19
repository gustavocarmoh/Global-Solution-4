# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace=@cidade-em-foco/shared --workspace=@cidade-em-foco/web

COPY packages/shared packages/shared
COPY apps/web apps/web

# A URL da API é embutida no bundle em tempo de build (é o endereço visto pelo navegador)
ARG VITE_API_URL=http://localhost:3000/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace=@cidade-em-foco/shared \
 && npm run build --workspace=@cidade-em-foco/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

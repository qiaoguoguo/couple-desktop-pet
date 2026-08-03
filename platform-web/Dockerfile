FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY platform-api/package.json platform-api/package.json
COPY platform-web/package.json platform-web/package.json
RUN pnpm install --frozen-lockfile --filter couple-pet-platform-web...

COPY shared shared
COPY platform-web platform-web
RUN pnpm --dir platform-web build

FROM nginx:1.29-alpine

COPY platform-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/platform-web/dist /usr/share/nginx/html

EXPOSE 80

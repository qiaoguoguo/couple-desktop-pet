FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY platform-api/package.json platform-api/package.json
COPY platform-web/package.json platform-web/package.json
RUN pnpm install --frozen-lockfile --filter couple-pet-platform-api...

COPY shared shared
COPY platform-api platform-api
RUN pnpm --dir platform-api build
RUN mkdir -p platform-api/dist/platform-api/src/db \
  && cp platform-api/src/db/schema.sql platform-api/dist/platform-api/src/db/schema.sql

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY platform-api/package.json platform-api/package.json
RUN pnpm install --frozen-lockfile --prod --filter couple-pet-platform-api...

COPY --from=build /app/platform-api/dist platform-api/dist

EXPOSE 3000
CMD ["node", "platform-api/dist/platform-api/src/index.js"]

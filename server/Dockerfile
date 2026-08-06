FROM node:22-alpine AS base

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.16.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json
COPY platform-api/package.json ./platform-api/package.json
COPY platform-web/package.json ./platform-web/package.json
RUN pnpm install --frozen-lockfile --filter couple-desktop-pet-relay...

COPY shared ./shared
COPY server ./server
RUN pnpm --dir server build

ENV NODE_ENV=production
ENV RELAY_HOST=0.0.0.0
ENV RELAY_PORT=8787
EXPOSE 8787

CMD ["pnpm", "--dir", "server", "start"]

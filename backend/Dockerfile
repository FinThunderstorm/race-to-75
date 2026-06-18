# Build context is the repository root (workspaces need the root lockfile).
ARG NODE_VERSION=24.16.0

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci --workspace backend --include-workspace-root
COPY backend ./backend
RUN npm run build --workspace backend

FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci --omit=dev --workspace backend --include-workspace-root
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/migrations ./backend/migrations
COPY backend/scripts ./backend/scripts
EXPOSE 7500
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 \
  CMD wget -qO- http://127.0.0.1:7500/ping || exit 1
WORKDIR /app/backend
CMD ["node", "dist/server.js"]

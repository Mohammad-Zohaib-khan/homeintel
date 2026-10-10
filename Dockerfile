# syntax=docker/dockerfile:1
# Single-origin image: API + built SPA (SERVE_CLIENT=1). Non-root, production deps only.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production SERVE_CLIENT=1 PORT=5000
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/client/dist ./client/dist
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1
CMD ["node", "server/src/server.js"]

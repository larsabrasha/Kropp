# Build:  docker build -t kropp .
#
# One image, one process: the server brings the database schema up to date, then serves the API
# and the app (see server/index.ts).

# The build stage runs on the builder's own platform: its output is plain JavaScript, the same for
# every architecture, so only the final stage differs per architecture and nothing is emulated.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The server is bundled into one file with its dependencies (scripts/buildServer.mjs), so the
# image needs neither node_modules nor TypeScript at runtime.
RUN npm run build && npm run build:server

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=./dist \
    NODE_OPTIONS=--enable-source-maps
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "dist-server/index.mjs"]

# syntax=docker/dockerfile:1
#
# Production image: API server + built dashboard + widget.js in one container.
# Built by GitHub Actions (.github/workflows/ci-cd.yml) and run by deploy/docker-compose.yml.

# ── Stage 1: install all dependencies and build widget, server and dashboard ──
FROM node:24-slim AS build
WORKDIR /app
# The embedded test MongoDB and browser downloads are only needed for local dev/tests.
ENV MONGOMS_DISABLE_POSTINSTALL=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    npm_config_audit=false \
    npm_config_fund=false
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY widget/package.json widget/
RUN npm ci
COPY . .
# VITE_API_URL stays empty: the dashboard calls the API on the same origin.
RUN npm run build

# ── Stage 2: runtime — only the server's production dependencies + build output ──
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    SERVE_CLIENT=true \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY widget/package.json widget/
RUN npm ci --omit=dev --workspace server --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/widget/dist widget/dist
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --start-interval=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/server.js"]

# syntax=docker/dockerfile:1.7

# ---- deps ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 needs a C++ toolchain at install time
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    READAURA_DB_PATH=/data/readaura.db

# Persist SQLite + uploaded files on a single mounted volume at /data.
# The app reads/writes from process.cwd()/data/reports/<user>, so symlink
# /app/data → /data to keep both under the volume.
RUN mkdir -p /data \
  && ln -s /data /app/data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
VOLUME ["/data"]
CMD ["npm", "run", "start"]

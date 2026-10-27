FROM oven/bun:1 AS builder

WORKDIR /app

# Accept VITE_ vars at build time so they get baked into the frontend bundle
ARG VITE_WAGER_CONTRACT
ENV VITE_WAGER_CONTRACT=$VITE_WAGER_CONTRACT

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build frontend (VITE_WAGER_CONTRACT is baked in here)
# Increase Node memory limit for large dependency trees
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN bun run build

# ── Production image ─────────────────────────────────────────────────────────
FROM oven/bun:1

WORKDIR /app

# Only copy what is needed to run
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server/ ./server/
COPY --from=builder /app/dist ./dist/

# HF Spaces requires port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["bun", "run", "./server/index.ts"]

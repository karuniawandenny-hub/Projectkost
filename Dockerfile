# =========================================================================
#  Dockerfile produksi untuk Kelola Kos.
#  Base image: node:20-bookworm — Debian Bookworm FULL (bukan slim).
#  Alasan: Next.js 14.2.35 SWC binary butuh glibc symbols lengkap
#  (__register_atfork dll) yang tidak ada di alpine + libc6-compat,
#  dan kadang missing di slim variants. Full Debian aman.
#  Build cache bust: v3
# =========================================================================

# ----- Stage 1: install deps + build -----
FROM node:20-bookworm AS builder
WORKDIR /app

# OpenSSL sudah ada di base bookworm, tapi kita pastikan via apt.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy schema Prisma SEBELUM npm ci karena package.json punya
# postinstall script 'prisma generate' yang butuh schema.
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ----- Stage 2: runner -----
FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV DATA_DIR=/data

# Salin output standalone Next.js.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma engine + seed file (perlu di runtime untuk db push & seed).
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
# tsx untuk run seed; bcryptjs untuk seed hashing.
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

COPY scripts/start.sh ./start.sh
RUN chmod +x ./start.sh

# Buat folder /data sebagai mount point untuk persistent storage.
# Volume di-mount oleh platform hosting (Railway/Render/dll).
RUN mkdir -p /data

EXPOSE 3000

CMD ["./start.sh"]

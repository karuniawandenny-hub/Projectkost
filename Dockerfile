# =========================================================================
#  Dockerfile produksi untuk Kelola Kos — versi defensif.
#
#  Strategi:
#  - Base: node:20-bookworm (Debian Bookworm full, glibc lengkap)
#  - npm install (bukan npm ci): biarkan npm pilih platform binary yang
#    tepat (mis. @next/swc-linux-x64-gnu untuk x86_64 linux glibc).
#  - --include=optional: pastikan optional deps (SWC binary varian
#    platform) ikut ter-install.
#  - Cache bust marker: v5
# =========================================================================

# ----- Stage 1: builder -----
FROM node:20-bookworm AS builder
WORKDIR /app

# Dependencies system yang dibutuhkan Prisma + TLS.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy schema Prisma SEBELUM npm install karena postinstall hook
# menjalankan 'prisma generate'.
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# npm install (bukan ci) supaya platform-specific optional deps —
# terutama @next/swc-linux-x64-gnu yang penting untuk Next.js build —
# selalu di-resolve & install sesuai OS container.
# --include=optional: paksa install semua optional deps (defaultnya).
# --no-audit & --no-fund: kurangi noise di log.
RUN npm install --include=optional --no-audit --no-fund

# Verifikasi SWC binary terinstall — fail fast kalau tidak.
RUN ls -lh node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node \
    || (echo "ERROR: SWC binary tidak terinstall" && exit 1)

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

# Salin output standalone Next.js (sudah berisi minimal deps).
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma + tsx untuk seed runtime.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

COPY scripts/start.sh ./start.sh
RUN chmod +x ./start.sh

# Buat folder /data sebagai mount point untuk persistent storage.
RUN mkdir -p /data

EXPOSE 3000

CMD ["./start.sh"]

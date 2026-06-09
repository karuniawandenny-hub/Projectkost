# =========================================================================
#  Dockerfile produksi untuk Kelola Kos — versi defensif.
#
#  Strategi:
#  - Base: node:20-bookworm (Debian Bookworm full, glibc lengkap)
#  - npm install (bukan npm ci): biarkan npm pilih platform binary yang
#    tepat (mis. @next/swc-linux-x64-gnu untuk x86_64 linux glibc).
#  - --include=optional: pastikan optional deps (SWC binary varian
#    platform) ikut ter-install.
#  - Cache bust marker: v6 (global prisma/tsx di runner)
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

# -------------------------------------------------------------------------
# Build-time public env. Next.js meng-INLINE semua NEXT_PUBLIC_* ke dalam
# bundle browser saat `next build` — jadi variabel ini WAJIB ada di sini,
# bukan hanya di runtime. Tanpa ini, VAPID_PUBLIC_KEY = undefined di klien
# dan tombol "Aktifkan notifikasi" jadi nonaktif (state "unsupported").
#
# Railway otomatis meneruskan service variable sebagai Docker build arg,
# sehingga `ARG` dengan nama sama akan terisi dari variabel Railway.
# -------------------------------------------------------------------------
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY}

ENV NEXT_TELEMETRY_DISABLED=1

# Peringatan (bukan fatal): kalau VAPID public key tidak ikut ter-build,
# tombol "Aktifkan notifikasi" akan nonaktif di browser. Sengaja TIDAK
# menggagalkan build supaya sisa situs tetap bisa deploy; diagnostik di
# halaman Profil akan menunjukkan kunci hilang bila ini terjadi.
RUN test -n "$NEXT_PUBLIC_VAPID_PUBLIC_KEY" \
    || echo "WARNING: NEXT_PUBLIC_VAPID_PUBLIC_KEY kosong saat build — Web Push akan nonaktif di klien. Set di Railway -> Variables lalu redeploy."

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
# Penting: Next.js standalone pakai HOSTNAME sebagai bind address.
# Default Railway set HOSTNAME=<container-id>, yang bikin server cuma
# listen di hostname spesifik & healthcheck Railway gagal.
# Paksa ke 0.0.0.0 supaya listen di semua interface.
ENV HOSTNAME=0.0.0.0

# Salin output standalone Next.js (sudah berisi minimal deps).
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma + tsx untuk seed runtime.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# CRITICAL: install `prisma` & `tsx` SEBAGAI GLOBAL BIN supaya muncul di
# $PATH. Sebelumnya kita cuma copy folder `node_modules/prisma/` tanpa
# `node_modules/.bin/prisma` — npx tidak ketemu binary-nya & seed gagal.
# Global install bikin runtime db push + seed pasti jalan.
RUN npm install -g prisma@5.22.0 tsx@4.19.2 --no-audit --no-fund

COPY scripts/start.sh ./start.sh
RUN chmod +x ./start.sh

# Buat folder /data sebagai mount point untuk persistent storage.
RUN mkdir -p /data

EXPOSE 3000

CMD ["./start.sh"]

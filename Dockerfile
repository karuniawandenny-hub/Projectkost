# =========================================================================
#  Dockerfile produksi untuk Kelola Kos.
#  Build standalone Next.js + SQLite (volume) + Prisma + script startup.
#
#  Bisa di-deploy ke: Railway, Render, Fly.io, atau VPS apapun yang
#  support Docker. Pastikan mount volume ke /data (1 GB cukup untuk
#  ratusan kos & ribuan foto).
# =========================================================================

# ----- Stage 1: install deps + build -----
FROM node:20-alpine AS builder
WORKDIR /app

# OpenSSL dibutuhkan Prisma di alpine.
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ----- Stage 2: runner -----
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

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

# Buat volume untuk SQLite + uploads.
VOLUME ["/data"]

EXPOSE 3000

CMD ["./start.sh"]

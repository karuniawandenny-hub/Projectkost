#!/bin/sh
# Production startup script — Kelola Kos.
#
# Tujuan: app harus bisa START dengan minimum konfigurasi user.
#  - Otomatis generate JWT_SECRET dan CRON_SECRET (sekali, lalu disimpan
#    di /data/.secrets agar konsisten antar restart).
#  - Default DATABASE_URL ke SQLite di /data.
#  - Auto-create skema database (idempotent).
#  - Auto-seed admin user (idempotent).
#  - Symlink upload folder ke volume.

set -e

DATA_DIR="${DATA_DIR:-/data}"
SECRETS_FILE="$DATA_DIR/.secrets"

# Pastikan folder data ada.
mkdir -p "$DATA_DIR/uploads"

# ===== Auto-generate / load secrets =====
# Kalau secrets sudah pernah di-generate, load. Kalau belum, generate
# acak dan simpan. User TIDAK perlu set JWT_SECRET / CRON_SECRET manual.
if [ -f "$SECRETS_FILE" ]; then
  # shellcheck disable=SC1090
  . "$SECRETS_FILE"
  echo "[start] Secrets loaded dari $SECRETS_FILE"
else
  echo "[start] Generate secrets baru ke $SECRETS_FILE…"
  GEN_JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  GEN_CRON=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  {
    echo "export JWT_SECRET='$GEN_JWT'"
    echo "export CRON_SECRET='$GEN_CRON'"
  } > "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
  # shellcheck disable=SC1090
  . "$SECRETS_FILE"
fi

# User boleh override via env Railway/Render kalau mau.
export JWT_SECRET="${JWT_SECRET}"
export CRON_SECRET="${CRON_SECRET}"

# Default mode dev untuk gateway opsional (email/WA/payment) supaya
# app tetap jalan tanpa setup tambahan. User bisa upgrade ke produksi
# nanti via /admin/system.
export EMAIL_MODE="${EMAIL_MODE:-dev}"
export OTP_MODE="${OTP_MODE:-dev}"
export PAYMENT_GATEWAY="${PAYMENT_GATEWAY:-mock}"

# Database default: SQLite di /data.
if [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="file:$DATA_DIR/dev.db"
fi

# Symlink public/uploads -> $DATA_DIR/uploads supaya Next.js bisa serve
# file yang diupload.
rm -rf /app/public/uploads
ln -s "$DATA_DIR/uploads" /app/public/uploads
export UPLOADS_DIR="$DATA_DIR/uploads"

echo "[start] DATA_DIR=$DATA_DIR"
echo "[start] DATABASE_URL=$DATABASE_URL"
echo "[start] EMAIL_MODE=$EMAIL_MODE OTP_MODE=$OTP_MODE PAYMENT_GATEWAY=$PAYMENT_GATEWAY"

echo "[start] Running prisma db push (create/update schema)…"
npx --yes prisma db push --skip-generate --accept-data-loss || true

echo "[start] Seeding admin user (idempoten)…"
npx --yes tsx prisma/seed.ts || true

echo "[start] Booting Next.js on port ${PORT:-3000}…"
exec node server.js

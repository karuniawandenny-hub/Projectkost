#!/bin/sh
# Production startup script.
#  1. Pastikan folder DATA_DIR ada (default /data) + uploads subfolder.
#  2. Symlink public/uploads -> /data/uploads agar Next.js bisa serve.
#  3. Jalankan prisma db push (idempotent — buat tabel kalau belum ada).
#  4. Jalankan seed admin (idempotent).
#  5. Start Next.js.

set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/uploads"

# Pastikan DATABASE_URL menunjuk ke file di DATA_DIR kalau pakai SQLite default.
if [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="file:$DATA_DIR/dev.db"
fi

# Symlink public/uploads -> $DATA_DIR/uploads supaya Next.js static
# serve bekerja untuk file yang diupload.
rm -rf /app/public/uploads
ln -s "$DATA_DIR/uploads" /app/public/uploads

# UPLOADS_DIR untuk lib/upload.ts.
export UPLOADS_DIR="$DATA_DIR/uploads"

echo "[start] DATABASE_URL=$DATABASE_URL"
echo "[start] DATA_DIR=$DATA_DIR  UPLOADS_DIR=$UPLOADS_DIR"

echo "[start] Running prisma db push…"
npx --yes prisma db push --skip-generate --accept-data-loss || true

echo "[start] Seeding admin user…"
npx --yes tsx prisma/seed.ts || true

echo "[start] Booting Next.js on port ${PORT:-3000}…"
exec node server.js

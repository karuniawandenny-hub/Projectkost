#!/bin/sh
# Production startup script — Kelola Kos.
#
# Filosofi: aplikasi HARUS sampai ke `node server.js` apapun yang terjadi,
# supaya healthcheck (/api/health) bisa lulus. Setiap langkah opsional
# di bawah dibungkus `|| true` dan tidak boleh menghentikan boot.
#
# Tugas script ini:
#  - Paksa HOSTNAME=0.0.0.0 supaya Next.js bind ke semua interface
#    (Railway set HOSTNAME=<container-id> by default → healthcheck gagal).
#  - Auto-generate JWT_SECRET & CRON_SECRET sekali, simpan di
#    /data/.secrets agar konsisten antar restart.
#  - Default DATABASE_URL ke SQLite di /data.
#  - Auto-create skema DB (idempotent, non-fatal).
#  - Auto-seed admin user (idempotent, non-fatal).
#  - Symlink upload folder ke volume persisten.

# JANGAN pakai `set -e`. Kita mau app tetap boot walau ada langkah opsional
# yang gagal — error akan terlihat di log, tapi container tidak crash loop.

# CRITICAL: paksa Next.js standalone bind ke 0.0.0.0, bukan ke
# container hostname yang Railway set. Tanpa ini healthcheck gagal.
export HOSTNAME=0.0.0.0

DATA_DIR="${DATA_DIR:-/data}"

# ===== Deteksi REAL mount, bukan cuma writable =====
# Dockerfile `RUN mkdir -p /data` bikin folder /data SELALU ada di image.
# Cek writable saja → bohong: terlihat "OK" walau volume belum di-attach,
# datanya di-tulis ke container ephemeral & hilang setiap redeploy.
# Cara benar: cek apakah path muncul di /proc/mounts sebagai mount point
# tersendiri (= ada volume / bind-mount yang persisten).
is_mount_point() {
  # Argument 1 = path absolut. Return 0 kalau itu mount point.
  [ -r /proc/mounts ] || return 1
  awk -v p="$1" '$2 == p { found=1; exit } END { exit !found }' /proc/mounts
}

DATA_IS_VOLUME=0
if is_mount_point "$DATA_DIR"; then
  DATA_IS_VOLUME=1
fi

# Branch 1: /data adalah volume sungguhan → pasti persisten. Tetap cek
#           writable buat sanity (volume read-only sangat jarang).
# Branch 2: /data ADA tapi bukan mount → akan hilang saat redeploy.
#           Fallback ke /tmp + warning sangat keras. User HARUS attach
#           volume Railway sebelum pakai produksi.
if [ "$DATA_IS_VOLUME" = "1" ] && mkdir -p "$DATA_DIR/uploads" 2>/dev/null; then
  echo "[start] ✓ $DATA_DIR adalah volume persisten (terdaftar di /proc/mounts)."
else
  if [ "$DATA_IS_VOLUME" = "0" ]; then
    echo "[start] =================================================="
    echo "[start] 🔴 PERINGATAN PENTING: $DATA_DIR BUKAN VOLUME!"
    echo "[start]"
    echo "[start] Railway Volume belum di-attach. Folder $DATA_DIR"
    echo "[start] cuma ada karena dibuat di Docker image — bukan"
    echo "[start] storage persisten. Semua data (pemilik, penghuni,"
    echo "[start] kos, pembayaran) akan HILANG saat redeploy berikutnya."
    echo "[start]"
    echo "[start] Cara fix di Railway:"
    echo "[start]   1. Buka service → tab Settings"
    echo "[start]   2. Scroll ke section Volumes → klik + Add Volume"
    echo "[start]   3. Mount path: /data"
    echo "[start]   4. Size: 1 GB"
    echo "[start]   5. Klik Add → Railway rebuild + data baru persisten"
    echo "[start]"
    echo "[start] Sementara: data fallback ke /tmp (juga TIDAK persisten)"
    echo "[start] supaya app tetap bisa start untuk testing UI."
    echo "[start] =================================================="
  else
    echo "[start] WARN: $DATA_DIR tidak writable walau terdaftar sebagai mount."
  fi
  DATA_DIR="/tmp/kelolakos"
  mkdir -p "$DATA_DIR/uploads" || true
fi

SECRETS_FILE="$DATA_DIR/.secrets"

# ===== Auto-generate / load secrets =====
if [ -f "$SECRETS_FILE" ]; then
  # shellcheck disable=SC1090
  . "$SECRETS_FILE" || true
  echo "[start] Secrets loaded dari $SECRETS_FILE"
else
  echo "[start] Generate secrets baru ke $SECRETS_FILE…"
  GEN_JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" 2>/dev/null || echo "fallback-jwt-$(date +%s)")
  GEN_CRON=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" 2>/dev/null || echo "fallback-cron-$(date +%s)")
  {
    echo "export JWT_SECRET='$GEN_JWT'"
    echo "export CRON_SECRET='$GEN_CRON'"
  } > "$SECRETS_FILE" 2>/dev/null || true
  chmod 600 "$SECRETS_FILE" 2>/dev/null || true
  export JWT_SECRET="$GEN_JWT"
  export CRON_SECRET="$GEN_CRON"
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

# Database default: SQLite di $DATA_DIR.
# Override DATABASE_URL kalau:
#  - belum diset, ATAU
#  - diset ke file SQLite relatif (mis. "file:./dev.db" warisan dev /
#    .env.example) — itu akan disimpan di /app yang ephemeral.
# Kalau user pasang DATABASE_URL ke postgres/mysql/dll, biarkan.
case "$DATABASE_URL" in
  "")
    export DATABASE_URL="file:$DATA_DIR/dev.db"
    echo "[start] DATABASE_URL kosong → di-set ke file:$DATA_DIR/dev.db"
    ;;
  "file:./"*|"file:"*"./"*)
    SAFE_URL="file:$DATA_DIR/dev.db"
    echo "[start] WARN: DATABASE_URL='$DATABASE_URL' (relatif) akan disimpan"
    echo "[start]       di working dir container — TIDAK persisten."
    echo "[start]       Override ke $SAFE_URL supaya data aman."
    export DATABASE_URL="$SAFE_URL"
    ;;
esac

# Symlink public/uploads -> $DATA_DIR/uploads supaya Next.js bisa serve
# file yang diupload. Non-fatal.
rm -rf /app/public/uploads 2>/dev/null || true
ln -s "$DATA_DIR/uploads" /app/public/uploads 2>/dev/null || true
export UPLOADS_DIR="$DATA_DIR/uploads"

echo "[start] DATA_DIR=$DATA_DIR"
echo "[start] DATABASE_URL=$DATABASE_URL"
echo "[start] HOSTNAME=$HOSTNAME PORT=${PORT:-3000}"
echo "[start] EMAIL_MODE=$EMAIL_MODE OTP_MODE=$OTP_MODE PAYMENT_GATEWAY=$PAYMENT_GATEWAY"

echo "[start] Running prisma db push (create/update schema)…"
npx --yes prisma db push --skip-generate --accept-data-loss || echo "[start] WARN: prisma db push gagal, lanjut boot"

echo "[start] Seeding admin user (idempoten)…"
npx --yes tsx prisma/seed.ts || echo "[start] WARN: seed gagal, lanjut boot"

echo "[start] Booting Next.js on port ${PORT:-3000}…"
exec node server.js

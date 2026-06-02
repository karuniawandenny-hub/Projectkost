/**
 * Deteksi apakah aplikasi sedang menyimpan data di volume persisten
 * atau di disk container yang akan terhapus saat redeploy.
 *
 * Logika:
 *  - Production-ready (persisten): DATABASE_URL pakai SQLite file di
 *    /data/*.db (volume Railway), ATAU pakai DATABASE provider eksternal
 *    (postgres/mysql) — di kedua kasus data aman saat redeploy.
 *  - Berisiko (tidak persisten): DATABASE_URL ke file:./dev.db atau
 *    file:/tmp/... — start.sh fallback saat /data tidak writable
 *    (volume belum di-attach di Railway).
 *
 * Dipakai oleh:
 *  - Banner peringatan di dashboard admin
 *  - Endpoint /api/health (read-only diagnostic, tidak mempengaruhi
 *    liveness status)
 */
export type StorageStatus = {
  persistent: boolean;
  driver: "sqlite" | "external";
  /** Path file SQLite (kalau ada). Untuk display ke admin. */
  sqlitePath: string | null;
  /** Penjelasan singkat untuk UI banner. */
  message: string;
};

export function getStorageStatus(): StorageStatus {
  const url = process.env.DATABASE_URL ?? "";

  // External database provider (postgres/mysql/mongo): selalu persisten
  // karena hosted di luar container.
  if (!url.startsWith("file:")) {
    return {
      persistent: true,
      driver: "external",
      sqlitePath: null,
      message: "Database eksternal — data aman saat redeploy.",
    };
  }

  // SQLite — cek lokasi file
  const filePath = url.slice("file:".length);

  // /data/... = Railway persistent volume = AMAN
  if (filePath.startsWith("/data/") || filePath.startsWith("/data\\")) {
    return {
      persistent: true,
      driver: "sqlite",
      sqlitePath: filePath,
      message: "Database SQLite di volume /data — data aman saat redeploy.",
    };
  }

  // /tmp/... = fallback start.sh saat /data tidak writable = BAHAYA
  if (filePath.startsWith("/tmp/")) {
    return {
      persistent: false,
      driver: "sqlite",
      sqlitePath: filePath,
      message:
        "PERINGATAN: Database di /tmp — data AKAN HILANG saat redeploy. Attach Volume di Railway → mount path /data.",
    };
  }

  // file:./dev.db atau file lokal = development mode
  return {
    persistent: false,
    driver: "sqlite",
    sqlitePath: filePath,
    message:
      "Mode development (database di project folder). Untuk produksi: pakai Railway Volume di /data.",
  };
}

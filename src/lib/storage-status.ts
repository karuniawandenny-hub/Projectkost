/**
 * Deteksi apakah aplikasi sedang menyimpan data di volume persisten
 * atau di disk container yang akan terhapus saat redeploy.
 *
 * Sumber kebenaran: /proc/mounts (Linux). Folder /data BISA muncul di
 * filesystem tanpa volume mount (Dockerfile RUN mkdir -p /data), jadi
 * cek "apakah path ada / writable" TIDAK cukup — itu false positive
 * yang membuat data user diam-diam hilang setiap redeploy.
 *
 * Logika:
 *  - Database eksternal (postgres/mysql/dll): selalu persisten — DB
 *    hosted di luar container.
 *  - SQLite file di path yang TERDAFTAR sebagai mount di /proc/mounts:
 *    persisten (volume Railway sungguhan).
 *  - SQLite file di path yang ADA tapi BUKAN mount point: ephemeral —
 *    folder dibuat di image, akan kembali kosong setelah redeploy.
 *  - SQLite file di /tmp atau relatif: ephemeral.
 */
import { readFileSync, existsSync } from "fs";
import path from "path";

export type StorageStatus = {
  persistent: boolean;
  driver: "sqlite" | "external";
  /** Path file SQLite (kalau ada). Untuk display ke admin. */
  sqlitePath: string | null;
  /** Penjelasan singkat untuk UI banner. */
  message: string;
};

/**
 * Cek apakah `targetPath` (atau salah satu parent-nya) terdaftar di
 * /proc/mounts sebagai mount point tersendiri. Kalau ya, file di
 * dalamnya disimpan di volume persisten — bukan layer ephemeral
 * container.
 */
function isPersistentMount(targetPath: string): boolean {
  try {
    const mounts = readFileSync("/proc/mounts", "utf-8");
    const mountPoints = new Set<string>();
    for (const line of mounts.split("\n")) {
      const parts = line.split(/\s+/);
      if (parts[1]) mountPoints.add(parts[1]);
    }
    // Cek targetPath itu sendiri & semua parent-nya. Volume di-mount
    // di /data, jadi /data/dev.db secara efektif tetap dalam mount.
    let current = path.resolve(targetPath);
    while (current && current !== "/") {
      if (mountPoints.has(current)) return true;
      const next = path.dirname(current);
      if (next === current) break;
      current = next;
    }
    return false;
  } catch {
    // /proc/mounts tidak terbaca (mis. dev di macOS/Windows): anggap
    // tidak persisten, supaya banner muncul untuk konfirmasi user.
    return false;
  }
}

export function getStorageStatus(): StorageStatus {
  const url = process.env.DATABASE_URL ?? "";

  // External database provider (postgres/mysql/mongo): selalu persisten
  // karena hosted di luar container.
  if (url && !url.startsWith("file:")) {
    return {
      persistent: true,
      driver: "external",
      sqlitePath: null,
      message: "Database eksternal — data aman saat redeploy.",
    };
  }

  // SQLite — cek lokasi file
  const filePath = url.slice("file:".length) || "(belum diset)";

  // Path relatif → pasti ephemeral (di /app working dir).
  if (!filePath.startsWith("/")) {
    return {
      persistent: false,
      driver: "sqlite",
      sqlitePath: filePath,
      message:
        "Database SQLite di path relatif — data ditulis ke working dir container & akan hilang saat redeploy. Override DATABASE_URL ke file:/data/dev.db, dan attach Volume di Railway.",
    };
  }

  // /tmp → fallback start.sh, jelas ephemeral.
  if (filePath.startsWith("/tmp/")) {
    return {
      persistent: false,
      driver: "sqlite",
      sqlitePath: filePath,
      message:
        "Database di /tmp — fallback karena Volume Railway belum di-attach. Data akan HILANG saat redeploy. Buka Railway → Settings → Volumes → + Add Volume → mount path /data → 1 GB.",
    };
  }

  // Cek apakah benar-benar di volume mount (bukan cuma direktori dari image).
  // Periksa file kalau sudah ada, kalau belum cek dir parent (Prisma akan
  // tulis ke situ).
  const probePath = existsSync(filePath) ? filePath : path.dirname(filePath);
  if (isPersistentMount(probePath)) {
    return {
      persistent: true,
      driver: "sqlite",
      sqlitePath: filePath,
      message: `Database SQLite di ${filePath} — volume persisten terverifikasi via /proc/mounts. Data aman saat redeploy.`,
    };
  }

  // Path absolute tapi BUKAN mount → ephemeral (mis. /data tanpa volume).
  return {
    persistent: false,
    driver: "sqlite",
    sqlitePath: filePath,
    message: `Database SQLite di ${filePath}, tapi path itu bukan volume Railway (cek /proc/mounts). Folder dibuat di Docker image — data akan HILANG saat redeploy. Buka Railway → Settings → Volumes → + Add Volume → mount path ${path.dirname(filePath)} → 1 GB.`,
  };
}

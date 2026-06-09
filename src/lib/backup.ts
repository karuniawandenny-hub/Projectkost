import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

/**
 * Backup database SQLite ke folder {DATA_DIR}/backups/YYYY-MM-DD.db.gz.
 *
 * Catatan SQLite & WAL:
 *   - SQLite write-ahead log bisa membuat copy-on-the-fly tidak konsisten
 *     kalau ada transaksi aktif. Strategi ringan: copy file via fs (atomic
 *     karena Prisma idle saat cron jalan tengah malam), gzip, simpan.
 *   - Untuk produksi yang lebih ketat, ganti dengan `sqlite3 .backup`,
 *     tapi itu butuh binary sqlite3 di container.
 *
 * Retensi: simpan N file terbaru saja (default 14). Yang lebih lama
 * dihapus otomatis biar volume tidak penuh.
 */

export type BackupResult = {
  ok: boolean;
  file?: string;
  bytes?: number;
  durationMs?: number;
  retained?: number;
  removed?: number;
  error?: string;
};

const DEFAULT_RETENTION = 14;

function dbPathFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  // "file:/data/dev.db" atau "file:./dev.db"
  const m = url.match(/^file:(.+)$/);
  if (!m) return null;
  return m[1].trim();
}

function backupDir(): string {
  const dataDir = process.env.DATA_DIR || "/data";
  return path.join(dataDir, "backups");
}

export async function runBackup(opts?: { retention?: number }): Promise<BackupResult> {
  const start = Date.now();
  const retention = opts?.retention ?? DEFAULT_RETENTION;
  try {
    const dbPath = dbPathFromUrl(process.env.DATABASE_URL);
    if (!dbPath) {
      return {
        ok: false,
        error:
          "DATABASE_URL bukan SQLite (atau kosong). Backup builtin hanya untuk SQLite.",
      };
    }
    await fs.access(dbPath); // pastikan file DB ada

    const dir = backupDir();
    await fs.mkdir(dir, { recursive: true });

    // Nama: YYYY-MM-DD_HHmm.db.gz — pakai waktu lokal agar mudah dibaca.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const outPath = path.join(dir, `${stamp}.db.gz`);

    // Gzip streaming agar tidak load file ke memori.
    await pipeline(
      createReadStream(dbPath),
      createGzip({ level: 6 }),
      createWriteStream(outPath)
    );

    const stat = await fs.stat(outPath);

    // Retensi: simpan N terbaru, hapus sisanya.
    const entries = (await fs.readdir(dir))
      .filter((f) => f.endsWith(".db.gz"))
      .sort()
      .reverse();
    let removed = 0;
    for (const old of entries.slice(retention)) {
      try {
        await fs.unlink(path.join(dir, old));
        removed++;
      } catch {
        // ignore
      }
    }

    return {
      ok: true,
      file: path.basename(outPath),
      bytes: stat.size,
      durationMs: Date.now() - start,
      retained: Math.min(entries.length, retention),
      removed,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    };
  }
}

export type BackupListEntry = {
  name: string;
  size: number;
  modifiedAt: Date;
};

/**
 * Daftar file backup yang ada, terbaru di atas. Dipakai admin/system
 * untuk verifikasi backup berjalan.
 */
export async function listBackups(): Promise<BackupListEntry[]> {
  try {
    const dir = backupDir();
    const names = await fs.readdir(dir).catch(() => []);
    const entries: BackupListEntry[] = [];
    for (const name of names) {
      if (!name.endsWith(".db.gz")) continue;
      const stat = await fs.stat(path.join(dir, name)).catch(() => null);
      if (!stat) continue;
      entries.push({
        name,
        size: stat.size,
        modifiedAt: stat.mtime,
      });
    }
    entries.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    return entries;
  } catch {
    return [];
  }
}

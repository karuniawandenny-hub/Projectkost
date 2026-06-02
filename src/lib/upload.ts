import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Folder root uploads. Saat di produksi (Railway/Docker), set env
 * UPLOADS_DIR ke path volume yang persisten (mis. /data/uploads).
 * Default: public/uploads di project (untuk dev).
 *
 * Saat menggunakan custom UPLOADS_DIR, file harus juga di-serve via
 * route /uploads/* — kita pakai symlink yang dibuat saat startup
 * (lihat scripts/start.sh).
 */
const UPLOAD_ROOT =
  process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.length > 0
    ? process.env.UPLOADS_DIR
    : path.join(process.cwd(), "public", "uploads");

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "application/pdf":
      return ".pdf";
    default:
      return "";
  }
}

export async function saveUploadedFile(
  file: File,
  subdir: string
): Promise<string> {
  if (!file || typeof file === "string") {
    throw new Error("File tidak ditemukan.");
  }
  if (file.size <= 0) throw new Error("File kosong.");
  if (file.size > MAX_BYTES) {
    throw new Error("Ukuran file maksimal 8 MB.");
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error("Format tidak didukung. Gunakan JPG/PNG/WEBP/HEIC/PDF.");
  }

  // Sanitasi subdir: hanya boleh huruf, angka, dash/underscore, slash.
  const safeSubdir = subdir.replace(/[^a-zA-Z0-9/_-]/g, "");
  const dir = path.join(UPLOAD_ROOT, safeSubdir);
  await mkdir(dir, { recursive: true });

  const ext = extFromMime(file.type);
  const filename = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
  const filepath = path.join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  return `/uploads/${safeSubdir}/${filename}`;
}

/**
 * Hapus 1 file upload berdasarkan URL `/uploads/...`. Best-effort:
 * tidak melempar error kalau file sudah tidak ada / path invalid /
 * permission denied — caller bisa lanjut delete row DB tanpa risiko
 * setengah jalan.
 *
 * Aman dari path traversal: hanya melayani URL yang dimulai dengan
 * `/uploads/` dan tidak mengandung `..`.
 */
export async function deleteUploadByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  if (!url.startsWith("/uploads/")) return;
  if (url.includes("..")) return;
  const rel = url.slice("/uploads/".length);
  const filepath = path.join(UPLOAD_ROOT, rel);
  try {
    await unlink(filepath);
  } catch {
    // file mungkin sudah tidak ada — abaikan
  }
}

/**
 * Hapus banyak file dari URL — convenience untuk array JSON
 * (mis. Complaint.photoUrls yang berisi JSON array of urls).
 */
export async function deleteUploadsByUrls(urls: (string | null | undefined)[]): Promise<void> {
  await Promise.all(urls.map((u) => deleteUploadByUrl(u)));
}

import { mkdir, writeFile } from "fs/promises";
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

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

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

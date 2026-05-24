import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const UPLOAD_ROOT =
  process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.length > 0
    ? process.env.UPLOADS_DIR
    : path.join(process.cwd(), "public", "uploads");

const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
};

/**
 * Serve file upload dari UPLOADS_DIR (di Railway: /data/uploads).
 *
 * Kenapa pakai route handler & bukan public/ symlink:
 *  - Next.js standalone tidak konsisten serve file yang masuk ke public/
 *    setelah build. Symlink kadang tidak dibaca, kadang ada caching.
 *  - Route handler langsung baca filesystem -> pasti jalan di production.
 *
 * Keamanan:
 *  - Wajib login (sesi cookie). Mencegah orang umum download KTP via
 *    guessing URL.
 *  - Sanitasi path: tolak `..` dan karakter aneh; pastikan resolved path
 *    masih di dalam UPLOAD_ROOT (path traversal protection).
 */
export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } }
) {
  const session = await readSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const segments = params.path ?? [];
  if (segments.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Sanitasi: tolak segmen yang mengandung `..` atau karakter berbahaya.
  for (const seg of segments) {
    if (seg.includes("..") || seg.includes("/") || seg.includes("\\")) {
      return new NextResponse("Bad request", { status: 400 });
    }
  }

  const rel = segments.join("/");
  const fullPath = path.resolve(UPLOAD_ROOT, rel);

  // Defense in depth: resolved path harus tetap di dalam UPLOAD_ROOT.
  const root = path.resolve(UPLOAD_ROOT);
  if (!fullPath.startsWith(root + path.sep) && fullPath !== root) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let data: Buffer;
  try {
    data = await readFile(fullPath);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = CONTENT_TYPE[ext] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Private cache (user-specific) — boleh di browser cache 1 jam,
      // tapi proxy/CDN tidak boleh cache.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

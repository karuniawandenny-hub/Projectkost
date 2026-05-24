/**
 * Dapatkan URL publik yang benar dari Request.
 *
 * Di balik reverse proxy (Railway/Vercel/Render/Cloudflare), `req.url`
 * berisi alamat internal container — misal `http://0.0.0.0:8080/path` —
 * BUKAN URL yang user lihat di browser (`https://www.kosbaiti.com/path`).
 *
 * Reverse proxy yang baik selalu set header `X-Forwarded-Host` dan
 * `X-Forwarded-Proto` dengan hostname & protokol asli. Kita pakai itu.
 *
 * Bug yang dicegah: redirect ke `https://0.0.0.0:8080/` saat user
 * logout (Safari blokir port restricted, browser lain error).
 */
export function publicOrigin(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");

  if (forwardedHost) {
    const proto = forwardedProto || "https";
    return `${proto}://${forwardedHost}`;
  }

  const hostHeader = req.headers.get("host");
  if (hostHeader && !hostHeader.startsWith("0.0.0.0")) {
    const proto = forwardedProto || (hostHeader.includes("localhost") ? "http" : "https");
    return `${proto}://${hostHeader}`;
  }

  // Last resort: ambil dari req.url. Kalau ini terjadi di Railway berarti
  // proxy tidak set forwarded headers — sangat jarang.
  return new URL(req.url).origin;
}

/**
 * Build URL absolut ke path tertentu, menggunakan public origin.
 */
export function publicUrl(req: Request, path: string): URL {
  return new URL(path, publicOrigin(req));
}

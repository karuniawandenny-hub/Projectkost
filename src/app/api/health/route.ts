import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Endpoint health check untuk hosting platform (Railway/Render/Docker).
 *
 * Sengaja TIDAK cek DB di sini. Healthcheck Railway harus selalu return
 * 200 begitu Next.js server alive — DB readiness terpisah dari liveness.
 * Kalau DB gagal, app akan return 500 di route lain dan log akan terlihat
 * jelas — tapi container tidak akan di-restart loop terus-menerus oleh
 * platform.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: Date.now(),
    service: "kelola-kos",
  });
}

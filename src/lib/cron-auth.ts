import { NextResponse } from "next/server";

/**
 * Wrapper untuk endpoint cron yang butuh autentikasi via CRON_SECRET.
 * Token bisa lewat ?token=... query param atau Authorization: Bearer ...
 * header. Pakai 1-line per route:
 *
 *   export const GET = withCronAuth(async () => {
 *     const result = await doWork();
 *     return { result };
 *   });
 *
 * Return value handler akan di-wrap jadi `{ ok: true, ...result }`.
 * Error apapun jadi 500 dengan `{ ok: false, error }`.
 */
export function withCronAuth<T extends Record<string, unknown>>(
  handler: () => Promise<T>
) {
  return async function (req: Request): Promise<NextResponse> {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json(
        { ok: false, error: "CRON_SECRET belum di-set di env" },
        { status: 503 }
      );
    }
    const url = new URL(req.url);
    const tokenQ = url.searchParams.get("token");
    const tokenH = req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (tokenQ !== secret && tokenH !== secret) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    try {
      const result = await handler();
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "unknown" },
        { status: 500 }
      );
    }
  };
}

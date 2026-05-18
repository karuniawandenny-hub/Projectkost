import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Endpoint health check untuk hosting platform (Railway/Render/Docker).
 * - 200 jika DB bisa diakses.
 * - 503 jika gagal.
 */
export async function GET() {
  try {
    await prisma.user.count();
    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "db unreachable" },
      { status: 503 }
    );
  }
}

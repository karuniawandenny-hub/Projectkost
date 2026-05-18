import { NextResponse } from "next/server";
import { processReminders } from "@/lib/reminders";

/**
 * Endpoint cron: GET/POST /api/cron/reminders?token=<CRON_SECRET>
 * - Cek query/header token cocok dengan env CRON_SECRET.
 * - Panggil processReminders() lalu return ringkasan.
 *
 * Jadwalkan via:
 *  - Vercel Cron (vercel.json): tiap pagi jam 9 WIB
 *  - EasyCron / cron-job.org
 *  - Linux crontab dengan curl
 */

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET belum di-set di env" },
      { status: 503 }
    );
  }
  const url = new URL(req.url);
  const tokenQ = url.searchParams.get("token");
  const tokenH = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (tokenQ !== secret && tokenH !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processReminders();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;

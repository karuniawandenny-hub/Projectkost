import { processReminders } from "@/lib/reminders";
import { withCronAuth } from "@/lib/cron-auth";

/**
 * Endpoint cron: GET/POST /api/cron/reminders?token=<CRON_SECRET>
 * Panggil processReminders() lalu return ringkasan.
 *
 * Jadwalkan via:
 *  - Vercel Cron (vercel.json): tiap pagi jam 9 WIB
 *  - EasyCron / cron-job.org
 *  - Linux crontab dengan curl
 */
export const dynamic = "force-dynamic";

const handle = withCronAuth(async () => ({
  result: await processReminders(),
}));

export const GET = handle;
export const POST = handle;

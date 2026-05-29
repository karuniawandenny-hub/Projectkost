import { ensureBillsForAllActive } from "@/lib/billing";
import { withCronAuth } from "@/lib/cron-auth";

/**
 * Endpoint cron untuk auto-generate tagihan periode baru.
 * GET/POST /api/cron/bills?token=<CRON_SECRET>
 *
 * Jadwalkan harian (mis. 00:30 WIB) supaya begitu lewat anniversary
 * date suatu tenancy, tagihan langsung muncul tanpa perlu user login.
 * Lalu /api/cron/reminders jalan jam 09:00 WIB akan kirim H7/H3/H1/
 * OVERDUE based on tagihan yg sudah ada.
 */
export const dynamic = "force-dynamic";

const handle = withCronAuth(async () => ({
  result: await ensureBillsForAllActive(),
}));

export const GET = handle;
export const POST = handle;

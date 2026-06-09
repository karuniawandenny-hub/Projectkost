import { withCronAuth } from "@/lib/cron-auth";
import { runBackup } from "@/lib/backup";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Backup database harian. Jadwalkan di cron-job.org tiap pagi 03:00 WIB.
 * Idempoten — kalau dipanggil ulang akan buat file baru dengan timestamp
 * berbeda (jam:menit). Retensi 14 file (~2 minggu).
 */
export const GET = withCronAuth(async () => {
  const result = await runBackup();
  await logAudit({
    actorId: null,
    actorName: "system/cron",
    action: result.ok ? "BACKUP.RUN" : "BACKUP.FAIL",
    entityType: "Backup",
    entityId: result.file ?? null,
    metadata: {
      ok: result.ok,
      file: result.file,
      bytes: result.bytes,
      durationMs: result.durationMs,
      removed: result.removed,
      error: result.error,
    },
  });
  return result as unknown as Record<string, unknown>;
});

// POST = manual trigger dari /admin/system (admin button).
export const POST = GET;

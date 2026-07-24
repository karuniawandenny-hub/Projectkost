import { headers } from "next/headers";
import { prisma } from "./prisma";

export type AuditAction =
  // Pembayaran
  | "PAYMENT.VERIFY"
  | "PAYMENT.REJECT"
  | "PAYMENT.DELETE"
  // User
  | "USER.SUSPEND"
  | "USER.ACTIVATE"
  | "USER.APPROVE"
  | "USER.REJECT"
  | "USER.DELETE"
  // Tenancy
  | "TENANCY.CREATE"
  | "TENANCY.END"
  // Expense
  | "EXPENSE.CREATE"
  | "EXPENSE.DELETE"
  // Komplain & perawatan
  | "COMPLAINT.RESOLVE"
  | "MAINTENANCE.COMPLETE"
  // Pengumuman & broadcast
  | "ANNOUNCEMENT.SEND"
  | "ANNOUNCEMENT.DELETE"
  // System
  | "BACKUP.RUN"
  | "BACKUP.FAIL";

type AuditInput = {
  actorId?: string | null;
  actorName?: string | null;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Catat aksi sensitif. Best-effort: kegagalan logging TIDAK boleh
 * menggagalkan operasi bisnis. Caller pasti mau aksi tetap berhasil
 * walaupun audit gagal disimpan.
 *
 * IP & user-agent diambil dari request headers — Next.js menyediakan
 * `headers()` di server components & actions.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      const h = headers();
      ip =
        h.get("x-forwarded-for")?.split(",")[0].trim() ??
        h.get("x-real-ip") ??
        null;
      ua = h.get("user-agent");
    } catch {
      // headers() lempar di luar request context (mis. cron). OK.
    }

    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        ip,
        userAgent: ua,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[audit] gagal mencatat:", input.action, e);
  }
}

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  "PAYMENT.VERIFY": "Verifikasi pembayaran",
  "PAYMENT.REJECT": "Tolak pembayaran",
  "PAYMENT.DELETE": "Hapus pembayaran",
  "USER.SUSPEND": "Suspend akun",
  "USER.ACTIVATE": "Aktifkan akun",
  "USER.APPROVE": "Setujui pendaftaran",
  "USER.REJECT": "Tolak pendaftaran",
  "USER.DELETE": "Hapus akun",
  "TENANCY.CREATE": "Tambah penghuni ke kamar",
  "TENANCY.END": "Akhiri kontrak penghuni",
  "EXPENSE.CREATE": "Catat pengeluaran",
  "EXPENSE.DELETE": "Hapus pengeluaran",
  "COMPLAINT.RESOLVE": "Selesaikan komplain",
  "MAINTENANCE.COMPLETE": "Selesaikan perawatan",
  "ANNOUNCEMENT.SEND": "Kirim pengumuman",
  "ANNOUNCEMENT.DELETE": "Hapus pengumuman",
  "BACKUP.RUN": "Backup database sukses",
  "BACKUP.FAIL": "Backup database GAGAL",
};

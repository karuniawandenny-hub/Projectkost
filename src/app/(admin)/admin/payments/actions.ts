"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

async function requireAdmin() {
  const me = await requireUser();
  if (me.role !== "ADMIN") throw new Error("FORBIDDEN");
  return me;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Geser dueDate tagihan ke offset hari relatif terhadap hari ini.
 * Untuk testing skenario reminder: H+7 / H+3 / H+1 / H-1.
 * offsetDays: positif = ke depan, negatif = ke belakang.
 */
export async function setDueDateOffsetAction(
  paymentId: string,
  offsetDays: number
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!Number.isInteger(offsetDays) || Math.abs(offsetDays) > 365) {
    return { ok: false, message: "Offset tidak valid (max ±365 hari)." };
  }
  const newDue = new Date(startOfDay(new Date()).getTime() + offsetDays * 86_400_000);
  await prisma.payment.update({
    where: { id: paymentId },
    data: { dueDate: newDue },
  });
  revalidatePath("/admin/payments");
  return {
    ok: true,
    message: `Jatuh tempo digeser ke ${newDue.toLocaleDateString("id-ID")}.`,
  };
}

/**
 * Hapus semua ReminderLog untuk tagihan tertentu.
 * Pakai untuk reset state idempotency supaya bisa retest reminder yang sama.
 */
export async function resetRemindersAction(
  paymentId: string
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const deleted = await prisma.reminderLog.deleteMany({
    where: { paymentId },
  });
  revalidatePath("/admin/payments");
  revalidatePath("/admin/reminders");
  return {
    ok: true,
    message: `${deleted.count} entri ReminderLog dihapus. Reminder bisa dipicu ulang.`,
  };
}

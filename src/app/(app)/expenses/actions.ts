"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageKos, getEffectiveOwnerId } from "@/lib/session";
import { isExpenseCategory } from "@/lib/expenses";
import { logAudit } from "@/lib/audit";

export type ExpenseState = { error?: string; success?: string };

async function requireOwner() {
  const user = await requireUser();
  if (!canManageKos(user)) throw new Error("FORBIDDEN");
  return user;
}

async function ownsKos(ownerId: string, kosId: string) {
  const k = await prisma.kos.findFirst({
    where: { id: kosId, ownerId },
    select: { id: true },
  });
  return !!k;
}

function parseAmount(raw: string): number | null {
  // Terima "1.500.000", "1,500,000", "1500000", "Rp 1.500.000"
  const cleaned = raw.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function createExpense(
  _prev: ExpenseState,
  formData: FormData
): Promise<ExpenseState> {
  const me = await requireOwner();

  const kosId = String(formData.get("kosId") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const dateStr = String(formData.get("date") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!kosId) return { error: "Pilih kos." };
  if (!(await ownsKos(me.id, kosId))) {
    return { error: "Anda tidak punya akses ke kos tersebut." };
  }
  if (!isExpenseCategory(category)) return { error: "Kategori tidak valid." };

  const amount = parseAmount(amountRaw);
  if (amount === null) return { error: "Nominal harus angka lebih dari 0." };

  // date input HTML kirim "YYYY-MM-DD". Parse di waktu lokal supaya
  // tidak geser sehari karena UTC.
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { error: "Tanggal tidak valid." };
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return { error: "Tanggal tidak valid." };

  const created = await prisma.expense.create({
    data: {
      kosId,
      createdById: me.id,
      category,
      date,
      amount,
      note: note || null,
    },
    include: { kos: { select: { name: true } } },
  });

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "EXPENSE.CREATE",
    entityType: "Expense",
    entityId: created.id,
    metadata: {
      kosName: created.kos.name,
      category,
      amount,
      date: dateStr,
    },
  });

  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { success: "Pengeluaran berhasil dicatat." };
}

export async function deleteExpense(
  _prev: ExpenseState,
  formData: FormData
): Promise<ExpenseState> {
  const me = await requireOwner();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "ID pengeluaran tidak valid." };

  // Verifikasi kepemilikan via relasi kos.
  const expense = await prisma.expense.findFirst({
    where: { id, kos: { ownerId: getEffectiveOwnerId(me) } },
    include: { kos: { select: { name: true } } },
  });
  if (!expense) return { error: "Pengeluaran tidak ditemukan." };

  await prisma.expense.delete({ where: { id: expense.id } });
  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "EXPENSE.DELETE",
    entityType: "Expense",
    entityId: expense.id,
    metadata: {
      kosName: expense.kos.name,
      category: expense.category,
      amount: expense.amount,
      date: expense.date.toISOString(),
    },
  });
  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { success: "Pengeluaran dihapus." };
}

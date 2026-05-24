"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";

export type UpdatePhoneState = {
  error?: string;
  success?: boolean;
};

/**
 * User update nomor HP sendiri. Wajib format Indonesia valid.
 * Dipakai dari banner di dashboard dan halaman /profile.
 */
export async function updateOwnPhone(
  _prev: UpdatePhoneState,
  formData: FormData
): Promise<UpdatePhoneState> {
  const me = await requireUser();
  const raw = String(formData.get("phone") ?? "").trim();
  if (!raw) return { error: "Nomor HP wajib diisi." };

  const phone = normalizePhone(raw);
  if (!phone) {
    return { error: "Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx." };
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { phone },
  });

  revalidatePath("/dashboard");
  revalidatePath("/profile");
  return { success: true };
}

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";

export type OnboardingState = { error?: string };

export async function submitOnboarding(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const user = await requireUser();

  const ktp = formData.get("ktp");
  const selfie = formData.get("selfie");

  if (!(ktp instanceof File) || ktp.size === 0) {
    return { error: "Foto/scan KTP wajib diunggah." };
  }
  if (!(selfie instanceof File) || selfie.size === 0) {
    return { error: "Foto diri (selfie) wajib diunggah." };
  }

  let ktpUrl: string;
  let selfieUrl: string;
  try {
    ktpUrl = await saveUploadedFile(ktp, `users/${user.id}/ktp`);
    selfieUrl = await saveUploadedFile(selfie, `users/${user.id}/selfie`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal mengunggah file." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ktpPhotoUrl: ktpUrl,
      selfiePhotoUrl: selfieUrl,
      onboardedAt: new Date(),
    },
  });

  redirect("/dashboard");
}

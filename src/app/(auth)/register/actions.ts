"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, normalizeEmail, isValidEmail } from "@/lib/password";
import { createSession } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";
import { notify } from "@/lib/notify";
import {
  saveUploadedFile,
  deleteUploadsByUrls,
} from "@/lib/upload";
import type { Role } from "@/lib/enums";

export type RegisterState = { error?: string };

export async function registerAction(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const role = String(formData.get("role") ?? "");
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  if (name.length < 2) return { error: "Nama wajib diisi (min 2 karakter)." };
  if (role !== "OWNER" && role !== "TENANT") {
    return { error: "Pilih peran terlebih dahulu." };
  }

  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) return { error: "Email tidak valid." };
  if (password.length < 8) {
    return { error: "Password minimal 8 karakter." };
  }
  if (password !== confirm) {
    return { error: "Konfirmasi password tidak cocok." };
  }

  let phone: string | null = null;
  if (!phoneRaw) {
    return { error: "Nomor HP wajib diisi (untuk reminder pembayaran via WhatsApp)." };
  }
  const norm = normalizePhone(phoneRaw);
  if (!norm) {
    return { error: "Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx." };
  }
  phone = norm;

  // === Validasi khusus TENANT: KTP + selfie WAJIB ada di form ini. ===
  // Kalau salah satu tidak ada / kosong, tolak SEBELUM buat user.
  // Ini adalah gate hard: tanpa dokumen, akun tidak pernah dibuat.
  let ktpFile: File | null = null;
  let selfieFile: File | null = null;
  if (role === "TENANT") {
    const ktp = formData.get("ktp");
    const selfie = formData.get("selfie");
    if (!(ktp instanceof File) || ktp.size === 0) {
      return {
        error:
          "Foto KTP wajib diupload sebelum akun penghuni bisa didaftarkan.",
      };
    }
    if (!(selfie instanceof File) || selfie.size === 0) {
      return {
        error:
          "Foto diri (selfie) wajib diupload sebelum akun penghuni bisa didaftarkan.",
      };
    }
    ktpFile = ktp;
    selfieFile = selfie;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Email sudah terdaftar. Silakan masuk." };
  }

  const passwordHash = await hashPassword(password);

  // === Upload file DULU sebelum create user. ===
  // Kenapa dulu: kalau upload sukses tapi create user gagal
  // (mis. race email unique), kita bisa cleanup file yatim.
  // Kalau create user sukses tapi upload gagal, user tanpa dokumen
  // di DB — melanggar aturan yang kita janjikan.
  // Kita simpan pakai path sementara berbasis timestamp+phone karena
  // userId belum ada. Setelah create user, file dipindah/dicatat as-is.
  let ktpUrl: string | null = null;
  let selfieUrl: string | null = null;
  if (role === "TENANT" && ktpFile && selfieFile) {
    const tempKey = `pending-${Date.now()}-${email.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20)}`;
    try {
      ktpUrl = await saveUploadedFile(ktpFile, `users/${tempKey}/ktp`);
      selfieUrl = await saveUploadedFile(selfieFile, `users/${tempKey}/selfie`);
    } catch (e) {
      // Cleanup: apa pun yang sudah tersimpan.
      await deleteUploadsByUrls([ktpUrl, selfieUrl]);
      return {
        error: e instanceof Error ? e.message : "Gagal upload dokumen. Coba lagi.",
      };
    }
  }

  // Status PENDING untuk OWNER dan TENANT.
  // TENANT langsung set onboardedAt karena dokumen sudah lengkap di
  // register — mereka tidak lagi perlu lewat /onboarding.
  const status = "PENDING";
  const now = new Date();

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role,
        status,
        phone,
        ...(role === "TENANT"
          ? {
              ktpPhotoUrl: ktpUrl,
              selfiePhotoUrl: selfieUrl,
              onboardedAt: now,
            }
          : {}),
      },
    });
  } catch (e) {
    // Kalau create user gagal (mis. race unique email), hapus file
    // yang barusan tersimpan supaya tidak numpuk di disk.
    if (ktpUrl || selfieUrl) {
      await deleteUploadsByUrls([ktpUrl, selfieUrl]);
    }
    return {
      error:
        e instanceof Error && e.message.includes("Unique")
          ? "Email sudah terdaftar. Silakan masuk."
          : "Gagal membuat akun. Coba lagi.",
    };
  }

  // Beritahu admin agar bisa segera meninjau.
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });
  await Promise.all(
    admins.map((a) =>
      notify({
        userId: a.id,
        type: role === "OWNER" ? "OWNER_PENDING" : "TENANT_PENDING",
        title:
          role === "OWNER"
            ? "Pendaftaran pemilik baru"
            : "Pendaftaran penghuni baru",
        message: `${user.name} (${user.email}) mengajukan akun ${
          role === "OWNER" ? "pemilik kos" : "penghuni"
        }.`,
        link: "/admin/users",
      })
    )
  );

  if (role === "OWNER") {
    // Owner: tidak ada session, langsung ke halaman menunggu.
    redirect("/register/pending");
  }

  // Beritahu semua owner aktif agar tahu ada calon penghuni baru.
  // TENANT sudah kirim dokumen lengkap di register, jadi mereka
  // langsung muncul di antrean "Pengajuan menunggu" owner.
  const owners = await prisma.user.findMany({
    where: { role: "OWNER", status: "ACTIVE" },
    select: { id: true },
  });
  await Promise.all(
    owners.map((o) =>
      notify({
        userId: o.id,
        type: "TENANT_PENDING",
        title: "Calon penghuni baru",
        message: `${user.name} mendaftar sebagai penghuni dengan dokumen lengkap dan menunggu persetujuan.`,
        link: "/tenants",
      })
    )
  );

  // TENANT: auto-login → langsung ke halaman menunggu persetujuan
  // (skip /onboarding karena dokumen sudah dikirim di register).
  await createSession({ userId: user.id, role: user.role as Role });
  redirect("/register/pending");
}

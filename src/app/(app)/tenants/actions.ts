"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ensureBillsForOneTenancy } from "@/lib/billing";
import { requireUser, canManageKos, getEffectiveOwnerId } from "@/lib/session";
import { notify } from "@/lib/notify";
import { sendTenantAssignedEmail, buildTenantAssignedWaText } from "@/lib/email";
import { sendWAWithTemplate } from "@/lib/wa-templates";
import { deleteUploadByUrl, deleteUploadsByUrls, saveUploadedFile } from "@/lib/upload";
import { logAudit } from "@/lib/audit";
import { hashPassword, normalizeEmail, isValidEmail } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";

function originFromHeaders(): string {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export type ApproveTenantState = { error?: string; success?: string };

async function requireOwnerOrAdmin() {
  const user = await requireUser();
  if (!canManageKos(user) && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/**
 * Setujui penghuni DAN langsung assign ke kamar pilihan owner. Akan
 * mengubah status PENDING -> ACTIVE, membuat Tenancy aktif, dan menandai
 * kamar OCCUPIED — semuanya dalam satu transaksi.
 */
export async function approveAndAssignTenant(
  _prev: ApproveTenantState,
  formData: FormData
): Promise<ApproveTenantState> {
  const me = await requireOwnerOrAdmin();
  const userId = String(formData.get("userId") ?? "");
  const roomId = String(formData.get("roomId") ?? "");
  const startDateRaw = String(formData.get("startDate") ?? "").trim();
  if (!userId) return { error: "User tidak ditemukan." };
  if (!roomId) return { error: "Pilih kamar terlebih dahulu." };

  // Parse tanggal mulai (YYYY-MM-DD). Default: hari ini.
  let startDate = new Date();
  if (startDateRaw) {
    const parsed = new Date(startDateRaw);
    if (isNaN(parsed.getTime())) {
      return { error: "Format tanggal mulai tidak valid." };
    }
    // Lock ke jam 00:00 local time supaya konsisten dengan logika billing.
    startDate = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate()
    );
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User tidak ditemukan." };
  if (target.role !== "TENANT") return { error: "Bukan akun penghuni." };

  // KTP + selfie wajib. Owner boleh upload atas nama penghuni via
  // uploadTenantDocs sebelum setuju.
  if (!target.ktpPhotoUrl || !target.selfiePhotoUrl) {
    const missing: string[] = [];
    if (!target.ktpPhotoUrl) missing.push("KTP");
    if (!target.selfiePhotoUrl) missing.push("foto diri");
    return {
      error: `Dokumen ${missing.join(" & ")} penghuni belum ada. Minta penghuni upload lewat onboarding, atau upload sendiri dari kartu ini sebelum menyetujui.`,
    };
  }

  // Cek kepemilikan kamar:
  // - OWNER hanya boleh assign ke kamar yang dia miliki.
  // - ADMIN boleh assign ke kamar manapun.
  const room = await prisma.room.findFirst({
    where:
      canManageKos(me)
        ? { id: roomId, kos: { ownerId: getEffectiveOwnerId(me) } }
        : { id: roomId },
    include: { kos: { select: { name: true, ownerId: true } } },
  });
  if (!room) return { error: "Kamar tidak ditemukan / bukan milik Anda." };
  if (room.status === "OCCUPIED") return { error: "Kamar sudah terisi." };

  const activeTenancy = await prisma.tenancy.findFirst({
    where: { tenantId: target.id, status: "ACTIVE" },
  });
  if (activeTenancy) {
    return { error: "Penghuni sudah punya tenancy aktif." };
  }

  const [, newTenancy] = await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { status: "ACTIVE" },
    }),
    prisma.tenancy.create({
      data: { tenantId: target.id, roomId: room.id, startDate },
    }),
    prisma.room.update({
      where: { id: room.id },
      data: { status: "OCCUPIED" },
    }),
  ]);

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "USER.APPROVE",
    entityType: "User",
    entityId: target.id,
    metadata: {
      tenantName: target.name,
      kosName: room.kos.name,
      roomName: room.name,
      startDate: startDate.toISOString(),
      tenancyId: newTenancy.id,
    },
  });

  const startStr = startDate.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  await notify({
    userId: target.id,
    type: "TENANT_APPROVED_ASSIGNED",
    title: "Akun disetujui & kamar di-assign",
    message: `${me.name} menyetujui akun Anda dan menempatkan Anda di ${room.kos.name} - Kamar ${room.name}. Mulai sewa: ${startStr}.`,
    link: "/dashboard",
  });

  // Kirim welcome email + WA — non-blocking, kedua channel independen.
  const welcomeParams = {
    tenantName: target.name,
    kosName: room.kos.name,
    roomName: room.name,
    startDate,
    monthlyPrice: room.monthlyPrice,
    loginUrl: `${originFromHeaders()}/login`,
  };
  if (target.email) {
    const result = await sendTenantAssignedEmail(target.email, welcomeParams);
    if (!result.delivered) {
      // eslint-disable-next-line no-console
      console.error("[approveAndAssignTenant] welcome email gagal:", result.error);
    }
  }
  if (target.phone) {
    try {
      await sendWAWithTemplate({
        phone: target.phone,
        text: buildTenantAssignedWaText(welcomeParams),
        template: {
          name: "tenant_assigned",
          params: [
            target.name,
            room.name,
            room.kos.name,
            startDate.toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            }),
            "Rp " + room.monthlyPrice.toLocaleString("id-ID"),
          ],
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[approveAndAssignTenant] welcome WA gagal:", e);
    }
  }

  revalidatePath("/tenants");
  revalidatePath(`/kos/${room.kosId}`);
  revalidatePath("/kos");
  revalidatePath("/admin/users");
  return { success: `${target.name} disetujui & ditempatkan di kamar ${room.name}.` };
}

export type UpdateStartDateState = { error?: string; success?: string };

/**
 * Pemilik/admin memperbarui tanggal mulai sewa pada tenancy yang sudah ada.
 * Otomatis revalidate halaman terkait sehingga dashboard penghuni ikut
 * ter-update tanpa reload manual.
 */
export async function updateTenancyStartDate(
  _prev: UpdateStartDateState,
  formData: FormData
): Promise<UpdateStartDateState> {
  const me = await requireOwnerOrAdmin();
  const tenancyId = String(formData.get("tenancyId") ?? "");
  const startDateRaw = String(formData.get("startDate") ?? "").trim();

  if (!tenancyId) return { error: "ID tenancy tidak ditemukan." };
  if (!startDateRaw) return { error: "Tanggal mulai wajib diisi." };

  const parsed = new Date(startDateRaw);
  if (isNaN(parsed.getTime())) {
    return { error: "Format tanggal tidak valid." };
  }
  const startDate = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: {
      tenant: { select: { id: true, name: true } },
      room: { include: { kos: true } },
    },
  });
  if (!tenancy) return { error: "Tenancy tidak ditemukan." };

  // OWNER hanya boleh edit tenancy di kos miliknya.
  if (canManageKos(me) && tenancy.room.kos.ownerId !== getEffectiveOwnerId(me)) {
    return { error: "Anda tidak punya akses untuk mengubah penghuni ini." };
  }

  // Validasi: tanggal mulai tidak boleh setelah endDate (jika tenancy ENDED).
  if (tenancy.endDate && startDate > tenancy.endDate) {
    return {
      error: "Tanggal mulai tidak boleh setelah tanggal akhir sewa.",
    };
  }

  await prisma.tenancy.update({
    where: { id: tenancy.id },
    data: { startDate },
  });

  // Cleanup tagihan yang tidak valid lagi karena startDate berubah.
  // Contoh: sebelumnya startDate Juni → tagihan Juni digenerate. Owner
  // update ke 30 Juli → tagihan Juni yang statusnya masih DUE/REJECTED
  // harus dihapus. PENDING/VERIFIED dilindungi (uang sudah/akan masuk).
  //
  // ensureBillsForOneTenancy juga sudah melakukan cleanup ini di
  // internal-nya (self-healing), tapi kita jalankan eksplisit di sini
  // supaya efek langsung terlihat + selanjutnya regenerate periode
  // baru sesuai startDate baru.
  await ensureBillsForOneTenancy(tenancy.id);

  // Notifikasi ke penghuni — agar mereka tahu jatuh tempo bulanan berubah.
  const startStr = startDate.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  await notify({
    userId: tenancy.tenant.id,
    type: "TENANCY_START_UPDATED",
    title: "Tanggal mulai sewa diperbarui",
    message: `Pemilik memperbarui tanggal mulai sewa Anda menjadi ${startStr}. Jatuh tempo bulanan akan mengikuti tanggal ini.`,
    link: "/dashboard",
  });

  revalidatePath("/tenants");
  revalidatePath("/dashboard");
  revalidatePath("/kos");
  revalidatePath(`/kos/${tenancy.room.kosId}`);
  revalidatePath("/payments");
  return { success: `Tanggal mulai sewa ${tenancy.tenant.name} diperbarui ke ${startStr}.` };
}

/**
 * Hapus penghuni beserta SEMUA data terkait (tenancy, payment, komplain,
 * move-request, notifikasi, reset-token, plus file upload KTP/selfie/
 * bukti bayar/foto komplain).
 *
 * Aturan akses:
 *  - ADMIN: boleh hapus penghuni siapa pun.
 *  - OWNER: hanya boleh hapus penghuni yang punya tenancy (aktif maupun
 *    sudah ENDED) di salah satu kos milik OWNER. Mencegah owner A
 *    menghapus tenant milik owner B.
 *  - Role selain ADMIN/OWNER → FORBIDDEN.
 *  - Target user harus role TENANT (tidak boleh hapus OWNER/ADMIN dari
 *    sini — admin punya nonaktifkan/aktifkan saja).
 *
 * Operasi:
 *  1. Kumpulkan semua file URL milik tenant (KTP, selfie, semua bukti
 *     bayar, semua foto komplain, semua foto resolusi).
 *  2. Set kamar yang sedang OCCUPIED oleh tenancy aktif → AVAILABLE.
 *  3. prisma.user.delete — Prisma onDelete: Cascade akan auto-hapus:
 *     Tenancy → Payment → ReminderLog + GatewayTransaction,
 *     Tenancy → Complaint, Tenancy → RoomMoveRequest,
 *     User → Notification, User → PasswordResetToken.
 *  4. Best-effort: unlink semua file upload yang dikumpulkan di step 1.
 */
export type DeleteTenantState = { error?: string; success?: string };

export async function deleteTenant(
  _prev: DeleteTenantState,
  formData: FormData
): Promise<DeleteTenantState> {
  const me = await requireOwnerOrAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "User tidak ditemukan." };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      tenancies: {
        include: {
          room: { select: { id: true, status: true, kos: { select: { ownerId: true } } } },
          payments: { select: { proofUrl: true } },
          complaints: { select: { photoUrls: true, resolutionPhotoUrls: true } },
        },
      },
    },
  });
  if (!target) return { error: "User tidak ditemukan." };
  if (target.role !== "TENANT") {
    return { error: "Hanya akun penghuni yang bisa dihapus dari sini." };
  }

  // Scope check untuk OWNER: tenant harus pernah tinggal di kos miliknya.
  if (canManageKos(me)) {
    const inMyKos = target.tenancies.some(
      (t) => t.room.kos.ownerId === getEffectiveOwnerId(me)
    );
    if (!inMyKos) {
      return { error: "Anda tidak punya akses untuk menghapus penghuni ini." };
    }
  }

  // === Step 1: kumpulkan semua file URL untuk dihapus dari disk ===
  const fileUrls: string[] = [];
  if (target.ktpPhotoUrl) fileUrls.push(target.ktpPhotoUrl);
  if (target.selfiePhotoUrl) fileUrls.push(target.selfiePhotoUrl);
  for (const ten of target.tenancies) {
    for (const p of ten.payments) {
      if (p.proofUrl) fileUrls.push(p.proofUrl);
    }
    for (const c of ten.complaints) {
      // photoUrls & resolutionPhotoUrls disimpan sebagai JSON string array.
      for (const raw of [c.photoUrls, c.resolutionPhotoUrls]) {
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const u of parsed) {
              if (typeof u === "string") fileUrls.push(u);
            }
          }
        } catch {
          // raw bukan JSON valid — skip
        }
      }
    }
  }

  // === Step 2: kumpulkan kamar yang perlu dibebaskan ===
  const roomsToFree = target.tenancies
    .filter((t) => t.room.status === "OCCUPIED")
    .map((t) => t.room.id);

  // === Step 2.5: hitung metadata cascade untuk audit trail ===
  // Total record yang akan hilang via FK Cascade Prisma schema:
  //   User → PasswordResetToken, Notification, PushSubscription, WaChatMessage
  //   User → Tenancy → Payment → ReminderLog + GatewayTransaction
  //   User → Tenancy → Complaint
  //   User → Tenancy → RoomMoveRequest
  //   User → AuditLog.actorId = SetNull (preserved, actor jadi null)
  // Hitung sebelum delete supaya angka valid untuk audit.
  const [
    paymentCount,
    complaintCount,
    moveRequestCount,
    notificationCount,
  ] = await Promise.all([
    prisma.payment.count({ where: { tenancy: { tenantId: target.id } } }),
    prisma.complaint.count({ where: { tenancy: { tenantId: target.id } } }),
    prisma.roomMoveRequest.count({
      where: { tenancy: { tenantId: target.id } },
    }),
    prisma.notification.count({ where: { userId: target.id } }),
  ]);

  // === Step 3: DB transaction — free rooms + delete user (cascade) ===
  try {
    await prisma.$transaction([
      ...roomsToFree.map((roomId) =>
        prisma.room.update({
          where: { id: roomId },
          data: { status: "AVAILABLE" },
        })
      ),
      prisma.user.delete({ where: { id: target.id } }),
    ]);
  } catch (e) {
    return {
      error: `Gagal menghapus penghuni: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  // === Step 4: best-effort file cleanup (jalan setelah DB sukses) ===
  await deleteUploadsByUrls(fileUrls);
  // Helper di atas membungkus deleteUploadByUrl per file & sudah
  // swallowing error per file, jadi aman dipanggil di sini.
  void deleteUploadByUrl; // mark as used (re-export guard)

  // === Step 5: audit log ===
  // Rekam siapa hapus siapa dengan metadata cascade lengkap — supaya
  // kalau ada dispute/inquiry di kemudian hari (mis. tenant klaim
  // "kok data saya hilang"), owner bisa buktikan aksi tercatat.
  // AuditLog entries dari tenant sendiri TIDAK ikut hilang karena
  // schema AuditLog.actorId punya onDelete: SetNull (bukan Cascade)
  // — actorId jadi null tapi entri log tetap ada.
  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "USER.DELETE",
    entityType: "User",
    entityId: target.id,
    metadata: {
      tenantName: target.name,
      email: target.email,
      cascade: {
        tenancies: target.tenancies.length,
        payments: paymentCount,
        complaints: complaintCount,
        moveRequests: moveRequestCount,
        notifications: notificationCount,
        filesDeleted: fileUrls.length,
        roomsFreed: roomsToFree.length,
      },
    },
  });

  revalidatePath("/tenants");
  revalidatePath("/kos");
  revalidatePath("/admin/users");
  return {
    success: `Penghuni "${target.name}" beserta ${target.tenancies.length} tenancy, ${paymentCount} pembayaran, ${complaintCount} komplain & ${fileUrls.length} file terkait telah dihapus permanen.`,
  };
}

export type UploadTenantDocsState = { error?: string; success?: string };

/**
 * Owner/admin upload KTP + selfie ATAS NAMA penghuni.
 *
 * Kasus pakai: penghuni PENDING tidak mampu / tidak mau upload sendiri
 * (mis. gaptek, HP tidak mendukung), owner sudah pegang copy KTP fisik.
 * Owner tetap dituntut untuk mendapat izin lisan dari penghuni.
 *
 * Bisa dipakai juga untuk mengganti dokumen penghuni AKTIF yang buram /
 * salah upload.
 *
 * Akses: OWNER (hanya untuk tenant di kos-nya), ADMIN (bebas).
 * Untuk tenant AKTIF: OWNER dibatasi lewat cek tenancy.
 * Untuk tenant PENDING (belum ada tenancy): OWNER selalu boleh — karena
 * PendingTenantCard yang menampilkannya sudah discope owner-side.
 */
export async function uploadTenantDocs(
  _prev: UploadTenantDocsState,
  formData: FormData
): Promise<UploadTenantDocsState> {
  const me = await requireOwnerOrAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "User tidak ditemukan." };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      tenancies: {
        select: { room: { select: { kos: { select: { ownerId: true } } } } },
      },
    },
  });
  if (!target) return { error: "User tidak ditemukan." };
  if (target.role !== "TENANT") {
    return { error: "Hanya akun penghuni yang bisa diupload dokumennya." };
  }

  // Scope untuk OWNER: tenant PENDING boleh, tenant AKTIF hanya kalau ada
  // tenancy di kos milik effective owner.
  if (canManageKos(me)) {
    const hasActiveInMyKos = target.tenancies.some(
      (t) => t.room.kos.ownerId === getEffectiveOwnerId(me)
    );
    if (target.status !== "PENDING" && !hasActiveInMyKos) {
      return { error: "Anda tidak punya akses untuk mengupload dokumen penghuni ini." };
    }
  }

  const ktpFile = formData.get("ktp");
  const selfieFile = formData.get("selfie");

  const hasKtp = ktpFile instanceof File && ktpFile.size > 0;
  const hasSelfie = selfieFile instanceof File && selfieFile.size > 0;
  if (!hasKtp && !hasSelfie) {
    return { error: "Pilih minimal satu file (KTP atau foto diri) untuk diupload." };
  }

  const updates: {
    ktpPhotoUrl?: string;
    selfiePhotoUrl?: string;
    onboardedAt?: Date;
  } = {};
  const oldFilesToDelete: string[] = [];

  try {
    if (hasKtp) {
      const url = await saveUploadedFile(ktpFile as File, `users/${target.id}/ktp`);
      if (target.ktpPhotoUrl) oldFilesToDelete.push(target.ktpPhotoUrl);
      updates.ktpPhotoUrl = url;
    }
    if (hasSelfie) {
      const url = await saveUploadedFile(selfieFile as File, `users/${target.id}/selfie`);
      if (target.selfiePhotoUrl) oldFilesToDelete.push(target.selfiePhotoUrl);
      updates.selfiePhotoUrl = url;
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal upload file." };
  }

  // Kalau setelah upload ini KTP + selfie sudah lengkap, tandai onboarded
  // supaya redirect middleware tidak paksa penghuni ke /onboarding lagi.
  const willHaveKtp = updates.ktpPhotoUrl ?? target.ktpPhotoUrl;
  const willHaveSelfie = updates.selfiePhotoUrl ?? target.selfiePhotoUrl;
  if (willHaveKtp && willHaveSelfie && !target.onboardedAt) {
    updates.onboardedAt = new Date();
  }

  await prisma.user.update({
    where: { id: target.id },
    data: updates,
  });

  // Best-effort: hapus file lama supaya tidak numpuk di disk.
  await deleteUploadsByUrls(oldFilesToDelete);

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "USER.APPROVE",
    entityType: "User",
    entityId: target.id,
    metadata: {
      subAction: "UPLOAD_DOCS_ON_BEHALF",
      tenantName: target.name,
      uploaded: {
        ktp: hasKtp,
        selfie: hasSelfie,
      },
    },
  });

  revalidatePath("/tenants");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${target.id}`);
  const uploaded = [
    hasKtp ? "KTP" : null,
    hasSelfie ? "foto diri" : null,
  ]
    .filter(Boolean)
    .join(" & ");
  return { success: `${uploaded} berhasil diupload untuk ${target.name}.` };
}

/**
 * Tolak pengajuan penghuni (status PENDING -> SUSPENDED).
 */
export async function rejectTenant(
  _prev: ApproveTenantState,
  formData: FormData
): Promise<ApproveTenantState> {
  const me = await requireOwnerOrAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "User tidak ditemukan." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== "TENANT" || target.status !== "PENDING") {
    return { error: "User tidak valid untuk ditolak." };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { status: "SUSPENDED" },
  });
  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "USER.REJECT",
    entityType: "User",
    entityId: target.id,
    metadata: { tenantName: target.name, email: target.email },
  });
  await notify({
    userId: target.id,
    type: "TENANT_REJECTED",
    title: "Pengajuan akun ditolak",
    message:
      "Mohon maaf, pengajuan akun penghuni Anda tidak disetujui. Silakan hubungi administrator / pemilik kos.",
    link: "/login",
  });
  revalidatePath("/tenants");
  revalidatePath("/admin/users");
  return { success: `${target.name} ditolak.` };
}

export type OwnerRegisterTenantState = {
  error?: string;
  success?: string;
  /** Konteks lengkap untuk client render tombol "Kirim via WhatsApp". */
  registered?: {
    tenantName: string;
    phone: string;
    kosName: string;
    roomName: string;
    startDate: string;
    monthlyPrice: number;
    /** Password yang dipakai owner — untuk disebutkan di pesan WA. */
    password: string;
  };
};

/**
 * Pemilik mendaftarkan penghuni SEKALIGUS menempatkan ke kamar dan
 * mulai kontrak. All-in-one — cocok untuk penghuni "gaptek" yang tidak
 * bisa self-register.
 *
 * Design decisions:
 *  - HP wajib (dipakai sebagai identity login) & harus unik antar user.
 *  - Email auto-generate dari HP: `<phone>@baitikos.local`. Owner
 *    tidak perlu isi email; tenant login pakai HP.
 *  - Password default = "baitikos" (dari form). Owner boleh ubah, tapi
 *    default-nya seragam supaya owner mudah share verbal.
 *  - KTP + selfie TIDAK wajib di step ini — bisa dilengkapi nanti oleh
 *    owner (via /tenants) atau tenant sendiri (via /onboarding).
 *  - onboardedAt di-set null: kelengkapan dokumen belum selesai.
 *  - Tenancy langsung ACTIVE + Room langsung OCCUPIED — owner tidak
 *    perlu approve lagi.
 */
export async function ownerRegisterTenant(
  _prev: OwnerRegisterTenantState,
  formData: FormData
): Promise<OwnerRegisterTenantState> {
  const me = await requireOwnerOrAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const roomId = String(formData.get("roomId") ?? "");
  const startDateRaw = String(formData.get("startDate") ?? "").trim();

  // Validasi field.
  if (name.length < 2) return { error: "Nama wajib diisi (min 2 karakter)." };
  if (password.length < 4) return { error: "Password minimal 4 karakter." };
  if (!phoneRaw) return { error: "Nomor HP wajib diisi." };
  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    return { error: "Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx." };
  }
  if (!roomId) return { error: "Pilih kamar terlebih dahulu." };
  if (!startDateRaw) return { error: "Tanggal mulai wajib diisi." };

  const parsed = new Date(startDateRaw);
  if (isNaN(parsed.getTime())) {
    return { error: "Format tanggal mulai tidak valid." };
  }
  const startDate = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );

  // Cek HP tidak dipakai user lain — HP jadi identity login, harus unik.
  const existingByPhone = await prisma.user.findFirst({
    where: { phone },
    select: { id: true, name: true, role: true },
  });
  if (existingByPhone) {
    return {
      error: `Nomor HP ini sudah terdaftar atas nama ${existingByPhone.name}. Gunakan nomor lain atau minta pemilik lain hapus akun tersebut.`,
    };
  }

  // Auto-generate email dari HP supaya schema tetap konsisten (email
  // NOT NULL + UNIQUE). Owner tidak perlu isi. Format:
  // <phone-tanpa-simbol>@baitikos.local — deterministic & unik selama
  // phone unik.
  const email = normalizeEmail(`${phone.replace(/[^0-9]/g, "")}@baitikos.local`);
  if (!isValidEmail(email)) {
    // Practically impossible sinced phone sudah lolos normalizePhone,
    // tapi guard tetap ada untuk defensive.
    return { error: "Gagal generate email dari HP. Cek format nomor HP." };
  }

  // Kalau ada race condition atau data legacy, email auto-generated
  // mungkin sudah dipakai (mis. dari registrasi owner sebelumnya).
  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    return {
      error: `Nomor HP ini sudah pernah didaftarkan (email otomatis ${email} sudah ada). Coba refresh atau hubungi admin.`,
    };
  }

  // Cek kamar valid & owned by this owner + belum terisi.
  const room = await prisma.room.findFirst({
    where: canManageKos(me)
      ? { id: roomId, kos: { ownerId: getEffectiveOwnerId(me) } }
      : { id: roomId },
    include: { kos: { select: { id: true, name: true, ownerId: true } } },
  });
  if (!room) return { error: "Kamar tidak ditemukan / bukan milik Anda." };
  if (room.status === "OCCUPIED") return { error: "Kamar sudah terisi." };

  const passwordHash = await hashPassword(password);

  // Bikin user + tenancy + occupy room dalam satu interactive
  // transaction. onboardedAt di-set null: dokumen belum lengkap,
  // owner atau tenant lengkapi nanti.
  let created: { user: { id: string; name: string }; tenancyId: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          role: "TENANT",
          status: "ACTIVE",
          phone,
          // KTP + selfie sengaja null — akan diupload nanti.
          ktpPhotoUrl: null,
          selfiePhotoUrl: null,
          onboardedAt: null,
        },
      });
      const tenancy = await tx.tenancy.create({
        data: {
          tenantId: user.id,
          roomId: room.id,
          startDate,
        },
      });
      await tx.room.update({
        where: { id: room.id },
        data: { status: "OCCUPIED" },
      });
      return { user: { id: user.id, name: user.name }, tenancyId: tenancy.id };
    });
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes("Unique")
          ? "Data sudah terdaftar (kemungkinan HP atau email bentrok). Coba lagi."
          : "Gagal membuat akun penghuni. Coba lagi.",
    };
  }

  // Generate tagihan pertama langsung supaya owner tidak perlu tunggu
  // load /payments untuk melihat tagihan bulan ini.
  await ensureBillsForOneTenancy(created.tenancyId);

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "USER.OWNER_REGISTER",
    entityType: "User",
    entityId: created.user.id,
    metadata: {
      tenantName: created.user.name,
      email,
      kosName: room.kos.name,
      roomName: room.name,
      startDate: startDate.toISOString(),
      tenancyId: created.tenancyId,
    },
  });

  const startStr = startDate.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Notifikasi in-app ke penghuni — record tetap ada meskipun mereka
  // mungkin belum pernah buka app.
  await notify({
    userId: created.user.id,
    type: "TENANT_APPROVED_ASSIGNED",
    title: "Akun dibuat oleh pemilik kos",
    message: `Pemilik kos ${me.name} mendaftarkan Anda dan menempatkan di ${room.kos.name} - Kamar ${room.name}. Mulai sewa: ${startStr}.`,
    link: "/dashboard",
  });

  // Auto-send WA sengaja SKIP. Owner akan klik tombol "Kirim via
  // WhatsApp" di panel sukses — pesan dikirim dari nomor pribadi owner
  // sendiri (100% delivery, tanpa template Meta, kontak WA owner ↔
  // penghuni langsung terbentuk).

  revalidatePath("/tenants");
  revalidatePath("/dashboard");
  revalidatePath("/kos");
  revalidatePath(`/kos/${room.kos.id}`);
  revalidatePath("/payments");
  revalidatePath("/admin/users");

  return {
    success: `${created.user.name} berhasil didaftarkan & ditempatkan di ${room.kos.name} - Kamar ${room.name}.`,
    registered: {
      tenantName: created.user.name,
      phone,
      kosName: room.kos.name,
      roomName: room.name,
      startDate: startDate.toISOString(),
      monthlyPrice: room.monthlyPrice,
      password,
    },
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { generateResetToken, hashToken, isDevEmailMode } from "@/lib/email";
import { sendEmailGeneric } from "@/lib/reminders";
import { logAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";

/**
 * Fitur "Anggota Tim" (Pengelola) — hanya OWNER yang boleh manage.
 * MANAGER TIDAK boleh invite/revoke MANAGER lain (dicegah di guard).
 *
 * Alur:
 *   inviteManager(email)          → create ManagerInvite + kirim email
 *   acceptInvite(token, name, pw) → create User role=MANAGER + login (di file terpisah)
 *   revokeManager(managerId)      → hapus akun MANAGER
 */

async function requireOwner() {
  const me = await requireUser();
  if (me.role !== "OWNER") throw new Error("FORBIDDEN");
  return me;
}

export type InviteState = {
  error?: string;
  success?: string;
  /** Hanya di mode dev — link invite di-attach supaya bisa dibuka
   *  tanpa perlu email keluar. */
  devLink?: string;
};

const INVITE_EXPIRY_HOURS = 72;

function originFromHeaders(): string {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function inviteManager(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  const me = await requireOwner();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !isValidEmail(email)) {
    return { error: "Email tidak valid." };
  }
  if (email === me.email.toLowerCase()) {
    return { error: "Anda tidak bisa mengundang diri sendiri." };
  }

  // Cek: email sudah pakai akun aktif? Kalau ya, cek role-nya.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, managedByOwnerId: true, name: true },
  });
  if (existing) {
    if (
      existing.role === "MANAGER" &&
      existing.managedByOwnerId === me.id
    ) {
      return {
        error: `${existing.name} sudah menjadi pengelola Anda.`,
      };
    }
    return {
      error:
        "Email ini sudah terdaftar di sistem sebagai akun lain. Gunakan email berbeda.",
    };
  }

  // Cek invite yang masih aktif untuk email yang sama dari owner ini —
  // hindari spam invite ganda. Kalau ada, refresh expiry-nya alih-alih
  // bikin duplikat.
  const existingInvite = await prisma.managerInvite.findFirst({
    where: {
      ownerId: me.id,
      email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  const { token, tokenHash } = generateResetToken();
  const expiresAt = new Date(
    Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000
  );

  if (existingInvite) {
    await prisma.managerInvite.update({
      where: { id: existingInvite.id },
      data: { tokenHash, expiresAt },
    });
  } else {
    await prisma.managerInvite.create({
      data: { ownerId: me.id, email, tokenHash, expiresAt },
    });
  }

  const inviteUrl = `${originFromHeaders()}/invite/${token}`;

  // Kirim email undangan (best-effort). Body friendly, jelaskan
  // konteks siapa yang mengundang.
  const subject = `Undangan menjadi Pengelola di Kos Baiti`;
  const body = `Halo,

${me.name} mengundang Anda menjadi Pengelola di aplikasi Kos Baiti.

Sebagai Pengelola, Anda akan bantu ${me.name} mengelola kos: cek pembayaran, verifikasi bukti transfer, tanggapi komplain penghuni, kirim pengumuman, dan pantau perawatan kos.

Terima undangan lewat link berikut (berlaku 3 hari):
${inviteUrl}

Saat menerima undangan, Anda akan diminta:
- Nama lengkap
- Nomor WhatsApp aktif (wajib — untuk notifikasi & fitur chat AI)
- Password akun

Kalau Anda tidak mengenal ${me.name} atau tidak merasa mengharapkan undangan ini, abaikan email ini.

-Asisten AI KosBaiti-`;

  try {
    await sendEmailGeneric(email, subject, body);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[manager-invite] email fail:", e);
    // Jangan return error — tetap sukses secara sistem (invite tercatat),
    // owner bisa copy link manual dari devLink kalau perlu.
  }

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "MANAGER.INVITE",
    entityType: "ManagerInvite",
    entityId: null,
    metadata: {
      inviteeEmail: email,
      expiresAt: expiresAt.toISOString(),
    },
  });

  revalidatePath("/managers");
  return {
    success: `Undangan terkirim ke ${email}. Link berlaku ${INVITE_EXPIRY_HOURS} jam.`,
    devLink: isDevEmailMode() ? inviteUrl : undefined,
  };
}

export type RevokeState = { error?: string; success?: string };

/**
 * Cabut akses pengelola — hard delete akun MANAGER. Cascade:
 *   User → semua Notification/PushSubscription/AuditLog.actorId=SetNull
 *   dsb. TIDAK menghapus data kos milik owner (karena User.ownedKos
 *   milik OWNER, bukan MANAGER — jadi kos tetap aman).
 */
export async function revokeManager(
  _prev: RevokeState,
  formData: FormData
): Promise<RevokeState> {
  const me = await requireOwner();
  const managerId = String(formData.get("managerId") ?? "");
  if (!managerId) return { error: "ID pengelola tidak valid." };

  const target = await prisma.user.findFirst({
    where: {
      id: managerId,
      role: "MANAGER",
      managedByOwnerId: me.id, // hard-scope: hanya pengelola milik owner ini
    },
    select: { id: true, name: true, email: true },
  });
  if (!target) {
    return {
      error:
        "Pengelola tidak ditemukan atau Anda tidak punya izin untuk mencabut akses.",
    };
  }

  await prisma.user.delete({ where: { id: target.id } });

  await logAudit({
    actorId: me.id,
    actorName: me.name,
    action: "MANAGER.REVOKE",
    entityType: "User",
    entityId: target.id,
    metadata: {
      managerName: target.name,
      managerEmail: target.email,
    },
  });

  revalidatePath("/managers");
  return {
    success: `Akses ${target.name} sudah dicabut.`,
  };
}

export type CancelInviteState = { error?: string; success?: string };

/** Batalkan invite yang belum diaccept — hapus row supaya link mati. */
export async function cancelInvite(
  _prev: CancelInviteState,
  formData: FormData
): Promise<CancelInviteState> {
  const me = await requireOwner();
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) return { error: "ID undangan tidak valid." };

  const inv = await prisma.managerInvite.findFirst({
    where: { id: inviteId, ownerId: me.id, acceptedAt: null },
  });
  if (!inv) return { error: "Undangan tidak ditemukan." };

  await prisma.managerInvite.delete({ where: { id: inv.id } });

  revalidatePath("/managers");
  return { success: "Undangan dibatalkan." };
}

/**
 * Server action untuk halaman /invite/[token] — dipanggil setelah
 * calon pengelola isi form (name + password). Membuat akun MANAGER
 * dan langsung login.
 *
 * SENGAJA di file ini (bukan di app/invite/[token]/actions.ts) supaya
 * semua manager-related actions terpusat.
 */
export type AcceptInviteState = { error?: string; redirectTo?: string };

export async function acceptManagerInvite(
  _prev: AcceptInviteState,
  formData: FormData
): Promise<AcceptInviteState> {
  const token = String(formData.get("token") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { error: "Token tidak valid." };
  if (name.length < 2) return { error: "Nama minimal 2 karakter." };
  if (password.length < 8) return { error: "Password minimal 8 karakter." };
  if (password !== confirm) return { error: "Konfirmasi password tidak cocok." };

  // Nomor WA WAJIB untuk pengelola — supaya bisa terima notifikasi &
  // pakai fitur chat AI via WhatsApp. Bot AI cocokkan sender WA
  // dengan User.phone; kalau nomor kosong / tidak match, bot tidak
  // bisa mengenal pengelola.
  if (!phoneRaw) {
    return {
      error:
        "Nomor WhatsApp wajib diisi — supaya bisa dapat notifikasi & pakai chat AI Kos Baiti.",
    };
  }
  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    return {
      error: "Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx.",
    };
  }

  const tokenHash = hashToken(token);
  const invite = await prisma.managerInvite.findUnique({
    where: { tokenHash },
    include: { owner: { select: { id: true, name: true } } },
  });
  if (!invite) return { error: "Undangan tidak ditemukan atau sudah dipakai." };
  if (invite.acceptedAt) {
    return { error: "Undangan sudah pernah diterima." };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return { error: "Undangan sudah kedaluwarsa. Minta pemilik mengirim ulang." };
  }

  // Extra safety: kalau di tengah proses accept, ada user lain daftar
  // dengan email yang sama.
  const emailTaken = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  });
  if (emailTaken) {
    return {
      error:
        "Email ini sudah dipakai akun lain di sistem. Hubungi pemilik untuk mengirim ulang undangan ke email berbeda.",
    };
  }

  const { hashPassword } = await import("@/lib/password");
  const passwordHash = await hashPassword(password);

  const [manager] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: invite.email,
        passwordHash,
        name,
        phone,
        role: "MANAGER",
        status: "ACTIVE",
        managedByOwnerId: invite.ownerId,
      },
    }),
    prisma.managerInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  await logAudit({
    actorId: manager.id,
    actorName: manager.name,
    action: "MANAGER.ACCEPT",
    entityType: "User",
    entityId: manager.id,
    metadata: {
      ownerId: invite.ownerId,
      ownerName: invite.owner.name,
      inviteEmail: invite.email,
    },
  });

  // Auto-login via createSession dari session lib
  const { createSession } = await import("@/lib/session");
  await createSession({ userId: manager.id, role: "MANAGER" });

  return { redirectTo: "/dashboard" };
}

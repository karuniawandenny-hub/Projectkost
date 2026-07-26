import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/email";
import { AcceptInviteForm } from "./AcceptInviteForm";

/**
 * Halaman public untuk terima undangan pengelola.
 *
 * URL: /invite/[token] — token asli (bukan hash) dikirim via email.
 * Halaman ini validasi token, tampilkan info pengundang, minta calon
 * pengelola set nama + password. Setelah submit sukses, auto-login
 * dan redirect ke /dashboard.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  if (!token || token.length < 32) {
    return <InvalidState reason="Link undangan tidak valid." />;
  }

  const tokenHash = hashToken(token);
  const invite = await prisma.managerInvite.findUnique({
    where: { tokenHash },
    include: {
      owner: {
        select: { name: true, email: true },
      },
    },
  });

  if (!invite) {
    return (
      <InvalidState reason="Undangan tidak ditemukan. Mungkin sudah dibatalkan pemilik." />
    );
  }
  if (invite.acceptedAt) {
    return (
      <InvalidState
        reason="Undangan ini sudah pernah diterima. Silakan langsung login."
        showLogin
      />
    );
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return (
      <InvalidState
        reason="Undangan sudah kedaluwarsa (berlaku 3 hari). Minta pemilik mengirim ulang."
      />
    );
  }

  // Kalau email sudah dipakai user lain — tolak juga
  const emailTaken = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  });
  if (emailTaken) {
    return (
      <InvalidState
        reason="Email undangan ini sudah dipakai akun lain di sistem. Hubungi pemilik untuk kirim undangan ke email berbeda."
      />
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-8">
      <div className="text-center">
        <div className="text-4xl">📩</div>
        <h1 className="mt-2 text-2xl font-bold">Undangan Pengelola</h1>
        <p className="mt-1 text-sm text-slate-600">
          <strong className="text-slate-900">{invite.owner.name}</strong>{" "}
          mengundang Anda menjadi pengelola di aplikasi{" "}
          <strong>Kos Baiti</strong>.
        </p>
      </div>

      <div className="card">
        <div className="mb-3 rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Undangan untuk email: <strong>{invite.email}</strong>
        </div>
        <AcceptInviteForm token={token} email={invite.email} />
      </div>

      <p className="text-center text-xs text-slate-500">
        Sudah pernah punya akun? <Link href="/login" className="text-brand-700 hover:underline">Masuk di sini</Link>
      </p>
    </div>
  );
}

function InvalidState({
  reason,
  showLogin,
}: {
  reason: string;
  showLogin?: boolean;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center space-y-4">
      <div className="text-5xl">⚠️</div>
      <h1 className="text-xl font-bold">Undangan tidak dapat diproses</h1>
      <p className="text-sm text-slate-600">{reason}</p>
      {showLogin ? (
        <Link href="/login" className="btn-primary inline-block">
          Ke halaman login
        </Link>
      ) : (
        <Link href="/" className="text-sm text-brand-700 hover:underline">
          Kembali ke beranda
        </Link>
      )}
    </div>
  );
}

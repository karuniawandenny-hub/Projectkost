import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.onboardedAt) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <img
              src="/kos-baiti-logo.png"
              alt="Kos Baiti"
              width={48}
              height={48}
              className="h-12 w-12 max-w-full object-contain"
            />
          </div>
          <form action="/logout" method="POST">
            <button className="text-sm text-slate-600 hover:underline">Keluar</button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="card">
          <h1 className="text-2xl font-semibold">Lengkapi dokumen identitas</h1>
          <p className="mt-1 text-sm text-slate-600">
            Akun Anda terdaftar sebelum sistem mewajibkan upload dokumen di
            halaman register. Silakan lengkapi foto KTP &amp; foto diri Anda
            sekarang — tanpa keduanya, pengajuan Anda belum bisa ditinjau
            pemilik kos.
          </p>

          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <div className="font-semibold">⚠️ Wajib diupload</div>
            <p className="mt-1">
              Foto KTP &amp; foto diri hanya bisa dilihat oleh pemilik kos
              tempat Anda menginap dan administrator sistem. Data Anda dijaga
              sesuai kebijakan privasi.
            </p>
          </div>

          <div className="mt-6">
            <OnboardingForm />
          </div>
        </div>
      </div>
    </main>
  );
}

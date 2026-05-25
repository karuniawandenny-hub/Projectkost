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
          <h1 className="text-2xl font-semibold">Lengkapi data diri</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sebelum mulai, unggah foto KTP dan foto diri Anda. Data ini wajib dan
            hanya bisa dilihat oleh pemilik kos tempat Anda menginap.
          </p>
          <div className="mt-6">
            <OnboardingForm />
          </div>
        </div>
      </div>
    </main>
  );
}

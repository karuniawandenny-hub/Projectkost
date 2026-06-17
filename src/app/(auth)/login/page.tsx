import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { reset?: string; reason?: string };
}) {
  const resetSuccess = searchParams.reset === "success";
  const idleLogout = searchParams.reason === "idle";

  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Masuk</h1>
      <p className="mt-1 text-sm text-slate-600">
        Masuk dengan email dan password Anda.
      </p>

      {resetSuccess && (
        <div className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Password Anda berhasil diperbarui. Silakan masuk dengan password baru.
        </div>
      )}

      {idleLogout && (
        <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Anda otomatis logout karena tidak ada aktivitas. Silakan masuk
          kembali untuk melanjutkan.
        </div>
      )}

      <LoginForm />

      <div className="mt-4 flex flex-col items-center gap-2 text-sm text-slate-600">
        <Link
          href="/forgot-password"
          className="font-medium text-brand-700 hover:underline"
        >
          Lupa password?
        </Link>
        <span>
          Belum punya akun?{" "}
          <Link href="/register" className="font-medium text-brand-700 hover:underline">
            Daftar
          </Link>
        </span>
      </div>
    </div>
  );
}

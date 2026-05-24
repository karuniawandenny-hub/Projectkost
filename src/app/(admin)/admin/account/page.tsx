import { requireUser } from "@/lib/session";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function AdminAccountPage() {
  const me = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Akun Saya</h1>
        <p className="text-slate-600">Kelola kredensial akun administrator.</p>
      </div>

      <div className="card">
        <div className="mb-4">
          <div className="text-sm text-slate-500">Username</div>
          <div className="font-medium">{me.username ?? "—"}</div>
        </div>
        <div className="mb-4">
          <div className="text-sm text-slate-500">Nama</div>
          <div className="font-medium">{me.name}</div>
        </div>
        <div>
          <div className="text-sm text-slate-500">Email</div>
          <div className="font-medium">{me.email ?? "—"}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">Ganti password</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}

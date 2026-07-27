import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { approveUser, rejectUser, setUserStatus } from "../../actions";
import { EmptyState, UsersIcon } from "@/components/EmptyState";
import { BulkActions, BulkCheckbox } from "./BulkActions";
import { DeleteTenantButton } from "../../../(app)/tenants/DeleteTenantButton";

const PER_PAGE = 50;

type SearchParams = {
  role?: string;
  status?: string;
  q?: string;
  page?: string;
};

function clampPage(p: number): number {
  if (!Number.isFinite(p) || p < 1) return 1;
  return Math.floor(p);
}

function RoleBadge({ role }: { role: string }) {
  if (role === "ADMIN") return <span className="badge-blue">Admin</span>;
  if (role === "OWNER") return <span className="badge-green">Pemilik</span>;
  return <span className="badge-slate">Penghuni</span>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PENDING") return <span className="badge-yellow">Menunggu</span>;
  if (status === "SUSPENDED") return <span className="badge-red">Nonaktif</span>;
  return <span className="badge-green">Aktif</span>;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const where: Record<string, unknown> = {};
  if (searchParams.role && ["OWNER", "TENANT", "ADMIN"].includes(searchParams.role)) {
    where.role = searchParams.role;
  }
  if (
    searchParams.status &&
    ["ACTIVE", "PENDING", "SUSPENDED"].includes(searchParams.status)
  ) {
    where.status = searchParams.status;
  }
  if (searchParams.q && searchParams.q.trim()) {
    const q = searchParams.q.trim();
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { username: { contains: q } },
      { phone: { contains: q } },
    ];
  }

  const page = clampPage(Number(searchParams.page ?? 1));

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const pendingUserIds = users
    .filter(
      (u) =>
        u.status === "PENDING" && (u.role === "OWNER" || u.role === "TENANT")
    )
    .map((u) => u.id);

  function buildQuery(patch: Record<string, string | null>): string {
    const params = new URLSearchParams();
    if (searchParams.role) params.set("role", searchParams.role);
    if (searchParams.status) params.set("status", searchParams.status);
    if (searchParams.q) params.set("q", searchParams.q);
    if (page > 1) params.set("page", String(page));
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  }

  const filters = [
    {
      href: buildQuery({ role: null, status: null, page: null }),
      label: "Semua",
      active: !searchParams.role && !searchParams.status,
    },
    {
      href: buildQuery({ status: "PENDING", role: null, page: null }),
      label: "Menunggu approval",
      active:
        searchParams.status === "PENDING" && !searchParams.role,
    },
    {
      href: buildQuery({ role: "OWNER", status: null, page: null }),
      label: "Pemilik",
      active: searchParams.role === "OWNER",
    },
    {
      href: buildQuery({ role: "TENANT", status: null, page: null }),
      label: "Penghuni",
      active: searchParams.role === "TENANT",
    },
    {
      href: buildQuery({ role: "ADMIN", status: null, page: null }),
      label: "Admin",
      active: searchParams.role === "ADMIN",
    },
    {
      href: buildQuery({ status: "SUSPENDED", role: null, page: null }),
      label: "Nonaktif",
      active:
        searchParams.status === "SUSPENDED" && !searchParams.role,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Pengguna</h1>
        <p className="text-slate-600">Kelola akun, hak akses, dan status user.</p>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Cari (nama / email / username / HP)</label>
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            className="input"
            placeholder="ketik untuk mencari"
          />
        </div>
        <input type="hidden" name="role" value={searchParams.role ?? ""} />
        <input type="hidden" name="status" value={searchParams.status ?? ""} />
        <button type="submit" className="btn-primary">Cari</button>
      </form>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              f.active
                ? "border-brand-500 bg-brand-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <BulkActions pendingUserIds={pendingUserIds} />

      <div className="space-y-2">
        {users.length === 0 && (
          <EmptyState
            icon={<UsersIcon />}
            title="Tidak ada pengguna"
            description="Tidak ada user yang cocok dengan filter. Coba ubah filter atau search."
          />
        )}
        {users.map((u) => {
          const isPending =
            u.status === "PENDING" &&
            (u.role === "OWNER" || u.role === "TENANT");
          return (
          <div key={u.id} className="card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {isPending && (
                  <div className="mt-1">
                    <BulkCheckbox userId={u.id} />
                  </div>
                )}
                <div className="min-w-0">
                <Link
                  href={`/admin/users/${u.id}`}
                  className="font-semibold hover:underline"
                >
                  {u.name}
                </Link>
                <div className="text-xs text-slate-500">
                  {u.email}
                  {u.username ? ` • @${u.username}` : ""}
                  {u.phone ? ` • ${u.phone}` : ""}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <RoleBadge role={u.role} />
                  <StatusBadge status={u.status} />
                  {u.role === "TENANT" &&
                    (!u.ktpPhotoUrl || !u.selfiePhotoUrl) && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                        Dok kurang
                      </span>
                    )}
                </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {u.status === "PENDING" &&
                  (u.role === "OWNER" || u.role === "TENANT") && (
                    <>
                      {/* TENANT hanya boleh disetujui setelah KTP + selfie
                          diupload. Kalau belum, arahkan admin ke halaman
                          detail untuk upload atas nama tenant. */}
                      {u.role === "TENANT" &&
                      (!u.ktpPhotoUrl || !u.selfiePhotoUrl) ? (
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="btn-secondary text-xs"
                        >
                          Butuh KTP/selfie →
                        </Link>
                      ) : (
                        <form action={approveUser}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button type="submit" className="btn-success">
                            Setujui
                          </button>
                        </form>
                      )}
                      <form action={rejectUser}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button type="submit" className="btn-danger">
                          Tolak
                        </button>
                      </form>
                    </>
                  )}
                {u.status === "ACTIVE" && u.role !== "ADMIN" && (
                  <form action={setUserStatus}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="status" value="SUSPENDED" />
                    <button type="submit" className="btn-danger">
                      Nonaktifkan
                    </button>
                  </form>
                )}
                {u.status === "SUSPENDED" && (
                  <form action={setUserStatus}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="status" value="ACTIVE" />
                    <button type="submit" className="btn-success">
                      Aktifkan
                    </button>
                  </form>
                )}
                {u.role === "TENANT" && (
                  <DeleteTenantButton
                    userId={u.id}
                    tenantName={u.name}
                    buttonLabel="Hapus permanen"
                  />
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="text-xs text-slate-500">
            Halaman {page} dari {totalPages} · {total} pengguna
          </div>
          <div className="flex gap-1">
            {page > 1 ? (
              <Link
                href={buildQuery({ page: String(page - 1) })}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ← Sebelumnya
              </Link>
            ) : (
              <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-400">
                ← Sebelumnya
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={buildQuery({ page: String(page + 1) })}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Berikutnya →
              </Link>
            ) : (
              <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-400">
                Berikutnya →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

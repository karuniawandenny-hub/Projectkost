import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { approveUser, rejectUser, setUserStatus } from "../../actions";

type SearchParams = {
  role?: string;
  status?: string;
  q?: string;
};

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

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const filters = [
    { href: "/admin/users", label: "Semua" },
    { href: "/admin/users?status=PENDING", label: "Menunggu approval" },
    { href: "/admin/users?role=OWNER", label: "Pemilik" },
    { href: "/admin/users?role=TENANT", label: "Penghuni" },
    { href: "/admin/users?role=ADMIN", label: "Admin" },
    { href: "/admin/users?status=SUSPENDED", label: "Nonaktif" },
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
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50"
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {users.length === 0 && (
          <div className="card text-sm text-slate-500">
            Tidak ada pengguna yang cocok dengan filter.
          </div>
        )}
        {users.map((u) => (
          <div key={u.id} className="card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
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
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {u.status === "PENDING" &&
                  (u.role === "OWNER" || u.role === "TENANT") && (
                    <>
                      <form action={approveUser}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button type="submit" className="btn-success">
                          Setujui
                        </button>
                      </form>
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
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { AUDIT_ACTION_LABEL, type AuditAction } from "@/lib/audit";

const PAGE_SIZE = 50;

type SP = Record<string, string | undefined>;

const ALL_ACTIONS = Object.keys(AUDIT_ACTION_LABEL) as AuditAction[];

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const actionFilter = searchParams.action && searchParams.action !== "all"
    ? searchParams.action
    : undefined;
  const actorQ = (searchParams.actor ?? "").trim();

  const where = {
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(actorQ
      ? {
          OR: [
            { actorName: { contains: actorQ } },
            { actor: { email: { contains: actorQ } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-slate-600">
          Jejak aksi sensitif: verifikasi pembayaran, perubahan status akun,
          pengeluaran, pengumuman, backup. Dipakai untuk klarifikasi sengketa
          dan investigasi keamanan.
        </p>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="block text-xs text-slate-600">Aksi</label>
          <select
            name="action"
            defaultValue={actionFilter ?? "all"}
            className="input mt-1"
          >
            <option value="all">Semua aksi</option>
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600">
            Pelaku (nama/email)
          </label>
          <input
            name="actor"
            defaultValue={actorQ}
            placeholder="Mis. denny@…"
            className="input mt-1"
          />
        </div>
        <button type="submit" className="btn-primary">
          Terapkan
        </button>
        <div className="text-xs text-slate-500">
          {total.toLocaleString("id-ID")} entri
        </div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600">
              <th className="px-3 py-2 whitespace-nowrap">Waktu</th>
              <th className="px-3 py-2">Pelaku</th>
              <th className="px-3 py-2">Aksi</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Detail</th>
              <th className="px-3 py-2 whitespace-nowrap">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  Belum ada entri audit yang cocok dengan filter.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const known = r.action in AUDIT_ACTION_LABEL;
              const isFailure = r.action.endsWith(".FAIL");
              let detail: Record<string, unknown> | null = null;
              if (r.metadata) {
                try {
                  detail = JSON.parse(r.metadata);
                } catch {
                  detail = null;
                }
              }
              return (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-50 ${
                    isFailure ? "bg-red-50/40" : ""
                  }`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                    {r.createdAt.toLocaleString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {r.actorName ?? r.actor?.email ?? "(system)"}
                    </div>
                    {r.actor?.email && r.actorName && (
                      <div className="text-xs text-slate-500">
                        {r.actor.email}
                      </div>
                    )}
                    {!r.actor && r.actorId === null && (
                      <div className="text-xs text-slate-400">cron / system</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        isFailure
                          ? "badge-red"
                          : known
                            ? "badge-slate"
                            : "badge-yellow"
                      }
                    >
                      {known
                        ? AUDIT_ACTION_LABEL[r.action as AuditAction]
                        : r.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {r.entityType && (
                      <div>
                        {r.entityType}
                        {r.entityId && (
                          <span className="text-slate-400">
                            {" "}
                            #{r.entityId.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 max-w-md">
                    {detail ? <DetailPreview data={detail} /> : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                    {r.ip ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-slate-500">
            Halaman {page} dari {totalPages}
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`?${new URLSearchParams({
                  ...(actionFilter ? { action: actionFilter } : {}),
                  ...(actorQ ? { actor: actorQ } : {}),
                  page: String(page - 1),
                }).toString()}`}
                className="rounded-md border px-3 py-1.5 hover:bg-slate-50"
              >
                ← Sebelumnya
              </a>
            )}
            {page < totalPages && (
              <a
                href={`?${new URLSearchParams({
                  ...(actionFilter ? { action: actionFilter } : {}),
                  ...(actorQ ? { actor: actorQ } : {}),
                  page: String(page + 1),
                }).toString()}`}
                className="rounded-md border px-3 py-1.5 hover:bg-slate-50"
              >
                Berikutnya →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailPreview({ data }: { data: Record<string, unknown> }) {
  // Tampilkan max 3 key paling penting agar baris tetap padat. Klik
  // untuk expand lengkap.
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <details>
      <summary className="cursor-pointer">
        {entries
          .slice(0, 2)
          .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
          .join(" · ")}
        {entries.length > 2 && <span className="text-slate-400"> · …</span>}
      </summary>
      <pre className="mt-1 max-w-md whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-[11px] text-slate-700">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

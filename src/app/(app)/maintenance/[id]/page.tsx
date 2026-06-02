import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  formatDateID,
  formatRupiah,
  statusBadgeClass,
  statusLabel,
  typeLabel,
} from "@/lib/maintenance";
import { CompleteForm } from "./CompleteForm";
import { SimpleActionButton } from "./SimpleActionButton";

export default async function MaintenanceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const m = await prisma.maintenance.findUnique({
    where: { id: params.id },
    include: {
      kos: { select: { id: true, name: true, ownerId: true } },
      room: { select: { id: true, name: true } },
      complaint: {
        include: {
          tenancy: { include: { tenant: { select: { name: true } } } },
        },
      },
      parent: { select: { id: true, completedDate: true } },
      children: {
        select: { id: true, status: true, scheduledDate: true },
        orderBy: { scheduledDate: "asc" },
      },
    },
  });
  if (!m) notFound();
  if (user.role === "OWNER" && m.kos.ownerId !== user.id) {
    notFound();
  }

  const photos: string[] = m.photoUrls ? JSON.parse(m.photoUrls) : [];

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <Link href="/maintenance" className="text-sm text-brand-700 hover:underline">
          ← Kembali ke Perawatan
        </Link>
      </div>

      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${m.type === "PREVENTIVE" ? "badge-blue" : "badge-violet"}`}>
                {typeLabel(m.type)}
              </span>
              <span className={`badge ${statusBadgeClass(m.status)}`}>
                {statusLabel(m.status)}
              </span>
              {m.recurrenceMonths ? (
                <span className="badge-slate text-xs">↻ tiap {m.recurrenceMonths} bln</span>
              ) : null}
            </div>
            <h1 className="mt-2 text-xl font-bold">{m.title}</h1>
            <div className="text-sm text-slate-600">
              {m.kos.name}
              {m.room ? ` • Kamar ${m.room.name}` : " • Fasilitas kos"}
            </div>
          </div>
        </div>

        {m.description && (
          <div>
            <div className="text-xs font-medium text-slate-500">Deskripsi</div>
            <p className="text-sm whitespace-pre-wrap">{m.description}</p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Field label="Tanggal jadwal" value={formatDateID(m.scheduledDate)} />
          <Field
            label="Tanggal selesai"
            value={m.completedDate ? formatDateID(m.completedDate) : "—"}
          />
          <Field label="Biaya" value={formatRupiah(m.cost)} />
          <Field label="Vendor / tukang" value={m.vendor ?? "—"} />
        </div>

        {m.notes && (
          <div>
            <div className="text-xs font-medium text-slate-500">Catatan</div>
            <p className="text-sm whitespace-pre-wrap">{m.notes}</p>
          </div>
        )}

        {m.complaint && (
          <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm">
            <div className="font-semibold text-violet-900">
              Sumber: Komplain penghuni
            </div>
            <div className="mt-1 text-violet-800">
              Dari <strong>{m.complaint.tenancy.tenant.name}</strong> —
              dilaporkan {formatDateID(m.complaint.createdAt)}.{" "}
              <Link
                href={`/complaints/${m.complaint.id}`}
                className="underline"
              >
                Lihat komplain →
              </Link>
            </div>
          </div>
        )}

        {photos.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Foto</div>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <a key={p} href={p} target="_blank" rel="noopener noreferrer">
                  <img
                    src={p}
                    alt="foto perawatan"
                    className="h-24 w-full rounded border object-cover hover:opacity-80"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {(m.parent || m.children.length > 0) && (
          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
            {m.parent && (
              <div>
                Lanjutan dari perawatan sebelumnya yang selesai{" "}
                {m.parent.completedDate
                  ? formatDateID(m.parent.completedDate)
                  : "—"}
                .{" "}
                <Link href={`/maintenance/${m.parent.id}`} className="underline">
                  Buka
                </Link>
              </div>
            )}
            {m.children.length > 0 && (
              <div className={m.parent ? "mt-1" : ""}>
                Sudah dijadwalkan berikutnya:{" "}
                {m.children.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ", "}
                    <Link href={`/maintenance/${c.id}`} className="underline">
                      {formatDateID(c.scheduledDate)} ({statusLabel(c.status)})
                    </Link>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Aksi sesuai status (CORRECTIVE tidak punya aksi — datanya turunan komplain) */}
      {m.type === "PREVENTIVE" && m.status !== "COMPLETED" && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Aksi</h2>
          <div className="flex flex-wrap gap-2">
            {m.status === "SCHEDULED" && (
              <SimpleActionButton
                id={m.id}
                status="IN_PROGRESS"
                label="Mulai kerjakan"
                className="btn-secondary"
              />
            )}
            {m.status !== "CANCELLED" && (
              <SimpleActionButton
                id={m.id}
                status="CANCELLED"
                label="Batalkan"
                className="btn-danger"
                confirm="Batalkan perawatan ini?"
              />
            )}
          </div>

          <hr />

          <div>
            <h3 className="font-semibold mb-2">Tandai selesai</h3>
            <CompleteForm id={m.id} />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div>{value}</div>
    </div>
  );
}

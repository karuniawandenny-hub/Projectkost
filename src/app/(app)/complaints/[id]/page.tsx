import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { replyComplaint } from "../actions";

function StatusBadge({ status }: { status: string }) {
  if (status === "OPEN") return <span className="badge-yellow">Terbuka</span>;
  if (status === "IN_PROGRESS") return <span className="badge-blue">Dalam proses</span>;
  return <span className="badge-green">Selesai</span>;
}

export default async function ComplaintDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const c = await prisma.complaint.findUnique({
    where: { id: params.id },
    include: {
      tenancy: {
        include: {
          tenant: true,
          room: { include: { kos: true } },
        },
      },
    },
  });
  if (!c) notFound();

  const isOwner = user.role === "OWNER" && c.tenancy.room.kos.ownerId === user.id;
  const isTenant = user.role === "TENANT" && c.tenancy.tenantId === user.id;
  if (!isOwner && !isTenant) redirect("/complaints");

  const photos: string[] = c.photoUrls ? JSON.parse(c.photoUrls) : [];

  return (
    <div className="space-y-4">
      <div>
        <Link href="/complaints" className="text-sm text-brand-700 hover:underline">
          ← Komplain
        </Link>
      </div>

      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{c.title}</h1>
            <div className="text-sm text-slate-600">
              {c.tenancy.tenant.name} • {c.tenancy.room.kos.name} / Kamar{" "}
              {c.tenancy.room.name}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {new Date(c.createdAt).toLocaleString("id-ID")}
            </div>
          </div>
          <StatusBadge status={c.status} />
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-800">
          {c.description}
        </p>

        {photos.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {photos.map((src, i) => (
              <a
                key={i}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`foto ${i + 1}`}
                  className="h-32 w-32 rounded-md object-cover border hover:opacity-90"
                />
              </a>
            ))}
          </div>
        )}

        {c.ownerReply && (
          <div className="mt-5 rounded-lg bg-brand-50 p-4">
            <div className="text-xs font-semibold text-brand-800">
              Balasan pemilik
            </div>
            <p className="mt-1 text-sm whitespace-pre-wrap">{c.ownerReply}</p>
          </div>
        )}
      </div>

      {isOwner && (
        <div className="card">
          <h2 className="font-semibold">Tanggapi komplain</h2>
          <form action={replyComplaint} className="mt-3 space-y-3">
            <input type="hidden" name="complaintId" value={c.id} />
            <div>
              <label className="label">Balasan untuk penghuni</label>
              <textarea
                name="ownerReply"
                rows={3}
                className="input"
                defaultValue={c.ownerReply ?? ""}
                placeholder="Mis. baik, tukang akan datang besok pagi."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                name="action"
                value="IN_PROGRESS"
                type="submit"
                className="btn-secondary"
              >
                Tandai diproses
              </button>
              <button
                name="action"
                value="RESOLVED"
                type="submit"
                className="btn-success"
              >
                Tandai selesai
              </button>
              {c.status !== "OPEN" && (
                <button
                  name="action"
                  value="REOPEN"
                  type="submit"
                  className="btn-secondary"
                >
                  Buka ulang
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

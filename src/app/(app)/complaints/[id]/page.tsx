import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { viewerUrl } from "@/lib/viewer";
import { removeResolutionPhoto } from "../actions";
import { OwnerReplyForm } from "./OwnerReplyForm";

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
  const resolutionPhotos: string[] = c.resolutionPhotoUrls
    ? JSON.parse(c.resolutionPhotoUrls)
    : [];

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
          <div className="mt-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">
              Foto dari penghuni
            </div>
            <div className="flex flex-wrap gap-2">
              {photos.map((src, i) => (
                <a
                  key={i}
                  href={viewerUrl(src, "Foto komplain")}
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
          </div>
        )}

        {(c.ownerReply || resolutionPhotos.length > 0) && (
          <div className="mt-5 rounded-lg bg-brand-50 p-4">
            <div className="text-xs font-semibold text-brand-800">
              Balasan & bukti dari pemilik
            </div>
            {c.ownerReply && (
              <p className="mt-1 text-sm whitespace-pre-wrap">{c.ownerReply}</p>
            )}
            {resolutionPhotos.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-brand-800 mb-2">
                  Foto bukti dukung ({resolutionPhotos.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {resolutionPhotos.map((src, i) => (
                    <div key={i} className="relative">
                      <a
                        href={viewerUrl(src, "Foto penyelesaian")}
                        className="block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={`bukti ${i + 1}`}
                          className="h-32 w-32 rounded-md object-cover border hover:opacity-90"
                        />
                      </a>
                      {isOwner && (
                        <form action={removeResolutionPhoto}>
                          <input type="hidden" name="complaintId" value={c.id} />
                          <input type="hidden" name="url" value={src} />
                          <button
                            type="submit"
                            className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md hover:bg-red-700"
                            aria-label={`Hapus bukti ${i + 1}`}
                          >
                            ✕
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isOwner && (
        <div className="card">
          <h2 className="font-semibold">Tanggapi komplain</h2>
          <p className="mt-1 text-sm text-slate-600">
            Tulis balasan untuk penghuni dan lampirkan foto bukti jika sudah
            diselesaikan (mis. hasil perbaikan, kondisi setelah ditangani).
          </p>
          <div className="mt-3">
            <OwnerReplyForm
              complaintId={c.id}
              currentReply={c.ownerReply}
              currentStatus={c.status}
              existingResolutionPhotos={resolutionPhotos.length}
            />
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { viewerUrl } from "@/lib/viewer";
import { endTenancy } from "../kos/actions";
import { EditStartDateForm } from "./EditStartDateForm";
import { DeleteTenantButton } from "./DeleteTenantButton";
import { UploadDocsForm } from "./UploadDocsForm";

export type ActiveTenant = {
  tenancyId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  selfiePhotoUrl: string | null;
  ktpPhotoUrl: string | null;
  startDate: string; // ISO
  kosId: string;
  kosName: string;
  roomName: string;
  ownerSigned: boolean;
};

type FilterMode = "all" | "unsigned" | "docsMissing";

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase();
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Thumbnail dokumen identitas dalam modal detail penghuni.
 * Kalau URL ada: preview 96px + link ke viewer.
 * Kalau null: placeholder abu-abu dengan status jelas "Belum diupload".
 */
function IdentityPhoto({
  label,
  url,
  caption,
}: {
  label: string;
  url: string | null;
  caption: string;
}) {
  if (url) {
    return (
      <a
        href={viewerUrl(url, label)}
        className="block rounded-lg border border-slate-200 bg-white p-2 transition hover:border-brand-400 hover:shadow-sm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="mb-2 h-24 w-full rounded object-cover"
        />
        <div className="text-xs font-medium text-slate-800">{label}</div>
        <div className="text-[10px] text-brand-700">Klik untuk perbesar</div>
      </a>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2 text-center">
      <div className="grid h-24 w-full place-items-center rounded bg-slate-100 text-2xl text-slate-400">
        📄
      </div>
      <div className="mt-2 text-xs font-medium text-slate-600">{label}</div>
      <div className="text-[10px] text-amber-700">Belum diupload</div>
      <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
        {caption}
      </div>
    </div>
  );
}

export function ActiveTenantsView({ tenants }: { tenants: ActiveTenant[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Group by kos + kompute ringkasan.
  const { grouped, kosList, stats } = useMemo(() => {
    const byKos = new Map<string, { name: string; items: ActiveTenant[] }>();
    for (const t of tenants) {
      const g = byKos.get(t.kosId) ?? { name: t.kosName, items: [] };
      g.items.push(t);
      byKos.set(t.kosId, g);
    }
    const kosArr = [...byKos.entries()]
      .map(([id, g]) => ({ id, name: g.name, items: g.items }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const unsignedCount = tenants.filter((t) => !t.ownerSigned).length;
    const docsMissingCount = tenants.filter(
      (t) => !t.ktpPhotoUrl || !t.selfiePhotoUrl
    ).length;
    return {
      grouped: kosArr,
      kosList: kosArr.map((k) => ({ id: k.id, name: k.name, count: k.items.length })),
      stats: {
        total: tenants.length,
        kosCount: kosArr.length,
        unsigned: unsignedCount,
        docsMissing: docsMissingCount,
      },
    };
  }, [tenants]);

  const matches = (t: ActiveTenant): boolean => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${t.name} ${t.email} ${t.roomName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter === "unsigned" && t.ownerSigned) return false;
    if (filter === "docsMissing" && t.ktpPhotoUrl && t.selfiePhotoUrl)
      return false;
    return true;
  };

  const filteredGrouped = useMemo(() => {
    return grouped.map((g) => ({
      ...g,
      items: g.items.filter(matches),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, search, filter]);

  const selected = selectedId
    ? tenants.find((t) => t.tenancyId === selectedId) ?? null
    : null;

  const totalMatched = filteredGrouped.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Total penghuni aktif" value={String(stats.total)} />
        <StatTile
          label="Tersebar di kos"
          value={String(stats.kosCount)}
          sub={kosList
            .slice(0, 3)
            .map((k) => `${k.name} (${k.count})`)
            .join(" · ")}
        />
        <StatTile
          label="Dokumen kurang"
          value={String(stats.docsMissing)}
          tone={stats.docsMissing > 0 ? "red" : "neutral"}
          sub={
            stats.docsMissing > 0
              ? "KTP/foto diri belum lengkap"
              : "Semua dokumen lengkap"
          }
        />
        <StatTile
          label="Kontrak belum TTD"
          value={String(stats.unsigned)}
          tone={stats.unsigned > 0 ? "amber" : "neutral"}
          sub={
            stats.unsigned > 0
              ? "Klik filter 'Belum TTD' untuk fokus"
              : "Semua tertandatangani"
          }
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, email, atau kamar…"
            className="input h-10 w-full pl-9 text-[16px]"
            autoComplete="off"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
        </div>
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-sm">
          <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>
            Semua
          </FilterBtn>
          <FilterBtn
            active={filter === "docsMissing"}
            onClick={() => setFilter("docsMissing")}
          >
            Dok kurang
            {stats.docsMissing > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {stats.docsMissing}
              </span>
            )}
          </FilterBtn>
          <FilterBtn
            active={filter === "unsigned"}
            onClick={() => setFilter("unsigned")}
          >
            Belum TTD
            {stats.unsigned > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900">
                {stats.unsigned}
              </span>
            )}
          </FilterBtn>
        </div>
      </div>

      {/* Groups */}
      {tenants.length === 0 ? (
        <div className="card text-sm text-slate-500">
          Belum ada penghuni aktif. Setujui pengajuan di atas dan assign ke
          kamar untuk menambahkan penghuni.
        </div>
      ) : totalMatched === 0 ? (
        <div className="card text-sm text-slate-500">
          Tidak ada penghuni yang cocok dengan pencarian/filter.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredGrouped.map((g, idx) => {
            if (g.items.length === 0) return null;
            // Default: kos pertama expanded, sisanya collapsed. State user
            // menimpa default.
            const userState = collapsed[g.id];
            const isCollapsed =
              userState === undefined ? idx > 0 : userState;
            const unsignedInGroup = g.items.filter((t) => !t.ownerSigned)
              .length;
            const docsMissingInGroup = g.items.filter(
              (t) => !t.ktpPhotoUrl || !t.selfiePhotoUrl
            ).length;
            return (
              <div
                key={g.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [g.id]: !isCollapsed }))
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-400 text-xs">
                      {isCollapsed ? "▶" : "▼"}
                    </span>
                    <span className="truncate font-semibold text-slate-800">
                      {g.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      ({g.items.length} penghuni)
                    </span>
                    {docsMissingInGroup > 0 && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                        {docsMissingInGroup} dok kurang
                      </span>
                    )}
                    {unsignedInGroup > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        {unsignedInGroup} belum TTD
                      </span>
                    )}
                  </div>
                </button>
                {!isCollapsed && (
                  <ul className="divide-y divide-slate-100">
                    {g.items.map((t) => (
                      <TenantRow
                        key={t.tenancyId}
                        t={t}
                        onClick={() => setSelectedId(t.tenancyId)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <TenantDetailModal
          tenant={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "amber" | "red" | "neutral";
}) {
  const bg =
    tone === "amber"
      ? "bg-amber-50 border-amber-200"
      : tone === "red"
      ? "bg-red-50 border-red-200"
      : "bg-white border-slate-200";
  const valueColor =
    tone === "amber"
      ? "text-amber-700"
      : tone === "red"
      ? "text-red-700"
      : "text-slate-800";
  return (
    <div className={`rounded-lg border ${bg} px-3 py-2`}>
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${valueColor}`}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 truncate text-[10px] text-slate-500">
          {sub}
        </div>
      )}
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function TenantRow({
  t,
  onClick,
}: {
  t: ActiveTenant;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
      >
        {t.selfiePhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t.selfiePhotoUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-200 text-sm font-bold text-slate-600">
            {initials(t.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium text-slate-800">
              {t.name}
            </span>
            {(!t.ktpPhotoUrl || !t.selfiePhotoUrl) && (
              <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                Dokumen kurang
              </span>
            )}
            {!t.ownerSigned && (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                Belum TTD
              </span>
            )}
          </div>
          <div className="truncate text-xs text-slate-500">
            Kamar {t.roomName} · sejak {formatDateShort(t.startDate)}
            {t.phone && ` · ${t.phone}`}
          </div>
        </div>
        <span className="shrink-0 text-slate-300">›</span>
      </button>
    </li>
  );
}

function TenantDetailModal({
  tenant: t,
  onClose,
}: {
  tenant: ActiveTenant;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {t.selfiePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.selfiePhotoUrl}
                alt=""
                className="h-11 w-11 shrink-0 rounded-full border object-cover"
              />
            ) : (
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-200 text-lg font-bold text-slate-600">
                {initials(t.name)}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-slate-800">
                {t.name}
              </h2>
              <p className="truncate text-xs text-slate-500">{t.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Info blok */}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[11px] text-slate-500">Kos & Kamar</dt>
              <dd className="font-medium text-slate-800">
                {t.kosName} · {t.roomName}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Sejak</dt>
              <dd className="font-medium text-slate-800">
                {formatDateShort(t.startDate)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Nomor HP</dt>
              <dd className="font-medium text-slate-800">
                {t.phone ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Kontrak</dt>
              <dd>
                {t.ownerSigned ? (
                  <span className="font-medium text-emerald-700">
                    Ditandatangani
                  </span>
                ) : (
                  <span className="font-medium text-amber-700">
                    Belum TTD
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {/* Dokumen Identitas — SELALU tampil, meski null. Kalau penghuni
              belum onboarding upload KTP/selfie (mis. di-assign owner
              langsung tanpa lewat onboarding), status "Belum diupload"
              muncul jelas — sebelumnya tombol "Lihat KTP" cuma di-hide
              yang bikin owner bingung apakah datanya ada tapi tersembunyi
              atau memang tidak ada. */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Dokumen Identitas
              </div>
              {(!t.ktpPhotoUrl || !t.selfiePhotoUrl) && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  ⚠️ Kurang lengkap
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <IdentityPhoto
                label="Foto KTP"
                url={t.ktpPhotoUrl}
                caption="Kartu Tanda Penduduk"
              />
              <IdentityPhoto
                label="Foto Diri (Selfie)"
                url={t.selfiePhotoUrl}
                caption="Verifikasi wajah"
              />
            </div>
            <div className="mt-3">
              <UploadDocsForm
                userId={t.userId}
                hasKtp={!!t.ktpPhotoUrl}
                hasSelfie={!!t.selfiePhotoUrl}
                tenantName={t.name}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <a
              href={`/tenancies/${t.tenancyId}/contract`}
              className={
                t.ownerSigned
                  ? "btn-secondary"
                  : "btn-secondary border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
              }
            >
              📄 Kontrak
              {!t.ownerSigned && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                  Belum TTD
                </span>
              )}
            </a>
            <EditStartDateForm
              tenancyId={t.tenancyId}
              currentStartDate={t.startDate}
            />
            <form action={endTenancy}>
              <input type="hidden" name="tenancyId" value={t.tenancyId} />
              <button className="btn-danger" type="submit" formNoValidate>
                Akhiri sewa
              </button>
            </form>
            <DeleteTenantButton
              userId={t.userId}
              tenantName={t.name}
              buttonLabel="Hapus penghuni"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

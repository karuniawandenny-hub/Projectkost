"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AssignTenantForm } from "./AssignTenantForm";
import { EditRoomForm } from "./EditRoomForm";
import { CreateRoomForm } from "./CreateRoomForm";
import {
  formatDateID,
  statusBadgeClass,
  statusLabel,
  typeLabel,
} from "@/lib/maintenance";

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function rupiahShort(n: number) {
  if (n >= 1_000_000) {
    const jt = n / 1_000_000;
    return "Rp " + (Number.isInteger(jt) ? jt.toString() : jt.toFixed(1)) + "jt";
  }
  if (n >= 1_000) return "Rp " + Math.round(n / 1000) + "rb";
  return "Rp " + n;
}

type MaintRow = {
  id: string;
  type: string;
  title: string;
  status: string;
  scheduledDate: Date;
  completedDate: Date | null;
};

type Room = {
  id: string;
  name: string;
  monthlyPrice: number;
  status: string;
  tenancies: {
    id: string;
    tenant: { name: string; email: string };
  }[];
};

type TenantOpt = {
  id: string;
  name: string;
  email: string;
  onboarded: boolean;
};

type FilterStatus = "all" | "available" | "occupied";

export function KosRoomsView({
  kosId,
  rooms,
  tenantOptions,
  maintByRoomId,
}: {
  kosId: string;
  rooms: Room[];
  tenantOptions: TenantOpt[];
  maintByRoomId: Record<string, MaintRow[]>;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const stats = useMemo(() => {
    const occupied = rooms.filter((r) => r.status === "OCCUPIED");
    const available = rooms.filter((r) => r.status !== "OCCUPIED");
    const activeIncome = occupied.reduce((s, r) => s + r.monthlyPrice, 0);
    const potentialExtra = available.reduce((s, r) => s + r.monthlyPrice, 0);
    return {
      total: rooms.length,
      occupied: occupied.length,
      available: available.length,
      activeIncome,
      potentialExtra,
    };
  }, [rooms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (filter === "occupied" && r.status !== "OCCUPIED") return false;
      if (filter === "available" && r.status === "OCCUPIED") return false;
      return true;
    });
  }, [rooms, search, filter]);

  const selectedRoom = selectedId
    ? rooms.find((r) => r.id === selectedId) ?? null
    : null;

  return (
    <>
      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Total kamar" value={String(stats.total)} />
        <StatTile
          label="Terisi"
          value={String(stats.occupied)}
          tone="green"
        />
        <StatTile
          label="Kosong"
          value={String(stats.available)}
          tone="amber"
        />
        <StatTile
          label="Pemasukan aktif/bulan"
          value={rupiahShort(stats.activeIncome)}
          sub={
            stats.potentialExtra > 0
              ? `+${rupiahShort(stats.potentialExtra)} kalau full`
              : undefined
          }
        />
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kamar (mis. A1, B2)…"
            className="input h-10 w-full pl-9 text-[16px]"
            autoComplete="off"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
        </div>
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-sm">
          <FilterButton
            active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            Semua
          </FilterButton>
          <FilterButton
            active={filter === "available"}
            onClick={() => setFilter("available")}
          >
            Kosong
          </FilterButton>
          <FilterButton
            active={filter === "occupied"}
            onClick={() => setFilter("occupied")}
          >
            Terisi
          </FilterButton>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="btn-primary h-10 whitespace-nowrap"
        >
          + Tambah kamar
        </button>
      </div>

      {/* Grid */}
      {rooms.length === 0 ? (
        <div className="mt-4 card text-sm text-slate-500">
          Belum ada kamar. Klik <strong>+ Tambah kamar</strong> untuk mulai.
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 card text-sm text-slate-500">
          Tidak ada kamar yang cocok dengan filter/pencarian.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {filtered.map((r) => (
            <RoomCard
              key={r.id}
              room={r}
              onClick={() => setSelectedId(r.id)}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedRoom && (
        <RoomDetailModal
          room={selectedRoom}
          tenantOptions={tenantOptions}
          maintenance={maintByRoomId[selectedRoom.id] ?? []}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Add room modal */}
      {addOpen && (
        <Modal onClose={() => setAddOpen(false)} title="Tambah kamar">
          <div className="p-4">
            <CreateRoomForm kosId={kosId} />
          </div>
        </Modal>
      )}
    </>
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
  tone?: "green" | "amber";
}) {
  const bg =
    tone === "green"
      ? "bg-emerald-50 border-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 border-amber-200"
        : "bg-white border-slate-200";
  const valueColor =
    tone === "green"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-slate-800";
  return (
    <div className={`rounded-lg border ${bg} px-3 py-2`}>
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${valueColor}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-slate-500 truncate">{sub}</div>
      )}
    </div>
  );
}

function FilterButton({
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
      className={`rounded px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function RoomCard({ room, onClick }: { room: Room; onClick: () => void }) {
  const active = room.tenancies[0];
  const occupied = room.status === "OCCUPIED";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col rounded-lg border p-3 text-left transition hover:shadow-md ${
        occupied
          ? "border-emerald-200 bg-emerald-50/40 hover:border-emerald-400"
          : "border-slate-200 bg-white hover:border-brand-400"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-semibold text-slate-800">
          {room.name}
        </span>
        <span
          className={`ml-auto inline-block h-2 w-2 shrink-0 rounded-full ${
            occupied ? "bg-emerald-500" : "bg-slate-300"
          }`}
          aria-label={occupied ? "Terisi" : "Kosong"}
        />
      </div>
      <div className="mt-1 text-xs text-slate-600 tabular-nums">
        {rupiahShort(room.monthlyPrice)}/bln
      </div>
      <div
        className={`mt-2 truncate text-xs ${
          occupied ? "font-medium text-slate-700" : "italic text-slate-400"
        }`}
      >
        {active ? active.tenant.name : "Belum ada penghuni"}
      </div>
    </button>
  );
}

function RoomDetailModal({
  room,
  tenantOptions,
  maintenance,
  onClose,
}: {
  room: Room;
  tenantOptions: TenantOpt[];
  maintenance: MaintRow[];
  onClose: () => void;
}) {
  const active = room.tenancies[0];
  const occupied = room.status === "OCCUPIED";
  return (
    <Modal
      onClose={onClose}
      title={`Kamar ${room.name}`}
      subtitle={`${rupiah(room.monthlyPrice)} / bulan · ${occupied ? "Terisi" : "Kosong"}`}
    >
      <div className="space-y-4 p-4">
        {/* Info kamar & edit */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-slate-600">
            {occupied ? (
              <>
                <div>
                  <span className="text-slate-500">Penghuni: </span>
                  <span className="font-medium text-slate-800">
                    {active?.tenant.name}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {active?.tenant.email}
                </div>
              </>
            ) : (
              <span className="italic text-slate-400">Belum ada penghuni</span>
            )}
          </div>
          <EditRoomForm
            room={{
              id: room.id,
              name: room.name,
              monthlyPrice: room.monthlyPrice,
            }}
          />
        </div>

        {/* Assign form kalau kosong */}
        {!occupied && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-sm font-medium text-slate-700">
              Assign penghuni
            </div>
            <AssignTenantForm roomId={room.id} tenants={tenantOptions} />
          </div>
        )}

        {/* Riwayat perawatan */}
        {maintenance.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">
              Riwayat perawatan ({maintenance.length})
            </div>
            <div className="space-y-1">
              {maintenance.slice(0, 8).map((m) => (
                <MaintenanceRow key={m.id} m={m} />
              ))}
              {maintenance.length > 8 && (
                <Link
                  href="/maintenance"
                  className="block px-2 py-1 text-xs text-brand-700 hover:underline"
                >
                  +{maintenance.length - 8} lagi → buka menu Perawatan
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function MaintenanceRow({ m }: { m: MaintRow }) {
  return (
    <Link
      href={`/maintenance/${m.id}`}
      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-100"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`badge text-[10px] ${
              m.type === "PREVENTIVE" ? "badge-blue" : "badge-violet"
            }`}
          >
            {typeLabel(m.type)}
          </span>
          <span className={`badge text-[10px] ${statusBadgeClass(m.status)}`}>
            {statusLabel(m.status)}
          </span>
        </div>
        <div className="mt-0.5 truncate font-medium text-slate-700">
          {m.title}
        </div>
      </div>
      <div className="shrink-0 text-right text-[11px] text-slate-500">
        {m.completedDate
          ? formatDateID(m.completedDate)
          : formatDateID(m.scheduledDate)}
      </div>
    </Link>
  );
}

function Modal({
  onClose,
  title,
  subtitle,
  children,
}: {
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        // Klik backdrop untuk close
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-800">{title}</h2>
            {subtitle && (
              <p className="text-xs text-slate-500 truncate">{subtitle}</p>
            )}
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
        {children}
      </div>
    </div>
  );
}

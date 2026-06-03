import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function typeLabel(t: string): string {
  if (t === "PREVENTIVE") return "Preventif";
  if (t === "CORRECTIVE") return "Korektif";
  return t;
}

function statusLabel(s: string): string {
  if (s === "SCHEDULED") return "Terjadwal";
  if (s === "IN_PROGRESS") return "Dalam proses";
  if (s === "COMPLETED") return "Selesai";
  if (s === "CANCELLED") return "Dibatalkan";
  return s;
}

/**
 * Export laporan biaya maintenance ke CSV.
 *
 * GET /api/maintenance/export?type=&status=&kosId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Filter:
 *  - type: PREVENTIVE | CORRECTIVE (opsional)
 *  - status: SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED (opsional)
 *  - kosId: filter kos tertentu (opsional)
 *  - from / to: rentang tanggal scheduledDate (opsional, format YYYY-MM-DD)
 *
 * Scope: OWNER hanya dapat kos miliknya, ADMIN dapat semua.
 *
 * Baris terakhir CSV: TOTAL biaya — memudahkan rekap di Excel.
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me || (me.role !== "OWNER" && me.role !== "ADMIN")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");
  const kosId = url.searchParams.get("kosId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const where: Record<string, unknown> = {};
  if (me.role === "OWNER") where.kos = { ownerId: me.id };
  if (type && ["PREVENTIVE", "CORRECTIVE"].includes(type)) where.type = type;
  if (
    status &&
    ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(status)
  ) {
    where.status = status;
  }
  if (kosId) where.kosId = kosId;

  const dateFilter: Record<string, Date> = {};
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) dateFilter.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) {
      // include sampai akhir hari `to`
      d.setHours(23, 59, 59, 999);
      dateFilter.lte = d;
    }
  }
  if (Object.keys(dateFilter).length > 0) {
    where.scheduledDate = dateFilter;
  }

  const items = await prisma.maintenance.findMany({
    where,
    orderBy: [{ scheduledDate: "desc" }],
    include: {
      kos: { select: { name: true, owner: { select: { name: true } } } },
      room: { select: { name: true } },
      complaint: {
        select: {
          id: true,
          tenancy: { select: { tenant: { select: { name: true } } } },
        },
      },
    },
  });

  const totalCost = items.reduce((acc, m) => acc + (m.cost ?? 0), 0);
  const completedCount = items.filter((m) => m.status === "COMPLETED").length;

  const rows: (string | number)[][] = [
    [
      "ID",
      "Jenis",
      "Status",
      "Kos",
      "Pemilik",
      "Kamar / Cakupan",
      "Judul",
      "Deskripsi",
      "Tgl jadwal",
      "Tgl selesai",
      "Biaya (Rp)",
      "Vendor / Tukang",
      "Catatan",
      "Sumber komplain (penghuni)",
      "Berulang (bulan)",
    ],
    ...items.map((m) => [
      m.id,
      typeLabel(m.type),
      statusLabel(m.status),
      m.kos.name,
      m.kos.owner.name,
      m.room ? `Kamar ${m.room.name}` : "Fasilitas kos",
      m.title,
      m.description ?? "",
      formatDate(m.scheduledDate),
      formatDate(m.completedDate),
      m.cost ?? "",
      m.vendor ?? "",
      m.notes ?? "",
      m.complaint?.tenancy.tenant.name ?? "",
      m.recurrenceMonths ?? "",
    ]),
    // baris pembatas + summary
    [],
    ["", "", "", "", "", "", "", "", "", "TOTAL:", totalCost, "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "Jumlah selesai:", completedCount, "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "Total record:", items.length, "", "", "", ""],
  ];

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");

  const filenameParts = ["kos-baiti-perawatan"];
  if (type) filenameParts.push(type.toLowerCase());
  if (status) filenameParts.push(status.toLowerCase());
  if (from) filenameParts.push(`from-${from}`);
  if (to) filenameParts.push(`to-${to}`);
  filenameParts.push(new Date().toISOString().slice(0, 10));
  const filename = `${filenameParts.join("-")}.csv`;

  // BOM "﻿" supaya Excel detect UTF-8 dengan benar.
  return new Response("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

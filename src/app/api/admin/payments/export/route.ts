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

/**
 * Export pembayaran ke CSV untuk admin.
 * GET /api/admin/payments/export?status=PENDING|VERIFIED|REJECTED|DUE
 *
 * Filter mengikuti params yang sama dengan halaman /admin/payments.
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (status && ["DUE", "PENDING", "VERIFIED", "REJECTED"].includes(status)) {
    where.status = status;
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      tenancy: {
        include: {
          tenant: { select: { name: true, email: true, phone: true } },
          room: {
            include: { kos: { include: { owner: { select: { name: true } } } } },
          },
        },
      },
    },
  });

  const rows = [
    [
      "ID",
      "Tanggal dibuat",
      "Pemilik kos",
      "Nama kos",
      "Kamar",
      "Penghuni",
      "Email penghuni",
      "Telepon penghuni",
      "Periode",
      "Nominal (Rp)",
      "Jatuh tempo",
      "Status",
      "Tgl verifikasi",
      "Catatan review",
    ],
    ...payments.map((p) => [
      p.id,
      formatDate(p.createdAt),
      p.tenancy.room.kos.owner.name,
      p.tenancy.room.kos.name,
      p.tenancy.room.name,
      p.tenancy.tenant.name,
      p.tenancy.tenant.email,
      p.tenancy.tenant.phone ?? "",
      `${MONTHS[p.periodMonth - 1]} ${p.periodYear}`,
      p.amount,
      formatDate(p.dueDate),
      p.status,
      formatDate(p.reviewedAt),
      p.reviewNote ?? "",
    ]),
  ];

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const filename = `kos-baiti-pembayaran-${
    status ?? "semua"
  }-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

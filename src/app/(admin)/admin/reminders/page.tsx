import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateID } from "@/lib/billing";

const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

type SearchParams = {
  type?: string;
  channel?: string;
  page?: string;
};

const PAGE_SIZE = 50;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function TypePill({ type }: { type: string }) {
  const map: Record<string, string> = {
    H7: "bg-sky-100 text-sky-800",
    H3: "bg-amber-100 text-amber-800",
    H1: "bg-orange-100 text-orange-800",
    OVERDUE: "bg-red-100 text-red-800",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[type] ?? "bg-slate-100 text-slate-700"}`}>
      {type}
    </span>
  );
}

function ChannelPill({ channel }: { channel: string }) {
  const map: Record<string, string> = {
    WA: "bg-emerald-100 text-emerald-800",
    EMAIL: "bg-indigo-100 text-indigo-800",
    IN_APP: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[channel] ?? "bg-slate-100 text-slate-700"}`}>
      {channel}
    </span>
  );
}

export default async function AdminRemindersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const type = searchParams.type ?? "";
  const channel = searchParams.channel ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const where = {
    ...(type ? { type } : {}),
    ...(channel ? { channel } : {}),
  };

  const today = startOfDay(new Date());
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86_400_000);

  const [total, items, sentToday, sentWeek, byChannel, byType] = await Promise.all([
    prisma.reminderLog.count({ where }),
    prisma.reminderLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        payment: {
          select: {
            id: true,
            periodMonth: true,
            periodYear: true,
            amount: true,
            dueDate: true,
            status: true,
            tenancy: {
              select: {
                tenant: { select: { name: true, phone: true, email: true } },
                room: { select: { name: true, kos: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.reminderLog.count({ where: { sentAt: { gte: today } } }),
    prisma.reminderLog.count({ where: { sentAt: { gte: sevenDaysAgo } } }),
    prisma.reminderLog.groupBy({ by: ["channel"], _count: { _all: true } }),
    prisma.reminderLog.groupBy({ by: ["type"], _count: { _all: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const channelStats = Object.fromEntries(
    byChannel.map((b) => [b.channel, b._count._all])
  );
  const typeStats = Object.fromEntries(byType.map((b) => [b.type, b._count._all]));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Reminder Log</h1>
          <p className="text-slate-600">
            Riwayat reminder pembayaran yang telah dikirim ke penghuni.
          </p>
        </div>
        <Link href="/admin/system" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
          ← Setup Cron
        </Link>
      </div>

      <section className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Stat label="Total" value={total} />
        <Stat label="Hari ini" value={sentToday} />
        <Stat label="7 hari terakhir" value={sentWeek} />
        <Stat
          label="Via WA"
          value={channelStats.WA ?? 0}
          sub={`Email: ${channelStats.EMAIL ?? 0} · In-app: ${channelStats.IN_APP ?? 0}`}
        />
      </section>

      <section className="card">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="text-sm font-medium text-slate-700">
            Breakdown per tipe:{" "}
            <span className="inline-flex gap-2 ml-1">
              <span>H3: <strong>{typeStats.H3 ?? 0}</strong></span>
              <span>· OVERDUE: <strong>{typeStats.OVERDUE ?? 0}</strong></span>
            </span>
          </div>
        </div>

        <form className="flex gap-2 flex-wrap" method="GET">
          <select
            name="type"
            defaultValue={type}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Semua tipe</option>
            <option value="H3">H3 (3 hari sebelum)</option>
            <option value="OVERDUE">OVERDUE (terlambat)</option>
          </select>
          <select
            name="channel"
            defaultValue={channel}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Semua channel</option>
            <option value="WA">WhatsApp</option>
            <option value="EMAIL">Email</option>
            <option value="IN_APP">In-app</option>
          </select>
          <button type="submit" className="btn-primary text-sm">
            Filter
          </button>
          {(type || channel) && (
            <Link href="/admin/reminders" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
              Reset
            </Link>
          )}
        </form>
      </section>

      <section className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Waktu kirim</th>
              <th className="px-3 py-2 text-left font-medium">Tipe</th>
              <th className="px-3 py-2 text-left font-medium">Channel</th>
              <th className="px-3 py-2 text-left font-medium">Penghuni</th>
              <th className="px-3 py-2 text-left font-medium">Kos / Kamar</th>
              <th className="px-3 py-2 text-left font-medium">Periode</th>
              <th className="px-3 py-2 text-right font-medium">Tagihan</th>
              <th className="px-3 py-2 text-left font-medium">Jatuh tempo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  Belum ada reminder yang terkirim
                  {type || channel ? " untuk filter ini" : ""}.
                </td>
              </tr>
            ) : (
              items.map((r) => {
                const t = r.payment.tenancy.tenant;
                const room = r.payment.tenancy.room;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                      {r.sentAt.toLocaleString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <TypePill type={r.type} />
                    </td>
                    <td className="px-3 py-2">
                      <ChannelPill channel={r.channel} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-slate-500">
                        {r.channel === "WA" ? t.phone ?? "—" : null}
                        {r.channel === "EMAIL" ? t.email : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{room.kos.name}</div>
                      <div className="text-slate-500">Kamar {room.name}</div>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {MONTH_LABELS[r.payment.periodMonth - 1]} {r.payment.periodYear}
                    </td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      Rp {r.payment.amount.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {r.payment.dueDate ? formatDateID(r.payment.dueDate) : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <div className="text-slate-500">
              Halaman {page} dari {totalPages} · Total {total} entri
            </div>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/reminders?${new URLSearchParams({ ...(type ? { type } : {}), ...(channel ? { channel } : {}), page: String(page - 1) }).toString()}`}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  ← Sebelumnya
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/admin/reminders?${new URLSearchParams({ ...(type ? { type } : {}), ...(channel ? { channel } : {}), page: String(page + 1) }).toString()}`}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  Berikutnya →
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

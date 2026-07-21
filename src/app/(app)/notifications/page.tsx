import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EmptyState, InboxIcon } from "@/components/EmptyState";
import { getCurrentUser } from "@/lib/session";
import {
  NotificationsView,
  type NotificationItem,
} from "./NotificationsView";

const PER_PAGE = 30;

function clampPage(p: number): number {
  if (!Number.isFinite(p) || p < 1) return 1;
  return Math.floor(p);
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: { page?: string; unread?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const page = clampPage(Number(searchParams?.page ?? 1));
  const unreadOnly = searchParams?.unread === "1";

  const where: Record<string, unknown> = { userId: user.id };
  if (unreadOnly) where.read = false;

  const [total, unreadTotal, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { userId: user.id, read: false },
    }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
  ]);

  // Tandai HANYA notifikasi yang sedang tampil sebagai read (row di
  // halaman aktif). Sebelumnya updateMany untuk semua unread — bikin
  // filter "Belum dibaca" jadi kosong setelah visit sekali. Sekarang
  // user bisa scroll ke halaman berikutnya dan tetap lihat unread di
  // sana sampai dia benar-benar buka halaman itu.
  const idsToMark = rows.filter((r) => !r.read).map((r) => r.id);
  if (idsToMark.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: idsToMark } },
      data: { read: true },
    });
  }

  const items: NotificationItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    message: r.message,
    link: r.link,
    // Kirim status ORIGINAL (sebelum kita mark-as-read di atas) supaya
    // baris yang baru pertama dilihat tetap render dengan highlight
    // "belum dibaca" — visual signal bahwa itu memang baru.
    read: r.read,
    createdAtISO: r.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Notifikasi</h1>
      {total === 0 && !unreadOnly ? (
        <EmptyState
          icon={<InboxIcon />}
          title="Belum ada notifikasi"
          description="Reminder tagihan, status pembayaran, dan info lain akan muncul di sini."
        />
      ) : (
        <NotificationsView
          items={items}
          page={page}
          perPage={PER_PAGE}
          total={total}
          unreadTotal={unreadTotal}
          filter={unreadOnly ? "unread" : "all"}
        />
      )}
    </div>
  );
}

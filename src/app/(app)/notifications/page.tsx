import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const notifs = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Tandai semua sebagai read.
  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Notifikasi</h1>
      <div className="space-y-2">
        {notifs.length === 0 && (
          <div className="card text-sm text-slate-500">
            Belum ada notifikasi.
          </div>
        )}
        {notifs.map((n) => {
          const inner = (
            <div className={`card ${n.read ? "" : "border-brand-400 bg-brand-50/50"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{n.title}</div>
                  <div className="text-sm text-slate-700">{n.message}</div>
                </div>
                <div className="text-xs text-slate-500 whitespace-nowrap">
                  {new Date(n.createdAt).toLocaleString("id-ID")}
                </div>
              </div>
            </div>
          );
          return n.link ? (
            <Link key={n.id} href={n.link}>
              {inner}
            </Link>
          ) : (
            <div key={n.id}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

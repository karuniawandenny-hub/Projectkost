import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isPushConfigured, sendPushToUser } from "@/lib/push";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Kirim notifikasi percobaan ke device milik user yang sedang login.
 * Dipakai tombol "Kirim notifikasi percobaan" di /profile untuk
 * verifikasi end-to-end push tanpa perlu akun kedua.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  if (!isPushConfigured()) {
    return NextResponse.json({
      ok: false,
      reason:
        "VAPID key belum diset di server. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY di Railway, lalu redeploy.",
    });
  }

  const count = await prisma.pushSubscription.count({
    where: { userId: user.id },
  });
  if (count === 0) {
    return NextResponse.json({
      ok: false,
      reason:
        "Device ini belum berlangganan. Aktifkan notifikasi dulu di tombol atas.",
    });
  }

  await sendPushToUser(user.id, {
    title: "🔔 Notifikasi percobaan",
    body: "Berhasil! Push dari Kos Baiti sudah aktif di device ini.",
    url: "/notifications",
    tag: "test-push",
  });

  return NextResponse.json({ ok: true, devices: count });
}

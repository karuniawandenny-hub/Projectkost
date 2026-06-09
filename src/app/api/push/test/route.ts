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

  // Ambil endpoint host (apple.com/google.com/mozilla.com) untuk
  // diagnostik — beberapa masalah spesifik vendor (mis. iOS Web Push
  // butuh PWA terpasang & SW versi yang punya handler push).
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: user.id },
    select: { endpoint: true, createdAt: true },
  });
  const hosts = Array.from(
    new Set(
      subs.map((s) => {
        try {
          return new URL(s.endpoint).host;
        } catch {
          return "unknown";
        }
      })
    )
  );

  await sendPushToUser(user.id, {
    title: "🔔 Notifikasi percobaan",
    body: "Berhasil! Push dari Kos Baiti sudah aktif di device ini.",
    url: "/notifications",
    tag: "test-push",
  });

  return NextResponse.json({
    ok: true,
    devices: count,
    hosts,
    hint:
      "Server berhasil kirim. Kalau popup tidak muncul di HP: (1) keluar dari PWA, hapus dari home screen, install ulang via Add to Home Screen — supaya service worker terbaru (v4) yang aktif. (2) Cek Setelan iOS → Notifikasi → Kos Baiti → Izinkan Notifikasi ON.",
  });
}

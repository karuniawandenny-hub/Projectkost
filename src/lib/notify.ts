import { prisma } from "./prisma";
import { sendPushToUser } from "./push";

/**
 * Buat notifikasi in-app + (best-effort) kirim Web Push ke device user.
 *
 * Push tidak boleh menggagalkan pembuatan notifikasi: kalau push error
 * atau VAPID belum diset, in-app tetap tersimpan. Push di-await tapi
 * di-catch — sengaja await supaya jalan tuntas di server action /
 * route handler sebelum response selesai (fire-and-forget tidak reliable
 * di serverless).
 */
export async function notify(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  const created = await prisma.notification.create({ data: params });

  try {
    await sendPushToUser(params.userId, {
      title: params.title,
      body: params.message,
      url: params.link ?? "/notifications",
      tag: params.type,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[notify][push]", e);
  }

  return created;
}

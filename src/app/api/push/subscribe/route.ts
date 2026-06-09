import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { saveSubscription, type SubscriptionInput } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Simpan langganan Web Push milik user yang sedang login. Dipanggil
 * client setelah PushManager.subscribe() berhasil.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let body: SubscriptionInput;
  try {
    body = (await req.json()) as SubscriptionInput;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return new NextResponse("Invalid subscription", { status: 400 });
  }

  await saveSubscription(
    user.id,
    body,
    req.headers.get("user-agent") ?? undefined
  );
  return NextResponse.json({ ok: true });
}

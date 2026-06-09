import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { removeSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Hapus langganan Web Push (saat user matikan notif di device ini). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let body: { endpoint?: string };
  try {
    body = (await req.json()) as { endpoint?: string };
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  if (!body?.endpoint) {
    return new NextResponse("Missing endpoint", { status: 400 });
  }

  await removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}

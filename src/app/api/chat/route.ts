import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/session";
import {
  isChatConfigured,
  runChatTurnStreaming,
  type ChatUser,
} from "@/lib/ai-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatRequestBody = { messages?: ChatMessage[] };

/**
 * POST /api/chat — Server-Sent Events endpoint untuk AI chat in-app.
 *
 * Provider (Gemini/Claude) dipilih lewat env AI_PROVIDER, dengan
 * auto-fallback kalau provider primer gagal sebelum stream mulai.
 *
 * Response SSE event:
 *   { type: "text", delta: "..." }    potongan teks dari AI
 *   { type: "tool", name: "..." }     AI sedang panggil tool
 *   { type: "done" }                  selesai
 *   { type: "error", message: "..." } error
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (user.status === "SUSPENDED") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!isChatConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "Tidak ada provider AI terkonfigurasi. Set GEMINI_API_KEY (gratis) atau ANTHROPIC_API_KEY di Railway.",
      },
      { status: 503 }
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) {
    return new NextResponse("Empty messages", { status: 400 });
  }
  // Trim ke 20 turn terakhir supaya context tidak membengkak.
  const trimmed = incoming.slice(-20);

  const me: ChatUser = {
    id: user.id,
    name: user.name,
    role:
      user.role === "ADMIN"
        ? "ADMIN"
        : user.role === "OWNER"
          ? "OWNER"
          : "TENANT",
  };

  const messages: Anthropic.MessageParam[] = trimmed.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      try {
        await runChatTurnStreaming(me, messages, (e) => send(e));
        send({ type: "done" });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[chat] error:", e);
        send({
          type: "error",
          message: e instanceof Error ? e.message : "Gagal memproses chat.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/session";
import {
  anthropic,
  buildTools,
  isChatConfigured,
  MODEL_ID,
  systemPromptFor,
  toolsForApi,
  type ChatTool,
  type ChatUser,
} from "@/lib/ai-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatRequestBody = { messages?: ChatMessage[] };

const MAX_ITERATIONS = 6;

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
          "ANTHROPIC_API_KEY belum diset di Railway. Chat belum aktif.",
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

  const tools = buildTools(me);
  const toolsByName = new Map<string, ChatTool>(
    tools.map((t) => [t.name, t])
  );
  const apiTools = toolsForApi(tools);

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
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          const stream = anthropic().messages.stream({
            model: MODEL_ID,
            max_tokens: 4096,
            system: systemPromptFor(me.role),
            tools: apiTools,
            messages,
          });

          for await (const event of stream) {
            if (event.type === "content_block_start") {
              if (event.content_block.type === "tool_use") {
                send({ type: "tool", name: event.content_block.name });
              }
            } else if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                send({ type: "text", delta: event.delta.text });
              }
            }
          }

          const finalMessage = await stream.finalMessage();
          // Tambahkan response assistant ke history utk turn berikutnya
          messages.push({
            role: "assistant",
            content: finalMessage.content,
          });

          if (finalMessage.stop_reason !== "tool_use") {
            // Selesai (end_turn / max_tokens / refusal)
            break;
          }

          // Eksekusi semua tool_use, kumpulkan hasil.
          const toolUseBlocks = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of toolUseBlocks) {
            const tool = toolsByName.get(block.name);
            let content: string;
            let isError = false;
            if (!tool) {
              content = JSON.stringify({
                ok: false,
                message: `Tool ${block.name} tidak dikenal.`,
              });
              isError = true;
            } else {
              try {
                const input = (block.input as Record<string, unknown>) ?? {};
                content = await tool.execute(input);
              } catch (e) {
                content = JSON.stringify({
                  ok: false,
                  message: e instanceof Error ? e.message : "Eksekusi gagal.",
                });
                isError = true;
              }
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content,
              ...(isError ? { is_error: true } : {}),
            });
          }
          messages.push({ role: "user", content: toolResults });
        }

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

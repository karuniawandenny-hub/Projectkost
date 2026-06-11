"use client";

import { useEffect, useRef, useState } from "react";

type Msg = {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
};

const TOOL_LABEL: Record<string, string> = {
  get_my_info: "Membaca data Anda…",
  get_my_bills: "Mengecek tagihan…",
  get_my_complaints: "Mengecek komplain Anda…",
  create_complaint: "Membuat komplain…",
  get_announcements: "Mengambil pengumuman…",
  get_payment_link: "Menyiapkan link pembayaran…",
  list_my_kos: "Mengambil daftar kos…",
  list_bills_by_status: "Mengambil daftar tagihan…",
  list_open_complaints: "Mengambil komplain aktif…",
  get_kos_financial_summary: "Menghitung pemasukan & pengeluaran…",
  get_expense_summary: "Menghitung pengeluaran per kategori…",
  list_tenants: "Mengambil daftar penghuni…",
};

/**
 * Chat bubble mengambang di pojok kanan-bawah. Default tertutup; user
 * tap ikon untuk buka. Streaming jawaban via SSE dari /api/chat.
 *
 * Auth otomatis ikut session — backend cek getCurrentUser() dan scope
 * data ke user yang login.
 */
export function ChatBubble({
  role,
}: {
  role: "TENANT" | "OWNER" | "ADMIN";
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  const examples =
    role === "TENANT"
      ? [
          "Berapa tagihan saya bulan ini?",
          "Pengumuman terbaru apa?",
          "Saya mau lapor AC kamar bocor",
        ]
      : [
          "Siapa saja yang nunggak bulan ini?",
          "Laba bersih bulan ini berapa?",
          "Komplain apa saja yang belum selesai?",
        ];

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);

    // Tambah placeholder assistant kosong yang akan diisi streaming.
    setMessages((m) => [
      ...m,
      { role: "assistant", content: "", toolsUsed: [] },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          res.status === 503
            ? "Chatbot belum aktif. Hubungi admin untuk set ANTHROPIC_API_KEY."
            : `Gagal: ${res.status} ${txt}`
        );
      }
      if (!res.body) throw new Error("Streaming tidak didukung browser ini.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.startsWith("data: ") ? part.slice(6) : part;
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as
              | { type: "text"; delta: string }
              | { type: "tool"; name: string }
              | { type: "done" }
              | { type: "error"; message: string };
            if (ev.type === "text") {
              setMessages((m) => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                if (last && last.role === "assistant") {
                  copy[copy.length - 1] = {
                    ...last,
                    content: last.content + ev.delta,
                  };
                }
                return copy;
              });
            } else if (ev.type === "tool") {
              setMessages((m) => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                if (last && last.role === "assistant") {
                  copy[copy.length - 1] = {
                    ...last,
                    toolsUsed: [...(last.toolsUsed ?? []), ev.name],
                  };
                }
                return copy;
              });
            } else if (ev.type === "error") {
              throw new Error(ev.message);
            }
          } catch (parseErr) {
            // Bukan JSON yang dikenal — kalau bukan error event, biarkan
            if (parseErr instanceof Error && parseErr.message !== line) {
              throw parseErr;
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim pesan.");
      // Hapus placeholder kosong terakhir kalau error
      setMessages((m) => {
        const last = m[m.length - 1];
        if (last && last.role === "assistant" && last.content === "") {
          return m.slice(0, -1);
        }
        return m;
      });
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka chat asisten AI"
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 sm:bottom-6 sm:right-6"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-6 w-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z"
          />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 sm:inset-x-auto sm:bottom-6 sm:right-6">
      <div className="flex h-[min(80dvh,560px)] w-full flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:h-[560px] sm:w-[380px] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-brand-600 px-4 py-3 text-white rounded-t-2xl sm:rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-lg">
              ✨
            </span>
            <div>
              <div className="text-sm font-semibold">Asisten Kos Baiti</div>
              <div className="text-[10px] text-brand-100">
                {role === "TENANT"
                  ? "Tanya soal tagihan, pengumuman, komplain"
                  : "Tanya soal performa kos & keuangan"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup chat"
            className="rounded p-1 hover:bg-brand-700"
          >
            ✕
          </button>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-3"
        >
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                Halo! Ada yang bisa saya bantu? Coba salah satu di bawah ini
                atau ketik pertanyaan Anda sendiri.
              </div>
              <div className="flex flex-col gap-2">
                {examples.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:border-brand-300 hover:bg-brand-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-white text-slate-800 shadow-sm"
                }`}
              >
                {m.toolsUsed && m.toolsUsed.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {m.toolsUsed.map((t, j) => (
                      <span
                        key={j}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
                      >
                        {TOOL_LABEL[t] ?? t}
                      </span>
                    ))}
                  </div>
                )}
                {m.content || (
                  <span className="inline-flex gap-1">
                    <span className="animate-pulse">•</span>
                    <span className="animate-pulse [animation-delay:150ms]">
                      •
                    </span>
                    <span className="animate-pulse [animation-delay:300ms]">
                      •
                    </span>
                  </span>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="shrink-0 border-t border-slate-200 bg-white px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tulis pertanyaan…"
              disabled={sending}
              autoComplete="off"
              // text-[16px] WAJIB: font < 16px memicu auto-zoom di Safari/
              // Chrome iOS saat input fokus — itu yang bikin panel "membesar".
              // h-10 fixed + truncate supaya tinggi & lebar tidak berubah
              // berapa pun panjang teks yang diketik.
              className="h-10 min-w-0 flex-1 truncate rounded-md border border-slate-300 px-3 text-[16px] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="h-10 shrink-0 rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
            >
              {sending ? "…" : "Kirim"}
            </button>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            Jawaban dihasilkan AI. Selalu verifikasi data penting.
          </div>
        </form>
      </div>
    </div>
  );
}

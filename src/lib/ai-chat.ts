import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { prisma } from "./prisma";
import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "./expenses";
import { logAudit } from "./audit";

/**
 * AI chat backend untuk Kos Baiti — multi-provider dengan auto-fallback.
 *
 * Provider primer dipilih lewat env AI_PROVIDER:
 *   - "gemini" (default): Google Gemini 2.5 Flash via OpenAI-compatible
 *     endpoint. GRATIS sampai 1500 req/hari + 1M context, kualitas
 *     Bahasa Indonesia sangat baik. Butuh GEMINI_API_KEY (dari
 *     https://aistudio.google.com/apikey).
 *   - "anthropic": Claude (berbayar). Butuh ANTHROPIC_API_KEY.
 *
 * Auto-fallback: kalau primary gagal (rate limit, outage, network) dan
 * ANTHROPIC_API_KEY tersedia, otomatis retry pakai Claude. User tidak
 * tahu ada masalah.
 *
 * Filosofi tool:
 *  - Tool query SELALU di-scope ke caller (tenant atau owner). Tidak ada
 *    risiko data bocor antar user — auth-nya ikut session yang sama
 *    dengan endpoint lain.
 *  - Set tool dipisah per role. TENANT lihat data dirinya; OWNER lihat
 *    data kos miliknya. ADMIN ikut OWNER untuk sederhananya.
 *  - Tiap aksi yang mengubah data (createComplaint) di-audit.
 */
export const MODEL_ID = "claude-opus-4-8" as const;
export const GEMINI_MODEL = "gemini-2.5-flash" as const;

export type AIProvider = "gemini" | "anthropic";

export function primaryProvider(): AIProvider {
  const v = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  return v === "anthropic" ? "anthropic" : "gemini";
}

export type ChatUser = {
  id: string;
  name: string;
  role: "TENANT" | "OWNER" | "ADMIN";
};

type JSONSchema = Record<string, unknown>;

export type ChatTool = {
  name: string;
  description: string;
  input_schema: JSONSchema;
  execute: (input: Record<string, unknown>) => Promise<string>;
};

export function buildTools(me: ChatUser): ChatTool[] {
  if (me.role === "TENANT") return tenantTools(me);
  return ownerTools(me);
}

// =============================================================
// TENANT TOOLS
// =============================================================

function tenantTools(me: ChatUser): ChatTool[] {
  return [
    {
      name: "get_my_info",
      description:
        "Ambil informasi penghuni yang sedang chat: nama, email, nomor HP, kos & kamar yang dia tempati saat ini, tanggal mulai sewa, dan jadwal perawatan kamar yang akan datang.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        const tenancy = await prisma.tenancy.findFirst({
          where: { tenantId: me.id, status: "ACTIVE" },
          include: {
            tenant: { select: { name: true, email: true, phone: true } },
            room: {
              include: {
                kos: { select: { name: true, address: true } },
                maintenances: {
                  where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
                  orderBy: { scheduledDate: "asc" },
                  take: 5,
                  select: { title: true, status: true, scheduledDate: true },
                },
              },
            },
          },
        });
        if (!tenancy) {
          return JSON.stringify({
            ok: false,
            message:
              "Anda belum punya kamar aktif. Hubungi pemilik untuk penempatan.",
          });
        }
        return JSON.stringify({
          ok: true,
          nama: tenancy.tenant.name,
          email: tenancy.tenant.email,
          nomorHp: tenancy.tenant.phone,
          kos: tenancy.room.kos.name,
          alamatKos: tenancy.room.kos.address,
          kamar: tenancy.room.name,
          hargaPerBulan: tenancy.room.monthlyPrice,
          mulaiSewa: tenancy.startDate.toISOString().slice(0, 10),
          perawatanTerjadwal: tenancy.room.maintenances.map((m) => ({
            judul: m.title,
            status: m.status,
            tanggal: m.scheduledDate.toISOString().slice(0, 10),
          })),
        });
      },
    },
    {
      name: "get_my_bills",
      description:
        "Daftar tagihan/pembayaran penghuni. Default 6 tagihan terbaru. Status: DUE (belum bayar), PENDING (menunggu verifikasi), VERIFIED (lunas), REJECTED (ditolak).",
      input_schema: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 24,
            description: "Jumlah tagihan, default 6",
          },
        },
        additionalProperties: false,
      },
      execute: async (input) => {
        const limit = (input.limit as number | undefined) ?? 6;
        const payments = await prisma.payment.findMany({
          where: { tenancy: { tenantId: me.id } },
          orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
          take: limit,
        });
        return JSON.stringify({
          ok: true,
          tagihan: payments.map((p) => ({
            id: p.id,
            periode: `${p.periodMonth}/${p.periodYear}`,
            nominal: p.amount,
            status: p.status,
            jatuhTempo: p.dueDate?.toISOString().slice(0, 10),
            tanggalReview: p.reviewedAt?.toISOString().slice(0, 10),
            catatan: p.note,
            catatanReview: p.reviewNote,
          })),
        });
      },
    },
    {
      name: "get_my_complaints",
      description:
        "Daftar komplain yang pernah dibuat penghuni & statusnya (OPEN / IN_PROGRESS / RESOLVED).",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        const complaints = await prisma.complaint.findMany({
          where: { tenancy: { tenantId: me.id } },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            ownerReply: true,
            createdAt: true,
            resolvedAt: true,
          },
        });
        return JSON.stringify({
          ok: true,
          komplain: complaints.map((c) => ({
            id: c.id,
            judul: c.title,
            status: c.status,
            balasanPemilik: c.ownerReply,
            tanggalDibuat: c.createdAt.toISOString().slice(0, 10),
            tanggalSelesai: c.resolvedAt?.toISOString().slice(0, 10),
          })),
        });
      },
    },
    {
      name: "create_complaint",
      description:
        "Buat komplain baru atas nama penghuni. Pakai HANYA setelah penghuni jelas-jelas minta dibuatkan komplain dan judul + deskripsi sudah jelas. Tanpa lampiran foto.",
      input_schema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            minLength: 3,
            maxLength: 200,
            description: "Judul singkat komplain, mis. 'AC kamar bocor'",
          },
          description: {
            type: "string",
            minLength: 5,
            maxLength: 2000,
            description: "Deskripsi detail masalah",
          },
        },
        required: ["title", "description"],
        additionalProperties: false,
      },
      execute: async (input) => {
        const title = String(input.title ?? "").trim();
        const description = String(input.description ?? "").trim();
        if (title.length < 3 || description.length < 5) {
          return JSON.stringify({
            ok: false,
            message: "Judul minimal 3 karakter, deskripsi minimal 5.",
          });
        }
        const tenancy = await prisma.tenancy.findFirst({
          where: { tenantId: me.id, status: "ACTIVE" },
          select: { id: true },
        });
        if (!tenancy) {
          return JSON.stringify({
            ok: false,
            message: "Tidak ada tenancy aktif — komplain tidak bisa dibuat.",
          });
        }
        const c = await prisma.complaint.create({
          data: {
            tenancyId: tenancy.id,
            title,
            description,
            photoUrls: "[]",
            status: "OPEN",
          },
        });
        await logAudit({
          actorId: me.id,
          actorName: me.name,
          action: "COMPLAINT.RESOLVE",
          entityType: "Complaint",
          entityId: c.id,
          metadata: { subAction: "CREATE_VIA_CHAT", title },
        });
        return JSON.stringify({
          ok: true,
          message: "Komplain berhasil dibuat.",
          id: c.id,
          link: `/complaints/${c.id}`,
        });
      },
    },
    announcementsTool(me),
    paymentLinkTool(me),
  ];
}

// =============================================================
// OWNER TOOLS
// =============================================================

function ownerTools(me: ChatUser): ChatTool[] {
  const ownerFilter = me.role === "ADMIN" ? {} : { ownerId: me.id };

  return [
    {
      name: "list_my_kos",
      description:
        "Daftar semua kos milik pemilik dengan ringkasan: alamat, jumlah kamar, kamar terisi, kamar kosong, potensi pemasukan bulanan.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        const kosList = await prisma.kos.findMany({
          where: ownerFilter,
          orderBy: { name: "asc" },
          include: {
            rooms: { select: { status: true, monthlyPrice: true } },
          },
        });
        return JSON.stringify({
          ok: true,
          kos: kosList.map((k) => {
            const total = k.rooms.length;
            const terisi = k.rooms.filter((r) => r.status === "OCCUPIED").length;
            return {
              id: k.id,
              nama: k.name,
              alamat: k.address,
              totalKamar: total,
              kamarTerisi: terisi,
              kamarKosong: total - terisi,
              potensiPemasukanBulanan: k.rooms
                .filter((r) => r.status === "OCCUPIED")
                .reduce((s, r) => s + r.monthlyPrice, 0),
            };
          }),
        });
      },
    },
    {
      name: "list_bills_by_status",
      description:
        "Daftar tagihan berdasarkan status — sangat berguna untuk 'siapa yang belum bayar', 'siapa pending verifikasi'. Status: DUE, PENDING, REJECTED, VERIFIED, atau OVERDUE (belum bayar & lewat jatuh tempo).",
      input_schema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["DUE", "PENDING", "REJECTED", "VERIFIED", "OVERDUE"],
          },
          kosId: {
            type: "string",
            description: "Opsional. Kosong = semua kos pemilik.",
          },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
        required: ["status"],
        additionalProperties: false,
      },
      execute: async (input) => {
        const status = String(input.status);
        const kosId = input.kosId as string | undefined;
        const limit = (input.limit as number | undefined) ?? 25;

        const where: Record<string, unknown> = {
          tenancy: {
            room: {
              kos: kosId ? { id: kosId, ...ownerFilter } : ownerFilter,
            },
          },
        };
        if (status === "OVERDUE") {
          where.status = { in: ["DUE", "PENDING"] };
          where.dueDate = { lt: new Date() };
        } else {
          where.status = status;
        }
        const payments = await prisma.payment.findMany({
          where,
          orderBy: { dueDate: "asc" },
          take: limit,
          include: {
            tenancy: {
              include: {
                tenant: { select: { name: true, phone: true } },
                room: { include: { kos: { select: { name: true } } } },
              },
            },
          },
        });
        return JSON.stringify({
          ok: true,
          jumlah: payments.length,
          tagihan: payments.map((p) => ({
            id: p.id,
            penghuni: p.tenancy.tenant.name,
            nomorHp: p.tenancy.tenant.phone,
            kos: p.tenancy.room.kos.name,
            kamar: p.tenancy.room.name,
            periode: `${p.periodMonth}/${p.periodYear}`,
            nominal: p.amount,
            jatuhTempo: p.dueDate?.toISOString().slice(0, 10),
            telatHari: p.dueDate
              ? Math.max(
                  0,
                  Math.floor(
                    (Date.now() - p.dueDate.getTime()) / (1000 * 60 * 60 * 24)
                  )
                )
              : null,
          })),
        });
      },
    },
    {
      name: "list_open_complaints",
      description:
        "Daftar komplain yang belum selesai (OPEN atau IN_PROGRESS) di kos pemilik.",
      input_schema: {
        type: "object",
        properties: { kosId: { type: "string" } },
        additionalProperties: false,
      },
      execute: async (input) => {
        const kosId = input.kosId as string | undefined;
        const complaints = await prisma.complaint.findMany({
          where: {
            status: { in: ["OPEN", "IN_PROGRESS"] },
            tenancy: {
              room: {
                kos: kosId ? { id: kosId, ...ownerFilter } : ownerFilter,
              },
            },
          },
          orderBy: { createdAt: "asc" },
          include: {
            tenancy: {
              include: {
                tenant: { select: { name: true } },
                room: { include: { kos: { select: { name: true } } } },
              },
            },
          },
        });
        return JSON.stringify({
          ok: true,
          jumlah: complaints.length,
          komplain: complaints.map((c) => ({
            id: c.id,
            judul: c.title,
            status: c.status,
            penghuni: c.tenancy.tenant.name,
            kos: c.tenancy.room.kos.name,
            kamar: c.tenancy.room.name,
            umurHari: Math.floor(
              (Date.now() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24)
            ),
          })),
        });
      },
    },
    {
      name: "get_kos_financial_summary",
      description:
        "Ringkasan keuangan satu bulan tertentu (atau bulan berjalan kalau month/year tidak diisi) per kos: pemasukan terverifikasi, total pengeluaran, laba bersih, margin.",
      input_schema: {
        type: "object",
        properties: {
          kosId: { type: "string" },
          month: { type: "integer", minimum: 1, maximum: 12 },
          year: { type: "integer", minimum: 2020, maximum: 2100 },
        },
        additionalProperties: false,
      },
      execute: async (input) => {
        const kosId = input.kosId as string | undefined;
        const now = new Date();
        const m = (input.month as number | undefined) ?? now.getMonth() + 1;
        const y = (input.year as number | undefined) ?? now.getFullYear();
        const from = new Date(y, m - 1, 1);
        const to = new Date(y, m, 0, 23, 59, 59);
        const kosWhere = kosId ? { id: kosId, ...ownerFilter } : ownerFilter;

        const [income, expenses, kosList] = await Promise.all([
          prisma.payment.findMany({
            where: {
              status: "VERIFIED",
              periodMonth: m,
              periodYear: y,
              tenancy: { room: { kos: kosWhere } },
            },
            select: {
              amount: true,
              tenancy: {
                select: {
                  room: {
                    select: { kos: { select: { id: true, name: true } } },
                  },
                },
              },
            },
          }),
          prisma.expense.findMany({
            where: { date: { gte: from, lte: to }, kos: kosWhere },
            select: {
              amount: true,
              kos: { select: { id: true, name: true } },
            },
          }),
          prisma.kos.findMany({
            where: kosWhere,
            select: { id: true, name: true },
          }),
        ]);

        const byKos = new Map<
          string,
          { nama: string; pemasukan: number; pengeluaran: number }
        >();
        for (const k of kosList)
          byKos.set(k.id, { nama: k.name, pemasukan: 0, pengeluaran: 0 });
        for (const p of income) {
          const b = byKos.get(p.tenancy.room.kos.id);
          if (b) b.pemasukan += p.amount;
        }
        for (const e of expenses) {
          const b = byKos.get(e.kos.id);
          if (b) b.pengeluaran += e.amount;
        }

        const rows = [...byKos.entries()].map(([id, v]) => ({
          kosId: id,
          kos: v.nama,
          pemasukan: v.pemasukan,
          pengeluaran: v.pengeluaran,
          laba: v.pemasukan - v.pengeluaran,
          marginPersen:
            v.pemasukan > 0
              ? Math.round(((v.pemasukan - v.pengeluaran) / v.pemasukan) * 100)
              : 0,
        }));
        const totalIncome = rows.reduce((s, r) => s + r.pemasukan, 0);
        const totalExpense = rows.reduce((s, r) => s + r.pengeluaran, 0);

        return JSON.stringify({
          ok: true,
          periode: `${m}/${y}`,
          ringkasanPerKos: rows,
          total: {
            pemasukan: totalIncome,
            pengeluaran: totalExpense,
            laba: totalIncome - totalExpense,
            marginPersen:
              totalIncome > 0
                ? Math.round(
                    ((totalIncome - totalExpense) / totalIncome) * 100
                  )
                : 0,
          },
        });
      },
    },
    {
      name: "get_expense_summary",
      description:
        "Ringkasan pengeluaran per kategori (Utilitas / Gaji / Perbaikan / Perlengkapan / Pajak / Lain-lain) untuk satu bulan tertentu.",
      input_schema: {
        type: "object",
        properties: {
          kosId: { type: "string" },
          month: { type: "integer", minimum: 1, maximum: 12 },
          year: { type: "integer", minimum: 2020, maximum: 2100 },
        },
        additionalProperties: false,
      },
      execute: async (input) => {
        const kosId = input.kosId as string | undefined;
        const now = new Date();
        const m = (input.month as number | undefined) ?? now.getMonth() + 1;
        const y = (input.year as number | undefined) ?? now.getFullYear();
        const from = new Date(y, m - 1, 1);
        const to = new Date(y, m, 0, 23, 59, 59);
        const kosWhere = kosId ? { id: kosId, ...ownerFilter } : ownerFilter;

        const expenses = await prisma.expense.findMany({
          where: { date: { gte: from, lte: to }, kos: kosWhere },
          select: { amount: true, category: true },
        });
        const byCat = new Map<string, { total: number; jumlah: number }>();
        for (const e of expenses) {
          const cur = byCat.get(e.category) ?? { total: 0, jumlah: 0 };
          cur.total += e.amount;
          cur.jumlah += 1;
          byCat.set(e.category, cur);
        }
        return JSON.stringify({
          ok: true,
          periode: `${m}/${y}`,
          total: expenses.reduce((s, e) => s + e.amount, 0),
          perKategori: [...byCat.entries()].map(([cat, v]) => ({
            kategori:
              EXPENSE_CATEGORY_LABEL[cat as ExpenseCategory] ?? cat,
            total: v.total,
            jumlahTransaksi: v.jumlah,
          })),
        });
      },
    },
    {
      name: "list_tenants",
      description:
        "Daftar penghuni aktif di kos pemilik. Berguna untuk pertanyaan 'berapa total penghuni', 'siapa saja di Baiti Tebet', dsb.",
      input_schema: {
        type: "object",
        properties: { kosId: { type: "string" } },
        additionalProperties: false,
      },
      execute: async (input) => {
        const kosId = input.kosId as string | undefined;
        const tenancies = await prisma.tenancy.findMany({
          where: {
            status: "ACTIVE",
            room: {
              kos: kosId ? { id: kosId, ...ownerFilter } : ownerFilter,
            },
          },
          orderBy: { startDate: "desc" },
          include: {
            tenant: { select: { name: true, email: true, phone: true } },
            room: { include: { kos: { select: { name: true } } } },
          },
        });
        return JSON.stringify({
          ok: true,
          jumlah: tenancies.length,
          penghuni: tenancies.map((t) => ({
            nama: t.tenant.name,
            email: t.tenant.email,
            nomorHp: t.tenant.phone,
            kos: t.room.kos.name,
            kamar: t.room.name,
            mulaiSewa: t.startDate.toISOString().slice(0, 10),
            hargaPerBulan: t.room.monthlyPrice,
          })),
        });
      },
    },
    announcementsTool(me),
  ];
}

// =============================================================
// SHARED TOOLS
// =============================================================

function announcementsTool(me: ChatUser): ChatTool {
  return {
    name: "get_announcements",
    description:
      "Daftar pengumuman terbaru. Untuk penghuni: pengumuman yang ditujukan ke dia. Untuk pemilik: pengumuman yang dia kirim.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 20 } },
      additionalProperties: false,
    },
    execute: async (input) => {
      const limit = (input.limit as number | undefined) ?? 6;
      const where: Record<string, unknown> =
        me.role === "TENANT"
          ? {
              OR: [
                { kosId: null },
                {
                  kos: {
                    rooms: {
                      some: {
                        tenancies: {
                          some: { tenantId: me.id, status: "ACTIVE" },
                        },
                      },
                    },
                  },
                },
              ],
            }
          : me.role === "OWNER"
            ? { authorId: me.id }
            : {};

      const items = await prisma.announcement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          author: { select: { name: true } },
          kos: { select: { name: true } },
        },
      });
      return JSON.stringify({
        ok: true,
        pengumuman: items.map((a) => ({
          judul: a.title,
          isi: a.body,
          pengirim: a.author.name,
          targetKos: a.kos?.name ?? "Semua kos",
          tanggal: a.createdAt.toISOString().slice(0, 10),
          jumlahPenerima: a.audienceCount,
        })),
      });
    },
  };
}

function paymentLinkTool(me: ChatUser): ChatTool {
  return {
    name: "get_payment_link",
    description:
      "Dapatkan link checkout untuk membayar tagihan tertentu. WAJIB pakai paymentId yang persis sama dengan yang dikembalikan get_my_bills, jangan ngarang ID.",
    input_schema: {
      type: "object",
      properties: { paymentId: { type: "string", minLength: 1 } },
      required: ["paymentId"],
      additionalProperties: false,
    },
    execute: async (input) => {
      const paymentId = String(input.paymentId ?? "");
      const payment = await prisma.payment.findFirst({
        where: { id: paymentId, tenancy: { tenantId: me.id } },
        select: { id: true, status: true },
      });
      if (!payment) {
        return JSON.stringify({
          ok: false,
          message: "Tagihan tidak ditemukan atau bukan milik Anda.",
        });
      }
      if (payment.status === "VERIFIED") {
        return JSON.stringify({
          ok: false,
          message: "Tagihan ini sudah lunas, tidak perlu dibayar lagi.",
        });
      }
      return JSON.stringify({
        ok: true,
        link: `/payments/new?paymentId=${payment.id}`,
        message:
          "Buka link ini di app untuk pilih metode pembayaran dan upload bukti.",
      });
    },
  };
}

// =============================================================
// SYSTEM PROMPTS
// =============================================================

const SYSTEM_TENANT = `Kamu asisten chat untuk app Kos Baiti — penghuni kos sedang bicara dengan kamu.

Tugas kamu: bantu mereka cek tagihan, lihat pengumuman, buat komplain, dan jawab pertanyaan seputar kos & kamarnya.

Aturan:
- Selalu jawab dalam Bahasa Indonesia, ramah, singkat, tidak bertele-tele.
- Jawab HANYA berdasarkan data dari tool. Jangan ngarang nominal, tanggal, atau status.
- Kalau data tidak ada / kosong, bilang apa adanya. Jangan asumsi.
- Format nominal: "Rp 1.500.000". Format tanggal: "26 Mei 2026".
- Sebelum panggil create_complaint, KONFIRMASI dulu ke penghuni judul + deskripsi yang akan disimpan.
- Kalau penghuni minta bayar, panggil get_payment_link dan kasih dia link-nya.
- Kalau pertanyaan di luar topik kos, arahkan balik dengan sopan.`;

const SYSTEM_OWNER = `Kamu asisten bisnis untuk app Kos Baiti — pemilik kos sedang bicara dengan kamu.

Tugas kamu: bantu mereka pantau performa kos, lihat siapa nunggak, ringkas keuangan, cek komplain yang belum selesai.

Aturan:
- Selalu jawab dalam Bahasa Indonesia, profesional, padat, fokus ke data.
- Jawab HANYA berdasarkan data dari tool. Jangan ngarang angka, nama penghuni, atau status.
- Kalau data tidak ada / kosong, bilang "tidak ada data untuk filter itu" — jangan menebak.
- Format nominal Rupiah: "Rp 1.500.000". Format tanggal: "26 Mei 2026".
- Untuk pertanyaan periode: kalau pemilik tidak sebut bulan/tahun, asumsikan bulan berjalan.
- Untuk pertanyaan "siapa nunggak": pakai list_bills_by_status dengan status OVERDUE.
- Boleh menarik kesimpulan ringkas dari data (mis. "kos Tebet paling untung bulan ini"), tapi selalu sertakan angkanya.`;

export function systemPromptFor(role: ChatUser["role"]): string {
  return role === "TENANT" ? SYSTEM_TENANT : SYSTEM_OWNER;
}

// =============================================================
// ANTHROPIC CLIENT
// =============================================================

let _anthropicClient: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!_anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY belum diset. Set di Railway -> Variables."
      );
    }
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
}

let _geminiClient: OpenAI | null = null;
/**
 * Gemini lewat OpenAI-compatible endpoint Google AI Studio.
 *
 * Dokumentasi: https://ai.google.dev/gemini-api/docs/openai
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/openai/
 * Auth: Bearer <GEMINI_API_KEY>
 *
 * Kenapa lewat OpenAI SDK, bukan @google/genai? Karena shape API,
 * tool definition, dan streaming format mirip OpenAI — bisa di-share
 * kode dengan provider lain (Groq, OpenRouter, dll) kalau nanti perlu.
 */
export function gemini(): OpenAI {
  if (!_geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY belum diset. Daftar di https://aistudio.google.com/apikey lalu set di Railway -> Variables."
      );
    }
    _geminiClient = new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }
  return _geminiClient;
}

/**
 * App siap chat kalau setidaknya satu provider terkonfigurasi.
 */
export function isChatConfigured(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export function providerStatus(): {
  primary: AIProvider;
  gemini: boolean;
  anthropic: boolean;
  fallbackAvailable: boolean;
} {
  const primary = primaryProvider();
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  return {
    primary,
    gemini: hasGemini,
    anthropic: hasAnthropic,
    fallbackAvailable:
      primary === "gemini" ? hasAnthropic : hasGemini,
  };
}

/**
 * Convert tool definition ke Anthropic API shape.
 */
export function toolsForApi(tools: ChatTool[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  })) as unknown as Anthropic.Tool[];
}

// =============================================================
// NON-STREAMING RUNNER — dipakai webhook WhatsApp (tidak ada SSE)
// =============================================================

const MAX_ITERATIONS = 6;

/**
 * Jalankan agentic loop sampai Claude balas tanpa tool_use, atau
 * sampai MAX_ITERATIONS tercapai. Mengembalikan teks final yang siap
 * dikirim ke user.
 *
 * Dipakai oleh /api/wa/inbound — di sana tidak ada streaming, kita
 * butuh hasil sekali jadi untuk dikirim balik via WhatsApp Cloud API.
 */
/**
 * Public entry untuk WhatsApp inbound handler (non-streaming).
 *
 * Strategi: coba provider primer dulu. Kalau error (rate limit, outage,
 * key tidak valid) dan ada provider sekunder yang tersedia, otomatis
 * fallback. User tidak tahu ada masalah.
 */
export async function runChatTurn(
  me: ChatUser,
  messages: Anthropic.MessageParam[]
): Promise<string> {
  const primary = primaryProvider();
  try {
    if (primary === "anthropic") {
      return await runAnthropicTurn(me, messages);
    }
    return await runGeminiTurn(me, messages);
  } catch (e) {
    const fallbackKey =
      primary === "gemini"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.GEMINI_API_KEY;
    if (!fallbackKey) throw e;
    // eslint-disable-next-line no-console
    console.warn(
      `[ai-chat] ${primary} gagal — fallback ke ${primary === "gemini" ? "anthropic" : "gemini"}:`,
      e instanceof Error ? e.message : e
    );
    if (primary === "gemini") return await runAnthropicTurn(me, messages);
    return await runGeminiTurn(me, messages);
  }
}

async function runAnthropicTurn(
  me: ChatUser,
  messages: Anthropic.MessageParam[]
): Promise<string> {
  const tools = buildTools(me);
  const toolsByName = new Map<string, ChatTool>(tools.map((t) => [t.name, t]));
  const apiTools = toolsForApi(tools);
  const client = anthropic();

  const convo: Anthropic.MessageParam[] = [...messages];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 4096,
      system: systemPromptFor(me.role),
      tools: apiTools,
      messages: convo,
    });

    convo.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    }

    const toolUseBlocks = response.content.filter(
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
    convo.push({ role: "user", content: toolResults });
  }

  return "Maaf, saya butuh terlalu banyak langkah untuk menjawab pertanyaan ini. Coba pertanyaan yang lebih spesifik atau buka app langsung.";
}

// =============================================================
// GEMINI IMPLEMENTATION (via OpenAI-compatible endpoint)
// =============================================================

/**
 * Konversi tool ChatTool ke shape OpenAI function calling.
 * Gemini & semua provider OpenAI-compatible pakai shape ini.
 */
function toolsForOpenAI(tools: ChatTool[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

/**
 * Convert Anthropic.MessageParam[] ke OpenAI shape.
 *
 * Tidak semua block type Anthropic ada di OpenAI. Strategi:
 *  - String content → masuk apa adanya
 *  - Array content yang text-only → gabung jadi string
 *  - Tool result blocks → masuk sebagai message role "tool"
 *  - Tool use blocks (assistant) → masuk sebagai tool_calls
 *
 * Untuk webhook WA, history yang kita simpan hanya text murni
 * (lihat WaChatMessage di prisma), jadi conversion ini ringan.
 */
function anthropicMessagesToOpenAI(
  messages: Anthropic.MessageParam[]
): OpenAI.ChatCompletionMessageParam[] {
  const out: OpenAI.ChatCompletionMessageParam[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    // Array content — bisa berisi text/tool_use/tool_result blocks.
    // Untuk caller WA inbound, hanya string yang dipakai, jadi case ini
    // praktis tidak terpicu. Tapi kita tangani defensif.
    if (m.role === "assistant") {
      const textParts = m.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      out.push({ role: "assistant", content: textParts || null });
    } else {
      // user — extract text & buang tool_result (Gemini conversation
      // sebelumnya tidak punya tool_call_id yang valid)
      const textParts = m.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("\n");
      if (textParts) out.push({ role: "user", content: textParts });
    }
  }
  return out;
}

async function runGeminiTurn(
  me: ChatUser,
  messages: Anthropic.MessageParam[]
): Promise<string> {
  const tools = buildTools(me);
  const toolsByName = new Map<string, ChatTool>(tools.map((t) => [t.name, t]));
  const openaiTools = toolsForOpenAI(tools);
  const client = gemini();

  const convo: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPromptFor(me.role) },
    ...anthropicMessagesToOpenAI(messages),
  ];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await client.chat.completions.create({
      model: GEMINI_MODEL,
      messages: convo,
      tools: openaiTools,
      max_tokens: 4096,
    });

    const choice = response.choices[0];
    if (!choice) {
      return "Maaf, tidak ada jawaban dari AI.";
    }
    const msg = choice.message;

    // Push assistant response (text dan/atau tool_calls)
    convo.push({
      role: "assistant",
      content: msg.content ?? null,
      ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
    });

    if (
      choice.finish_reason !== "tool_calls" ||
      !msg.tool_calls?.length
    ) {
      return (msg.content ?? "").trim() ||
        "Maaf, saya tidak punya jawaban untuk itu sekarang.";
    }

    // Eksekusi tool calls
    for (const tc of msg.tool_calls) {
      if (tc.type !== "function") continue;
      const tool = toolsByName.get(tc.function.name);
      let content: string;
      if (!tool) {
        content = JSON.stringify({
          ok: false,
          message: `Tool ${tc.function.name} tidak dikenal.`,
        });
      } else {
        try {
          const input = tc.function.arguments
            ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
            : {};
          content = await tool.execute(input);
        } catch (e) {
          content = JSON.stringify({
            ok: false,
            message: e instanceof Error ? e.message : "Eksekusi gagal.",
          });
        }
      }
      convo.push({
        role: "tool",
        tool_call_id: tc.id,
        content,
      });
    }
  }

  return "Maaf, saya butuh terlalu banyak langkah untuk menjawab pertanyaan ini. Coba pertanyaan yang lebih spesifik atau buka app langsung.";
}

// =============================================================
// STREAMING — dipakai /api/chat (UI ChatBubble in-app)
// =============================================================

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string };

/**
 * Streaming agentic loop dengan auto-fallback.
 *
 * Callback `onEvent` dipanggil tiap kali ada text delta atau tool call
 * masuk. Provider primer dicoba dulu; kalau gagal SEBELUM ada event
 * terkirim, fallback ke Anthropic. (Kalau primary sudah mulai stream
 * lalu error di tengah, kita tidak fallback supaya UI tidak duplicate.)
 */
export async function runChatTurnStreaming(
  me: ChatUser,
  messages: Anthropic.MessageParam[],
  onEvent: (e: StreamEvent) => void
): Promise<void> {
  const primary = primaryProvider();
  let sentAnyEvent = false;
  const wrapped = (e: StreamEvent) => {
    sentAnyEvent = true;
    onEvent(e);
  };

  try {
    if (primary === "anthropic") {
      await streamAnthropic(me, messages, wrapped);
    } else {
      await streamGemini(me, messages, wrapped);
    }
  } catch (e) {
    if (sentAnyEvent) throw e;
    const fallbackKey =
      primary === "gemini"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.GEMINI_API_KEY;
    if (!fallbackKey) throw e;
    // eslint-disable-next-line no-console
    console.warn(
      `[ai-chat][stream] ${primary} gagal sebelum event — fallback ke ${primary === "gemini" ? "anthropic" : "gemini"}:`,
      e instanceof Error ? e.message : e
    );
    if (primary === "gemini") {
      await streamAnthropic(me, messages, wrapped);
    } else {
      await streamGemini(me, messages, wrapped);
    }
  }
}

async function streamAnthropic(
  me: ChatUser,
  messages: Anthropic.MessageParam[],
  onEvent: (e: StreamEvent) => void
): Promise<void> {
  const tools = buildTools(me);
  const toolsByName = new Map<string, ChatTool>(tools.map((t) => [t.name, t]));
  const apiTools = toolsForApi(tools);
  const client = anthropic();
  const convo: Anthropic.MessageParam[] = [...messages];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const stream = client.messages.stream({
      model: MODEL_ID,
      max_tokens: 4096,
      system: systemPromptFor(me.role),
      tools: apiTools,
      messages: convo,
    });

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          onEvent({ type: "tool", name: event.content_block.name });
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          onEvent({ type: "text", delta: event.delta.text });
        }
      }
    }

    const finalMessage = await stream.finalMessage();
    convo.push({ role: "assistant", content: finalMessage.content });
    if (finalMessage.stop_reason !== "tool_use") return;

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
    convo.push({ role: "user", content: toolResults });
  }
}

async function streamGemini(
  me: ChatUser,
  messages: Anthropic.MessageParam[],
  onEvent: (e: StreamEvent) => void
): Promise<void> {
  const tools = buildTools(me);
  const toolsByName = new Map<string, ChatTool>(tools.map((t) => [t.name, t]));
  const openaiTools = toolsForOpenAI(tools);
  const client = gemini();

  const convo: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPromptFor(me.role) },
    ...anthropicMessagesToOpenAI(messages),
  ];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const stream = await client.chat.completions.create({
      model: GEMINI_MODEL,
      messages: convo,
      tools: openaiTools,
      max_tokens: 4096,
      stream: true,
    });

    // Accumulator untuk tool_calls — OpenAI stream kirim per delta
    // (id+name dulu, lalu arguments potong-potong).
    type AccTool = {
      id: string;
      name: string;
      arguments: string;
      announced: boolean;
    };
    const toolCalls = new Map<number, AccTool>();
    let textBuf = "";
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta;
      if (delta?.content) {
        textBuf += delta.content;
        onEvent({ type: "text", delta: delta.content });
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          let acc = toolCalls.get(idx);
          if (!acc) {
            acc = { id: "", name: "", arguments: "", announced: false };
            toolCalls.set(idx, acc);
          }
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          if (!acc.announced && acc.name) {
            acc.announced = true;
            onEvent({ type: "tool", name: acc.name });
          }
        }
      }
    }

    // Selesai stream — assemble assistant message
    const finalToolCalls = [...toolCalls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, t]) => ({
        id: t.id,
        type: "function" as const,
        function: { name: t.name, arguments: t.arguments },
      }));

    convo.push({
      role: "assistant",
      content: textBuf || null,
      ...(finalToolCalls.length ? { tool_calls: finalToolCalls } : {}),
    });

    if (finishReason !== "tool_calls" || finalToolCalls.length === 0) {
      return;
    }

    for (const tc of finalToolCalls) {
      const tool = toolsByName.get(tc.function.name);
      let content: string;
      if (!tool) {
        content = JSON.stringify({
          ok: false,
          message: `Tool ${tc.function.name} tidak dikenal.`,
        });
      } else {
        try {
          const input = tc.function.arguments
            ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
            : {};
          content = await tool.execute(input);
        } catch (e) {
          content = JSON.stringify({
            ok: false,
            message: e instanceof Error ? e.message : "Eksekusi gagal.",
          });
        }
      }
      convo.push({ role: "tool", tool_call_id: tc.id, content });
    }
  }
}

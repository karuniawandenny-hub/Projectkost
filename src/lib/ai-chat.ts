import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "./expenses";
import { logAudit } from "./audit";

/**
 * AI chat backend untuk Kos Baiti. Pakai Claude API + tool use — tiap
 * tool adalah pembungkus tipis di atas query Prisma yang sudah ada.
 *
 * Filosofi:
 *  - Tool query SELALU di-scope ke caller (tenant atau owner). Tidak ada
 *    risiko data bocor antar user — auth-nya ikut session yang sama
 *    dengan endpoint lain.
 *  - Set tool dipisah per role. TENANT lihat data dirinya; OWNER lihat
 *    data kos miliknya. ADMIN ikut OWNER untuk sederhananya.
 *  - Tiap aksi yang mengubah data (createComplaint) di-audit.
 *
 * Untuk mengganti model: ubah konstanta MODEL_ID di bawah.
 *   - claude-opus-4-8 (default): paling pintar, ~Rp 50-100/chat
 *   - claude-sonnet-4-6: cepat & lebih murah, sweet spot
 *   - claude-haiku-4-5: paling murah, cukup untuk Q&A simple
 */
export const MODEL_ID = "claude-opus-4-8" as const;

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

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY belum diset. Set di Railway -> Variables."
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export function isChatConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
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
export async function runChatTurn(
  me: ChatUser,
  messages: Anthropic.MessageParam[]
): Promise<string> {
  const tools = buildTools(me);
  const toolsByName = new Map<string, ChatTool>(tools.map((t) => [t.name, t]));
  const apiTools = toolsForApi(tools);
  const client = anthropic();

  // Salinan lokal supaya tidak mutasi array caller
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
      // Selesai — gabung semua text block jadi satu string.
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

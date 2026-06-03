/**
 * Definisi template WhatsApp Cloud API untuk Kos Baiti.
 *
 * Setiap template DI SINI = template yang HARUS Anda submit & approve
 * di Meta Business Manager → WhatsApp Manager → Message Templates.
 * Nama template (slug) WAJIB persis sama, body text format harus sama,
 * jumlah placeholder {{1}}, {{2}}, dst juga harus sama.
 *
 * Kategori Meta untuk template kita:
 *  - UTILITY: untuk pesan transaksional (welcome, konfirmasi, reminder
 *    tagihan, status komplain, jadwal perawatan). Approval cepat
 *    (~hitungan menit-jam) karena fungsi essensial.
 *  - Tidak pakai MARKETING (untuk promosi) atau AUTHENTICATION (OTP).
 *
 * Struktur tiap template:
 *  - HEADER: tipe IMAGE — Meta hosting logo Kos Baiti (Anda upload
 *    sekali saat create template di dashboard). Logo tampil di setiap
 *    pesan, mirip preview card.
 *  - BODY: text dengan placeholder {{1}}, {{2}}, dst. Sistem
 *    substitusi dengan data tenant saat kirim.
 *  - FOOTER: opsional, brand line "— Kos Baiti".
 *  - BUTTONS: URL button "Buka Aplikasi" → https://www.kosbaiti.com
 *
 * Cara pakai dari kode: lihat `sendKosBaitiTemplate()` di bawah.
 */

import { sendTemplate, type CloudResult } from "./wa-cloud";

const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || "https://www.kosbaiti.com").replace(
    /\/+$/,
    ""
  );
// URL gambar logo yang Meta fetch sekali saat template di-approve.
// Wajib publicly accessible. Pakai og-image.jpg yang kita generate
// (1200x1200 dengan logo, white background — sesuai recommendation
// Meta untuk template header image).
const LOGO_URL = `${SITE_URL}/og-image.jpg`;

export type TemplateSpec = {
  /** Slug nama template di Meta. Lowercase + underscore. */
  name: string;
  /** Bahasa, untuk Kos Baiti default Bahasa Indonesia. */
  language: "id";
  /** Kategori untuk approval di Meta. */
  category: "UTILITY";
  /** Header (opsional). Untuk Kos Baiti semua pakai image logo. */
  header?: {
    type: "IMAGE";
    /** URL contoh untuk approval — Meta perlu sample. */
    sampleImageUrl: string;
  };
  /** Body dengan placeholder {{1}}, {{2}}, dst. */
  body: {
    text: string;
    /** Contoh nilai placeholder untuk approval. */
    sampleParams: string[];
  };
  /** Footer (opsional). */
  footer?: string;
  /** Buttons (opsional). */
  buttons?: Array<{
    type: "URL";
    text: string;
    url: string;
  }>;
};

/**
 * REGISTRY semua template yang dipakai aplikasi. Submit semuanya ke
 * Meta Business Manager → Message Templates sebelum cutover.
 */
export const TEMPLATES: Record<string, TemplateSpec> = {
  // ==== Welcome saat tenant ditempatkan di kamar ====
  tenant_assigned: {
    name: "tenant_assigned",
    language: "id",
    category: "UTILITY",
    header: { type: "IMAGE", sampleImageUrl: LOGO_URL },
    body: {
      text:
        "Halo {{1}},\n\n" +
        "Anda sudah ditempatkan di Kamar {{2}} - {{3}}.\n" +
        "Mulai sewa: {{4}}\n" +
        "Tagihan: {{5}}/bulan\n\n" +
        "Selamat datang di Kos Baiti. Mohon simpan nomor ini agar update tagihan & komunikasi pemilik tidak terlewat.",
      sampleParams: ["Budi", "A1", "Kos Baiti Pusat", "01 Juni 2026", "Rp 800.000"],
    },
    footer: "— Kos Baiti",
    buttons: [{ type: "URL", text: "Buka Aplikasi", url: SITE_URL }],
  },

  // ==== Reminder tagihan H-7 ====
  payment_reminder_h7: {
    name: "payment_reminder_h7",
    language: "id",
    category: "UTILITY",
    header: { type: "IMAGE", sampleImageUrl: LOGO_URL },
    body: {
      text:
        "Halo {{1}},\n\n" +
        "Pengingat 7 hari lagi: tagihan kos periode {{2}}\n" +
        "  Kos: {{3}}\n" +
        "  Kamar: {{4}}\n" +
        "  Nominal: {{5}}\n" +
        "  Jatuh tempo: {{6}}\n\n" +
        "Mohon disiapkan pembayarannya sebelum jatuh tempo.",
      sampleParams: ["Budi", "Mei 2026", "Kos Baiti Pusat", "A1", "Rp 800.000", "01 Juni 2026"],
    },
    footer: "— Kos Baiti",
    buttons: [{ type: "URL", text: "Lihat Tagihan", url: `${SITE_URL}/payments` }],
  },

  // ==== Reminder tagihan H-3 ====
  payment_reminder_h3: {
    name: "payment_reminder_h3",
    language: "id",
    category: "UTILITY",
    header: { type: "IMAGE", sampleImageUrl: LOGO_URL },
    body: {
      text:
        "Halo {{1}},\n\n" +
        "Pengingat 3 hari lagi: tagihan kos periode {{2}}\n" +
        "  Nominal: {{3}}\n" +
        "  Jatuh tempo: {{4}}\n\n" +
        "Mohon selesaikan pembayaran sebelum jatuh tempo, ya.",
      sampleParams: ["Budi", "Mei 2026", "Rp 800.000", "01 Juni 2026"],
    },
    footer: "— Kos Baiti",
    buttons: [{ type: "URL", text: "Bayar Sekarang", url: `${SITE_URL}/payments` }],
  },

  // ==== Reminder tagihan H-1 ====
  payment_reminder_h1: {
    name: "payment_reminder_h1",
    language: "id",
    category: "UTILITY",
    header: { type: "IMAGE", sampleImageUrl: LOGO_URL },
    body: {
      text:
        "Halo {{1}},\n\n" +
        "Pengingat BESOK: tagihan kos periode {{2}} jatuh tempo.\n" +
        "Nominal: {{3}}\n\n" +
        "Silakan upload bukti transfer di aplikasi setelah membayar.",
      sampleParams: ["Budi", "Mei 2026", "Rp 800.000"],
    },
    footer: "— Kos Baiti",
    buttons: [{ type: "URL", text: "Upload Bukti", url: `${SITE_URL}/payments` }],
  },

  // ==== Tagihan overdue ====
  payment_overdue: {
    name: "payment_overdue",
    language: "id",
    category: "UTILITY",
    header: { type: "IMAGE", sampleImageUrl: LOGO_URL },
    body: {
      text:
        "Halo {{1}},\n\n" +
        "Tagihan periode {{2}} sudah lewat {{3}} hari.\n" +
        "Nominal: {{4}}\n\n" +
        "Mohon segera upload bukti pembayaran agar tidak menambah keterlambatan. Bila ada kendala, silakan hubungi pemilik kos.",
      sampleParams: ["Budi", "April 2026", "5", "Rp 800.000"],
    },
    footer: "— Kos Baiti",
    buttons: [{ type: "URL", text: "Bayar Sekarang", url: `${SITE_URL}/payments` }],
  },

  // ==== Konfirmasi pembayaran berhasil ====
  payment_verified: {
    name: "payment_verified",
    language: "id",
    category: "UTILITY",
    header: { type: "IMAGE", sampleImageUrl: LOGO_URL },
    body: {
      text:
        "Halo {{1}},\n\n" +
        "Terima kasih, pembayaran Anda sudah kami verifikasi.\n" +
        "  Periode: {{2}}\n" +
        "  Nominal: {{3}}\n" +
        "  Tanggal verifikasi: {{4}}\n\n" +
        "Tagihan periode ini sudah lunas. Sampai jumpa di periode berikutnya!",
      sampleParams: ["Budi", "Mei 2026", "Rp 800.000", "03 Juni 2026 10:30"],
    },
    footer: "— Kos Baiti",
    buttons: [{ type: "URL", text: "Lihat Kuitansi", url: `${SITE_URL}/payments` }],
  },

  // ==== Komplain selesai ====
  complaint_resolved: {
    name: "complaint_resolved",
    language: "id",
    category: "UTILITY",
    header: { type: "IMAGE", sampleImageUrl: LOGO_URL },
    body: {
      text:
        "Halo {{1}},\n\n" +
        "Komplain Anda sudah selesai ditangani oleh pemilik kos.\n" +
        "Judul: {{2}}\n\n" +
        "Catatan pemilik: {{3}}\n\n" +
        "Bila masih ada kendala, silakan buka kembali komplain melalui aplikasi.",
      sampleParams: ["Budi", "AC kamar bocor", "Sudah diperbaiki, freon ditambah"],
    },
    footer: "— Kos Baiti",
    buttons: [{ type: "URL", text: "Lihat Komplain", url: `${SITE_URL}/complaints` }],
  },

  // ==== Reminder maintenance ke pemilik ====
  maintenance_reminder_owner: {
    name: "maintenance_reminder_owner",
    language: "id",
    category: "UTILITY",
    header: { type: "IMAGE", sampleImageUrl: LOGO_URL },
    body: {
      text:
        "Halo {{1}},\n\n" +
        "Pengingat jadwal perawatan {{2}}:\n" +
        "  {{3}}\n" +
        "  Lokasi: {{4}}\n" +
        "  Tanggal: {{5}}\n\n" +
        "Buka aplikasi untuk tandai sudah dikerjakan atau atur ulang jadwal.",
      sampleParams: ["Bapak Denny", "besok", "Service AC", "Kos Baiti Pusat - Kamar A1", "06 Juni 2026"],
    },
    footer: "— Kos Baiti",
    buttons: [{ type: "URL", text: "Buka Perawatan", url: `${SITE_URL}/maintenance` }],
  },

  // ==== Pemberitahuan perawatan ke penghuni ====
  maintenance_notify_tenant: {
    name: "maintenance_notify_tenant",
    language: "id",
    category: "UTILITY",
    header: { type: "IMAGE", sampleImageUrl: LOGO_URL },
    body: {
      text:
        "Halo {{1}},\n\n" +
        "Pemilik kos memberitahu akan ada perawatan kamar Anda.\n" +
        "Judul: {{2}}\n" +
        "Kamar: {{3}}\n" +
        "Tanggal rencana: {{4}}\n\n" +
        "Akses ke kamar mungkin terbatas selama perawatan berlangsung. Mohon kerja samanya.",
      sampleParams: ["Budi", "Cat ulang dinding", "Kos Baiti Pusat - Kamar A1", "10 Juni 2026"],
    },
    footer: "— Kos Baiti",
    buttons: [{ type: "URL", text: "Buka Aplikasi", url: SITE_URL }],
  },
};

/**
 * Helper terpusat: kirim template via Cloud API. Caller cuma kasih
 * nama template + body params dalam urutan {{1}}, {{2}}, dst.
 *
 * Header image otomatis pakai LOGO_URL untuk template yang punya
 * header IMAGE.
 */
export async function sendKosBaitiTemplate(
  phone: string,
  templateKey: keyof typeof TEMPLATES,
  bodyParams: string[]
): Promise<CloudResult> {
  const spec = TEMPLATES[templateKey];
  if (!spec) throw new Error(`Template ${templateKey} tidak ditemukan di registry.`);
  const headerImageUrl = spec.header?.type === "IMAGE" ? LOGO_URL : undefined;
  return sendTemplate(phone, spec.name, bodyParams, headerImageUrl, spec.language);
}

/**
 * Format JSON contoh untuk submit ke Meta Business Manager.
 * Bisa di-print via script untuk paste ke dashboard Meta saat create
 * template baru. Lihat docs/wa-cloud/templates.md.
 */
export function templateToJSON(key: keyof typeof TEMPLATES): string {
  const t = TEMPLATES[key];
  const components: unknown[] = [];
  if (t.header) {
    components.push({
      type: "HEADER",
      format: t.header.type,
      example: { header_handle: ["<<MEDIA_HANDLE>>"] },
    });
  }
  components.push({
    type: "BODY",
    text: t.body.text,
    example: { body_text: [t.body.sampleParams] },
  });
  if (t.footer) {
    components.push({ type: "FOOTER", text: t.footer });
  }
  if (t.buttons && t.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: t.buttons.map((b) => ({
        type: b.type,
        text: b.text,
        url: b.url,
      })),
    });
  }
  return JSON.stringify(
    {
      name: t.name,
      language: t.language,
      category: t.category,
      components,
    },
    null,
    2
  );
}

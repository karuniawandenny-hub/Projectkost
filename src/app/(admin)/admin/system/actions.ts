"use server";

import { requireUser } from "@/lib/session";
import {
  processReminders,
  buildReminderMessage,
  appendWaSignature,
  fonnteSend,
  type ReminderType,
} from "@/lib/reminders";
import { normalizePhone } from "@/lib/phone";
import { pingCloudApi } from "@/lib/wa-cloud";
import { sendKosBaitiTemplate, TEMPLATES } from "@/lib/wa-templates";

/**
 * Cek kesehatan setup WhatsApp Cloud API Meta.
 * Tidak kirim pesan — hanya validasi token + phone ID.
 */
export async function pingCloudApiAction(): Promise<TestActionState> {
  await requireUser().then((u) => {
    if (u.role !== "ADMIN") throw new Error("FORBIDDEN");
  });
  const result = await pingCloudApi();
  return {
    ok: result.ok,
    message: result.ok
      ? `✓ Cloud API OK — ${result.detail}`
      : `❌ Setup belum siap: ${result.detail}`,
    detail: JSON.stringify(result.raw, null, 2),
  };
}

/**
 * Kirim pesan test pakai 1 template Cloud API ke nomor admin.
 * Wajib template `tenant_assigned` sudah di-approve Meta.
 */
export async function testCloudTemplateAction(
  to: string
): Promise<TestActionState> {
  const me = await requireUser();
  if (me.role !== "ADMIN") throw new Error("FORBIDDEN");
  const normalized = normalizePhone(to);
  if (!normalized) return { ok: false, message: "Format nomor HP tidak valid." };
  if (!process.env.META_WA_PHONE_ID || !process.env.META_WA_TOKEN) {
    return {
      ok: false,
      message: "META_WA_PHONE_ID / META_WA_TOKEN belum diset di Railway. Lihat docs/wa-cloud/setup.md.",
    };
  }
  const target = normalized.replace(/^\+/, "");
  try {
    const result = await sendKosBaitiTemplate(target, "tenant_assigned", [
      "Test Admin",
      "A1",
      "Kos Baiti (test)",
      "01 Januari 2026",
      "Rp 1.000.000",
    ]);
    return {
      ok: true,
      message: `✓ Template terkirim ke ${normalized}. Cek WA dalam 5-30 detik. Harusnya muncul: image header (logo) + body + button. Message ID: ${result.messageId ?? "?"}`,
      detail: JSON.stringify(result.raw, null, 2),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error",
    };
  }
}

/**
 * Daftar template yang ter-registry di kode + helper untuk lihat
 * isinya. Berguna saat submit ke Meta Business Manager.
 */
export async function listCloudTemplatesAction(): Promise<TestActionState> {
  const me = await requireUser();
  if (me.role !== "ADMIN") throw new Error("FORBIDDEN");
  const names = Object.keys(TEMPLATES);
  return {
    ok: true,
    message: `${names.length} template di registry: ${names.join(", ")}. Submit semua di Meta Business Manager → WhatsApp Manager → Message Templates. Detail di docs/wa-cloud/templates.md.`,
    detail: names
      .map((k) => {
        const t = TEMPLATES[k];
        return `${k}\n${"-".repeat(k.length)}\n${t.body.text}\n\nSample: ${t.body.sampleParams.join(", ")}\n`;
      })
      .join("\n"),
  };
}

export type TestActionState = {
  ok: boolean;
  message: string;
  detail?: string;
};

async function requireAdmin() {
  const me = await requireUser();
  if (me.role !== "ADMIN") throw new Error("FORBIDDEN");
  return me;
}

/**
 * Cek status device Fonnte: connected/disconnected, quota, dll.
 * Penting untuk diagnose: kalau pesan "sent" tapi tidak sampai
 * penerima, biasanya device disconnect atau quota habis.
 */
export async function checkFonnteDeviceAction(): Promise<TestActionState> {
  await requireAdmin();
  const mode = (process.env.OTP_MODE ?? "dev").toLowerCase();
  if (mode !== "fonnte") {
    return {
      ok: false,
      message: `OTP_MODE='${mode}' (bukan fonnte). Cek device hanya untuk mode fonnte.`,
    };
  }
  const token = process.env.WA_GATEWAY_TOKEN;
  if (!token) return { ok: false, message: "WA_GATEWAY_TOKEN belum diset." };
  try {
    const res = await fetch("https://api.fonnte.com/device", {
      method: "POST",
      headers: { Authorization: token },
    });
    const txt = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, message: `Fonnte HTTP ${res.status}`, detail: txt };
    }
    let parsed: {
      status?: boolean;
      device_status?: string;
      device?: string;
      name?: string;
      quota?: number;
      messages?: number;
      autoread?: boolean;
      package?: string;
      expired?: string;
      reason?: string;
    } = {};
    try {
      parsed = JSON.parse(txt);
    } catch {
      return { ok: false, message: "Response bukan JSON.", detail: txt };
    }
    if (parsed.status === false) {
      return {
        ok: false,
        message: `Fonnte tolak: ${parsed.reason ?? "unknown"}`,
        detail: txt,
      };
    }
    const isConnected = parsed.device_status === "connect";
    const summary = [
      `Device: ${parsed.device ?? "?"} (${parsed.name ?? "no name"})`,
      `Status: ${parsed.device_status ?? "?"} ${isConnected ? "✓" : "✗"}`,
      `Paket: ${parsed.package ?? "free"}${parsed.expired ? ` (expired ${parsed.expired})` : ""}`,
      `Kuota tersisa: ${parsed.quota ?? "?"}`,
      `Pesan terkirim hari ini: ${parsed.messages ?? "?"}`,
    ].join("\n");
    return {
      ok: isConnected,
      message: isConnected
        ? "Device CONNECT dan siap kirim WA."
        : `Device ${parsed.device_status ?? "tidak connect"}. Reconnect di dashboard Fonnte.`,
      detail: summary + "\n\nRaw:\n" + txt,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}

/**
 * Validasi apakah nomor target punya WhatsApp aktif.
 * Tanpa ini, pesan ke nomor non-WA akan "sent" di Fonnte tapi
 * tidak pernah sampai.
 */
export async function validateWaNumberAction(
  to: string
): Promise<TestActionState> {
  await requireAdmin();
  const normalized = normalizePhone(to);
  if (!normalized) {
    return { ok: false, message: "Format nomor HP tidak valid." };
  }
  const mode = (process.env.OTP_MODE ?? "dev").toLowerCase();
  if (mode !== "fonnte") {
    return {
      ok: false,
      message: `OTP_MODE='${mode}'. Validasi hanya untuk mode fonnte.`,
    };
  }
  const token = process.env.WA_GATEWAY_TOKEN;
  if (!token) return { ok: false, message: "WA_GATEWAY_TOKEN belum diset." };
  try {
    const target = normalized.startsWith("+") ? normalized.slice(1) : normalized;
    const form = new URLSearchParams();
    form.set("target", target);
    form.set("countryCode", "62");
    const res = await fetch("https://api.fonnte.com/validate", {
      method: "POST",
      headers: { Authorization: token },
      body: form,
    });
    const txt = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, message: `Fonnte HTTP ${res.status}`, detail: txt };
    }
    let parsed: {
      status?: boolean;
      registered?: string[];
      not_registered?: string[];
      reason?: string;
    } = {};
    try {
      parsed = JSON.parse(txt);
    } catch {
      return { ok: false, message: "Response bukan JSON.", detail: txt };
    }
    if (parsed.status === false) {
      return {
        ok: false,
        message: `Fonnte tolak: ${parsed.reason ?? "unknown"}`,
        detail: txt,
      };
    }
    const isRegistered =
      parsed.registered && parsed.registered.length > 0 && !parsed.not_registered?.length;
    return {
      ok: !!isRegistered,
      message: isRegistered
        ? `${normalized} TERDAFTAR di WhatsApp.`
        : `${normalized} TIDAK terdaftar di WhatsApp atau privasi blok.`,
      detail: txt,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}

/**
 * Cek OG metadata yang dilihat crawler WA + sediakan link FB Sharing
 * Debugger supaya admin bisa force Meta refresh cache.
 *
 * Konteks: WhatsApp cache OG metadata per URL sangat agresif (bisa
 * berminggu-minggu). Kalau pernah kirim URL tanpa preview yang valid,
 * recipient akan terus melihat versi cached tanpa preview meski OG
 * tags sudah diperbaiki di layout.tsx.
 *
 * Aksi ini:
 *  1. Fetch homepage pakai User-Agent facebookexternalhit (sama dengan
 *     yang dipakai WA & FB crawler).
 *  2. Parse meta og:image / og:title / og:description.
 *  3. HEAD check ke og:image untuk memastikan publik & cukup besar.
 *  4. Generate URL FB Sharing Debugger — caller (client) akan auto-
 *     open di tab baru supaya admin tinggal klik "Scrape Again".
 */
export async function refreshWaLinkPreviewAction(): Promise<
  TestActionState & { debuggerUrl?: string }
> {
  await requireAdmin();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.kosbaiti.com";

  try {
    const res = await fetch(siteUrl, {
      headers: {
        // Identifikasi sebagai FB/WA crawler — beberapa server beda
        // response untuk bot vs browser (mis. SSR vs CSR).
        "User-Agent": "facebookexternalhit/1.1 (kosbaiti-admin-check)",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        ok: false,
        message: `${siteUrl} balas HTTP ${res.status}. URL tidak bisa diakses publik?`,
      };
    }
    const html = await res.text();

    const pick = (prop: string): string | undefined => {
      // Cocokkan kedua urutan atribut: property dulu atau content dulu.
      const a = new RegExp(
        `<meta\\s+property=["']${prop}["']\\s+content=["']([^"']+)["']`,
        "i"
      ).exec(html);
      if (a) return a[1];
      const b = new RegExp(
        `<meta\\s+content=["']([^"']+)["']\\s+property=["']${prop}["']`,
        "i"
      ).exec(html);
      return b?.[1];
    };

    const ogImage = pick("og:image");
    const ogTitle = pick("og:title");
    const ogDesc = pick("og:description");

    if (!ogImage) {
      return {
        ok: false,
        message:
          "Meta og:image tidak ditemukan di HTML. Cek src/app/layout.tsx atau pastikan deploy terbaru sudah live.",
      };
    }

    // HEAD check og:image — kalau 404 / bukan image / terlalu kecil,
    // WhatsApp akan tolak preview.
    let imgInfo = `OG image: ${ogImage}`;
    let imgOk = false;
    try {
      const absoluteImg = ogImage.startsWith("http")
        ? ogImage
        : new URL(ogImage, siteUrl).toString();
      const imgRes = await fetch(absoluteImg, { method: "HEAD" });
      const size = imgRes.headers.get("content-length");
      const type = imgRes.headers.get("content-type") ?? "?";
      const sizeKb = size ? `${Math.round(Number(size) / 1024)}KB` : "?";
      imgInfo = `OG image: ${absoluteImg}\n  HTTP ${imgRes.status} • ${type} • ${sizeKb}`;
      imgOk = imgRes.ok && type.startsWith("image/");
    } catch (e) {
      imgInfo += `\n  (HEAD check gagal: ${e instanceof Error ? e.message : "?"})`;
    }

    const debuggerUrl = `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(siteUrl)}`;

    return {
      ok: imgOk,
      message: imgOk
        ? `OG metadata OK. Tab FB Debugger akan terbuka — klik "Scrape Again" 2x di sana untuk paksa Meta + WA refresh cache.`
        : `OG image tidak accessible / bukan image valid. Cek deploy & path file.`,
      detail: [
        `Site URL : ${siteUrl}`,
        `og:title : ${ogTitle ?? "(missing)"}`,
        `og:desc  : ${ogDesc ?? "(missing)"}`,
        imgInfo,
        ``,
        `Setelah "Scrape Again" di FB Debugger, test kirim URL ke nomor`,
        `BARU (yang belum pernah terima URL ini) untuk verify preview muncul.`,
        `Trik bust cache per-nomor: tambah query string unik:`,
        `${siteUrl}?v=${Date.now()}`,
      ].join("\n"),
      debuggerUrl,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error",
    };
  }
}

export async function testReminderAction(): Promise<TestActionState> {
  await requireAdmin();
  try {
    const result = await processReminders();
    return {
      ok: true,
      message: `Selesai. ${result.sent.length} reminder terkirim, ${result.skipped} dilewati, ${result.errors.length} error.`,
      detail: JSON.stringify(result, null, 2),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error tidak diketahui",
    };
  }
}

export async function testEmailAction(to: string): Promise<TestActionState> {
  await requireAdmin();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, message: "Format email tidak valid." };
  }
  const mode = (process.env.EMAIL_MODE ?? "dev").toLowerCase();
  if (mode === "dev") {
    // eslint-disable-next-line no-console
    console.log(`[test-email][dev] -> ${to}: ping`);
    return {
      ok: true,
      message:
        "Dev mode aktif — email tidak benar-benar dikirim. Cek terminal server untuk log.",
    };
  }
  if (mode !== "resend") {
    return { ok: false, message: `EMAIL_MODE='${mode}' tidak didukung.` };
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, message: "RESEND_API_KEY atau EMAIL_FROM belum diset." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject: "Test integrasi Kos Baiti",
        text:
          "Halo!\n\nIni email test dari Kos Baiti. Jika Anda menerima ini, integrasi Resend Anda berfungsi.\n\nTerima kasih.",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, message: `Resend HTTP ${res.status}`, detail: body };
    }
    return { ok: true, message: `Email test dikirim ke ${to} via Resend.` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Gagal hubungi Resend",
    };
  }
}

/**
 * Preview reminder per tipe (H7/H3/H1/OVERDUE) ke nomor HP target.
 *
 * Pakai data dummy (Test User / Kos Baiti / Kamar A1 / Rp 1.000.000 /
 * dueDate dihitung dari hari ini sesuai tipe). Tidak buat ReminderLog,
 * tidak ganggu tagihan real. Murni untuk verifikasi format pesan.
 */
export async function previewReminderAction(
  to: string,
  type: ReminderType
): Promise<TestActionState> {
  await requireAdmin();
  const normalized = normalizePhone(to);
  if (!normalized) {
    return { ok: false, message: "Format nomor HP tidak valid." };
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const offsetDays: Record<ReminderType, number> = {
    H7: 7,
    H3: 3,
    H1: 1,
    OVERDUE: -1,
  };
  const dueDate = new Date(
    todayStart.getTime() + offsetDays[type] * 86_400_000
  );

  const { body } = buildReminderMessage({
    type,
    tenantName: "Penghuni Test",
    kosName: "Kos Baiti (preview)",
    roomName: "A1",
    periodMonth: today.getMonth() + 1,
    periodYear: today.getFullYear(),
    amount: 1_000_000,
    dueDate,
    daysOverdue: type === "OVERDUE" ? 1 : undefined,
  });

  const previewBody = appendWaSignature(`[PREVIEW ${type}]\n\n${body}`);

  const mode = (process.env.OTP_MODE ?? "dev").toLowerCase();
  if (mode === "dev") {
    // eslint-disable-next-line no-console
    console.log(`[preview-reminder][dev] -> ${normalized} (${type}): ${previewBody.slice(0, 80)}…`);
    return {
      ok: true,
      message: "Dev mode — pesan tidak benar-benar dikirim. Cek log server.",
      detail: previewBody,
    };
  }
  if (mode === "fonnte") {
    const token = process.env.WA_GATEWAY_TOKEN;
    if (!token) return { ok: false, message: "WA_GATEWAY_TOKEN belum diset." };
    try {
      await fonnteSend(token, normalized, previewBody);
      return {
        ok: true,
        message: `Preview ${type} diantrikan ke Fonnte untuk ${normalized}. Tunggu beberapa detik & cek WA penerima.`,
        detail: previewBody,
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Error",
        detail: e instanceof Error ? e.message : undefined,
      };
    }
  }
  return { ok: false, message: `OTP_MODE='${mode}' belum didukung untuk preview.` };
}

export async function testWaAction(to: string): Promise<TestActionState> {
  await requireAdmin();
  const normalized = normalizePhone(to);
  if (!normalized) {
    return { ok: false, message: "Format nomor HP tidak valid." };
  }
  const mode = (process.env.OTP_MODE ?? "dev").toLowerCase();
  const message = appendWaSignature(
    "Halo! Ini pesan test dari Kos Baiti. Jika Anda menerima ini, integrasi gateway WA Anda berfungsi."
  );

  if (mode === "dev") {
    // eslint-disable-next-line no-console
    console.log(`[test-wa][dev] -> ${normalized}: ${message}`);
    return {
      ok: true,
      message:
        "Dev mode aktif — WA tidak benar-benar dikirim. Cek terminal server.",
    };
  }
  if (mode === "fonnte") {
    const token = process.env.WA_GATEWAY_TOKEN;
    if (!token) {
      return { ok: false, message: "WA_GATEWAY_TOKEN belum diset." };
    }
    const target = normalized.startsWith("+") ? normalized.slice(1) : normalized;
    const diagnostics: string[] = [];

    // ===== Pre-flight 1: Cek device status =====
    try {
      const devRes = await fetch("https://api.fonnte.com/device", {
        method: "POST",
        headers: { Authorization: token },
      });
      const devTxt = await devRes.text().catch(() => "");
      let devParsed: {
        device_status?: string;
        quota?: number;
        package?: string;
      } = {};
      try {
        devParsed = JSON.parse(devTxt);
      } catch {
        // ignore
      }
      diagnostics.push(
        `[Device] status=${devParsed.device_status ?? "?"}, kuota=${devParsed.quota ?? "?"}, paket=${devParsed.package ?? "free"}`
      );
      if (devParsed.device_status && devParsed.device_status !== "connect") {
        return {
          ok: false,
          message: `Device WA ${devParsed.device_status}. Reconnect di dashboard Fonnte sebelum kirim ulang.`,
          detail: diagnostics.join("\n") + "\n\nRaw device:\n" + devTxt,
        };
      }
      if (typeof devParsed.quota === "number" && devParsed.quota <= 0) {
        return {
          ok: false,
          message: "Kuota Fonnte habis. Top-up di dashboard sebelum kirim ulang.",
          detail: diagnostics.join("\n"),
        };
      }
    } catch (e) {
      diagnostics.push(
        `[Device] check skipped: ${e instanceof Error ? e.message : "error"}`
      );
    }

    // ===== Pre-flight 2: Validasi nomor target di WA =====
    try {
      const valForm = new URLSearchParams();
      valForm.set("target", target);
      valForm.set("countryCode", "62");
      const valRes = await fetch("https://api.fonnte.com/validate", {
        method: "POST",
        headers: { Authorization: token },
        body: valForm,
      });
      const valTxt = await valRes.text().catch(() => "");
      let valParsed: {
        registered?: string[];
        not_registered?: string[];
      } = {};
      try {
        valParsed = JSON.parse(valTxt);
      } catch {
        // ignore
      }
      const isRegistered =
        valParsed.registered &&
        valParsed.registered.length > 0 &&
        !valParsed.not_registered?.length;
      diagnostics.push(
        `[Validasi] ${normalized} ${isRegistered ? "TERDAFTAR di WA ✓" : "TIDAK terdaftar di WA ✗"}`
      );
      if (!isRegistered) {
        return {
          ok: false,
          message: `Nomor ${normalized} tidak terdaftar di WhatsApp (atau privasi blok). Pesan tidak akan sampai meski Fonnte report "sent".`,
          detail: diagnostics.join("\n") + "\n\nRaw validate:\n" + valTxt,
        };
      }
    } catch (e) {
      diagnostics.push(
        `[Validasi] check skipped: ${e instanceof Error ? e.message : "error"}`
      );
    }

    // ===== Send (via helper terpusat — pakai multipart image+caption) =====
    try {
      await fonnteSend(token, normalized, message);
      diagnostics.push(`[Kirim] OK (mode image+caption kalau WA_INLINE_PREVIEW aktif)`);
      return {
        ok: true,
        message: `✓ Pre-flight pass + dikirim ke ${normalized}. Cek WA penerima 5-30 detik. Kalau preview logo tidak muncul, cek log Railway untuk pesan [wa][fonnte-media] vs [wa][fonnte-fallback-text].`,
        detail: diagnostics.join("\n"),
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Error",
        detail: diagnostics.join("\n"),
      };
    }
  }
  // Generic gateway
  const url = process.env.WA_GATEWAY_URL;
  const token = process.env.WA_GATEWAY_TOKEN;
  if (!url || !token) {
    return { ok: false, message: "WA gateway URL/TOKEN belum diset." };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phone: normalized, message }),
    });
    if (!res.ok) {
      return { ok: false, message: `Gateway HTTP ${res.status}` };
    }
    return { ok: true, message: `WA test dikirim ke ${normalized}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}

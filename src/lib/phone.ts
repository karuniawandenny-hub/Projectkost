// Normalisasi nomor HP Indonesia ke format +62xxxxxxxxxx
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let s = raw.replace(/[\s\-().]/g, "");
  if (s.startsWith("+62")) {
    s = "+62" + s.slice(3).replace(/^0+/, "");
  } else if (s.startsWith("62")) {
    s = "+62" + s.slice(2).replace(/^0+/, "");
  } else if (s.startsWith("0")) {
    s = "+62" + s.replace(/^0+/, "");
  } else if (/^[1-9]/.test(s)) {
    s = "+62" + s;
  } else {
    return null;
  }
  // 9-13 digit setelah +62
  if (!/^\+62[1-9][0-9]{7,12}$/.test(s)) return null;
  return s;
}

/**
 * Konversi nomor ke format Meta WhatsApp Cloud API: "628xxx" — tanpa
 * "+" di depan. Meta webhook `from` selalu format ini.
 *
 * Return null kalau nomor tidak valid / kosong.
 */
export function toWhatsAppFormat(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = normalizePhone(raw);
  if (!normalized) return null;
  return normalized.replace(/^\+/, "");
}

export function maskPhone(phone: string): string {
  if (!phone) return "";
  const tail = phone.slice(-3);
  return phone.slice(0, 4) + "*".repeat(Math.max(0, phone.length - 7)) + tail;
}

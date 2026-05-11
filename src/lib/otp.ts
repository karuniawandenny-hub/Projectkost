import bcrypt from "bcryptjs";

export function generateOtp(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += Math.floor(Math.random() * 10);
  return s;
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

export async function verifyOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

export function isDevOtpMode(): boolean {
  return (process.env.OTP_MODE ?? "dev") === "dev";
}

export type SendOtpResult = {
  delivered: boolean;
  /** Hanya terisi di mode dev sehingga UI bisa menampilkannya. */
  devOtp?: string;
  error?: string;
};

/**
 * Mengirim OTP via gateway yang dikonfigurasi.
 *
 * Mode (env OTP_MODE):
 *  - "dev"        : tidak mengirim apa-apa, OTP dikembalikan via field `devOtp`
 *                   sehingga halaman verifikasi bisa menampilkannya.
 *  - "fonnte"     : pakai Fonnte (https://fonnte.com) — gateway WhatsApp ID populer.
 *                   Butuh env: WA_GATEWAY_TOKEN (Device Token Fonnte).
 *  - "generic"    : POST JSON ke WA_GATEWAY_URL dengan Bearer WA_GATEWAY_TOKEN.
 *                   Body: { phone, message }.
 */
export async function sendOtp(
  phone: string,
  otp: string
): Promise<SendOtpResult> {
  const mode = process.env.OTP_MODE ?? "dev";
  const message = `Kode OTP Kelola Kos Anda: *${otp}*. Berlaku 5 menit. Jangan bagikan ke siapa pun.`;

  if (mode === "dev") {
    // eslint-disable-next-line no-console
    console.log(`[OTP][dev] ${phone} -> ${otp}`);
    return { delivered: true, devOtp: otp };
  }

  if (mode === "fonnte") {
    const token = process.env.WA_GATEWAY_TOKEN;
    if (!token) {
      return {
        delivered: false,
        error: "WA_GATEWAY_TOKEN (Fonnte) belum diset.",
      };
    }
    try {
      // Fonnte expects local format (08…) atau dengan kode negara tanpa "+".
      const target = phone.startsWith("+") ? phone.slice(1) : phone;
      const form = new URLSearchParams();
      form.set("target", target);
      form.set("message", message);
      form.set("countryCode", "62");
      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: token },
        body: form,
      });
      const json: { status?: boolean; reason?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || json.status === false) {
        // eslint-disable-next-line no-console
        console.error("Fonnte gagal kirim:", res.status, json);
        return {
          delivered: false,
          error: json.reason ?? `Fonnte HTTP ${res.status}`,
        };
      }
      return { delivered: true };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error kirim OTP via Fonnte:", err);
      return { delivered: false, error: "Gagal hubungi Fonnte." };
    }
  }

  // Generic gateway: POST JSON.
  const url = process.env.WA_GATEWAY_URL;
  const token = process.env.WA_GATEWAY_TOKEN;
  if (!url || !token) {
    return {
      delivered: false,
      error: "WA_GATEWAY_URL/WA_GATEWAY_TOKEN belum dikonfigurasi.",
    };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phone, message }),
    });
    if (!res.ok) {
      return { delivered: false, error: `Gateway HTTP ${res.status}` };
    }
    return { delivered: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error kirim OTP via gateway:", err);
    return { delivered: false, error: "Gagal hubungi gateway." };
  }
}

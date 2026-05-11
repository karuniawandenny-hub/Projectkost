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

export async function sendOtp(phone: string, otp: string): Promise<void> {
  const mode = process.env.OTP_MODE ?? "dev";
  if (mode === "dev") {
    // Di mode dev, cetak OTP ke server console agar mudah testing.
    // eslint-disable-next-line no-console
    console.log(`[OTP][dev] ${phone} -> ${otp}`);
    return;
  }
  // TODO: integrasi gateway WA/SMS produksi.
  const url = process.env.WA_GATEWAY_URL;
  const token = process.env.WA_GATEWAY_TOKEN;
  if (!url || !token) {
    // eslint-disable-next-line no-console
    console.warn("WA_GATEWAY_URL/TOKEN belum dikonfigurasi; OTP tidak terkirim.");
    return;
  }
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      phone,
      message: `Kode OTP Kos Anda: ${otp}. Berlaku 5 menit. Jangan bagikan ke siapa pun.`,
    }),
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Gagal kirim OTP:", err);
  });
}

import { cookies } from "next/headers";

const COOKIE = "kos_dev_otp_hint";

/**
 * Disimpan SANGAT singkat (5 menit), HANYA dipakai untuk menampilkan OTP
 * di halaman /verify saat OTP_MODE=dev. Tidak akan pernah diset di produksi.
 */
export function setDevOtpHint(phone: string, otp: string) {
  if ((process.env.OTP_MODE ?? "dev") !== "dev") return;
  cookies().set(COOKIE, `${phone}:${otp}`, {
    httpOnly: false, // perlu dibaca dari komponen client untuk ditampilkan
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
}

export function readDevOtpHint(phone: string): string | null {
  if ((process.env.OTP_MODE ?? "dev") !== "dev") return null;
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  const [p, otp] = raw.split(":");
  if (p !== phone || !otp) return null;
  return otp;
}

export function clearDevOtpHint() {
  cookies().delete(COOKIE);
}

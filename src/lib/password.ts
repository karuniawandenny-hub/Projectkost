import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Normalisasi email: trim + lowercase. Tidak validasi format ketat —
 * itu dilakukan via HTML `type="email"` + Zod-light check di server action.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(s: string): boolean {
  // Pola sederhana yang cukup untuk validasi server-side.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

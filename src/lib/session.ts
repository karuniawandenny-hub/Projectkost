import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import type { Role } from "./enums";

const COOKIE_NAME = "kos_session";
const SESSION_DAYS = 30;

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET environment variable tidak diset atau terlalu pendek.");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  role: Role;
};

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  cookies().delete(COOKIE_NAME);
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.userId === "string" &&
      typeof payload.role === "string" &&
      ["OWNER", "TENANT", "ADMIN", "MANAGER"].includes(payload.role)
    ) {
      return { userId: payload.userId, role: payload.role as Role };
    }
  } catch {
    return null;
  }
  return null;
}

export async function getCurrentUser() {
  const session = await readSession();
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.userId } });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

/**
 * Type minimal untuk helper role/scope — kompatibel dengan hasil
 * getCurrentUser() (User dari Prisma) dan payload session ringan.
 */
type UserWithRoleAndOwner = {
  id: string;
  role: string;
  managedByOwnerId?: string | null;
};

/**
 * Apakah user boleh kelola kos? OWNER punya kos-nya sendiri; MANAGER
 * (pengelola tim) diundang OWNER, punya akses setara ke seluruh kos
 * milik OWNER-nya. Dua-duanya boleh manage.
 */
export function canManageKos(user: UserWithRoleAndOwner): boolean {
  return user.role === "OWNER" || user.role === "MANAGER";
}

/**
 * Owner ID efektif untuk scoping query. OWNER → id sendiri;
 * MANAGER → id owner yang mengundangnya. Semua query yang biasanya
 * `where: { ownerId: user.id }` seharusnya pakai fungsi ini supaya
 * MANAGER bisa akses data yang sama seperti OWNER-nya.
 *
 * Kalau MANAGER tidak punya managedByOwnerId (impossible dalam kondisi
 * normal — schema mengharuskan), fallback ke user.id sendiri (yang
 * akan hasilkan query kosong — safe default, bukan cross-tenant leak).
 */
export function getEffectiveOwnerId(user: UserWithRoleAndOwner): string {
  if (user.role === "MANAGER" && user.managedByOwnerId) {
    return user.managedByOwnerId;
  }
  return user.id;
}

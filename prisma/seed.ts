/**
 * Seed script — buat akun admin awal jika belum ada.
 *
 * Jalankan:  npm run db:seed
 * Idempoten: aman dijalankan berulang.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "d111284k";
const ADMIN_EMAIL = "admin@kelolakos.local";

async function main() {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }] },
  });

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  if (existing) {
    // Pastikan akun yang sudah ada tetap punya hak admin & aktif.
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: "ADMIN",
        status: "ACTIVE",
        username: ADMIN_USERNAME,
        // tidak menimpa password yang sudah ada — admin bisa ganti sendiri
      },
    });
    console.log(`[seed] Admin sudah ada (username=${ADMIN_USERNAME}). Status disinkronkan.`);
  } else {
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        username: ADMIN_USERNAME,
        passwordHash,
        name: "Administrator",
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    console.log(`[seed] Admin dibuat. Username: ${ADMIN_USERNAME}  Password: ${ADMIN_PASSWORD}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

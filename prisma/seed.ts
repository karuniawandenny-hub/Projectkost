/**
 * Seed script — buat akun admin awal jika belum ada.
 *
 * Jalankan:  npm run db:seed
 * Idempoten: aman dijalankan berulang.
 *
 * Reset password admin (kalau lupa):
 *   Set env ADMIN_RESET_PASSWORD ke password baru di Railway Variables,
 *   restart service. Seed akan TIMPA password admin existing. Setelah
 *   konfirmasi bisa login, HAPUS env tersebut supaya tidak kena timpa
 *   lagi di restart berikutnya.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "kosbaiti-admin";
const ADMIN_EMAIL = "admin@kosbaiti.local";

async function main() {
  const resetPassword = process.env.ADMIN_RESET_PASSWORD?.trim();

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }] },
  });

  if (existing) {
    if (resetPassword) {
      // MODE RESET: env ADMIN_RESET_PASSWORD di-set -> TIMPA password.
      if (resetPassword.length < 8) {
        console.error(
          "[seed] ADMIN_RESET_PASSWORD harus minimal 8 karakter. Reset dibatalkan."
        );
        return;
      }
      const newHash = await bcrypt.hash(resetPassword, 10);
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: newHash,
          role: "ADMIN",
          status: "ACTIVE",
          username: ADMIN_USERNAME,
        },
      });
      console.log("=================================================");
      console.log("[seed] ⚠️  ADMIN PASSWORD DI-RESET via env.");
      console.log(`[seed] Username: ${ADMIN_USERNAME}`);
      console.log(`[seed] Password baru: ${resetPassword}`);
      console.log(
        "[seed] PENTING: Hapus env ADMIN_RESET_PASSWORD di Railway"
      );
      console.log(
        "[seed]          sekarang juga supaya tidak kena timpa lagi"
      );
      console.log("[seed]          di restart berikutnya.");
      console.log("=================================================");
    } else {
      // Normal: sinkron role/status saja, JANGAN timpa password.
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: "ADMIN",
          status: "ACTIVE",
          username: ADMIN_USERNAME,
        },
      });
      console.log(
        `[seed] Admin sudah ada (username=${ADMIN_USERNAME}). Status disinkronkan.`
      );
    }
  } else {
    const password = resetPassword || ADMIN_PASSWORD;
    const passwordHash = await bcrypt.hash(password, 10);
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
    console.log(
      `[seed] Admin dibuat. Username: ${ADMIN_USERNAME}  Password: ${password}`
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

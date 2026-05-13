import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/email";
import { ResetClient } from "./ResetClient";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = (searchParams.token ?? "").trim();

  let status: "valid" | "missing" | "invalid" | "used" | "expired" = "valid";
  if (!token) status = "missing";
  else {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record) status = "invalid";
    else if (record.usedAt) status = "used";
    else if (record.expiresAt.getTime() < Date.now()) status = "expired";
  }

  if (status !== "valid") {
    const msg =
      status === "missing"
        ? "Token tidak ditemukan di URL."
        : status === "invalid"
          ? "Link reset tidak valid."
          : status === "used"
            ? "Link reset sudah digunakan."
            : "Link reset kedaluwarsa.";
    return (
      <div className="card">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {msg}
        </div>
        <Link
          href="/forgot-password"
          className="btn-primary mt-4 inline-flex"
        >
          Minta link reset baru
        </Link>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="card">Memuat…</div>}>
      <ResetClient token={token} />
    </Suspense>
  );
}

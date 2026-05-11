import { Suspense } from "react";
import { isDevOtpMode } from "@/lib/otp";
import { VerifyClient } from "./VerifyClient";
import { readDevOtpHint } from "@/lib/devOtpCookie";

export default function VerifyPage({
  searchParams,
}: {
  searchParams: { phone?: string; intent?: string };
}) {
  const phone = searchParams.phone ?? "";
  const dev = isDevOtpMode();
  const initialDevOtp = dev && phone ? readDevOtpHint(phone) : null;

  return (
    <Suspense fallback={<div className="card">Memuat…</div>}>
      <VerifyClient
        phone={phone}
        devMode={dev}
        initialDevOtp={initialDevOtp ?? undefined}
      />
    </Suspense>
  );
}

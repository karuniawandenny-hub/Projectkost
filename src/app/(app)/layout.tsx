import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import Shell from "@/components/Shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.status === "SUSPENDED") redirect("/login");
  if (user.status === "PENDING") {
    // Tenant PENDING yang belum onboarding diarahkan ke onboarding.
    // Yang sudah onboarding diarahkan ke halaman menunggu persetujuan.
    if (user.role === "TENANT" && !user.onboardedAt) {
      redirect("/onboarding");
    }
    redirect("/register/pending");
  }
  return <Shell user={user}>{children}</Shell>;
}

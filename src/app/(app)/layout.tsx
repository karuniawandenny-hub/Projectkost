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
  if (user.status !== "ACTIVE") {
    // Akun PENDING/SUSPENDED tidak boleh masuk halaman aplikasi.
    redirect("/login");
  }
  return <Shell user={user}>{children}</Shell>;
}

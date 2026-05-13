import { redirect } from "next/navigation";

// Halaman pengajuan dipindahkan ke /tenants (digabung).
// Redirect ini menjaga link lama (notifikasi, bookmark) tetap berfungsi.
export default function PendingTenantsLegacyRedirect() {
  redirect("/tenants");
}

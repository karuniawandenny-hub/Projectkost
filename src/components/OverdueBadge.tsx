import {
  computeOverdue,
  overdueBadgeClass,
  overdueLabel,
  type OverdueStatus,
} from "@/lib/overdue";

/**
 * Badge "Terlambat X hari" — otomatis tersembunyi kalau tagihan tidak
 * telat (status bukan DUE/REJECTED, atau due date belum lewat).
 *
 * Bisa dipakai di server component (owner list, tenant list, dashboard)
 * & client component tanpa modifikasi — pure props-in JSX-out.
 */
export function OverdueBadge({
  dueDate,
  status,
  size = "sm",
}: {
  dueDate: Date | string | null;
  status: OverdueStatus;
  size?: "xs" | "sm";
}) {
  if (!dueDate) return null;
  const info = computeOverdue(dueDate, status);
  if (!info) return null;

  const sizeClass =
    size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${overdueBadgeClass(
        info.level
      )} ${sizeClass}`}
      title={`Jatuh tempo sudah lewat ${info.daysOverdue} hari`}
    >
      ⚠ {overdueLabel(info)}
    </span>
  );
}

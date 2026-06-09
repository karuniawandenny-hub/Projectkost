import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  listExpenses,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_CATEGORY_SHORT,
  isExpenseCategory,
  type ExpenseCategory,
} from "@/lib/expenses";
import { rupiah } from "@/lib/reports";
import { ExpenseForm } from "./ExpenseForm";
import { DeleteExpenseButton } from "./DeleteExpenseButton";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

type SP = Record<string, string | undefined>;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER") redirect("/dashboard");

  const kosList = await prisma.kos.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Default rentang: bulan berjalan.
  const now = new Date();
  const monthParam = parseInt(searchParams.month ?? "", 10);
  const yearParam = parseInt(searchParams.year ?? "", 10);
  const month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12
    ? monthParam
    : now.getMonth() + 1;
  const year = Number.isInteger(yearParam) && yearParam >= 2020 && yearParam <= 2100
    ? yearParam
    : now.getFullYear();

  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999);

  const kosFilter = searchParams.kosId && searchParams.kosId !== "all"
    ? searchParams.kosId
    : undefined;
  const categoryFilter = searchParams.category && isExpenseCategory(searchParams.category)
    ? (searchParams.category as ExpenseCategory)
    : undefined;

  const rows = await listExpenses(user.id, {
    kosId: kosFilter,
    category: categoryFilter,
    from,
    to,
  });

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCategory = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + r.amount;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pengeluaran</h1>
        <p className="text-slate-600">
          Catat biaya operasional kos. Akan otomatis masuk laporan laba-rugi
          di halaman <a href="/reports" className="text-brand-700 hover:underline">Laporan</a>.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <form
            method="get"
            className="card flex flex-wrap items-end gap-3 text-sm"
          >
            <div>
              <label className="block text-xs text-slate-600">Bulan</label>
              <select name="month" defaultValue={month} className="input mt-1">
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600">Tahun</label>
              <select name="year" defaultValue={year} className="input mt-1">
                {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map(
                  (y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600">Kos</label>
              <select
                name="kosId"
                defaultValue={searchParams.kosId ?? "all"}
                className="input mt-1"
              >
                <option value="all">Semua kos</option>
                {kosList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600">Kategori</label>
              <select
                name="category"
                defaultValue={searchParams.category ?? ""}
                className="input mt-1"
              >
                <option value="">Semua</option>
                {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map(
                  (c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_SHORT[c]}
                    </option>
                  )
                )}
              </select>
            </div>
            <button type="submit" className="btn-primary">
              Terapkan
            </button>
          </form>

          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card">
              <div className="text-xs text-slate-500">Total pengeluaran</div>
              <div className="mt-1 text-2xl font-semibold text-red-700">
                {rupiah(total)}
              </div>
              <div className="text-xs text-slate-500">
                {rows.length} transaksi · {MONTHS[month - 1]} {year}
              </div>
            </div>
            {(["UTILITY", "STAFF", "MAINTENANCE"] as ExpenseCategory[]).map(
              (c) => (
                <div key={c} className="card">
                  <div className="text-xs text-slate-500">
                    {EXPENSE_CATEGORY_SHORT[c]}
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {rupiah(byCategory[c] ?? 0)}
                  </div>
                </div>
              )
            )}
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600">
                  <th className="px-3 py-2">Tanggal</th>
                  <th className="px-3 py-2">Kos</th>
                  <th className="px-3 py-2">Kategori</th>
                  <th className="px-3 py-2">Catatan</th>
                  <th className="px-3 py-2 text-right">Nominal</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      Belum ada pengeluaran tercatat untuk filter ini.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.date.toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-2">{r.kosName}</td>
                    <td className="px-3 py-2">
                      <span className="badge-slate">
                        {EXPENSE_CATEGORY_SHORT[r.category]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 max-w-xs">
                      {r.note ? (
                        <span className="line-clamp-2">{r.note}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {rupiah(r.amount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DeleteExpenseButton id={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="card sticky top-4">
            <h2 className="font-semibold">Catat pengeluaran baru</h2>
            <p className="mb-3 text-xs text-slate-500">
              Tanggal default hari ini. Tinggal pilih kategori, isi nominal,
              simpan.
            </p>
            <ExpenseForm kosList={kosList} defaultKosId={kosFilter} />
          </div>
        </div>
      </div>
    </div>
  );
}

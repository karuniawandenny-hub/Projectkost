import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { BackButton } from "@/components/BackButton";

/**
 * Viewer lampiran in-app. Membungkus file upload (gambar / PDF) dengan
 * header app + tombol Kembali, supaya membuka lampiran tidak melempar
 * user ke viewer native browser tanpa cara balik.
 *
 * Hanya melayani path internal `/uploads/...` (sama-origin) dan menolak
 * traversal `..` — guard yang sama dengan helper upload.
 */
export default async function ViewPage({
  searchParams,
}: {
  searchParams: { src?: string; title?: string };
}) {
  // Lampiran bisa berisi PII (foto KTP/selfie) — wajib login. File
  // upload mentah memang public, tapi viewer minimal tidak boleh
  // dibuka anonim agar tidak jadi galeri PII yang mudah di-share.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const src = searchParams.src ?? "";
  if (!src.startsWith("/uploads/") || src.includes("..")) {
    notFound();
  }
  const title = searchParams.title || "Lampiran";
  const isPdf = src.split("?")[0].toLowerCase().endsWith(".pdf");

  return (
    <main className="flex min-h-screen flex-col bg-slate-900">
      <header className="flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-4 py-3">
        <BackButton
          label="← Kembali"
          className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600"
        />
        <div className="min-w-0 flex-1 truncate text-center text-sm font-medium text-slate-200">
          {title}
        </div>
        <a
          href={src}
          download
          className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600"
        >
          ⬇ Unduh
        </a>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        {isPdf ? (
          <iframe
            src={src}
            title={title}
            className="h-full min-h-[80vh] w-full max-w-4xl rounded bg-white"
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={title}
            className="max-h-full max-w-full rounded object-contain"
          />
        )}
      </div>
    </main>
  );
}

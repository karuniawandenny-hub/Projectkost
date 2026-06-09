import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Gallery } from "./Gallery";

/**
 * Viewer lampiran in-app. Membungkus file upload (gambar / PDF) dengan
 * header app + tombol Kembali + navigasi prev/next, supaya membuka
 * lampiran tidak melempar user ke viewer native browser tanpa cara
 * balik atau berpindah antar foto.
 *
 * Query:
 *  - src : path file. Boleh berulang (src=a&src=b) untuk mode galeri.
 *  - i   : index awal (0-based) saat dibuka. Default 0.
 *  - title : judul header.
 *
 * Hanya melayani path internal `/uploads/...` (sama-origin) dan menolak
 * traversal `..` — guard yang sama dengan helper upload.
 */
export default async function ViewPage({
  searchParams,
}: {
  searchParams: { src?: string | string[]; i?: string; title?: string };
}) {
  // Lampiran bisa berisi PII (foto KTP/selfie) — wajib login. File
  // upload mentah memang public, tapi viewer minimal tidak boleh
  // dibuka anonim agar tidak jadi galeri PII yang mudah di-share.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const raw = searchParams.src;
  const srcs = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(
    (s) => s.startsWith("/uploads/") && !s.includes("..")
  );
  if (srcs.length === 0) notFound();

  const title = searchParams.title || "Lampiran";
  const parsedIndex = Number.parseInt(searchParams.i ?? "0", 10);
  const initialIndex = Number.isFinite(parsedIndex) ? parsedIndex : 0;

  return <Gallery srcs={srcs} title={title} initialIndex={initialIndex} />;
}

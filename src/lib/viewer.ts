/**
 * Bangun URL ke halaman viewer in-app (/view) untuk membuka lampiran
 * (foto KTP, bukti bayar, foto komplain/perawatan) di dalam frame app
 * — lengkap dengan tombol Kembali — alih-alih link langsung ke file
 * yang membuka viewer native browser tanpa navigasi balik.
 */
export function viewerUrl(src: string, title?: string): string {
  const params = new URLSearchParams({ src });
  if (title) params.set("title", title);
  return `/view?${params.toString()}`;
}

/**
 * Versi galeri: buka 1 foto dari sekumpulan foto (mis. foto komplain
 * atau perawatan) sambil membawa seluruh daftar + index awal supaya
 * viewer bisa menampilkan navigasi prev/next.
 *
 * Daftar dikirim sebagai query `src` berulang (src=a&src=b&...) supaya
 * tidak perlu pusing dengan delimiter — path upload sudah disanitasi.
 */
export function galleryViewerUrl(
  srcs: string[],
  index: number,
  title?: string
): string {
  const params = new URLSearchParams();
  for (const s of srcs) params.append("src", s);
  params.set("i", String(index));
  if (title) params.set("title", title);
  return `/view?${params.toString()}`;
}

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

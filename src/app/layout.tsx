import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baiti Kos — Forum Komunikasi Pemilik & Penghuni Kos",
  description:
    "Aplikasi untuk pemilik & penghuni kos: data penghuni, pembayaran, dan komplain.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

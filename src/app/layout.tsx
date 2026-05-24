import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kos Baiti — Forum Komunikasi Pemilik & Penghuni Kos",
  description:
    "Satu aplikasi, semua terkoneksi — data penghuni, pembayaran, dan komplain untuk pemilik & penghuni kos.",
  icons: {
    icon: "/kos-baiti-logo.png",
    shortcut: "/kos-baiti-logo.png",
    apple: "/kos-baiti-logo.png",
  },
  openGraph: {
    type: "website",
    siteName: "Kos Baiti",
    title: "Kos Baiti — Satu aplikasi, semua terkoneksi",
    description:
      "Forum komunikasi pemilik & penghuni kos: data penghuni, pembayaran, dan komplain — semua tercatat rapi.",
    images: [
      {
        url: "/kos-baiti-logo.png",
        width: 1240,
        height: 1240,
        alt: "Logo Kos Baiti",
      },
    ],
    locale: "id_ID",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kos Baiti — Satu aplikasi, semua terkoneksi",
    description:
      "Forum komunikasi pemilik & penghuni kos.",
    images: ["/kos-baiti-logo.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e3a8a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { PWARegister } from "@/components/PWARegister";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.kosbaiti.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Kos Baiti — Forum Komunikasi Pemilik & Penghuni Kos",
  description:
    "Satu aplikasi, semua terkoneksi — data penghuni, pembayaran, dan komplain untuk pemilik & penghuni kos.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Kos Baiti",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: "Kos Baiti",
    url: siteUrl,
    title: "Kos Baiti — Satu aplikasi, semua terkoneksi",
    description:
      "Forum komunikasi pemilik & penghuni kos: data penghuni, pembayaran, dan komplain — semua tercatat rapi.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 1200,
        alt: "Logo Kos Baiti",
        type: "image/jpeg",
      },
      {
        url: "/og-image-wide.jpg",
        width: 1200,
        height: 630,
        alt: "Kos Baiti — Forum Komunikasi Pemilik & Penghuni Kos",
        type: "image/jpeg",
      },
    ],
    locale: "id_ID",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kos Baiti — Satu aplikasi, semua terkoneksi",
    description:
      "Forum komunikasi pemilik & penghuni kos.",
    images: ["/og-image-wide.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#1e3a8a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <div className="w-full max-w-full overflow-x-hidden">{children}</div>
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: "text-sm",
            },
          }}
        />
        <PWARegister />
      </body>
    </html>
  );
}

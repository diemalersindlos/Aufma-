import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aufmaß Mobil | Die Maler sind los",
  description: "Mobile Aufmaß-App mit Spracheingabe, Bluetooth-Laser, KI-Maßeingabe, Freihandskizzen, prüfbarer Freigabe, Projektversionen und direkter PC-Übergabe.",
  applicationName: "Aufmaß Mobil",
  manifest: "/mobile.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Aufmaß Mobil",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function MobileLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

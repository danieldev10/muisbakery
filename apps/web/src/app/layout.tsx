import type { Metadata } from "next";

import { LegacyPwaCleanup } from "@/components/layout/legacy-pwa-cleanup";

import "./globals.css";

export const metadata: Metadata = {
  title: "Muis Bakery",
  description: "Inventory and sales management for Muis Bakery",
  icons: {
    icon: [
      {
        url: "/icons/icon-192.png?v=2",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    shortcut: "/icons/icon-192.png?v=2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <LegacyPwaCleanup />
        {children}
      </body>
    </html>
  );
}

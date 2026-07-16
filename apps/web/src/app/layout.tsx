import type { Metadata } from "next";

import { ServiceWorkerRegistration } from "@/components/layout/service-worker-registration";

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
    // iOS ignores the web manifest; this is what "Add to Home Screen" uses.
    apple: "/icons/icon-192.png?v=2",
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
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}

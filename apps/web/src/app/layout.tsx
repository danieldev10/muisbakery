import type { Metadata } from "next";

import { ServiceWorkerRegistration } from "@/components/layout/service-worker-registration";

import "./globals.css";

export const metadata: Metadata = {
  title: "Muis Bakery",
  description: "Inventory and sales management for Muis Bakery",
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

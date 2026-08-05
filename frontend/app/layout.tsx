/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { connection } from "next/server";
import { ApplicationBoundary } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ion · Industrial Intelligence",
    template: "%s · Ion",
  },
  description: "Factories that think ahead.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // A fresh CSP nonce is attached by proxy.ts on every document request.
  // Dynamic rendering lets Next apply it to framework and page scripts.
  await connection();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <ApplicationBoundary>{children}</ApplicationBoundary>
      </body>
    </html>
  );
}

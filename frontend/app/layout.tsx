/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { connection } from "next/server";
import { ApplicationBoundary } from "@/lib/auth-context";
import { designSystemStyle } from "@/lib/design-system";
import { getPlatformConfig } from "@/lib/variant-config";
import { PlatformProvider } from "@/lib/variant";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPlatformConfig();
  return {
    title: {
      default: `${config.displayName} · Industrial Intelligence`,
      template: `%s · ${config.displayName}`,
    },
    description: `${config.displayName} ${config.descriptor.toLocaleLowerCase("en-US")}.`,
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const config = await getPlatformConfig();
  return (
    <html lang="en" suppressHydrationWarning style={designSystemStyle}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <PlatformProvider config={config}>
          <ApplicationBoundary>{children}</ApplicationBoundary>
        </PlatformProvider>
      </body>
    </html>
  );
}

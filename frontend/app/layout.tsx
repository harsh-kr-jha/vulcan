import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { FactoryProvider } from "@/lib/factory-context";
import { designSystemStyle } from "@/lib/design-system";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vulcan · Mushroom Factory Intelligence",
  description: "Crop, climate, harvest and supply intelligence for mushroom factories",
  icons: {
    icon: [
      { url: "/icon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning style={designSystemStyle}>
      <body suppressHydrationWarning>
        <FactoryProvider>
          <AppShell>{children}</AppShell>
        </FactoryProvider>
      </body>
    </html>
  );
}

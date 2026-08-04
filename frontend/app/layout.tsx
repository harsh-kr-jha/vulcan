import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { FactoryProvider } from "@/lib/factory-context";
import { ProjectProvider } from "@/lib/project-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vulcan · Factory Intelligence",
  description: "Operational intelligence for modern factories",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <FactoryProvider>
          <ProjectProvider>
            <AppShell>{children}</AppShell>
          </ProjectProvider>
        </FactoryProvider>
      </body>
    </html>
  );
}

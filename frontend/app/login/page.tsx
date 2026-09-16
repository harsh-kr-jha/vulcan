"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { VulcanLogo } from "@/components/vulcan-logo";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <main
      className="flex h-screen w-full flex-col items-center justify-center gap-4 text-sm"
      style={{ background: "var(--canvas, #ffffff)", color: "var(--ink, #1e1b15)" }}
    >
      <VulcanLogo size={64} priority />
      <div className="flex items-center gap-2" style={{ color: "var(--green, #00a06c)" }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span style={{ fontWeight: 600 }}>Connecting to Vulcan cultivation intelligence...</span>
      </div>
    </main>
  );
}

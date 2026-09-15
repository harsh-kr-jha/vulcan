"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <main className="flex h-screen w-full items-center justify-center bg-gray-50 text-gray-500">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
        <span>Redirecting to mushroom factory dashboard...</span>
      </div>
    </main>
  );
}

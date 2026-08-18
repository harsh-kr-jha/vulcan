"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function PageBack({ fallback = "/", label = "Back" }: { fallback?: string; label?: string }) {
  const router = useRouter();

  function goBack() {
    // document.referrer is unchanged during Next.js client navigation, so it
    // cannot tell whether this screen has an in-app predecessor. Browser history
    // can: use it whenever present and reserve the fallback for direct entries.
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  }

  return <button className="page-back-button" onClick={goBack}><ArrowLeft size={14} /> {label}</button>;
}

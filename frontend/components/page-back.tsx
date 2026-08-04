"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function PageBack({ fallback = "/", label = "Back" }: { fallback?: string; label?: string }) {
  const router = useRouter();

  function goBack() {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer?.origin === window.location.origin && window.history.length > 1) router.back();
    else router.push(fallback);
  }

  return <button className="page-back-button" onClick={goBack}><ArrowLeft size={14} /> {label}</button>;
}

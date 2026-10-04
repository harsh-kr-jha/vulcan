const PROTECTED_PREFIXES = [
  "/dashboard",
  "/digital-twin",
  "/data",
  "/uploads",
  "/alerts",
  "/settings",
  "/rules",
  "/methodology",
  "/help",
] as const;

export function safeNextPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return "/digital-twin";
  }

  try {
    const parsed = new URL(candidate, "https://ion.local");
    const allowed = parsed.origin === "https://ion.local"
      && PROTECTED_PREFIXES.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`));
    return allowed ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/digital-twin";
  } catch {
    return "/digital-twin";
  }
}

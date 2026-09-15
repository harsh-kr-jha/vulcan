const PROTECTED_PREFIXES = [
  "/dashboard",
  "/projects",
  "/digital-twin",
  "/data",
  "/uploads",
  "/performance",
  "/alerts",
  "/settings",
  "/rules",
  "/methodology",
  "/help",
] as const;

export function safeNextPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return "/dashboard";
  }

  try {
    const parsed = new URL(candidate, "https://ion.local");
    const allowed = parsed.origin === "https://ion.local"
      && PROTECTED_PREFIXES.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`));
    return allowed ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

import "server-only";

import type { PlatformConfig } from "@/lib/variant";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/**
 * Load platform configuration from the backend at build/render time.
 *
 * Operating template branches provide a platform.json that the backend serves
 * via /api/backend/platform-config/. Platform Core returns a minimal fallback.
 */
export async function getPlatformConfig(): Promise<PlatformConfig> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/platform/config/`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      return (await res.json()) as PlatformConfig;
    }
  } catch {
    // Backend not reachable during build — use fallback
  }

  return {
    id: "platform-core",
    displayName: "Tamaso Platform",
    descriptor: "Platform Core",
    industry: "",
    modules: [],
    datasets: {},
    navigation: {},
    terminology: {
      siteSingular: "site",
      sitePlural: "sites",
      projectSingular: "project",
      projectPlural: "projects",
    },
    features: {},
  };
}

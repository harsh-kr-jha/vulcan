import "server-only";

import { readFileSync } from "fs";
import { resolve } from "path";
import type { PlatformConfig } from "@/lib/variant";

/**
 * Load platform configuration from platform.json at the repository root.
 *
 * Each operating template branch provides this file with industry-specific
 * display names, terminology, navigation labels, and feature flags.
 */
export function getPlatformConfig(): PlatformConfig {
  const manifestPath = resolve(process.cwd(), "platform.json");
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as PlatformConfig;
  } catch {
    // Platform Core or missing file — return fallback
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
}

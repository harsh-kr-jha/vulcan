import "server-only";

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { PlatformConfig } from "@/lib/variant";

const FALLBACK: PlatformConfig = {
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

/**
 * Load platform configuration from platform.json at the repository root.
 *
 * Checks both process.cwd() and one directory up (handles npm workspace
 * invocation where cwd may be the frontend/ subdirectory).
 */
export function getPlatformConfig(): PlatformConfig {
  const candidates = [
    resolve(process.cwd(), "platform.json"),
    resolve(process.cwd(), "..", "platform.json"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8");
        return JSON.parse(raw) as PlatformConfig;
      } catch {
        continue;
      }
    }
  }

  return FALLBACK;
}

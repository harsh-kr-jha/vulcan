import "server-only";

import type { PlatformConfig } from "@/lib/variant";
import platformConfig from "../../platform.json";

const FALLBACK: PlatformConfig = {
  id: "platform-core",
  displayName: "Vulcan",
  descriptor: "by Tamaso.ai",
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

export function getPlatformConfig(): PlatformConfig {
  return platformConfig && typeof platformConfig === "object"
    ? platformConfig as PlatformConfig
    : FALLBACK;
}

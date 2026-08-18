"use client";

import { createContext, useContext } from "react";

/**
 * Platform configuration provided by the operating template branch.
 *
 * Each branch supplies a platform.json at the repository root with industry-specific
 * display names, terminology, navigation labels, and feature flags. Platform Core
 * ships a minimal fallback when no platform.json exists.
 */
export interface PlatformConfig {
  id: string;
  displayName: string;
  descriptor: string;
  industry: string;
  modules: string[];
  datasets: Record<string, string>;
  navigation: Record<string, string>;
  terminology: {
    siteSingular: string;
    sitePlural: string;
    projectSingular: string;
    projectPlural: string;
  };
  features: Record<string, boolean>;
}

const PlatformContext = createContext<PlatformConfig | null>(null);

export function PlatformProvider({
  config,
  children,
}: {
  config: PlatformConfig;
  children: React.ReactNode;
}) {
  return <PlatformContext.Provider value={config}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformConfig {
  const config = useContext(PlatformContext);
  if (!config) throw new Error("usePlatform must be used inside PlatformProvider.");
  return config;
}

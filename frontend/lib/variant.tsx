"use client";

import { createContext, useContext } from "react";
import type { DatasetType } from "@/lib/factory-domain";

export type VariantId = "automotive" | "mushroom";

export interface VariantConfig {
  id: VariantId;
  displayName: string;
  descriptor: string;
  industry: string;
  modules: string[];
  datasets: Record<DatasetType, string>;
  navigation: Record<string, string>;
  terminology: {
    siteSingular: string;
    sitePlural: string;
    projectSingular: string;
    projectPlural: string;
  };
  features: {
    asyncUploads: boolean;
    mushroomAnalytics: boolean;
  };
}

const VariantContext = createContext<VariantConfig | null>(null);

export function VariantProvider({
  config,
  children,
}: {
  config: VariantConfig;
  children: React.ReactNode;
}) {
  return <VariantContext.Provider value={config}>{children}</VariantContext.Provider>;
}

export function useVariant(): VariantConfig {
  const config = useContext(VariantContext);
  if (!config) throw new Error("useVariant must be used inside VariantProvider.");
  return config;
}

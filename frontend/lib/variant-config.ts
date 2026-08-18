import "server-only";

import automotiveManifest from "../../variants/automotive.json";
import mushroomManifest from "../../variants/mushroom.json";
import type { VariantConfig, VariantId } from "@/lib/variant";

const manifests = {
  automotive: automotiveManifest,
  mushroom: mushroomManifest,
} as const;

export function getVariantConfig(): VariantConfig {
  const configured = process.env.VULCAN_VARIANT?.trim().toLocaleLowerCase("en-US");
  const variant = configured || (process.env.NODE_ENV === "development" ? "mushroom" : "");
  if (!Object.prototype.hasOwnProperty.call(manifests, variant)) {
    throw new Error(
      `VULCAN_VARIANT must be one of ${Object.keys(manifests).join(", ")}; received ${variant || "an empty value"}.`,
    );
  }
  return manifests[variant as VariantId] as VariantConfig;
}

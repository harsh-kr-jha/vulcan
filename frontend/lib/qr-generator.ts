import QRCode from "qrcode";

/**
 * QR Code Generation Utility for Factory Twin Builder.
 *
 * Generates QR codes (SVG format) for machines, inventory, and dispatch panels.
 * QR codes encode platform URLs that open the corresponding data entry pages.
 *
 * Requirements: 6.1, 6.2, 6.3, 11.6, 12.5
 */

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Returns the application origin URL.
 * Prefers the NEXT_PUBLIC_APP_URL environment variable; falls back to
 * window.location.origin at runtime.
 */
function getOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

/**
 * Returns the data entry URL for a given machine.
 * Pattern: {ORIGIN}/digital-twin/entry/{machineId}
 */
export function getMachineEntryUrl(machineId: string): string {
  return `${getOrigin()}/digital-twin/entry/${machineId}`;
}

/**
 * Returns the inventory entry URL for a given layout.
 * Pattern: {ORIGIN}/digital-twin/inventory/{layoutId}
 */
export function getInventoryEntryUrl(layoutId: string): string {
  return `${getOrigin()}/digital-twin/inventory/${layoutId}`;
}

/**
 * Returns the dispatch entry URL for a given layout.
 * Pattern: {ORIGIN}/digital-twin/dispatch/{layoutId}
 */
export function getDispatchEntryUrl(layoutId: string): string {
  return `${getOrigin()}/digital-twin/dispatch/${layoutId}`;
}

// ---------------------------------------------------------------------------
// QR SVG generators
// ---------------------------------------------------------------------------

/** Options passed to the underlying qrcode library for SVG output. */
const QR_OPTIONS: QRCode.QRCodeToStringOptions = {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 1,
  width: 256,
};

/**
 * Generates an SVG string for a machine data entry QR code.
 * Encodes URL: {ORIGIN}/digital-twin/entry/{machineId}
 *
 * Requirement 6.1: generated within 5 seconds of save (client-side, instant).
 * Requirement 6.3: URL works within platform's existing auth flow.
 */
export async function generateMachineQrSvg(machineId: string): Promise<string> {
  const url = getMachineEntryUrl(machineId);
  return QRCode.toString(url, QR_OPTIONS);
}

/**
 * Generates an SVG string for an inventory entry QR code.
 * Encodes URL: {ORIGIN}/digital-twin/inventory/{layoutId}
 *
 * Requirement 11.6: Inventory_QR_Code displayed within the Inventory_Panel.
 */
export async function generateInventoryQrSvg(layoutId: string): Promise<string> {
  const url = getInventoryEntryUrl(layoutId);
  return QRCode.toString(url, QR_OPTIONS);
}

/**
 * Generates an SVG string for a dispatch entry QR code.
 * Encodes URL: {ORIGIN}/digital-twin/dispatch/{layoutId}
 *
 * Requirement 12.5: Dispatch_QR_Code displayed within the Dispatch_Panel.
 */
export async function generateDispatchQrSvg(layoutId: string): Promise<string> {
  const url = getDispatchEntryUrl(layoutId);
  return QRCode.toString(url, QR_OPTIONS);
}

// ---------------------------------------------------------------------------
// QR Data URL generators (for JPG/PNG download and printing)
// ---------------------------------------------------------------------------

const QR_IMAGE_OPTIONS: QRCode.QRCodeToDataURLOptions = {
  type: "image/png",
  errorCorrectionLevel: "M",
  margin: 1,
  width: 512,
};

/** Generates a PNG data URL for a machine QR code. */
export async function generateMachineQrDataUrl(machineId: string): Promise<string> {
  const url = getMachineEntryUrl(machineId);
  return QRCode.toDataURL(url, QR_IMAGE_OPTIONS);
}

/** Generates a PNG data URL for an inventory QR code. */
export async function generateInventoryQrDataUrl(layoutId: string): Promise<string> {
  const url = getInventoryEntryUrl(layoutId);
  return QRCode.toDataURL(url, QR_IMAGE_OPTIONS);
}

/** Generates a PNG data URL for a dispatch QR code. */
export async function generateDispatchQrDataUrl(layoutId: string): Promise<string> {
  const url = getDispatchEntryUrl(layoutId);
  return QRCode.toDataURL(url, QR_IMAGE_OPTIONS);
}

// ---------------------------------------------------------------------------
// Helper: convert data URL to Blob (avoids fetch on data: URLs)
// ---------------------------------------------------------------------------

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

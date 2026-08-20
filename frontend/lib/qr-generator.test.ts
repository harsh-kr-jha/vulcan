import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getMachineEntryUrl,
  getInventoryEntryUrl,
  getDispatchEntryUrl,
  generateMachineQrSvg,
  generateInventoryQrSvg,
  generateDispatchQrSvg,
} from "./qr-generator";

describe("qr-generator", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear NEXT_PUBLIC_APP_URL so window.location.origin is used
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("URL helpers", () => {
    describe("getMachineEntryUrl", () => {
      it("returns correct URL using NEXT_PUBLIC_APP_URL", () => {
        process.env.NEXT_PUBLIC_APP_URL = "https://factory.example.com";
        const url = getMachineEntryUrl("machine-123");
        expect(url).toBe(
          "https://factory.example.com/digital-twin/entry/machine-123"
        );
      });

      it("strips trailing slashes from NEXT_PUBLIC_APP_URL", () => {
        process.env.NEXT_PUBLIC_APP_URL = "https://factory.example.com/";
        const url = getMachineEntryUrl("abc");
        expect(url).toBe("https://factory.example.com/digital-twin/entry/abc");
      });

      it("returns empty origin prefix when no env and no window", () => {
        // In node test environment without NEXT_PUBLIC_APP_URL, window is not defined
        const url = getMachineEntryUrl("m1");
        expect(url).toBe("/digital-twin/entry/m1");
      });
    });

    describe("getInventoryEntryUrl", () => {
      it("returns correct URL pattern", () => {
        process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
        const url = getInventoryEntryUrl("layout-456");
        expect(url).toBe("https://app.test/digital-twin/inventory/layout-456");
      });
    });

    describe("getDispatchEntryUrl", () => {
      it("returns correct URL pattern", () => {
        process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
        const url = getDispatchEntryUrl("layout-789");
        expect(url).toBe("https://app.test/digital-twin/dispatch/layout-789");
      });
    });
  });

  describe("QR SVG generators", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_APP_URL = "https://factory.example.com";
    });

    describe("generateMachineQrSvg", () => {
      it("returns a valid SVG string", async () => {
        const svg = await generateMachineQrSvg("machine-001");
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
      });

      it("generates different SVGs for different machine IDs", async () => {
        const svg1 = await generateMachineQrSvg("machine-001");
        const svg2 = await generateMachineQrSvg("machine-002");
        expect(svg1).not.toBe(svg2);
      });

      it("generates consistent output for the same input", async () => {
        const svg1 = await generateMachineQrSvg("machine-same");
        const svg2 = await generateMachineQrSvg("machine-same");
        expect(svg1).toBe(svg2);
      });
    });

    describe("generateInventoryQrSvg", () => {
      it("returns a valid SVG string", async () => {
        const svg = await generateInventoryQrSvg("layout-100");
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
      });

      it("generates different SVGs for different layout IDs", async () => {
        const svg1 = await generateInventoryQrSvg("layout-100");
        const svg2 = await generateInventoryQrSvg("layout-200");
        expect(svg1).not.toBe(svg2);
      });
    });

    describe("generateDispatchQrSvg", () => {
      it("returns a valid SVG string", async () => {
        const svg = await generateDispatchQrSvg("layout-300");
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
      });

      it("generates different SVGs for different layout IDs", async () => {
        const svg1 = await generateDispatchQrSvg("layout-300");
        const svg2 = await generateDispatchQrSvg("layout-400");
        expect(svg1).not.toBe(svg2);
      });
    });
  });
});

import path from "node:path";
import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=(), browsing-topics=()" },
  ...(isProduction
    // Do not opt unrelated subdomains into HSTS or the browser preload list.
    // Those broader commitments belong at the ingress after an HTTPS inventory.
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  // Django's APPEND_SLASH routes must keep their trailing slash. In
  // particular, a multipart POST cannot be safely redirected after Next has
  // removed it.
  skipTrailingSlashRedirect: true,
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
    return [
      { source: "/api/backend/:path*", destination: `${backend}/:path*/` },
      // Keep already-open tabs from the pre-refactor frontend working while
      // their cached client bundle is replaced by the current one.
      { source: "/api/workspace", destination: `${backend}/api/workspace/` },
      { source: "/api/workspace/:path*", destination: `${backend}/api/workspace/:path*` },
    ];
  },
};

export default nextConfig;

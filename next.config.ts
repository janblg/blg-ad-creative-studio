import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/binary packages must not be bundled — required at runtime instead.
  serverExternalPackages: ["@resvg/resvg-wasm", "sharp", "satori", "heic-convert"],
  experimental: {
    serverActions: {
      // Product photo uploads flow through server actions.
      bodySizeLimit: "12mb",
    },
  },
  // Ship the brand fonts and the resvg wasm with the serverless functions.
  outputFileTracingIncludes: {
    "/**": ["./fonts/**", "./node_modules/@resvg/resvg-wasm/index_bg.wasm"],
  },
};

export default nextConfig;

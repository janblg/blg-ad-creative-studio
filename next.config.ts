import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/binary packages must not be bundled — required at runtime instead.
  serverExternalPackages: ["@resvg/resvg-js", "sharp", "satori", "heic-convert"],
  experimental: {
    serverActions: {
      // Product photo uploads flow through server actions.
      bodySizeLimit: "12mb",
    },
  },
  // Ensure the bundled brand fonts ship with the serverless functions.
  outputFileTracingIncludes: {
    "/**": ["./fonts/**"],
  },
};

export default nextConfig;

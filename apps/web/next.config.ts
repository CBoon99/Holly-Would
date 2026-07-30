import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  // Include seed JSON + scripts in serverless bundle
  outputFileTracingIncludes: {
    "/**": [
      "./src/scripts/**/*",
      "../../content/seed/**/*",
    ],
  },
  outputFileTracingRoot: path.join(__dirname, "../.."),
  serverExternalPackages: [],
};

export default nextConfig;

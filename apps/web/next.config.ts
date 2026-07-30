import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  // Allow loading media from local storage path via API only
  webpack: (config) => {
    config.externals = config.externals || [];
    return config;
  },
  // Project root for monorepo
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;

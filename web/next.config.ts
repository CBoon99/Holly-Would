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
  // Keep seed content inside the package for Netlify file tracing
  outputFileTracingIncludes: {
    "/**": ["./content/seed/**/*", "./src/scripts/**/*"],
  },
  // monorepo root is one level up from web/
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;

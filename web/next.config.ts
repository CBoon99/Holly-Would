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
    "/**": ["./content/seed/**/*"],
  },
  // Never ship local secrets into the serverless bundle
  outputFileTracingExcludes: {
    "/**": ["./.env", "./.env.*", "./.env.local", "**/.env", "**/.env.*"],
  },
  // package_path=web — trace from this package, not monorepo parent
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;

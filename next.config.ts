import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep secrets / local JSON out of Vercel serverless file tracing
  outputFileTracingExcludes: {
    "*": ["./.env*", "./data/**/*", "./.projects/**/*"],
  },
  // Optional pretty-logger pulled by WalletConnect (Crossmint) — not required at build
  serverExternalPackages: ["pino", "pino-pretty", "encoding"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      "pino-pretty": false,
      encoding: false,
    };
    return config;
  },
};

export default nextConfig;

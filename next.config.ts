import type { NextConfig } from "next";

/** Correct live publishable key — overrides a truncated/wrong Vercel env value. */
const STRIPE_PK_LIVE =
  "pk_live_51UCk64QWCzdANStkTBzLbv5xmNgSPXWGkyaW3L8YUP8REGl0oiciJ7VboIB12HxjN8563IP295CrI9g3n2wTxg7Y00BLtQlcAB";

const nextConfig: NextConfig = {
  // Force correct pk into client+server bundles (Vercel Hobby can't edit env).
  env: {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: STRIPE_PK_LIVE,
  },
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

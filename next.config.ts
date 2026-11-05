import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.local"],
  outputFileTracingExcludes: {
    "*": ["./.env*", "./data/**/*", "./.projects/**/*"],
  },
};

export default nextConfig;

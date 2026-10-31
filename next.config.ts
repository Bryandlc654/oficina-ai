import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep development and production builds separate so `next dev` never
  // deletes the chunks required by a running `next start` server.
  distDir: isDev ? ".next-dev" : ".next",
  serverExternalPackages: ["@prisma/client", "bullmq", "ioredis"],
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    "/**": ["./prisma/**/*"],
  },
};

export default nextConfig;

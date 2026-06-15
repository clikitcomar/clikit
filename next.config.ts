import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["geist"],
  serverExternalPackages: ["@prisma/client", "@neondatabase/serverless", "pg", "@prisma/adapter-pg"],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  silent: !process.env.CI,

  widenClientFileUpload: true,

  webpack: {
    reactComponentAnnotation: {
      enabled: true,
    },
    treeshake: {
      removeDebugLogging: true,
    },
    automaticVercelMonitors: true,
  },
});

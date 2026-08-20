import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        hostname: "images.unsplash.com",
        protocol: "https",
      },
    ],
  },
  experimental: {
    serverActions: {
      // ponytail: app validators cap files at 10 MB; 12 MB leaves multipart overhead.
      bodySizeLimit: "12mb",
    },
  },
  reactCompiler: true,
};

export default withSentryConfig(nextConfig, {
  authToken: process.env.NESTORY_SENTRY_AUTH_TOKEN,
  automaticVercelMonitors: false,
  org: process.env.NESTORY_SENTRY_ORG,
  project: process.env.NESTORY_SENTRY_PROJECT,
  release: {
    name: process.env.VERCEL_GIT_COMMIT_SHA,
  },
  silent: !process.env.CI,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  telemetry: false,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});

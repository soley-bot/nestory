import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { BROWSER_SECURITY_HEADERS } from "./src/lib/security/browser-security";

const nextConfig: NextConfig = {
  // Vercel injects a build adapter and does not consume standalone output.
  // Next 16.3 currently omits the root trace files when both are enabled.
  output: process.env.VERCEL ? undefined : "standalone",
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
  async headers() {
    return [
      {
        headers: [...BROWSER_SECURITY_HEADERS],
        source: "/:path*",
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  authToken: process.env.NESTORY_SENTRY_AUTH_TOKEN,
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
    automaticVercelMonitors: false,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});

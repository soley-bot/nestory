import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;

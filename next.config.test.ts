import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("Next.js development origin configuration", () => {
  it("allows the loopback host used by the annotation browser", () => {
    expect(nextConfig.allowedDevOrigins ?? []).toContain("127.0.0.1");
  });

  it("does not expose an unused remote image optimization origin", () => {
    expect(nextConfig.images?.remotePatterns ?? []).toEqual([]);
  });
});

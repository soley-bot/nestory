import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("Next.js development origin configuration", () => {
  it("allows the loopback host used by the annotation browser", () => {
    expect(nextConfig.allowedDevOrigins ?? []).toContain("127.0.0.1");
  });
});

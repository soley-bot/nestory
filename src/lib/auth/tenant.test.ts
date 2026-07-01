import { afterEach, describe, expect, it } from "vitest";
import { getOrganizationSlugFromHost } from "@/lib/auth/tenant";

const originalRootDomain = process.env.APP_ROOT_DOMAIN;
const originalReservedSubdomains = process.env.APP_RESERVED_SUBDOMAINS;

afterEach(() => {
  process.env.APP_ROOT_DOMAIN = originalRootDomain;
  process.env.APP_RESERVED_SUBDOMAINS = originalReservedSubdomains;
});

describe("getOrganizationSlugFromHost", () => {
  it("keeps localhost and the root app in single-workspace fallback mode", () => {
    process.env.APP_ROOT_DOMAIN = "nestory-kh.com";

    expect(getOrganizationSlugFromHost("localhost:3000")).toBeNull();
    expect(getOrganizationSlugFromHost("nestory-kh.com")).toBeNull();
    expect(getOrganizationSlugFromHost("app.nestory-kh.com")).toBeNull();
  });

  it("uses one organization subdomain when a root domain is configured", () => {
    process.env.APP_ROOT_DOMAIN = "nestory-kh.com";

    expect(getOrganizationSlugFromHost("demo.nestory-kh.com")).toBe("demo");
    expect(getOrganizationSlugFromHost("demo.nestory-kh.com:3000")).toBe("demo");
  });

  it("ignores unrelated and nested hostnames", () => {
    process.env.APP_ROOT_DOMAIN = "nestory-kh.com";

    expect(getOrganizationSlugFromHost("nestory-bay.vercel.app")).toBeNull();
    expect(getOrganizationSlugFromHost("team.demo.nestory-kh.com")).toBeNull();
  });
});

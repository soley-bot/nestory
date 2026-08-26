import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAuthCookieOptions,
  getOrganizationSlugFromHost,
} from "@/lib/auth/tenant";

const originalRootDomain = process.env.APP_ROOT_DOMAIN;
const originalReservedSubdomains = process.env.APP_RESERVED_SUBDOMAINS;

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalRootDomain === undefined) {
    delete process.env.APP_ROOT_DOMAIN;
  } else {
    process.env.APP_ROOT_DOMAIN = originalRootDomain;
  }
  if (originalReservedSubdomains === undefined) {
    delete process.env.APP_RESERVED_SUBDOMAINS;
  } else {
    process.env.APP_RESERVED_SUBDOMAINS = originalReservedSubdomains;
  }
});

describe("getAuthCookieOptions", () => {
  it("keeps Auth sessions HttpOnly and secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_ROOT_DOMAIN = "nestory-kh.com";

    expect(getAuthCookieOptions()).toEqual({
      domain: ".nestory-kh.com",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });

  it("keeps local Auth sessions HttpOnly without forcing HTTPS", () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.APP_ROOT_DOMAIN;

    expect(getAuthCookieOptions()).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });
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

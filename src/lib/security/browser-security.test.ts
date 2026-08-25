import { describe, expect, it } from "vitest";
import {
  BROWSER_SECURITY_HEADERS,
  buildContentSecurityPolicy,
} from "@/lib/security/browser-security";

describe("browser security policy", () => {
  it("builds a nonce-based production CSP with exact external origins", () => {
    const policy = buildContentSecurityPolicy({
      environment: "production",
      nonce: "nonce-value",
      requestUrl: "https://app.nestory-kh.com/account",
      sentryDsn: "https://public@example.ingest.sentry.io/123",
      supabaseUrl: "https://project.supabase.co",
    });

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self' 'nonce-nonce-value' 'strict-dynamic'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("style-src 'self' 'nonce-nonce-value'");
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy).not.toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("connect-src 'self' https://project.supabase.co wss://project.supabase.co https://example.ingest.sentry.io");
    expect(policy).toContain("img-src 'self' data: blob: https://project.supabase.co https://images.unsplash.com");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toMatch(/https:\/\/\*|wss:\/\/\*/);
  });

  it("scopes development-only script and websocket allowances to loopback", () => {
    const policy = buildContentSecurityPolicy({
      environment: "development",
      nonce: "dev-nonce",
      requestUrl: "http://127.0.0.1:3000/account",
      sentryDsn: "",
      supabaseUrl: "http://127.0.0.1:54321",
    });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("ws://127.0.0.1:*");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("defines the stable hardening headers once", () => {
    expect(Object.fromEntries(BROWSER_SECURITY_HEADERS.map(({ key, value }) => [key, value]))).toEqual({
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
  });
});

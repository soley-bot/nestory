import { describe, expect, it } from "vitest";
import { getLoginPath, safeLoginNextPath } from "@/lib/auth/login-redirect";
import { safeAuthNextPath } from "@/lib/auth/redirect";

const invitation = "/accept-invite?invitation=11111111-1111-4111-8111-111111111111";

describe("login destinations", () => {
  it.each([
    "/properties/11111111-1111-4111-8111-111111111111?tab=units&search=North%20Wing",
    "/rent-income?month=2026-10&status=unpaid",
    "/settings/access",
    "/tasks?review=open",
    invitation,
  ])("preserves %s through repeated login URL encoding", (destination) => {
    const first = new URL(getLoginPath(destination), "https://example.test");
    const second = new URL(getLoginPath(first.searchParams.get("next")), first);
    expect(safeLoginNextPath(second.searchParams.get("next"))).toBe(destination);
  });

  it.each([
    undefined, null, "", "https://evil.test", "//evil.test", "/\\evil.test",
    "javascript:alert(1)", "/login?next=/properties", "/auth/confirm?token_hash=test",
    "/api/documents/test", "/update-password", "/request", "/properties/../login",
    "/properties/%2e%2e/login", "/%2f%2fevil.test", "/properties%2f..%2fauth",
    "/properties\nLocation:https://evil.test", "/properties#//evil.test",
    "/accept-invite?invitation=invalid", `${invitation}&next=https://evil.test`,
    "/properties?search=" + "a".repeat(4096),
  ])("falls back for unsafe or unsupported destination %s", (destination) => {
    expect(safeLoginNextPath(destination)).toBe("/workspace");
    expect(getLoginPath(destination)).toBe("/login");
  });

  it("keeps email verification restricted to its existing destinations", () => {
    expect(safeAuthNextPath("/properties?search=North")).toBe("/workspace");
    expect(safeAuthNextPath(invitation)).toBe(invitation);
    expect(safeAuthNextPath("/update-password")).toBe("/update-password");
  });

  it("preserves semicolons in a search through the server action redirect header", () => {
    const destination = "/properties?search=A;B&view=table";
    const login = new URL(getLoginPath(destination), "https://example.test");
    const returned = safeLoginNextPath(login.searchParams.get("next"));
    const [path, type] = `${returned};push`.split(";");
    const parsed = new URL(path, login);
    expect(type).toBe("push");
    expect(parsed.searchParams.get("search")).toBe("A;B");
    expect(parsed.searchParams.get("view")).toBe("table");
  });
});

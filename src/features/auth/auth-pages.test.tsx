import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  cookieGet: vi.fn(),
  getInvitationAcceptance: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookieGet }) }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/features/auth/invitation-acceptance", () => ({
  getInvitationAcceptance: mocks.getInvitationAcceptance,
  acceptInvitationAction: vi.fn(),
}));

import LoginPage from "@/app/(auth)/login/page";
import UpdatePasswordPage from "@/app/(auth)/update-password/page";
import AcceptInvitePage from "@/app/accept-invite/page";
import AuthCompletePage from "@/app/auth/complete/page";
import { createRecoveryMarker, RECOVERY_MARKER_MAX_AGE_SECONDS } from "@/lib/auth/recovery-marker";

describe("auth page journeys", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("NESTORY_AUTH_COOKIE_SECRET", "auth-page-test-only-cookie-secret");
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.cookieGet.mockReset();
    mocks.getInvitationAcceptance.mockReset();
  });

  it("shows reset success and carries a safe destination into the login form", async () => {
    const html = renderToStaticMarkup(await LoginPage({
      searchParams: Promise.resolve({ password: "updated", next: "/properties?view=table" }),
    }));
    expect(html).toContain('role="status"');
    expect(html).toContain("Your password has been updated");
    expect(html).toContain('name="next" value="/properties?view=table"');
  });

  it("does not trust duplicate or external login destinations", async () => {
    for (const next of [["/properties", "https://evil.test"], "https://evil.test"]) {
      const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ next }) }));
      expect(html).toContain('name="next" value="/workspace"');
      expect(html).not.toContain("Your password has been updated");
      expect(html).not.toContain("evil.test");
    }
  });

  it.each(["missing", "expired", "wrong-user", "malformed", "signed-out", "provider-failure"])("hides password entry for %s recovery", async (state) => {
    if (state === "expired") mocks.cookieGet.mockReturnValue({ value: createRecoveryMarker("user-1", Date.now() - (RECOVERY_MARKER_MAX_AGE_SECONDS + 1) * 1000) });
    if (state === "wrong-user") mocks.cookieGet.mockReturnValue({ value: createRecoveryMarker("user-2") });
    if (state === "malformed") mocks.cookieGet.mockReturnValue({ value: "invalid-marker" });
    if (state === "signed-out") mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    if (state === "provider-failure") mocks.getUser.mockRejectedValue(new Error("unavailable"));
    const html = renderToStaticMarkup(await UpdatePasswordPage());
    expect(html).toContain("Password reset unavailable");
    expect(html).toContain('href="/forgot-password"');
    expect(html).not.toContain('type="password"');
  });

  it("allows verified recovery and hides the form when revisited after marker consumption", async () => {
    mocks.cookieGet.mockReturnValue({ value: createRecoveryMarker("user-1") });
    expect(renderToStaticMarkup(await UpdatePasswordPage())).toContain('type="password"');
    mocks.cookieGet.mockReturnValue(undefined);
    expect(renderToStaticMarkup(await UpdatePasswordPage())).not.toContain('type="password"');
  });

  it("preserves the invitation for existing-account sign-in and account switching", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    mocks.getInvitationAcceptance.mockResolvedValue({ state: "signed_out" });
    const html = renderToStaticMarkup(await AcceptInvitePage({ searchParams: Promise.resolve({ invitation: id }) }));
    expect(html).toContain(`/login?next=%2Faccept-invite%3Finvitation%3D${id}`);
    mocks.getInvitationAcceptance.mockResolvedValue({ state: "unavailable", accountEmail: "other@example.com" });
    const switched = renderToStaticMarkup(await AcceptInvitePage({ searchParams: Promise.resolve({ invitation: id }) }));
    expect(switched).toContain(`name="next" value="/accept-invite?invitation=${id}"`);
  });

  it("shows recovery errors immediately without an in-progress heading or confirmation form", async () => {
    const html = renderToStaticMarkup(await AuthCompletePage({ searchParams: Promise.resolve({
      error: "access_denied", next: "/update-password", token_hash: "synthetic-token", type: "recovery",
    }) }));
    expect(html).toContain("We could not verify this link");
    expect(html).toContain("Request a new recovery link");
    expect(html).not.toContain("Signing you in");
    expect(html).not.toContain("Keep this page open");
    expect(html).not.toContain("synthetic-token");
  });
});

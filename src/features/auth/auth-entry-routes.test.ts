import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession, verifyOtp } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/auth/recovery-marker", () => ({
  createRecoveryMarker: () => "signed-recovery-marker",
  RECOVERY_MARKER_COOKIE: "nestory_recovery",
  RECOVERY_MARKER_MAX_AGE_SECONDS: 600,
}));

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { exchangeCodeForSession, verifyOtp },
  }),
}));

import { GET as callbackGet } from "@/app/auth/callback/route";
import { GET as confirmGet } from "@/app/auth/confirm/route";

describe("successful auth entry routes", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    verifyOtp.mockReset();
  });

  it("sends OAuth callback success through the workspace resolver", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await callbackGet(
      new NextRequest("http://localhost:3000/auth/callback?code=valid"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/workspace",
    );
  });

  it("sends email confirmation success through the workspace resolver", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await confirmGet(
      new NextRequest(
        "http://localhost:3000/auth/confirm?token_hash=valid&type=signup",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/workspace",
    );
  });

  it("preserves only an allowlisted recovery destination", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await callbackGet(
      new NextRequest(
        "http://localhost:3000/auth/callback?code=valid&next=%2Fupdate-password",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/update-password",
    );
  });

  it("marks only a verified recovery-token response for password updates", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await confirmGet(
      new NextRequest(
        "http://localhost:3000/auth/confirm?token_hash=valid&type=recovery&next=%2Fupdate-password",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/update-password",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "nestory_recovery=signed-recovery-marker",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=600");
  });

  it("rejects external callback destinations", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await callbackGet(
      new NextRequest(
        "http://localhost:3000/auth/callback?code=valid&next=https%3A%2F%2Fevil.example",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/workspace",
    );
  });

  it("preserves an invitation identifier after email verification", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await confirmGet(
      new NextRequest(
        "http://localhost:3000/auth/confirm?token_hash=valid&type=invite&next=%2Faccept-invite%3Finvitation%3D11111111-1111-4111-8111-111111111111",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/accept-invite?invitation=11111111-1111-4111-8111-111111111111",
    );
  });
});

describe("entry experience contracts", () => {
  it("removes public workspace creation from the landing page", () => {
    const source = readSource("src/features/marketing/landing-page.tsx");
    const header = readSource(
      "src/features/marketing/components/landing-header.tsx",
    );

    expect(source).not.toContain('href="/signup"');
    expect(source).not.toContain("Create workspace");
    expect(header).not.toContain('href="/signup"');
    expect(header).not.toContain("Create workspace");
  });

  it("disables local public signup without disabling the email auth provider", () => {
    const config = readSource("supabase/config.toml");
    const authConfig = config.slice(
      config.indexOf("[auth]"),
      config.indexOf("[auth.rate_limit]"),
    );
    const emailConfig = config.slice(
      config.indexOf("[auth.email]"),
      config.indexOf("[auth.sms]"),
    );

    expect(authConfig).toContain("enable_signup = false");
    expect(emailConfig).toContain("enable_signup = true");
  });

  it("keeps auth pages focused on the form instead of a label explainer", () => {
    const login = readSource("src/app/(auth)/login/page.tsx");
    const loginForm = readSource(
      "src/features/auth/components/login-form.tsx",
    );
    const signup = readSource("src/app/(auth)/signup/page.tsx");
    const shell = readSource("src/features/auth/components/auth-page-shell.tsx");
    const themeToggle = readSource(
      "src/components/theme-toggle.tsx",
    );
    const setup = readSource("src/app/setup/page.tsx");

    expect(login).toContain('contextLabel="Property operations"');
    expect(login).toContain('contextTitle="See the full record."');
    expect(login).toContain("history stay connected to each property");
    expect(shell).not.toContain("contextItems.map");
    expect(shell).toContain("bg-[var(--auth-page-card-bg)]");
    expect(shell).toContain('markTone={visualSrc ? "light" : "auto"}');
    expect(shell).toContain("<ThemeToggle");
    expect(themeToggle).toContain('localStorage.setItem("nestory-theme"');
    expect(login).not.toContain('switchHref="/signup"');
    expect(login).not.toContain("Create workspace");
    expect(loginForm).toContain('href="/forgot-password"');
    expect(signup).toContain('redirect("/login")');
    expect(setup).toContain('redirect("/no-access")');
    expect(setup).not.toContain("SetupOrganizationForm");
  });

  it("associates auth validation with the affected fields", () => {
    for (const path of ["src/features/auth/components/login-form.tsx"]) {
      const source = readSource(path);
      expect(source).toContain("aria-invalid");
      expect(source).toContain("aria-describedby");
    }
  });

  it("provides focused recovery and password-update routes", () => {
    const forgotPage = readSource("src/app/(auth)/forgot-password/page.tsx");
    const updatePage = readSource("src/app/(auth)/update-password/page.tsx");
    const forgotForm = readSource(
      "src/features/auth/components/forgot-password-form.tsx",
    );
    const updateForm = readSource(
      "src/features/auth/components/update-password-form.tsx",
    );

    expect(forgotPage).toContain("ForgotPasswordForm");
    expect(forgotForm).toContain("requestPasswordRecoveryAction");
    expect(forgotForm).toContain('autoComplete="email"');
    expect(updatePage).toContain("UpdatePasswordForm");
    expect(updateForm).toContain("updatePasswordAction");
    expect(updateForm).toContain('autoComplete="new-password"');
  });

  it("provides an explicit invitation review and acceptance boundary", () => {
    const page = readSource("src/app/accept-invite/page.tsx");
    const form = readSource(
      "src/features/auth/components/accept-invitation-form.tsx",
    );

    expect(page).toContain("getInvitationAcceptance");
    expect(page).toContain("Use another account");
    expect(page).toContain("InvitationSummary");
    expect(form).toContain("acceptInvitationAction");
    expect(form).toContain('name="invitationId"');
    expect(form).toContain('autoComplete="new-password"');
  });

  it("keeps the no-access recovery honest and the preview attention-first", () => {
    const noAccess = readSource("src/app/no-access/page.tsx");
    const preview = readSource(
      "src/features/marketing/components/control-preview.tsx",
    );

    expect(noAccess).not.toContain('href="/login"');
    expect(noAccess).toContain("signOutAction");
    expect(noAccess).toContain("requireUser");
    expect(preview).toContain("Needs attention");
    expect(preview).not.toContain("Focus now");
  });
});

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

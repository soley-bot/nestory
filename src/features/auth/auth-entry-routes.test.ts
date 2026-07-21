import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession, verifyOtp } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
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
});

describe("entry experience contracts", () => {
  it("puts a direct workspace action in the landing hero", () => {
    const source = readSource("src/features/marketing/landing-page.tsx");
    const hero = source.slice(
      source.indexOf('className="landing-hero'),
      source.indexOf('id="workspace"'),
    );

    expect(hero).toContain('href="/signup"');
    expect(hero).toContain("Create workspace");
  });

  it("keeps auth pages focused on the form instead of a label explainer", () => {
    const login = readSource("src/app/(auth)/login/page.tsx");
    const shell = readSource("src/features/auth/components/auth-page-shell.tsx");
    const themeToggle = readSource(
      "src/components/theme-toggle.tsx",
    );
    const setup = readSource(
      "src/features/auth/components/setup-organization-form.tsx",
    );

    expect(login).toContain('contextLabel="Property operations"');
    expect(login).toContain('contextTitle="See the full record."');
    expect(login).toContain("history stay connected to each property");
    expect(shell).not.toContain("contextItems.map");
    expect(shell).toContain("bg-[var(--auth-page-card-bg)]");
    expect(shell).toContain('markTone={visualSrc ? "light" : "auto"}');
    expect(shell).toContain("<ThemeToggle");
    expect(themeToggle).toContain('localStorage.setItem("nestory-theme"');
    expect(setup).not.toContain("After setup");
  });

  it("associates auth validation with the affected fields", () => {
    for (const path of [
      "src/features/auth/components/login-form.tsx",
      "src/features/auth/components/signup-form.tsx",
    ]) {
      const source = readSource(path);
      expect(source).toContain("aria-invalid");
      expect(source).toContain("aria-describedby");
    }
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

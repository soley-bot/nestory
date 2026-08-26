/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getPrivilegedEmailStepUpStatus,
  requireWorkspaceContext,
  routerRefresh,
} = vi.hoisted(() => ({
    getPrivilegedEmailStepUpStatus: vi.fn(),
    requireWorkspaceContext: vi.fn(),
    routerRefresh: vi.fn(),
  }));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));
vi.mock("@/lib/auth/context", () => ({ requireWorkspaceContext }));
vi.mock("@/features/auth/privileged-step-up", () => ({
  getPrivilegedEmailStepUpStatus,
  requestPrivilegedEmailStepUpAction: vi.fn(async () => ({})),
  verifyPrivilegedEmailStepUpAction: vi.fn(async () => ({})),
}));
vi.mock("@/components/observability/sentry-identity", () => ({
  SentryIdentity: () => null,
}));
vi.mock("@/components/theme-runtime", () => ({
  ThemeRuntime: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));

import DashboardLayout from "@/app/(dashboard)/layout";

const unverifiedStatus = {
  canRequestAt: null,
  email: "operator@example.com",
  enforcementEnabled: true,
  required: true,
  verified: false,
  verifiedUntil: null,
};

describe("DashboardLayout privileged email gate", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    getPrivilegedEmailStepUpStatus.mockReset();
    requireWorkspaceContext.mockReset();
    routerRefresh.mockReset();
    requireWorkspaceContext.mockResolvedValue({
      isSuperAdmin: true,
      organizationId: "752a87b8-bd04-4a45-9cb8-00687af66e73",
      organizationName: "Pilot",
      permissionKeys: new Set<string>(),
      role: "super_admin",
      roleKind: "super_admin",
      theme: { accentPreset: "neutral", mode: "system" },
      userEmail: "operator@example.com",
      userId: "b1000000-0000-0000-0000-000000000001",
    });
  });

  it("requires verification before rendering workspace forms for an unverified privileged session", async () => {
    getPrivilegedEmailStepUpStatus.mockResolvedValue(unverifiedStatus);

    render(
      await DashboardLayout({
        children: <div>Tenant and lease form</div>,
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Verify this session" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Email a code" })).not.toBeNull();
    expect(screen.getByText("Tenant and lease form")).not.toBeNull();
    expect(screen.getByTestId("workspace-content").hasAttribute("inert")).toBe(
      true,
    );
  });

  it("uses the database status as authority when a future privileged role is not in the UI hint", async () => {
    requireWorkspaceContext.mockResolvedValue({
      isSuperAdmin: false,
      organizationId: "752a87b8-bd04-4a45-9cb8-00687af66e73",
      organizationName: "Pilot",
      permissionKeys: new Set<string>(["people.read"]),
      role: "custom",
      roleKind: "custom",
      roleName: "Operations lead",
      theme: { accentPreset: "neutral", mode: "system" },
      userEmail: "operator@example.com",
      userId: "b1000000-0000-0000-0000-000000000001",
    });
    getPrivilegedEmailStepUpStatus.mockResolvedValue(unverifiedStatus);

    render(
      await DashboardLayout({
        children: <div>Tenant and lease form</div>,
      }),
    );

    expect(getPrivilegedEmailStepUpStatus).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Verify this session" }),
    ).not.toBeNull();
    expect(screen.getByText("Tenant and lease form")).not.toBeNull();
    expect(screen.getByTestId("workspace-content").hasAttribute("inert")).toBe(
      true,
    );
  });

  it.each([
    ["disabled enforcement", { ...unverifiedStatus, enforcementEnabled: false }],
    [
      "an active grant",
      { ...unverifiedStatus, verified: true },
    ],
  ])("renders workspace forms with %s", async (_label, status) => {
    getPrivilegedEmailStepUpStatus.mockResolvedValue(status);

    render(
      await DashboardLayout({
        children: <div>Tenant and lease form</div>,
      }),
    );

    expect(screen.getByText("Tenant and lease form")).not.toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Verify this session" }),
    ).toBeNull();
  });

  it("keeps Pilot available and retries when status is temporarily unavailable", async () => {
    vi.useFakeTimers();
    getPrivilegedEmailStepUpStatus.mockResolvedValue(null);

    render(
      await DashboardLayout({
        children: <div>Tenant and lease form</div>,
      }),
    );

    expect(screen.getByText("Tenant and lease form")).not.toBeNull();
    expect(screen.queryByText("Security verification unavailable")).toBeNull();

    await act(async () => vi.advanceTimersByTime(15_001));

    expect(routerRefresh).toHaveBeenCalledOnce();
  });

  it("preserves in-progress form data when refreshed status requires verification", async () => {
    getPrivilegedEmailStepUpStatus.mockResolvedValue({
      ...unverifiedStatus,
      verified: true,
    });
    const initialLayout = await DashboardLayout({
      children: (
        <label>
          Tenant name
          <input aria-label="Tenant name" defaultValue="" />
        </label>
      ),
    });
    const { rerender } = render(initialLayout);
    const tenantName = screen.getByLabelText("Tenant name") as HTMLInputElement;
    fireEvent.change(tenantName, { target: { value: "Real Pilot tenant" } });

    getPrivilegedEmailStepUpStatus.mockResolvedValue(unverifiedStatus);
    rerender(
      await DashboardLayout({
        children: (
          <label>
            Tenant name
            <input aria-label="Tenant name" defaultValue="" />
          </label>
        ),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Verify this session" }),
    ).not.toBeNull();
    expect(screen.getByLabelText("Tenant name")).toBe(tenantName);
    expect(tenantName.value).toBe("Real Pilot tenant");
    expect(screen.getByTestId("workspace-content").hasAttribute("inert")).toBe(
      true,
    );
  });

  it("refreshes a disabled-policy layout so a later rollout cannot stay stale", async () => {
    vi.useFakeTimers();
    getPrivilegedEmailStepUpStatus.mockResolvedValue({
      ...unverifiedStatus,
      enforcementEnabled: false,
    });

    render(
      await DashboardLayout({
        children: <div>Tenant and lease form</div>,
      }),
    );

    await act(async () => vi.advanceTimersByTime(60_001));

    expect(routerRefresh).toHaveBeenCalledOnce();
  });

  it("refreshes verified status periodically without using a grant-expiry timer", async () => {
    vi.useFakeTimers();
    getPrivilegedEmailStepUpStatus.mockResolvedValue({
      ...unverifiedStatus,
      verified: true,
    });

    render(
      await DashboardLayout({
        children: <div>Tenant and lease form</div>,
      }),
    );

    await act(async () => vi.advanceTimersByTime(60_001));

    expect(routerRefresh).toHaveBeenCalledOnce();
  });
});

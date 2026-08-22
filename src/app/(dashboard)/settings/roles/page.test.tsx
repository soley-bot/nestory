import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAccessSettingsData,
  getOrganizationRolesData,
  requireSuperAdminContext,
  screenSpy,
} = vi.hoisted(() => ({
  getAccessSettingsData: vi.fn(),
  getOrganizationRolesData: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  screenSpy: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireSuperAdminContext }));
vi.mock("@/features/organization/data", () => ({
  getAccessSettingsData,
  getOrganizationRolesData,
}));
vi.mock("@/features/organization/components/role-settings-screen", () => ({
  RoleSettingsScreen: (props: Record<string, unknown>) => {
    screenSpy(props);
    return <div>Role register</div>;
  },
}));
vi.mock("@/components/layout/settings-shell", () => ({
  SettingsShell: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));

import RolesSettingsPage from "./page";

describe("RolesSettingsPage", () => {
  beforeEach(() => {
    getAccessSettingsData.mockReset();
    getOrganizationRolesData.mockReset();
    requireSuperAdminContext.mockReset();
    screenSpy.mockReset();
    requireSuperAdminContext.mockResolvedValue({
      organizationId: "organization-1",
      role: "super_admin",
      userId: "user-1",
    });
    getOrganizationRolesData.mockResolvedValue([
      {
        assignedUserCount: 3,
        id: "role-1",
        name: "Caretaker",
        pendingInvitationCount: 1,
        permissions: ["maintenance.view"],
        status: "active",
        version: 2,
      },
    ]);
    getAccessSettingsData.mockResolvedValue({
      branches: [],
      invitations: [],
      members: [
        { id: "member-1", role: "super_admin" },
        { id: "member-2", role: "custom" },
        { id: "member-3", role: "super_admin" },
      ],
      staff: [],
    });
  });

  it("authorizes before loading the exact role register and admin count", async () => {
    const html = renderToStaticMarkup(await RolesSettingsPage());

    expect(html).toContain("Role register");
    expect(requireSuperAdminContext).toHaveBeenCalledOnce();
    expect(getOrganizationRolesData).toHaveBeenCalledWith("organization-1");
    expect(getAccessSettingsData).toHaveBeenCalledWith("organization-1");
    expect(screenSpy).toHaveBeenCalledWith({
      roles: [
        expect.objectContaining({
          assignedUserCount: 3,
          name: "Caretaker",
          permissions: ["maintenance.view"],
          status: "active",
        }),
      ],
      superAdminUserCount: 2,
    });
  });
});

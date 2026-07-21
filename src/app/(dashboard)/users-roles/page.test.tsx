import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAccessSettingsData, requireAdminContext, screenSpy } = vi.hoisted(() => ({
  getAccessSettingsData: vi.fn(),
  requireAdminContext: vi.fn(),
  screenSpy: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireAdminContext }));
vi.mock("@/features/organization/data", () => ({ getAccessSettingsData }));
vi.mock("@/features/organization/components/access-settings-screen", () => ({
  AccessSettingsScreen: (props: Record<string, unknown>) => {
    screenSpy(props);
    return <div>Access workspace</div>;
  },
}));

import UsersRolesPage from "@/app/(dashboard)/users-roles/page";

describe("UsersRolesPage", () => {
  beforeEach(() => {
    getAccessSettingsData.mockReset();
    requireAdminContext.mockReset();
    screenSpy.mockReset();
    requireAdminContext.mockResolvedValue({
      organizationId: "organization-1",
      role: "admin",
      userId: "user-1",
    });
    getAccessSettingsData.mockResolvedValue({ branches: [], invitations: [], members: [], staff: [] });
  });

  it("loads access data only after admin authorization and identifies the current user", async () => {
    const html = renderToStaticMarkup(
      await UsersRolesPage({ searchParams: Promise.resolve({ email: "new@example.com" }) }),
    );

    expect(html).toContain("Access workspace");
    expect(requireAdminContext).toHaveBeenCalledOnce();
    expect(getAccessSettingsData).toHaveBeenCalledWith("organization-1");
    expect(screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ currentUserId: "user-1", invitations: [] }),
    );
  });
});

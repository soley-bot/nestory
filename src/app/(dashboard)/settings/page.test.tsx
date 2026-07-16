import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getOrganizationSettingsData,
  requireAdminContext,
  requireWorkspaceContext,
} = vi.hoisted(() => ({
  getOrganizationSettingsData: vi.fn(),
  requireAdminContext: vi.fn(),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireAdminContext,
  requireWorkspaceContext,
}));

vi.mock("@/features/organization/data", () => ({
  getOrganizationSettingsData,
}));

vi.mock("@/features/organization/components/organization-settings-screen", () => ({
  OrganizationSettingsScreen: ({ section }: { section: string }) => (
    <div>Organization settings: {section}</div>
  ),
}));

import SettingsPage from "@/app/(dashboard)/settings/page";

describe("SettingsPage", () => {
  beforeEach(() => {
    getOrganizationSettingsData.mockReset();
    requireAdminContext.mockReset();
    requireWorkspaceContext.mockReset();

    const context = {
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      role: "admin",
      userId: "user-1",
    };
    requireAdminContext.mockResolvedValue(context);
    requireWorkspaceContext.mockResolvedValue(context);
    getOrganizationSettingsData.mockResolvedValue({
      branches: [],
      staff: [],
      teams: [],
    });
  });

  it.each([
    ["organization", "organization"],
    ["branches", "branches"],
    ["teams", "teams"],
    ["future", "organization"],
  ])("requires admin context and normalizes section %s", async (section, expected) => {
    const html = renderToStaticMarkup(
      await SettingsPage({
        searchParams: Promise.resolve({ section }),
      }),
    );

    expect(html).toContain(`Organization settings: ${expected}`);
    expect(requireAdminContext).toHaveBeenCalledOnce();
    expect(requireWorkspaceContext).not.toHaveBeenCalled();
  });
});

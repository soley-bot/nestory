import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
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
  OrganizationSettingsScreen: ({
    header,
    section,
  }: {
    header?: ReactNode;
    section: string;
  }) => (
    <div>
      {header}
      <div>Organization settings: {section}</div>
    </div>
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
    ["configuration", "configuration"],
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

  it("renders one Settings heading with section navigation in the same header", async () => {
    const html = renderToStaticMarkup(
      await SettingsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("<h1");
    expect(html).toContain("Settings</h1>");
    expect(html).toMatch(
      /<header[^>]*>[\s\S]*aria-label="Settings sections"[\s\S]*<\/header>/,
    );
    expect(requireAdminContext).toHaveBeenCalledOnce();
  });
});

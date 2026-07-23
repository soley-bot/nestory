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
    expect(html).toContain("Workspace Access");
    expect(requireAdminContext).toHaveBeenCalledOnce();
    expect(getAccessSettingsData).toHaveBeenCalledWith("organization-1");
    expect(screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUserId: "user-1",
        invitations: [],
        inviteDefaults: undefined,
      }),
    );
  });

  it("prefills only a current Staff record with its authoritative primary email", async () => {
    const personId = "80300000-0000-0000-0000-000000000005";
    const unrelatedMemberId = "77777777-7777-4777-8777-777777777777";
    getAccessSettingsData.mockResolvedValue({
      branches: [],
      invitations: [],
      members: [{
        branchId: null,
        email: "unrelated@example.com",
        id: unrelatedMemberId,
        personId: null,
        role: "member",
        userId: "88888888-8888-4888-8888-888888888888",
      }],
      staff: [{
        archived: false,
        description: "Staff · staff@example.com",
        id: personId,
        label: "Mara Chen",
        primaryEmail: "staff@example.com",
        roles: ["staff"],
      }],
    });

    renderToStaticMarkup(
      await UsersRolesPage({
        searchParams: Promise.resolve({
          email: "attacker@example.com",
          memberId: unrelatedMemberId,
          personId,
        }),
      }),
    );

    expect(screenSpy).toHaveBeenCalledWith(expect.objectContaining({
      inviteDefaults: {
        email: "staff@example.com",
        personId,
        staffEmail: "staff@example.com",
      },
      focusedInvitationId: undefined,
      focusedMemberId: undefined,
      requestedStaffId: personId,
    }));
  });

  it("focuses the server-derived existing invitation instead of opening a duplicate grant", async () => {
    const personId = "11111111-1111-4111-8111-111111111111";
    const invitationId = "22222222-2222-4222-8222-222222222222";
    getAccessSettingsData.mockResolvedValue({
      branches: [],
      invitations: [{
        branchId: null,
        email: "staff@example.com",
        expiresAt: "2026-07-30T12:00:00.000Z",
        id: invitationId,
        invitedAt: "2026-07-23T12:00:00.000Z",
        lastSentAt: "2026-07-23T12:01:00.000Z",
        personId,
        role: "member",
        status: "pending",
      }],
      members: [],
      staff: [{
        archived: false,
        description: "Staff · staff@example.com",
        id: personId,
        label: "Mara Chen",
        primaryEmail: "staff@example.com",
        roles: ["staff"],
      }],
    });

    renderToStaticMarkup(
      await UsersRolesPage({
        searchParams: Promise.resolve({
          invitationId: "33333333-3333-4333-8333-333333333333",
          personId,
        }),
      }),
    );

    expect(screenSpy).toHaveBeenCalledWith(expect.objectContaining({
      focusedInvitationId: invitationId,
      inviteDefaults: undefined,
      requestedStaffId: personId,
    }));
  });

  it("accepts only organization-loaded member and invitation focus IDs", async () => {
    const memberId = "44444444-4444-4444-8444-444444444444";
    getAccessSettingsData.mockResolvedValue({
      branches: [],
      invitations: [],
      members: [{
        branchId: null,
        email: "member@example.com",
        id: memberId,
        personId: null,
        role: "member",
        userId: "55555555-5555-4555-8555-555555555555",
      }],
      staff: [],
    });

    renderToStaticMarkup(
      await UsersRolesPage({
        searchParams: Promise.resolve({
          invitationId: "not-a-uuid",
          memberId,
          personId: "66666666-6666-4666-8666-666666666666",
        }),
      }),
    );

    expect(screenSpy).toHaveBeenCalledWith(expect.objectContaining({
      focusedInvitationId: undefined,
      focusedMemberId: memberId,
      inviteDefaults: undefined,
    }));
  });
});

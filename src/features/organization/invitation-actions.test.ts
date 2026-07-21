import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adminInvite,
  adminOtp,
  revalidatePath,
  requireAdminContext,
  rpc,
} = vi.hoisted(() => ({
  adminInvite: vi.fn(),
  adminOtp: vi.fn(),
  revalidatePath: vi.fn(),
  requireAdminContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requireAdminContext }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: () => ({ rpc }),
}));
vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: { inviteUserByEmail: adminInvite },
      signInWithOtp: adminOtp,
    },
  }),
}));

import {
  inviteOrganizationUserAction,
  removeMemberAccessAction,
  resendOrganizationInvitationAction,
  revokeOrganizationInvitationAction,
} from "@/features/organization/actions";

const invitationId = "11111111-1111-4111-8111-111111111111";

describe("organization invitation actions", () => {
  beforeEach(() => {
    adminInvite.mockReset();
    adminOtp.mockReset();
    revalidatePath.mockReset();
    requireAdminContext.mockReset();
    rpc.mockReset();
    requireAdminContext.mockResolvedValue({
      organizationId: "22222222-2222-4222-8222-222222222222",
      userId: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("keeps a new Auth user pending until acceptance", async () => {
    rpc
      .mockResolvedValueOnce({ data: invitationId, error: null })
      .mockResolvedValueOnce({ data: invitationId, error: null });
    adminInvite.mockResolvedValue({
      data: { user: { id: "44444444-4444-4444-8444-444444444444" } },
      error: null,
    });
    const formData = inviteForm();

    const result = await inviteOrganizationUserAction({}, formData);

    expect(rpc.mock.calls[0][0]).toBe("create_organization_invitation");
    expect(adminInvite).toHaveBeenCalledWith(
      "invitee@example.com",
      expect.objectContaining({
        redirectTo: expect.stringContaining("%2Faccept-invite%3Finvitation%3D"),
      }),
    );
    expect(rpc.mock.calls[1]).toEqual([
      "mark_organization_invitation_sent",
      {
        p_auth_user_id: "44444444-4444-4444-8444-444444444444",
        p_delivery_method: "invite",
        p_invitation_id: invitationId,
      },
    ]);
    expect(result).toEqual({ message: "Invitation sent.", status: "success" });
  });

  it("claims an existing Auth user with a non-creating magic link", async () => {
    rpc
      .mockResolvedValueOnce({ data: invitationId, error: null })
      .mockResolvedValueOnce({ data: invitationId, error: null });
    adminInvite.mockResolvedValue({
      data: { user: null },
      error: { code: "user_already_exists", message: "User already registered" },
    });
    adminOtp.mockResolvedValue({ error: null });

    const result = await inviteOrganizationUserAction({}, inviteForm());

    expect(adminOtp).toHaveBeenCalledWith({
      email: "invitee@example.com",
      options: expect.objectContaining({ shouldCreateUser: false }),
    });
    expect(rpc.mock.calls[1][1]).toEqual(
      expect.objectContaining({ p_delivery_method: "magic_link" }),
    );
    expect(result.status).toBe("success");
  });

  it("records delivery failure without creating active access", async () => {
    rpc
      .mockResolvedValueOnce({ data: invitationId, error: null })
      .mockResolvedValueOnce({ data: invitationId, error: null });
    adminInvite.mockResolvedValue({
      data: { user: null },
      error: { message: "SMTP unavailable" },
    });

    const result = await inviteOrganizationUserAction({}, inviteForm());

    expect(rpc.mock.calls[1][0]).toBe(
      "mark_organization_invitation_delivery_failed",
    );
    expect(result).toEqual({
      message: "Invitation saved, but email delivery failed. Retry from Pending invitations.",
      status: "error",
    });
  });

  it("refreshes and resends an invitation through the same delivery boundary", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ email: "invitee@example.com", invitation_id: invitationId }],
        error: null,
      })
      .mockResolvedValueOnce({ data: invitationId, error: null });
    adminInvite.mockResolvedValue({
      data: { user: { id: "44444444-4444-4444-8444-444444444444" } },
      error: null,
    });
    const formData = new FormData();
    formData.set("invitationId", invitationId);

    const result = await resendOrganizationInvitationAction({}, formData);

    expect(rpc.mock.calls[0][0]).toBe("refresh_organization_invitation");
    expect(adminInvite).toHaveBeenCalledOnce();
    expect(result).toEqual({ message: "Invitation resent.", status: "success" });
  });

  it("revalidates settings after refresh even when resend delivery fails", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ email: "invitee@example.com", invitation_id: invitationId }],
        error: null,
      })
      .mockResolvedValueOnce({ data: invitationId, error: null });
    adminInvite.mockResolvedValue({
      data: { user: null },
      error: { code: "over_email_send_rate_limit", message: "Rate limited" },
    });
    const formData = new FormData();
    formData.set("invitationId", invitationId);

    const result = await resendOrganizationInvitationAction({}, formData);

    expect(result).toEqual({
      message: "Invitation email could not be resent.",
      status: "error",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/users-roles");
  });

  it("revokes pending invitations and removes active membership separately", async () => {
    rpc.mockResolvedValue({ data: invitationId, error: null });
    const invitationForm = new FormData();
    invitationForm.set("invitationId", invitationId);
    const memberForm = new FormData();
    memberForm.set("memberId", invitationId);

    await revokeOrganizationInvitationAction({}, invitationForm);
    await removeMemberAccessAction({}, memberForm);

    expect(rpc.mock.calls[0][0]).toBe("revoke_organization_invitation");
    expect(rpc.mock.calls[1][0]).toBe("remove_organization_member_access");
  });
});

function inviteForm() {
  const formData = new FormData();
  formData.set("email", "invitee@example.com");
  formData.set("role", "member");
  formData.set("branchId", "");
  formData.set("personId", "");
  return formData;
}

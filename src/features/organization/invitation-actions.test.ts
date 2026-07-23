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
const personId = "55555555-5555-4555-8555-555555555555";

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
    expect(rpc.mock.calls[0][1]).toEqual(expect.objectContaining({
      p_email: "invitee@example.com",
      p_person_id: personId,
    }));
    expect(adminInvite).toHaveBeenCalledWith(
      "invitee@example.com",
      expect.objectContaining({
        redirectTo: expect.stringMatching(
          /^http:\/\/localhost:3000\/auth\/complete\?next=%2Faccept-invite%3Finvitation%3D/,
        ),
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
    expect(result).toEqual({
      message: "Invitation sent to invitee@example.com for the selected Staff record.",
      status: "success",
    });
  });

  it("claims an existing Auth user with a non-creating magic link", async () => {
    rpc
      .mockResolvedValueOnce({ data: invitationId, error: null })
      .mockResolvedValueOnce({ data: invitationId, error: null });
    adminInvite.mockResolvedValue({
      data: { user: null },
      error: {
        code: "email_exists",
        message: "A user with this email address has already been registered",
      },
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

  it("requires a valid Staff record for a new invitation", async () => {
    const formData = inviteForm();
    formData.set("personId", "");

    await expect(inviteOrganizationUserAction({}, formData)).resolves.toEqual({
      message: "Choose a valid Staff member, invitation email, and access level.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(adminInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["This staff member already has workspace access", "This Staff member already has workspace access. Review the existing member."],
    ["This staff member already has an active invitation", "This Staff member already has an active invitation. Review the existing invitation."],
    ["An active invitation already exists for this email", "That invitation email already has an active invitation."],
    ["Person not found", "Choose an active Staff member."],
  ])("maps bounded invitation RPC errors without provider details", async (databaseMessage, safeMessage) => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: databaseMessage } });

    await expect(inviteOrganizationUserAction({}, inviteForm())).resolves.toEqual({
      message: safeMessage,
      status: "error",
    });
    expect(adminInvite).not.toHaveBeenCalled();
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

  it.each(["email_exists", "user_already_exists"])(
    "keeps an invite-created Auth user on password onboarding when resend returns %s",
    async (errorCode) => {
      rpc
        .mockResolvedValueOnce({ data: invitationId, error: null })
        .mockResolvedValueOnce({ data: invitationId, error: null })
        .mockResolvedValueOnce({
          data: [{ email: "invitee@example.com", invitation_id: invitationId }],
          error: null,
        })
        .mockResolvedValueOnce({ data: invitationId, error: null });
      adminInvite
        .mockResolvedValueOnce({
          data: { user: { id: "44444444-4444-4444-8444-444444444444" } },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { user: null },
          error: {
            code: errorCode,
            message: "A user with this email address has already been registered",
          },
        });
      adminOtp.mockResolvedValue({ error: null });
      const resendFormData = new FormData();
      resendFormData.set("invitationId", invitationId);

      const inviteResult = await inviteOrganizationUserAction({}, inviteForm());
      const resendResult = await resendOrganizationInvitationAction(
        {},
        resendFormData,
      );

      expect(rpc.mock.calls[1]).toEqual([
        "mark_organization_invitation_sent",
        {
          p_auth_user_id: "44444444-4444-4444-8444-444444444444",
          p_delivery_method: "invite",
          p_invitation_id: invitationId,
        },
      ]);
      expect(adminOtp).toHaveBeenCalledWith({
        email: "invitee@example.com",
        options: expect.objectContaining({ shouldCreateUser: false }),
      });
      expect(rpc.mock.calls[3]).toEqual([
        "mark_organization_invitation_sent",
        {
          p_auth_user_id: null,
          p_delivery_method: "magic_link",
          p_invitation_id: invitationId,
        },
      ]);
      expect(inviteResult.status).toBe("success");
      expect(resendResult).toEqual({
        message: "Invitation resent.",
        status: "success",
      });
    },
  );

  it("returns bounded conflict guidance when an expired invitation cannot be reactivated", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "This staff member already has an active invitation" },
    });
    const formData = new FormData();
    formData.set("invitationId", invitationId);

    await expect(
      resendOrganizationInvitationAction({}, formData),
    ).resolves.toEqual({
      message: "This Staff member already has an active invitation. Review the existing invitation.",
      status: "error",
    });
    expect(adminInvite).not.toHaveBeenCalled();
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
    expect(revalidatePath).toHaveBeenCalledWith("/staff");
    expect(revalidatePath).toHaveBeenCalledWith("/people");
    expect(revalidatePath).toHaveBeenCalledWith("/people/[personId]", "page");
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
  formData.set("email", "  Invitee@Example.com  ");
  formData.set("role", "member");
  formData.set("branchId", "");
  formData.set("personId", personId);
  return formData;
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, redirect, rpc, updateUser } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(),
  rpc: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser, updateUser },
    rpc,
  }),
}));

import {
  acceptInvitationAction,
  getInvitationAcceptance,
} from "@/features/auth/invitation-acceptance";

const invitationId = "77777777-7777-4777-8777-777777777777";
const invitation = {
  expires_at: "2026-07-28T12:00:00.000Z",
  invitation_id: invitationId,
  invitation_status: "pending",
  invited_role: "admin",
  organization_name: "Harbor Property Group",
  password_required: true,
  scope_name: "All branches",
  staff_name: null,
};

describe("invitation acceptance", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockReset();
    rpc.mockReset();
    updateUser.mockReset();
    getUser.mockResolvedValue({
      data: { user: { email: "owner@example.com", id: "user-1" } },
      error: null,
    });
  });

  it("asks a signed-out recipient to open the email link or sign in", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(getInvitationAcceptance(invitationId)).resolves.toEqual({
      state: "signed_out",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not reveal invitation details to the wrong signed-in account", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(getInvitationAcceptance(invitationId)).resolves.toEqual({
      accountEmail: "owner@example.com",
      state: "unavailable",
    });
  });

  it("maps a valid invitation without exposing provider tokens", async () => {
    rpc.mockResolvedValue({ data: [invitation], error: null });

    await expect(getInvitationAcceptance(invitationId)).resolves.toEqual({
      accountEmail: "owner@example.com",
      expiresAt: invitation.expires_at,
      invitationId,
      organizationName: "Harbor Property Group",
      passwordRequired: true,
      role: "admin",
      scopeName: "All branches",
      staffName: null,
      state: "pending",
    });
  });

  it("requires and sets a password before accepting a new invited identity", async () => {
    rpc
      .mockResolvedValueOnce({ data: [invitation], error: null })
      .mockResolvedValueOnce({ data: "member-1", error: null });
    updateUser.mockResolvedValue({ error: null });
    redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    const formData = new FormData();
    formData.set("invitationId", invitationId);
    formData.set("password", "correct-horse-battery");
    formData.set("passwordConfirm", "correct-horse-battery");

    await expect(acceptInvitationAction({}, formData)).rejects.toThrow(
      "redirect:/workspace",
    );
    expect(updateUser).toHaveBeenCalledWith({ password: "correct-horse-battery" });
    expect(rpc).toHaveBeenLastCalledWith("accept_organization_invitation", {
      p_invitation_id: invitationId,
    });
  });

  it("accepts an existing identity without changing its password", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ ...invitation, password_required: false }],
        error: null,
      })
      .mockResolvedValueOnce({ data: "member-1", error: null });
    redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    const formData = new FormData();
    formData.set("invitationId", invitationId);

    await expect(acceptInvitationAction({}, formData)).rejects.toThrow(
      "redirect:/workspace",
    );
    expect(updateUser).not.toHaveBeenCalled();
  });
});

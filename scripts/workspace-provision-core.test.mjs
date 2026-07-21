import { describe, expect, it, vi } from "vitest";
import {
  parseProvisionArgs,
  provisionWorkspace,
  validateProvisionInput,
} from "./workspace-provision-core.mjs";

describe("workspace provisioning core", () => {
  it("parses the documented named arguments", () => {
    expect(
      parseProvisionArgs([
        "--name=Example PM",
        "--slug=example-pm",
        "--admin=Admin@Example.com",
      ]),
    ).toEqual({
      adminEmail: "Admin@Example.com",
      name: "Example PM",
      slug: "example-pm",
    });
  });

  it("normalizes and validates the provisioning input", () => {
    expect(
      validateProvisionInput({
        adminEmail: " Admin@Example.com ",
        name: " Example PM ",
        slug: "example-pm",
      }),
    ).toEqual({
      adminEmail: "admin@example.com",
      name: "Example PM",
      slug: "example-pm",
    });
    expect(() =>
      validateProvisionInput({
        adminEmail: "not-email",
        name: "X",
        slug: "www",
      }),
    ).toThrow("Company name must be between 2 and 120 characters");
  });

  it("provisions a pending first-admin invitation before sending Auth mail", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            invitation_id: "11111111-1111-4111-8111-111111111111",
            invitation_status: "pending",
            invited_email: "admin@example.com",
            organization_id: "22222222-2222-4222-8222-222222222222",
            organization_name: "Example PM",
            workspace_slug: "example-pm",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: { id: "33333333-3333-4333-8333-333333333333" } },
      error: null,
    });
    const signInWithOtp = vi.fn();

    const result = await provisionWorkspace({
      client: { auth: { admin: { inviteUserByEmail }, signInWithOtp }, rpc },
      input: {
        adminEmail: "admin@example.com",
        name: "Example PM",
        slug: "example-pm",
      },
      siteUrl: "http://localhost:3000",
    });

    expect(rpc.mock.calls[0][0]).toBe("provision_client_workspace");
    expect(inviteUserByEmail).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[1]).toEqual([
      "mark_organization_invitation_sent",
      {
        p_auth_user_id: "33333333-3333-4333-8333-333333333333",
        p_delivery_method: "invite",
        p_invitation_id: "11111111-1111-4111-8111-111111111111",
      },
    ]);
    expect(result.invitationState).toBe("pending");
    expect(result.deliveryMethod).toBe("invite");
  });

  it("uses a non-creating magic link for an existing confirmed Auth user", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            invitation_id: "11111111-1111-4111-8111-111111111111",
            invitation_status: "pending",
            invited_email: "admin@example.com",
            organization_id: "22222222-2222-4222-8222-222222222222",
            organization_name: "Example PM",
            workspace_slug: "example-pm",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email already exists" },
    });
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });

    const result = await provisionWorkspace({
      client: { auth: { admin: { inviteUserByEmail }, signInWithOtp }, rpc },
      input: {
        adminEmail: "admin@example.com",
        name: "Example PM",
        slug: "example-pm",
      },
      siteUrl: "http://localhost:3000",
    });

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "admin@example.com",
      options: expect.objectContaining({ shouldCreateUser: false }),
    });
    expect(result.deliveryMethod).toBe("magic_link");
  });

  it("marks delivery failure without activating membership", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            invitation_id: "11111111-1111-4111-8111-111111111111",
            invitation_status: "pending",
            invited_email: "admin@example.com",
            organization_id: "22222222-2222-4222-8222-222222222222",
            organization_name: "Example PM",
            workspace_slug: "example-pm",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "SMTP delivery unavailable" },
    });

    const result = await provisionWorkspace({
      client: {
        auth: {
          admin: { inviteUserByEmail },
          signInWithOtp: vi.fn().mockResolvedValue({
            error: { message: "SMTP delivery unavailable" },
          }),
        },
        rpc,
      },
      input: {
        adminEmail: "admin@example.com",
        name: "Example PM",
        slug: "example-pm",
      },
      siteUrl: "http://localhost:3000",
    });

    expect(rpc.mock.calls[1][0]).toBe(
      "mark_organization_invitation_delivery_failed",
    );
    expect(result.invitationState).toBe("send_failed");
  });
});

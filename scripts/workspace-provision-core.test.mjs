import { describe, expect, it, vi } from "vitest";
import {
  parseProvisionArgs,
  provisionWorkspace,
  validateProvisionInput,
} from "./workspace-provision-core.mjs";

describe("deferred provisioning delivery", () => {
  const input = { adminEmail: "admin@example.com", name: "Example PM", slug: "example-pm" };
  const provisioned = {
    invitation_id: "11111111-1111-4111-8111-111111111111",
    invited_email: input.adminEmail,
    organization_name: input.name,
    workspace_slug: input.slug,
  };
  const options = { input, siteUrl: "http://localhost:3000", deferEmail: true };

  it("accepts only the explicit bare defer flag", () => {
    expect(parseProvisionArgs(["--defer-email"]).deferEmail).toBe(true);
  });

  it.each([
    ["--defer-email=true"], ["--defer-email=false"], ["--defer-email=1"],
    ["--defer-email="], ["--defer-email", "false"],
    ["--defer-email", "--defer-email"], ["--deferEmail"],
  ])("rejects malformed flag arguments %j", (...args) => {
    expect(() => parseProvisionArgs(args)).toThrow("optional --defer-email");
  });

  it.each(["true", "false", 1, null])("rejects nonboolean deferEmail %j before any RPC", async (deferEmail) => {
    const rpc = vi.fn();
    await expect(provisionWorkspace({ ...options, client: { rpc }, deferEmail })).rejects.toThrow("must be a boolean");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stages pending records without even reading client.auth or marking sent", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [provisioned], error: null });
    const client = { rpc, get auth() { throw new Error("Auth must not be accessed"); } };
    const result = await provisionWorkspace({ ...options, client });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("provision_client_workspace", {
      p_admin_email: input.adminEmail, p_name: input.name, p_slug: input.slug,
    });
    expect(result).toMatchObject({ deliveryMethod: "deferred", invitationState: "pending", invitedEmail: input.adminEmail });
    expect(result.message).toContain("not delivered (one-hour expiry)");
    expect(result.message).toContain("not active");
    expect(result.message).toContain("not a dry run");
  });

  it("does not attempt invite or OTP delivery for an existing Auth user", async () => {
    const inviteUserByEmail = vi.fn().mockResolvedValue({ error: { code: "user_already_exists" } });
    const signInWithOtp = vi.fn();
    const rpc = vi.fn().mockResolvedValue({ data: [provisioned], error: null });
    await provisionWorkspace({ ...options, client: { rpc, auth: { admin: { inviteUserByEmail }, signInWithOtp } } });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("propagates provisioning errors without accessing Auth", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "Workspace conflict" } }),
      get auth() { throw new Error("Auth must not be accessed"); },
    };
    await expect(provisionWorkspace({ ...options, client })).rejects.toThrow("Workspace provisioning failed: Workspace conflict");
    expect(client.rpc).toHaveBeenCalledTimes(1);
    client.rpc.mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(provisionWorkspace({ ...options, client })).rejects.toThrow("RPC unavailable");
  });
});

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
      deferEmail: false,
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
    expect(inviteUserByEmail).toHaveBeenCalledWith("admin@example.com", {
      redirectTo:
        "http://localhost:3000/auth/complete?next=%2Faccept-invite%3Finvitation%3D11111111-1111-4111-8111-111111111111",
    });
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
      error: {
        code: "user_already_exists",
        message: "A user with this email already exists",
      },
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

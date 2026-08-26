import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/privileged-step-up-guard", () => ({
  requirePrivilegedStepUp: vi.fn(),
}));

const { revalidatePath, requireSuperAdminContext, rpc } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requireSuperAdminContext }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: () => ({ rpc }),
}));

import {
  archiveOrganizationRoleAction,
  duplicateOrganizationRoleAction,
  saveOrganizationRoleAction,
} from "@/features/organization/actions";

const organizationId = "11111111-1111-4111-8111-111111111111";
const roleId = "22222222-2222-4222-8222-222222222222";

describe("organization role actions", () => {
  beforeEach(() => {
    revalidatePath.mockReset();
    requireSuperAdminContext.mockReset();
    rpc.mockReset();
    requireSuperAdminContext.mockResolvedValue({ organizationId });
  });

  it("creates a named role and saves its normalized permission selection", async () => {
    rpc
      .mockResolvedValueOnce({ data: roleId, error: null })
      .mockResolvedValueOnce({
        data: {
          affectedUserCount: 0,
          permissionKeys: ["finance.view", "finance.record_payments"],
          status: "saved",
          version: 2,
        },
        error: null,
      });

    await expect(
      saveOrganizationRoleAction({
        confirmRemovals: false,
        expectedVersion: null,
        id: null,
        name: "Finance desk",
        permissions: ["finance.record_payments"],
      }),
    ).resolves.toMatchObject({
      kind: "saved",
      roleId,
      version: 2,
    });

    expect(rpc.mock.calls).toEqual([
      ["create_organization_role", { p_name: "Finance desk", p_organization_id: organizationId }],
      [
        "save_organization_role",
        {
          p_confirm_removals: false,
          p_expected_version: 1,
          p_name: "Finance desk",
          p_organization_id: organizationId,
          p_permission_keys: ["finance.view", "finance.record_payments"],
          p_role_id: roleId,
        },
      ],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/settings/roles");
  });

  it("returns the exact affected-user confirmation without saving", async () => {
    rpc.mockResolvedValueOnce({
      data: { affectedUserCount: 3, status: "confirmation_required", version: 7 },
      error: null,
    });

    await expect(
      saveOrganizationRoleAction({
        confirmRemovals: false,
        expectedVersion: 7,
        id: roleId,
        name: "Finance desk",
        permissions: ["finance.view"],
      }),
    ).resolves.toEqual({ affectedUserCount: 3, kind: "confirmation_required" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("turns an optimistic conflict into a reload result", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Role has changed. Reload and try again." },
    });

    await expect(
      saveOrganizationRoleAction({
        confirmRemovals: false,
        expectedVersion: 7,
        id: roleId,
        name: "Finance desk",
        permissions: ["finance.view"],
      }),
    ).resolves.toEqual({ kind: "stale" });
  });

  it("duplicates with a server-derived available name", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [
          { id: roleId, name: "Caretaker" },
          { id: "33333333-3333-4333-8333-333333333333", name: "Caretaker copy" },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: "44444444-4444-4444-8444-444444444444", error: null });

    await expect(duplicateOrganizationRoleAction(roleId)).resolves.toEqual({
      kind: "saved",
      roleId: "44444444-4444-4444-8444-444444444444",
    });
    expect(rpc.mock.calls[1]).toEqual([
      "duplicate_organization_role",
      {
        p_name: "Caretaker copy 2",
        p_organization_id: organizationId,
        p_role_id: roleId,
      },
    ]);
  });

  it("archives only the expected persisted version", async () => {
    rpc.mockResolvedValueOnce({ data: roleId, error: null });

    await expect(
      archiveOrganizationRoleAction({ expectedVersion: 7, id: roleId }),
    ).resolves.toEqual({ kind: "saved", roleId });
    expect(rpc).toHaveBeenCalledWith("archive_organization_role", {
      p_expected_version: 7,
      p_organization_id: organizationId,
      p_role_id: roleId,
    });
  });
});

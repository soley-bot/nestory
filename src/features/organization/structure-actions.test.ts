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
  archiveOrganizationBranchAction,
  archiveOrganizationTeamAction,
  restoreOrganizationBranchAction,
  restoreOrganizationTeamAction,
  updateOrganizationBranchAction,
  updateOrganizationTeamAction,
} from "@/features/organization/actions";

const organizationId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const teamId = "33333333-3333-4333-8333-333333333333";
const managerPersonId = "44444444-4444-4444-8444-444444444444";

describe("organization structure actions", () => {
  beforeEach(() => {
    revalidatePath.mockReset();
    requireSuperAdminContext.mockReset();
    rpc.mockReset();
    requireSuperAdminContext.mockResolvedValue({ organizationId });
  });

  it("updates a branch through the checked lifecycle RPC", async () => {
    rpc.mockResolvedValue({ data: branchId, error: null });

    await expect(
      updateOrganizationBranchAction({
        address: " 17 South Road ",
        code: " south ",
        id: branchId,
        name: " South Office ",
      }),
    ).resolves.toEqual({ kind: "saved", message: "Branch updated." });
    expect(rpc).toHaveBeenCalledWith("update_organization_branch", {
      p_address: "17 South Road",
      p_branch_id: branchId,
      p_code: "south",
      p_name: "South Office",
      p_organization_id: organizationId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/branches");
  });

  it.each([
    [archiveOrganizationBranchAction, "archive_organization_branch", "Branch archived."],
    [restoreOrganizationBranchAction, "restore_organization_branch", "Branch restored."],
  ] as const)("uses the checked branch lifecycle boundary", async (action, rpcName, message) => {
    rpc.mockResolvedValue({ data: branchId, error: null });

    await expect(action(branchId)).resolves.toEqual({ kind: "saved", message });
    expect(rpc).toHaveBeenCalledWith(rpcName, {
      p_branch_id: branchId,
      p_organization_id: organizationId,
    });
  });

  it("returns the named archive consequence without implementation wording", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Move or archive 2 active Properties before archiving this branch." },
    });

    await expect(archiveOrganizationBranchAction(branchId)).resolves.toEqual({
      kind: "error",
      message: "Move or archive 2 active Properties before archiving this branch.",
    });
  });

  it("updates a team through the checked lifecycle RPC", async () => {
    rpc.mockResolvedValue({ data: teamId, error: null });

    await expect(
      updateOrganizationTeamAction({
        branchId,
        id: teamId,
        managerPersonId,
        name: " Field Operations ",
      }),
    ).resolves.toEqual({ kind: "saved", message: "Team updated." });
    expect(rpc).toHaveBeenCalledWith("update_organization_team", {
      p_branch_id: branchId,
      p_manager_person_id: managerPersonId,
      p_name: "Field Operations",
      p_organization_id: organizationId,
      p_team_id: teamId,
    });
  });

  it.each([
    [archiveOrganizationTeamAction, "archive_organization_team", "Team archived."],
    [restoreOrganizationTeamAction, "restore_organization_team", "Team restored."],
  ] as const)("uses the checked team lifecycle boundary", async (action, rpcName, message) => {
    rpc.mockResolvedValue({ data: teamId, error: null });

    await expect(action(teamId)).resolves.toEqual({ kind: "saved", message });
    expect(rpc).toHaveBeenCalledWith(rpcName, {
      p_organization_id: organizationId,
      p_team_id: teamId,
    });
  });
});

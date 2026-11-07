/* @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  updateOrganizationBranchAction: vi.fn(), updateOrganizationTeamAction: vi.fn(),
  archiveOrganizationBranchAction: vi.fn(), archiveOrganizationTeamAction: vi.fn(),
  restoreOrganizationBranchAction: vi.fn(), restoreOrganizationTeamAction: vi.fn(),
}));
vi.mock("@/features/organization/actions", () => actions);
import { BranchManageDrawer, TeamManageDrawer } from "./structure-manage-drawers";

afterEach(() => { cleanup(); vi.resetAllMocks(); });
const branch = { id: "branch", name: "Main branch", code: "MAIN", address: null, status: "active" };
const team = { id: "team", name: "Operations", branchId: null, managerPersonId: null, status: "active" };

describe("structure action recovery", () => {
  it.each(["branch", "team"] as const)("preserves the %s draft and unlocks dismissal after an interrupted update", async (kind) => {
    const user = userEvent.setup();
    const action = kind === "branch" ? actions.updateOrganizationBranchAction : actions.updateOrganizationTeamAction;
    action.mockRejectedValueOnce(new Error("Synthetic response loss"));
    if (kind === "branch") render(<BranchManageDrawer branch={branch} canManageStructure onClose={vi.fn()} open />);
    else render(<TeamManageDrawer activeBranches={[]} team={team} staff={[]} canManageStructure onClose={vi.fn()} open />);
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Updated name");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/could not confirm whether the change was saved/)).toBeTruthy();
    expect(name).toHaveProperty("value", "Updated name");
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Reload workspace" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
  });

  it.each(["branch", "team"] as const)("reports interrupted %s archiving instead of remaining busy", async (kind) => {
    const user = userEvent.setup();
    const action = kind === "branch" ? actions.archiveOrganizationBranchAction : actions.archiveOrganizationTeamAction;
    action.mockRejectedValueOnce(new Error("Synthetic response loss"));
    if (kind === "branch") render(<BranchManageDrawer branch={branch} canManageStructure onClose={vi.fn()} open />);
    else render(<TeamManageDrawer activeBranches={[]} team={team} staff={[]} canManageStructure onClose={vi.fn()} open />);
    await user.click(screen.getByRole("button", { name: `Archive ${kind}` }));
    expect(await screen.findByText(/could not confirm whether the change was saved/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload workspace" })).toBeTruthy();
  });
});

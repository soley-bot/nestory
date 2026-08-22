/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { archiveRole, duplicateRole, refresh, saveRole } = vi.hoisted(() => ({
  archiveRole: vi.fn(),
  duplicateRole: vi.fn(),
  refresh: vi.fn(),
  saveRole: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/organization/actions", () => ({
  archiveOrganizationRoleAction: archiveRole,
  duplicateOrganizationRoleAction: duplicateRole,
  saveOrganizationRoleAction: saveRole,
}));

import { RoleSettingsScreen } from "./role-settings-screen";

const role = {
  assignedUserCount: 0,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Caretaker",
  pendingInvitationCount: 0,
  permissions: ["maintenance.view" as const],
  status: "active" as const,
  version: 4,
};

beforeEach(() => {
  archiveRole.mockReset();
  duplicateRole.mockReset();
  refresh.mockReset();
  saveRole.mockReset();
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(cleanup);

describe("RoleSettingsScreen", () => {
  it("opens the exact persisted role from the dense register", async () => {
    const user = userEvent.setup();
    render(<RoleSettingsScreen roles={[role]} superAdminUserCount={2} />);

    await user.click(screen.getByRole("button", { name: "Manage Caretaker" }));

    expect(screen.getByRole("dialog", { name: "Caretaker" })).toBeTruthy();
    const maintenance = screen.getByRole("group", { name: "Maintenance" });
    expect(
      within(maintenance)
        .getByRole("checkbox", { name: "View" })
        .getAttribute("data-state"),
    ).toBe("checked");
  });

  it("keeps the editor open and offers reload after a save conflict", async () => {
    const user = userEvent.setup();
    saveRole.mockResolvedValue({ kind: "stale" });
    render(<RoleSettingsScreen roles={[role]} superAdminUserCount={2} />);

    await user.click(screen.getByRole("button", { name: "Manage Caretaker" }));
    const name = screen.getByRole("textbox", { name: "Role name" });
    await user.type(name, " team");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("This role changed elsewhere. Reload before saving.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("reconciles the register when refreshed server data arrives", () => {
    const { rerender } = render(
      <RoleSettingsScreen roles={[role]} superAdminUserCount={2} />,
    );

    rerender(
      <RoleSettingsScreen
        roles={[
          role,
          {
            ...role,
            id: "33333333-3333-4333-8333-333333333333",
            name: "Caretaker copy",
            version: 1,
          },
        ]}
        superAdminUserCount={2}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Manage Caretaker copy" }),
    ).toBeTruthy();
  });

  it("shows register duplicate errors in the affected role editor", async () => {
    const user = userEvent.setup();
    duplicateRole.mockResolvedValue({
      kind: "error",
      message: "That role name is already in use.",
    });
    render(<RoleSettingsScreen roles={[role]} superAdminUserCount={2} />);

    await user.click(screen.getByRole("button", { name: "Duplicate Caretaker" }));

    expect(await screen.findByRole("dialog", { name: "Caretaker" })).toBeTruthy();
    expect(screen.getByText("That role name is already in use.")).toBeTruthy();
  });
});

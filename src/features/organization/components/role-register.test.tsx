/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoleRegister } from "./role-register";

const roles = [
  {
    assignedUserCount: 2,
    id: "role-finance",
    name: "Finance Manager",
    pendingInvitationCount: 1,
    status: "active" as const,
    version: 7,
  },
  {
    assignedUserCount: 0,
    id: "role-operations",
    name: "Former Operations",
    pendingInvitationCount: 0,
    status: "archived" as const,
    version: 3,
  },
];

afterEach(cleanup);

describe("RoleRegister", () => {
  it("keeps protected Super Admin first and renders dense role facts", () => {
    render(
      <RoleRegister
        onDuplicateRole={vi.fn()}
        onManageRole={vi.fn()}
        onNewRole={vi.fn()}
        roles={roles}
        superAdminUserCount={3}
      />,
    );

    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Super Admin")).toBeTruthy();
    expect(within(rows[1]).getByText("3 users")).toBeTruthy();
    expect(within(rows[1]).getByText("Protected")).toBeTruthy();
    expect(within(rows[1]).queryByRole("button")).toBeNull();

    expect(within(rows[2]).getByText("Finance Manager")).toBeTruthy();
    expect(within(rows[2]).getByText("2 users")).toBeTruthy();
    expect(within(rows[2]).getByText("1 pending invitation")).toBeTruthy();
    expect(within(rows[2]).getByText("Active")).toBeTruthy();
    expect(within(rows[3]).getByText("Former Operations")).toBeTruthy();
    expect(within(rows[3]).getByText("Archived")).toBeTruthy();
    expect(within(rows[3]).queryByText(/version/i)).toBeNull();
  });

  it("exposes one New role action and compact custom-role actions", async () => {
    const user = userEvent.setup();
    const onDuplicateRole = vi.fn();
    const onManageRole = vi.fn();
    const onNewRole = vi.fn();
    render(
      <RoleRegister
        onDuplicateRole={onDuplicateRole}
        onManageRole={onManageRole}
        onNewRole={onNewRole}
        roles={roles}
        superAdminUserCount={3}
      />,
    );

    expect(screen.getAllByRole("button", { name: "New role" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "New role" }));
    await user.click(
      screen.getByRole("button", { name: "Manage Finance Manager" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Duplicate Finance Manager" }),
    );

    expect(onNewRole).toHaveBeenCalledOnce();
    expect(onManageRole).toHaveBeenCalledWith(roles[0]);
    expect(onDuplicateRole).toHaveBeenCalledWith(roles[0]);
  });

  it("uses the exact register columns without catalogue or implementation copy", () => {
    const { container } = render(
      <RoleRegister
        onDuplicateRole={vi.fn()}
        onManageRole={vi.fn()}
        onNewRole={vi.fn()}
        roles={roles}
        superAdminUserCount={3}
      />,
    );

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Role", "Assigned users", "Status", "Actions"]);
    expect(container.textContent).not.toMatch(/RLS|RPC|permission key/i);
  });

  it("makes an empty custom-role register explicit", () => {
    render(
      <RoleRegister
        onDuplicateRole={vi.fn()}
        onManageRole={vi.fn()}
        onNewRole={vi.fn()}
        roles={[]}
        superAdminUserCount={1}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "No custom roles yet",
    );
  });
});

/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OrganizationStaffOption } from "@/features/organization/data";
import { AccessRegister } from "./access-register";
import type { AccessRegisterView } from "./access-register-model";

const branch = {
  address: null,
  code: "BKK",
  id: "branch-bangkok",
  name: "Bangkok",
  status: "active",
};

const mina = {
  activeStaff: true,
  archived: false,
  description: "Staff - mina@example.com",
  id: "staff-mina",
  label: "Mina Chen",
  primaryEmail: "mina@example.com",
  roles: ["staff" as const],
};

const admin = {
  activeStaff: true,
  archived: false,
  description: "Staff - admin@example.com",
  id: "staff-admin",
  label: "Admin Staff",
  primaryEmail: "admin@example.com",
  roles: ["staff" as const],
};

const members = [
  {
    branchId: null,
    email: "admin@example.com",
    id: "member-admin",
    personId: admin.id,
    role: "super_admin" as const,
    userId: "user-admin",
  },
  {
    branchId: branch.id,
    email: "mina.signin@example.com",
    id: "member-mina",
    personId: mina.id,
    role: "operations_manager" as const,
    userId: "user-mina",
  },
];

const invitation = {
  branchId: branch.id,
  email: "pending@example.com",
  expiresAt: "2099-08-20T12:00:00.000Z",
  id: "invitation-pending",
  invitedAt: "2026-08-11T12:00:00.000Z",
  lastSentAt: "2026-08-11T12:01:00.000Z",
  personId: null,
  role: "operations_member" as const,
  status: "pending" as const,
};

afterEach(cleanup);

function RegisterHarness({
  initialView = "active",
  noAccessStaff = [mina],
  onGrantStaff = vi.fn(),
}: {
  initialView?: AccessRegisterView;
  noAccessStaff?: OrganizationStaffOption[];
  onGrantStaff?: (person: OrganizationStaffOption) => void;
}) {
  const [view, setView] = useState<AccessRegisterView>(initialView);

  return (
    <AccessRegister
      activeView={view}
      branches={[branch]}
      invitations={[invitation]}
      members={members}
      noAccessStaff={noAccessStaff}
      onGrantStaff={onGrantStaff}
      onViewChange={setView}
      people={[admin, mina]}
      renderInvitationRow={(record) => (
        <tbody key={record.id}>
          <tr>
            <td>{record.email}</td>
          </tr>
        </tbody>
      )}
      renderMemberRow={(member) => (
        <tbody key={member.id}>
          <tr>
            <td>{member.personId === mina.id ? mina.label : admin.label}</td>
            <td>{member.email}</td>
          </tr>
        </tbody>
      )}
    />
  );
}

describe("AccessRegister", () => {
  it("renders one lifecycle register with exactly three views", () => {
    render(<RegisterHarness />);

    const register = screen.getByTestId("access-register");
    expect(
      within(register).getByRole("tab", { name: "Active2" }).getAttribute("data-state"),
    ).toBe("active");
    expect(within(register).getByRole("tab", { name: "Invitations1" })).toBeTruthy();
    expect(within(register).getByRole("tab", { name: "No access1" })).toBeTruthy();
    expect(within(register).queryByRole("tab", { name: /Revoked/ })).toBeNull();
  });

  it("keeps search visible and filters the selected view", async () => {
    const user = userEvent.setup();
    render(<RegisterHarness />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search workspace access" }),
      "mina",
    );

    expect(screen.getByText("Mina Chen")).toBeTruthy();
    expect(screen.queryByText("Admin Staff")).toBeNull();
  });

  it("switches views without rendering separate page cards", async () => {
    const user = userEvent.setup();
    render(<RegisterHarness />);

    await user.click(screen.getByRole("tab", { name: "Invitations1" }));

    expect(screen.getByText("pending@example.com")).toBeTruthy();
    expect(screen.queryByText("Mina Chen")).toBeNull();
    expect(screen.getAllByTestId("access-register")).toHaveLength(1);
  });

  it("opens the unified flow from a No access row", async () => {
    const user = userEvent.setup();
    const onGrantStaff = vi.fn();
    render(
      <RegisterHarness initialView="no_access" onGrantStaff={onGrantStaff} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Add access for Mina Chen" }),
    );

    expect(onGrantStaff).toHaveBeenCalledWith(mina);
  });

  it("uses a concise filtered empty state", async () => {
    const user = userEvent.setup();
    render(<RegisterHarness />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search workspace access" }),
      "not present",
    );

    expect(screen.getByText("No matching active access")).toBeTruthy();
  });
});

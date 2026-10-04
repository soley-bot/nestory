/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  addAccess,
  createStaff,
  removeAccess,
  resendInvite,
  revokeInvite,
  signOut,
  updateAccess,
} = vi.hoisted(() => ({
  addAccess: vi.fn(),
  createStaff: vi.fn(),
  removeAccess: vi.fn(),
  resendInvite: vi.fn(),
  revokeInvite: vi.fn(),
  signOut: vi.fn(),
  updateAccess: vi.fn(),
}));

vi.mock("@/features/auth/actions", () => ({ signOutAction: signOut }));
vi.mock("@/features/people/actions", () => ({ createPersonAction: createStaff }));
vi.mock("@/features/organization/actions", () => ({
  inviteOrganizationUserAction: addAccess,
  removeMemberAccessAction: removeAccess,
  resendOrganizationInvitationAction: resendInvite,
  revokeOrganizationInvitationAction: revokeInvite,
  updateMemberAccessAction: updateAccess,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { AccessSettingsScreen } from "./access-settings-screen";

const branch = {
  address: "12 River Road",
  code: "BKK",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Bangkok",
  status: "active",
};

const person = {
  activeStaff: true,
  archived: false,
  description: "Staff - mina@example.com",
  id: "22222222-2222-4222-8222-222222222222",
  label: "Mina Chen",
  primaryEmail: "mina@example.com",
  roles: ["staff" as const],
};

const adminPerson = {
  ...person,
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  label: "Admin Staff",
  primaryEmail: "admin@example.com",
};

const admin = {
  branchId: null,
  email: "admin@example.com",
  id: "33333333-3333-4333-8333-333333333333",
  personId: adminPerson.id,
  role: "super_admin" as const,
  userId: "44444444-4444-4444-8444-444444444444",
};

const customRole = {
  assignedUserCount: 0,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Branch operator",
  pendingInvitationCount: 0,
  permissions: ["maintenance.view" as const],
  status: "active" as const,
  version: 1,
};

const pendingInvitation = {
  branchId: branch.id,
  email: "pending@example.com",
  expiresAt: "2099-07-30T12:00:00.000Z",
  id: "77777777-7777-4777-8777-777777777777",
  invitedAt: "2026-07-21T11:00:00.000Z",
  lastSentAt: "2026-07-21T11:01:00.000Z",
  personId: person.id,
  role: "operations_member" as const,
  status: "pending" as const,
};

beforeEach(() => {
  addAccess.mockReset().mockResolvedValue({ message: "Invitation sent.", status: "success" });
  createStaff.mockReset().mockResolvedValue({ personId: "new-staff", roles: ["staff"], status: "success" });
  removeAccess.mockReset().mockResolvedValue({ message: "Access removed.", status: "success" });
  resendInvite.mockReset().mockResolvedValue({ message: "Invitation resent.", status: "success" });
  revokeInvite.mockReset().mockResolvedValue({ message: "Invitation revoked.", status: "success" });
  signOut.mockReset().mockResolvedValue(undefined);
  updateAccess.mockReset().mockResolvedValue({ message: "Access updated.", status: "success" });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderScreen({
  branches = [branch],
  currentUserId,
  invitations = [],
  members = [admin],
  people = [person, adminPerson],
  roles = [customRole],
}: {
  branches?: ComponentProps<typeof AccessSettingsScreen>["branches"];
  currentUserId?: string;
  invitations?: ComponentProps<typeof AccessSettingsScreen>["invitations"];
  members?: ComponentProps<typeof AccessSettingsScreen>["members"];
  people?: ComponentProps<typeof AccessSettingsScreen>["people"];
  roles?: ComponentProps<typeof AccessSettingsScreen>["roles"];
} = {}) {
  return render(
    <AccessSettingsScreen
      branches={branches}
      currentUserId={currentUserId}
      invitations={invitations}
      members={members}
      people={people}
      role="super_admin"
      roles={roles}
      staff={people}
    />,
  );
}

function getExpandedMember(id: string) {
  const member = screen.getByTestId(`access-member-${id}`);
  const manage = within(member).queryByRole("button", { name: "Manage" });
  if (manage) fireEvent.click(manage);
  return member;
}

describe("AccessSettingsScreen protected access rows", () => {
  const operator = {
    ...admin,
    branchId: branch.id,
    customRoleId: customRole.id,
    customRoleName: customRole.name,
    id: "99999999-9999-4999-8999-999999999999",
    personId: person.id,
    role: "custom" as const,
  };
  const sibling = { ...branch, id: "88888888-8888-4888-8888-888888888888", name: "Chiang Mai" };
  const third = { ...branch, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Phuket" };
  const assignmentProps = {
    branches: [branch, sibling, third],
    members: [admin, operator],
    people: [person, adminPerson],
    role: "super_admin" as const,
    roles: [customRole],
  };

  async function chooseBranch(user: ReturnType<typeof userEvent.setup>, member: HTMLElement, target: typeof branch) {
    await user.click(within(member).getByRole("combobox", { name: "Access scope" }));
    await user.click(screen.getByRole("option", { name: `${target.code} - ${target.name}` }));
  }

  async function discardAssignment(user: ReturnType<typeof userEvent.setup>, member: HTMLElement) {
    await user.click(within(member).getByRole("button", { name: "Discard" }));
    await user.click(within(member).getByRole("button", { name: "Discard changes" }));
  }

  it("shows a successful save as current immediately while refresh is delayed", async () => {
    const user = userEvent.setup();
    let completeSave!: (result: { status: "success"; message: string }) => void;
    updateAccess.mockImplementationOnce(() => new Promise((resolve) => { completeSave = resolve; }));
    const view = render(<AccessSettingsScreen {...assignmentProps} />);
    const member = getExpandedMember(operator.id);
    await chooseBranch(user, member, sibling);
    await user.click(within(member).getByRole("button", { name: "Save access" }));
    expect(within(member).getByRole("region", { name: "Proposed assignment" })).toBeTruthy();
    vi.useFakeTimers();
    await act(async () => { completeSave({ status: "success", message: "Access updated." }); });
    expect(within(member).getByText("Access updated.")).toBeTruthy();
    expect(within(member).queryByRole("region", { name: "Proposed assignment" })).toBeNull();
    expect(within(within(member).getByRole("region", { name: "Current assignment" })).getByText("Chiang Mai only")).toBeTruthy();
    view.rerender(<AccessSettingsScreen {...assignmentProps} members={[admin, { ...operator }]} />);
    expect(within(within(member).getByRole("region", { name: "Current assignment" })).getByText("Chiang Mai only")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(4_500); });
    vi.useRealTimers();
    expect(within(member).getByRole("region", { name: "Current assignment" })).toBeTruthy();
    await chooseBranch(user, member, branch);
    await discardAssignment(user, member);
    expect(within(within(member).getByRole("region", { name: "Current assignment" })).getByText("Chiang Mai only")).toBeTruthy();
    expect(updateAccess).toHaveBeenCalledOnce();
  });

  it.each(["rejected", "thrown"])("keeps a %s save proposed, restores its baseline and permits retry", async (failure) => {
    const user = userEvent.setup();
    if (failure === "thrown") updateAccess.mockRejectedValueOnce(new Error("Synthetic failure"));
    else updateAccess.mockResolvedValueOnce({ status: "error", message: "Synthetic failure" });
    render(<AccessSettingsScreen {...assignmentProps} />);
    const member = getExpandedMember(operator.id);
    await chooseBranch(user, member, sibling);
    await user.click(within(member).getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(within(member).getByText(failure === "thrown" ? "Access could not be saved." : "Synthetic failure")).toBeTruthy());
    expect(within(within(member).getByRole("region", { name: "Proposed assignment" })).getByText("Chiang Mai only")).toBeTruthy();
    await discardAssignment(user, member);
    expect(within(within(member).getByRole("region", { name: "Current assignment" })).getByText("Bangkok only")).toBeTruthy();
    await chooseBranch(user, member, sibling);
    await user.click(within(member).getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(within(within(member).getByRole("region", { name: "Current assignment" })).getByText("Chiang Mai only")).toBeTruthy());
    expect(updateAccess).toHaveBeenCalledTimes(2);
  });

  it("adopts refreshed assignments when clean and uses them as the discard baseline", async () => {
    const user = userEvent.setup();
    const view = render(<AccessSettingsScreen {...assignmentProps} />);
    const member = getExpandedMember(operator.id);
    view.rerender(<AccessSettingsScreen {...assignmentProps} members={[admin, { ...operator, branchId: sibling.id }]} />);
    expect(within(within(member).getByRole("region", { name: "Current assignment" })).getByText("Chiang Mai only")).toBeTruthy();
    await chooseBranch(user, member, third);
    await discardAssignment(user, member);
    expect(within(within(member).getByRole("region", { name: "Current assignment" })).getByText("Chiang Mai only")).toBeTruthy();
    expect(updateAccess).not.toHaveBeenCalled();
  });

  it("preserves unsaved edits across refreshed props and discards to the refreshed baseline", async () => {
    const user = userEvent.setup();
    const view = render(<AccessSettingsScreen {...assignmentProps} />);
    const member = getExpandedMember(operator.id);
    await chooseBranch(user, member, sibling);
    view.rerender(<AccessSettingsScreen {...assignmentProps} members={[admin, { ...operator, branchId: third.id }]} />);
    expect(within(within(member).getByRole("region", { name: "Proposed assignment" })).getByText("Chiang Mai only")).toBeTruthy();
    await discardAssignment(user, member);
    expect(within(within(member).getByRole("region", { name: "Current assignment" })).getByText("Phuket only")).toBeTruthy();
    expect(updateAccess).not.toHaveBeenCalled();
  });

  it("shows the assigned role permissions and one branch before any edits", () => {
    renderScreen({ members: [admin, operator] });
    const panel = within(getExpandedMember(operator.id)).getByRole("region", { name: "Current assignment" });
    expect(within(panel).getByText(customRole.name)).toBeTruthy();
    expect(within(panel).getByText(`${branch.name} only`)).toBeTruthy();
    expect(within(panel).getByText("Maintenance")).toBeTruthy();
    expect(within(panel).getByText("View")).toBeTruthy();
    expect(within(panel).queryByText("Create & assign")).toBeNull();
    expect(within(panel).queryByText("Finance")).toBeNull();
    expect(within(panel).queryByText(/All branches/)).toBeNull();
    expect(updateAccess).not.toHaveBeenCalled();
  });

  it.each([
    { name: "missing role", roles: [], branches: [branch], message: "Role permissions could not be confirmed." },
    { name: "archived role", roles: [{ ...customRole, status: "archived" as const }], branches: [branch], message: "This role is archived. Ordinary access is unavailable." },
    { name: "empty role", roles: [{ ...customRole, permissions: [] }], branches: [branch], message: "This role has no permissions. Ordinary access is unavailable." },
    { name: "inactive branch", roles: [customRole], branches: [{ ...branch, status: "inactive" }], message: "An active assigned branch is required for ordinary access." },
  ])("explains $name without claiming full access", ({ roles, branches, message }) => {
    renderScreen({ branches, members: [admin, operator], roles });
    const panel = within(getExpandedMember(operator.id)).getByRole("region", { name: "Current assignment" });
    expect(within(panel).getByText(message)).toBeTruthy();
    expect(within(panel).queryByText("Full access within this company")).toBeNull();
    expect(updateAccess).not.toHaveBeenCalled();
  });

  it("distinguishes unsaved assignment changes from granted access", async () => {
    const user = userEvent.setup();
    const sibling = { ...branch, id: "88888888-8888-4888-8888-888888888888", name: "Chiang Mai" };
    renderScreen({ branches: [branch, sibling], members: [admin, operator] });
    const member = getExpandedMember(operator.id);
    await user.click(within(member).getByRole("combobox", { name: "Access scope" }));
    await user.click(screen.getByRole("option", { name: `${sibling.code} - ${sibling.name}` }));
    const panel = within(member).getByRole("region", { name: "Proposed assignment" });
    expect(within(panel).getByText("Chiang Mai only")).toBeTruthy();
    expect(within(panel).getByText("Changes take effect only after Save access succeeds.")).toBeTruthy();
    expect(updateAccess).not.toHaveBeenCalled();
  });

  it("explains that an invitation has not granted access", async () => {
    const user = userEvent.setup();
    renderScreen({ invitations: [pendingInvitation] });
    await user.click(screen.getByRole("tab", { name: "Invitations1" }));
    expect(screen.getByText("This invitation grants access only after it is accepted.")).toBeTruthy();
    expect(addAccess).not.toHaveBeenCalled();
  });

  it("explains company-only offboarding and preserved Staff history", () => {
    renderScreen({ members: [admin, operator] });
    const member = getExpandedMember(operator.id);
    fireEvent.click(within(member).getByRole("button", { name: "Remove access" }));
    expect(within(member).getByText(/lose access to this company immediately.*Staff record and its history will be kept/)).toBeTruthy();
    expect(removeAccess).not.toHaveBeenCalled();
  });

  it("explains the access boundary before showing the register", () => {
    renderScreen();

    expect(screen.getByRole("heading", { name: "Workspace access" })).toBeTruthy();
    expect(
      screen.getByText(
        "Sign-in, role, and branches.",
      ),
    ).toBeTruthy();
  });

  it("exposes the authoritative last-admin protection", () => {
    renderScreen({ people: [adminPerson] });

    const member = getExpandedMember(admin.id);
    expect(
      (within(member).getByRole("button", { name: "Save access" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(within(member).getByText("Last Super Admin")).toBeTruthy();
    expect(
      within(member).getByText(/add another Super Admin before reducing this role/i),
    ).toBeTruthy();
  });

  it("links an unlinked Operations account through the guarded update", async () => {
    const user = userEvent.setup();
    const unlinkedMember = {
      ...admin,
      branchId: branch.id,
      email: "unlinked@example.com",
      id: "99999999-9999-4999-8999-999999999999",
      personId: null,
      customRoleId: customRole.id,
      customRoleName: customRole.name,
      role: "custom" as const,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    renderScreen({ members: [admin, unlinkedMember] });
    const member = getExpandedMember(unlinkedMember.id);

    await user.click(within(member).getByRole("combobox", { name: "Linked staff record" }));
    await user.click(screen.getByRole("option", { name: /Mina Chen/ }));
    await user.click(within(member).getByRole("button", { name: "Link staff record" }));

    await waitFor(() => expect(updateAccess).toHaveBeenCalledOnce());
    expect(
      Object.fromEntries((updateAccess.mock.calls[0][1] as FormData).entries()),
    ).toMatchObject({ memberId: unlinkedMember.id, personId: person.id });
  });

  it("submits the exact member access boundary when another admin remains", async () => {
    const user = userEvent.setup();
    const otherAdmin = {
      ...admin,
      email: "other@example.com",
      id: "55555555-5555-4555-8555-555555555555",
      userId: "66666666-6666-4666-8666-666666666666",
    };
    renderScreen({ members: [admin, otherAdmin] });
    const member = getExpandedMember(admin.id);

    await user.click(within(member).getByRole("combobox", { name: "Access level" }));
    await user.click(screen.getByRole("option", { name: customRole.name }));
    fireEvent.click(within(member).getByRole("button", { name: "Save access" }));

    await waitFor(() => expect(updateAccess).toHaveBeenCalledOnce());
    expect(
      Object.fromEntries((updateAccess.mock.calls[0][1] as FormData).entries()),
    ).toEqual({
      branchId: branch.id,
      customRoleId: customRole.id,
      memberId: admin.id,
      personId: adminPerson.id,
      roleKind: "custom",
    });
  });

  it("signs out after removing the current administrator's own access", async () => {
    const user = userEvent.setup();
    const otherAdmin = {
      ...admin,
      id: "55555555-5555-4555-8555-555555555555",
      userId: "66666666-6666-4666-8666-666666666666",
    };
    renderScreen({ currentUserId: admin.userId, members: [admin, otherAdmin] });
    const member = getExpandedMember(admin.id);

    await user.click(within(member).getByRole("button", { name: "Remove access" }));
    await user.click(
      within(member).getByRole("button", { name: "Confirm remove access" }),
    );

    await waitFor(() => expect(removeAccess).toHaveBeenCalledOnce());
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(
      Object.fromEntries((removeAccess.mock.calls[0][1] as FormData).entries()),
    ).toEqual({ memberId: admin.id });
  });

  it("keeps invitation resend and revoke recoverable in the Invitations view", async () => {
    const user = userEvent.setup();
    renderScreen({ invitations: [pendingInvitation] });
    await user.click(screen.getByRole("tab", { name: "Invitations1" }));
    const invitation = screen.getByTestId(`access-invitation-${pendingInvitation.id}`);

    await user.click(within(invitation).getByRole("button", { name: "Resend" }));
    await waitFor(() => expect(resendInvite).toHaveBeenCalledOnce());
    await user.click(within(invitation).getByRole("button", { name: "Revoke" }));
    await user.click(within(invitation).getByRole("button", { name: "Revoke invitation" }));

    await waitFor(() => expect(revokeInvite).toHaveBeenCalledOnce());
  });

  it("asks before discarding a dirty member row", async () => {
    const user = userEvent.setup();
    const otherAdmin = {
      ...admin,
      id: "55555555-5555-4555-8555-555555555555",
      userId: "66666666-6666-4666-8666-666666666666",
    };
    renderScreen({ members: [admin, otherAdmin] });
    const member = getExpandedMember(admin.id);

    await user.click(within(member).getByRole("combobox", { name: "Access level" }));
    await user.click(screen.getByRole("option", { name: customRole.name }));
    await user.click(within(member).getByRole("button", { name: /Close/ }));

    const dialog = within(member).getByRole("alertdialog");
    expect(within(dialog).getByText("Discard unsaved access changes?")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Discard and close" }));
    await waitFor(() =>
      expect(within(member).queryByRole("combobox", { name: "Access level" })).toBeNull(),
    );
    expect(updateAccess).not.toHaveBeenCalled();
  });
});

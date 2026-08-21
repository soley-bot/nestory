/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  vi.unstubAllGlobals();
});

function renderScreen({
  currentUserId,
  invitations = [],
  members = [admin],
  people = [person, adminPerson],
}: {
  currentUserId?: string;
  invitations?: ComponentProps<typeof AccessSettingsScreen>["invitations"];
  members?: ComponentProps<typeof AccessSettingsScreen>["members"];
  people?: ComponentProps<typeof AccessSettingsScreen>["people"];
} = {}) {
  return render(
    <AccessSettingsScreen
      branches={[branch]}
      currentUserId={currentUserId}
      invitations={invitations}
      members={members}
      people={people}
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
  it("explains the access boundary before showing the register", () => {
    renderScreen();

    expect(screen.getByRole("heading", { name: "Workspace access" })).toBeTruthy();
    expect(
      screen.getByText(
        "Sign-in, role, and branch scope.",
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
      role: "operations_member" as const,
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
    await user.click(screen.getByRole("option", { name: "Operations Manager" }));
    fireEvent.click(within(member).getByRole("button", { name: "Save access" }));

    await waitFor(() => expect(updateAccess).toHaveBeenCalledOnce());
    expect(
      Object.fromEntries((updateAccess.mock.calls[0][1] as FormData).entries()),
    ).toEqual({
      branchId: branch.id,
      memberId: admin.id,
      personId: adminPerson.id,
      role: "operations_manager",
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
    await user.click(screen.getByRole("option", { name: "Finance Manager" }));
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

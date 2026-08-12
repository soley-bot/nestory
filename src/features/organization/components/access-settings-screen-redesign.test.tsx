/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addAccess, createStaff, removeAccess, resendInvite, revokeInvite, signOut, updateAccess } = vi.hoisted(() => ({
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
  address: null,
  code: "BKK",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Bangkok",
  status: "active",
};
const noAccess = {
  activeStaff: true,
  archived: false,
  description: "Staff - mina@example.com",
  id: "22222222-2222-4222-8222-222222222222",
  label: "Mina Chen",
  primaryEmail: "mina@example.com",
  roles: ["staff" as const],
};
const adminPerson = {
  ...noAccess,
  id: "33333333-3333-4333-8333-333333333333",
  label: "Admin Staff",
  primaryEmail: "admin@example.com",
};
const admin = {
  branchId: null,
  email: "admin@example.com",
  id: "44444444-4444-4444-8444-444444444444",
  personId: adminPerson.id,
  role: "super_admin" as const,
  userId: "55555555-5555-4555-8555-555555555555",
};
const invitation = {
  branchId: branch.id,
  email: "pending@example.com",
  expiresAt: "2099-08-20T12:00:00.000Z",
  id: "66666666-6666-4666-8666-666666666666",
  invitedAt: "2026-08-11T12:00:00.000Z",
  lastSentAt: "2026-08-11T12:01:00.000Z",
  personId: null,
  role: "operations_member" as const,
  status: "pending" as const,
};

beforeEach(() => {
  addAccess.mockResolvedValue({ message: "Invitation sent.", status: "success" });
  createStaff.mockResolvedValue({ personId: "new-staff", roles: ["staff"], status: "success" });
  removeAccess.mockResolvedValue({ message: "Access removed.", status: "success" });
  resendInvite.mockResolvedValue({ message: "Invitation resent.", status: "success" });
  revokeInvite.mockResolvedValue({ message: "Invitation revoked.", status: "success" });
  updateAccess.mockResolvedValue({ message: "Access updated.", status: "success" });
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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderScreen(overrides: Partial<React.ComponentProps<typeof AccessSettingsScreen>> = {}) {
  return render(
    <AccessSettingsScreen
      branches={[branch]}
      currentUserId={admin.userId}
      invitations={[invitation]}
      members={[admin]}
      people={[adminPerson, noAccess]}
      staff={[adminPerson, noAccess]}
      {...overrides}
    />,
  );
}

describe("AccessSettingsScreen redesigned orchestration", () => {
  it("renders one compact Workspace access header and one primary action", () => {
    renderScreen();

    expect(screen.getByRole("heading", { name: "Workspace access" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Add member" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Add Staff" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Invite Staff" })).toBeNull();
    expect(screen.getByTestId("access-register")).toBeTruthy();
  });

  it("opens the same Add member dialog from the page and No access row", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("tab", { name: "No access1" }));
    await user.click(screen.getByRole("button", { name: "Add access for Mina Chen" }));

    const dialog = screen.getByRole("dialog", { name: "Add member" });
    expect((screen.getByLabelText("Invitation email") as HTMLInputElement).value).toBe(
      "mina@example.com",
    );
    expect(dialog).toBeTruthy();
  });

  it("opens Invitations before focusing a deep-linked invitation", async () => {
    renderScreen({ focusedInvitationId: invitation.id });

    expect(screen.getByRole("tab", { name: "Invitations1" }).getAttribute("data-state")).toBe(
      "active",
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByTestId(`access-invitation-${invitation.id}`),
      ),
    );
  });

  it("opens a deep-linked no-access Staff record directly in Add member", () => {
    renderScreen({
      inviteDefaults: {
        email: noAccess.primaryEmail,
        personId: noAccess.id,
        staffEmail: noAccess.primaryEmail,
      },
      requestedStaffId: noAccess.id,
    });

    expect(screen.getByRole("dialog", { name: "Add member" })).toBeTruthy();
    expect((screen.getByLabelText("Invitation email") as HTMLInputElement).value).toBe(
      noAccess.primaryEmail,
    );
  });

  it("guards settings navigation while the Add member draft is dirty", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole("button", { name: "Add member" }));
    await user.type(screen.getByLabelText("Invitation email"), "draft@example.com");

    fireEvent.click(
      screen.getByRole("link", { hidden: true, name: "Organization" }),
    );

    expect(
      screen.getByRole("dialog", { hidden: true, name: "Open Organization?" }),
    ).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Add member" })).toBeTruthy();
  });
});

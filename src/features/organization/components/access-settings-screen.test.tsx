/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  addAccess,
  removeAccess,
  resendInvite,
  revokeInvite,
  signOut,
  updateAccess,
} = vi.hoisted(() => ({
  addAccess: vi.fn(),
  removeAccess: vi.fn(),
  resendInvite: vi.fn(),
  revokeInvite: vi.fn(),
  signOut: vi.fn(),
  updateAccess: vi.fn(),
}));

vi.mock("@/features/auth/actions", () => ({ signOutAction: signOut }));

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

import { AccessSettingsScreen } from "@/features/organization/components/access-settings-screen";

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
  description: "Staff · mina@example.com",
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

const expiredInvitation = {
  ...pendingInvitation,
  email: "expired@example.com",
  expiresAt: "2026-07-20T12:00:00.000Z",
  id: "88888888-8888-4888-8888-888888888888",
  status: "expired" as const,
};

beforeEach(() => {
  addAccess.mockReset();
  removeAccess.mockReset();
  resendInvite.mockReset();
  revokeInvite.mockReset();
  signOut.mockReset();
  updateAccess.mockReset();
  addAccess.mockResolvedValue({
    status: "success",
    message: "Invitation sent.",
  });
  removeAccess.mockResolvedValue({
    status: "success",
    message: "Access removed.",
  });
  resendInvite.mockResolvedValue({
    status: "success",
    message: "Invitation resent.",
  });
  revokeInvite.mockResolvedValue({
    status: "success",
    message: "Invitation revoked.",
  });
  updateAccess.mockResolvedValue({
    status: "success",
    message: "Access updated.",
  });
  signOut.mockResolvedValue(undefined);
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
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

function getInviteForm() {
  const existing = screen.queryByTestId("add-access-form");
  if (existing) {
    return existing;
  }

  fireEvent.click(screen.getByRole("button", { name: "Invite Staff" }));
  return within(
    screen.getByRole("dialog", { name: "Invite Staff" }),
  ).getByTestId("add-access-form");
}

function getExpandedMember(id: string) {
  const member = screen.getByTestId(`access-member-${id}`);
  const manage = within(member).queryByRole("button", { name: "Manage" });
  if (manage) fireEvent.click(manage);
  return member;
}

describe("AccessSettingsScreen", () => {
  it("renders one access surface with Shadcn-style groups for Needs access, Pending, and Active", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );

    const surface = screen.getByTestId("access-surface");
    expect(surface.className).not.toContain("xl:grid-cols");
    // Pending has nothing in it, so it does not take up the page at all.
    expect(
      within(surface)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Needs access", "Active"]);
    expect(screen.queryByTestId("access-pending-group")).toBeNull();
    for (const group of ["needs", "active"]) {
      const section = screen.getByTestId(`access-${group}-group`);
      expect(section.className).toContain("rounded-xl");
      expect(section.className).toContain("bg-card");
      expect(section.className).toContain("ring-1");
    }
    expect(screen.queryByTestId("add-access-form")).toBeNull();
    expect(screen.getByRole("button", { name: "Invite Staff" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Add Staff" }).getAttribute("href"),
    ).toBe("/staff?action=create");
    expect(
      screen
        .getByRole("link", { name: "Grant workspace access for Mina Chen" })
        .getAttribute("href"),
    ).toBe(`/users-roles?personId=${person.id}`);
    // The heading names what is counted, so the badge is only the number.
    expect(screen.queryByText(/active account/)).toBeNull();
    expect(
      within(screen.getByTestId("access-active-group")).getByText("1"),
    ).toBeTruthy();
    expect(screen.queryByText(/Full workspace access, settings/i)).toBeNull();
    expect(within(surface).getByRole("button", { name: "Manage" })).toBeTruthy();
    expect(
      within(surface).queryByRole("region", { name: "Access effect" }),
    ).toBeNull();
  });

  it("opens Invite Staff in the shared drawer with one full-width action surface", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );

    const form = getInviteForm();
    const drawer = screen.getByRole("dialog", { name: "Invite Staff" });
    const actionBar = within(form).getByTestId("draft-action-bar");

    expect(
      drawer.querySelector("[data-slot='drawer-content']")?.contains(form),
    ).toBe(true);
    expect(drawer.querySelector("[data-slot='drawer-footer']")).toBeNull();
    expect(actionBar.parentElement?.className).toContain("w-full");
  });

  it("auto-opens Invite Staff for a no-access person deep link", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: person.primaryEmail,
          personId: person.id,
          staffEmail: person.primaryEmail,
        }}
        members={[admin]}
        people={[person, adminPerson]}
        requestedStaffId={person.id}
      />,
    );

    const drawer = screen.getByRole("dialog", { name: "Invite Staff" });
    expect(
      (within(drawer).getByLabelText("Invitation email") as HTMLInputElement)
        .value,
    ).toBe(person.primaryEmail);
  });

  it.each(["close button", "Escape", "backdrop"])(
    "guards a dirty invite drawer on %s and restores the Invite Staff trigger",
    async (dismissal) => {
      const user = userEvent.setup();
      render(
        <AccessSettingsScreen
          branches={[branch]}
          members={[admin]}
          people={[person, adminPerson]}
        />,
      );

      const trigger = screen.getByRole("button", { name: "Invite Staff" });
      await user.click(trigger);
      const drawer = screen.getByRole("dialog", { name: "Invite Staff" });
      fireEvent.change(within(drawer).getByLabelText("Invitation email"), {
        target: { value: "new@example.com" },
      });

      if (dismissal === "close button") {
        await user.click(
          within(drawer).getByRole("button", { name: "Close drawer" }),
        );
      } else if (dismissal === "Escape") {
        fireEvent.keyDown(document, { key: "Escape" });
      } else {
        const backdrop = document.querySelector<HTMLElement>(
          "[data-slot='sheet-overlay']",
        );
        expect(backdrop).not.toBeNull();
        fireEvent.pointerDown(backdrop!, { button: 0, ctrlKey: false });
        fireEvent.click(backdrop!);
      }

      const confirmation = screen.getByRole("alertdialog", {
        name: "Discard unsaved changes?",
      });
      await user.click(
        within(confirmation).getByRole("button", { name: "Discard changes" }),
      );
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Invite Staff" }),
        ).toBeNull();
      });
      expect(document.activeElement).toBe(trigger);
    },
  );

  it("shows effective scope and staff linkage beside each member", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );

    const member = getExpandedMember(admin.id);
    expect(within(member).getAllByText("Super Admin").length).toBeGreaterThan(0);
    expect(within(member).getAllByText("All branches").length).toBeGreaterThan(0);
    expect(
      within(member).getByRole("combobox", { name: "Access scope" })
        .textContent,
    ).toContain("All branches");
    expect(within(member).getAllByText("Not required").length).toBeGreaterThan(0);
  });

  it("preserves a focused active-member deep link without opening Invite Staff", async () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        focusedMemberId={admin.id}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );

    const member = getExpandedMember(admin.id);
    await waitFor(() => expect(document.activeElement).toBe(member));
    expect(screen.queryByRole("dialog", { name: "Invite Staff" })).toBeNull();
  });

  it("keeps pending invitations separate with resend and revoke actions", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        invitations={[pendingInvitation]}
        members={[admin]}
        people={[person]}
      />,
    );

    const invitation = screen.getByTestId(
      `access-invitation-${pendingInvitation.id}`,
    );
    expect(within(invitation).getByText("pending@example.com")).toBeTruthy();
    expect(within(invitation).getByText("Pending invitation")).toBeTruthy();
    expect(within(invitation).getByText("Bangkok")).toBeTruthy();
    expect(within(invitation).getByText("Mina Chen")).toBeTruthy();

    await user.click(
      within(invitation).getByRole("button", { name: "Resend" }),
    );
    expect(resendInvite).toHaveBeenCalledOnce();
    await user.click(
      within(invitation).getByRole("button", { name: "Revoke" }),
    );
    const revokeDialog = within(invitation).getByRole("alertdialog", {
      name: "Revoke this invitation?",
    });
    expect(revokeDialog.textContent).toContain(
      "The invitation link will stop working immediately.",
    );
    expect(document.activeElement).toBe(
      within(revokeDialog).getByRole("button", { name: "Keep invitation" }),
    );
    await user.click(
      within(revokeDialog).getByRole("button", { name: "Keep invitation" }),
    );
    expect(document.activeElement).toBe(
      within(invitation).getByRole("button", { name: "Revoke" }),
    );
    await user.click(
      within(invitation).getByRole("button", { name: "Revoke" }),
    );
    await user.click(
      within(invitation).getByRole("button", { name: "Revoke invitation" }),
    );
    expect(revokeInvite).toHaveBeenCalledOnce();
  });

  it("keeps materialized expired invitations recoverable through resend or revoke", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        invitations={[expiredInvitation]}
        members={[admin]}
        people={[person]}
      />,
    );

    const invitation = screen.getByTestId(
      `access-invitation-${expiredInvitation.id}`,
    );
    expect(within(invitation).getByText("Invitation expired")).toBeTruthy();

    await user.click(
      within(invitation).getByRole("button", { name: "Resend" }),
    );
    expect(resendInvite).toHaveBeenCalledOnce();

    await user.click(
      within(invitation).getByRole("button", { name: "Revoke" }),
    );
    await user.click(
      within(invitation).getByRole("button", { name: "Revoke invitation" }),
    );
    expect(revokeInvite).toHaveBeenCalledOnce();
  });

  it("starts clean and exposes the authoritative last-admin protection", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );

    const member = getExpandedMember(admin.id);
    expect(
      (
        within(member).getByRole("button", {
          name: "Save access",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(within(member).getByText("Last Super Admin")).toBeTruthy();
    expect(
      within(member).getByText(
        /add another Super Admin before reducing this role/i,
      ),
    ).toBeTruthy();
  });

  it("uses visible form labels and one primary add action", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );

    const addForm = getInviteForm();
    expect(
      within(addForm).getByRole("combobox", { name: "Staff member" }),
    ).toBeTruthy();
    expect(within(addForm).getByLabelText("Invitation email")).toBeTruthy();
    expect(within(addForm).getAllByText("Access level").length).toBeGreaterThan(
      0,
    );
    expect(within(addForm).getAllByText("Access scope").length).toBeGreaterThan(
      0,
    );
    // Labelled controls carry their own meaning; the form ships no standing
    // hint text restating what each field is for.
    expect(
      within(addForm).queryByText(/The employee or contractor/),
    ).toBeNull();
    expect(
      within(addForm).queryByText(/The address used to sign in/),
    ).toBeNull();
    expect(
      within(addForm).queryByText(/may administer in Nestory/),
    ).toBeNull();
    expect(
      within(addForm).queryByText(/branch or property context/),
    ).toBeNull();
    expect(
      within(addForm).queryByText(/controls sign-in permissions/),
    ).toBeNull();
    const formCopy = addForm.textContent ?? "";
    expect(formCopy.indexOf("Staff member")).toBeLessThan(
      formCopy.indexOf("Invitation email"),
    );
    expect(formCopy.indexOf("Invitation email")).toBeLessThan(
      formCopy.indexOf("Access level"),
    );
    expect(formCopy.indexOf("Access level")).toBeLessThan(
      formCopy.indexOf("Access scope"),
    );
    expect(
      (
        within(addForm).getByRole("button", {
          name: "Send invitation",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      within(addForm)
        .getByRole("region", { name: "Access effect" })
        .compareDocumentPosition(
          within(addForm).getByRole("button", { name: "Send invitation" }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("offers the five fixed workspace roles", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );

    const addForm = getInviteForm();
    await user.click(
      within(addForm).getByRole("combobox", { name: "Access level" }),
    );

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([
      "Super Admin",
      "Finance Manager",
      "Finance Member",
      "Operations Manager",
      "Operations Member",
    ]);
  });

  it("submits finance access organization-wide without a Staff link", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: "finance@example.com" }}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );

    const addForm = getInviteForm();
    await user.click(
      within(addForm).getByRole("combobox", { name: "Access level" }),
    );
    await user.click(screen.getByRole("option", { name: "Finance Manager" }));

    expect(
      (
        within(addForm).getByRole("combobox", {
          name: "Staff member",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        within(addForm).getByRole("combobox", {
          name: "Access scope",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await user.click(
      within(addForm).getByRole("button", { name: "Send invitation" }),
    );
    await waitFor(() => expect(addAccess).toHaveBeenCalledOnce());
    expect(
      Object.fromEntries((addAccess.mock.calls[0][1] as FormData).entries()),
    ).toMatchObject({
      branchId: "",
      email: "finance@example.com",
      personId: "",
      role: "finance_manager",
    });
  });

  it("keeps a trusted invite handoff actionable without retyping", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: "mina@example.com",
          personId: person.id,
          staffEmail: "mina@example.com",
        }}
        members={[admin]}
        people={[person]}
      />,
    );

    const addForm = getInviteForm();
    expect(
      (within(addForm).getByLabelText("Invitation email") as HTMLInputElement)
        .value,
    ).toBe("mina@example.com");
    expect(
      (
        within(addForm).getByRole("button", {
          name: "Send invitation",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("resets trusted invite defaults when client navigation selects different Staff", async () => {
    const secondPerson = {
      ...person,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      label: "Nadia Wong",
      primaryEmail: "nadia@example.com",
    };
    const view = render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: person.primaryEmail,
          personId: person.id,
          staffEmail: person.primaryEmail,
        }}
        members={[admin]}
        people={[person, secondPerson]}
        requestedStaffId={person.id}
      />,
    );
    let addForm = getInviteForm();
    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "edited@example.com" },
    });

    view.rerender(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: secondPerson.primaryEmail,
          personId: secondPerson.id,
          staffEmail: secondPerson.primaryEmail,
        }}
        members={[admin]}
        people={[person, secondPerson]}
        requestedStaffId={secondPerson.id}
      />,
    );

    addForm = getInviteForm();
    expect(
      (within(addForm).getByLabelText("Invitation email") as HTMLInputElement)
        .value,
    ).toBe("nadia@example.com");
    expect(
      within(addForm).getByRole("region", { name: "Access effect" })
        .textContent,
    ).toContain("Nadia Wong");

    addAccess.mockResolvedValueOnce({
      status: "error",
      message: "Invitation could not be sent.",
    });
    fireEvent.click(
      within(addForm).getByRole("button", { name: "Send invitation" }),
    );
    await waitFor(() =>
      expect(
        within(addForm).getByText("Invitation could not be sent."),
      ).toBeTruthy(),
    );

    view.rerender(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: secondPerson.primaryEmail,
          personId: secondPerson.id,
          staffEmail: secondPerson.primaryEmail,
        }}
        members={[admin]}
        people={[person, secondPerson]}
        requestedStaffId={secondPerson.id}
      />,
    );

    expect(
      within(getInviteForm()).getByText("Invitation could not be sent."),
    ).toBeTruthy();
  });

  it("closes a persisted invitation whose email delivery failed and reopens clean", async () => {
    const user = userEvent.setup();
    addAccess.mockResolvedValueOnce({
      status: "error",
      message:
        "Invitation saved, but email delivery failed. Retry from Pending invitations.",
    });
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );

    let addForm = getInviteForm();
    await user.click(
      within(addForm).getByRole("combobox", { name: "Staff member" }),
    );
    await user.click(screen.getByRole("option", { name: /Mina Chen/ }));
    await user.click(
      within(addForm).getByRole("button", { name: "Send invitation" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Invite Staff" })).toBeNull();
    });
    expect(addAccess).toHaveBeenCalledOnce();

    addForm = getInviteForm();
    expect(
      (within(addForm).getByLabelText("Invitation email") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      (
        within(addForm).getByRole("button", {
          name: "Send invitation",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("discards a trusted invite handoff back to an empty access draft", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: "mina@example.com",
          personId: person.id,
          staffEmail: "mina@example.com",
        }}
        members={[admin]}
        people={[person]}
      />,
    );

    const addForm = getInviteForm();
    await user.click(within(addForm).getByRole("button", { name: "Discard" }));
    await user.click(
      within(addForm).getByRole("button", { name: "Discard changes" }),
    );

    expect(
      (within(addForm).getByLabelText("Invitation email") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      (
        within(addForm).getByRole("button", {
          name: "Send invitation",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("keeps an edited sign-in email separate from the selected Staff record", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: "mina@example.com",
          personId: person.id,
          staffEmail: "mina@example.com",
        }}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );
    const addForm = getInviteForm();

    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "signin@example.com" },
    });

    expect(
      within(addForm).getByText("Not Mina Chen's Staff email."),
    ).toBeTruthy();
    expect(
      within(addForm).getByText("Mina Chen's Staff role is unchanged."),
    ).toBeTruthy();
    expect(
      (
        within(addForm).getByRole("combobox", {
          name: "Staff member",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(within(addForm).getAllByText("Mina Chen").length).toBeGreaterThan(0);
  });

  it("clears the prior email when the newly selected Staff record has no primary email", async () => {
    const user = userEvent.setup();
    const noEmailStaff = {
      ...person,
      description: "Staff",
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      label: "No Email Staff",
      primaryEmail: null,
    };
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: person.primaryEmail,
          personId: person.id,
          staffEmail: person.primaryEmail,
        }}
        members={[admin]}
        people={[person, noEmailStaff]}
      />,
    );
    const addForm = getInviteForm();
    await user.click(
      within(addForm).getByRole("combobox", { name: "Staff member" }),
    );
    await user.click(screen.getByRole("option", { name: /No Email Staff/ }));

    expect(
      (within(addForm).getByLabelText("Invitation email") as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("clears and disables branch and Staff scope for Super Admin invitations", async () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: "mina@example.com",
          personId: person.id,
          staffEmail: "mina@example.com",
        }}
        members={[]}
        people={[person]}
      />,
    );
    const addForm = getInviteForm();
    fireEvent.click(
      within(addForm).getByRole("combobox", { name: "Access scope" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "BKK - Bangkok" }));
    fireEvent.click(
      within(addForm).getByRole("combobox", { name: "Access level" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Super Admin" }));

    expect(
      (
        within(addForm).getByRole("combobox", {
          name: "Access scope",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.submit(addForm);
    await waitFor(() => expect(addAccess).toHaveBeenCalledOnce());
    expect(
      Object.fromEntries((addAccess.mock.calls[0][1] as FormData).entries()),
    ).toMatchObject({
      branchId: "",
      personId: "",
      role: "super_admin",
    });
  });

  it("closes the invite drawer before focusing the matching duplicate invitation", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        focusedInvitationId={pendingInvitation.id}
        invitations={[pendingInvitation]}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = getInviteForm();
    await user.click(
      within(addForm).getByRole("combobox", { name: "Staff member" }),
    );
    await user.click(screen.getByRole("option", { name: /Mina Chen/ }));

    expect(
      within(addForm).getByText(
        "This Staff member already has a pending invitation.",
      ),
    ).toBeTruthy();
    await user.click(
      within(addForm).getByRole("button", { name: "Review invitation" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Invite Staff" })).toBeNull();
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByTestId(`access-invitation-${pendingInvitation.id}`),
      ),
    );
    expect(addAccess).not.toHaveBeenCalled();
  });

  it("closes the invite drawer before focusing matching active access", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );

    const addForm = getInviteForm();
    await user.click(
      within(addForm).getByRole("combobox", { name: "Staff member" }),
    );
    await user.click(screen.getByRole("option", { name: /Admin Staff/ }));
    expect(
      within(addForm).getByText(
        "This Staff member already has workspace access.",
      ),
    ).toBeTruthy();

    await user.click(
      within(addForm).getByRole("button", { name: "Review access" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Invite Staff" })).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByTestId(`access-member-${admin.id}`),
      );
    });
    expect(addAccess).not.toHaveBeenCalled();
  });

  it("keeps failed invitation feedback safe and operational", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        invitations={[
          { ...pendingInvitation, lastSentAt: null, status: "send_failed" },
        ]}
        members={[admin]}
        people={[person]}
      />,
    );
    const invitation = screen.getByTestId(
      `access-invitation-${pendingInvitation.id}`,
    );
    expect(within(invitation).getByText("Invitation failed")).toBeTruthy();
    expect(
      within(invitation).getByText("Created, but not delivered."),
    ).toBeTruthy();
    expect(within(invitation).getByText("Not sent")).toBeTruthy();
  });

  it("shows each active Staff option once and excludes non-Staff or archived records", async () => {
    const user = userEvent.setup();
    const tenantOnly = {
      activeStaff: false,
      archived: false,
      description: "Tenant · tenant@example.com",
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      label: "Tenant Only",
      primaryEmail: "tenant@example.com",
      roles: ["tenant" as const],
    };
    const archivedStaff = {
      ...person,
      archived: true,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      label: "Archived Staff",
    };
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[
          person,
          {
            ...person,
            description: "Staff, Tenant · mina@example.com",
            roles: ["staff", "tenant"],
          },
          tenantOnly,
          archivedStaff,
        ]}
      />,
    );
    const addForm = getInviteForm();
    await user.click(
      within(addForm).getByRole("combobox", { name: "Staff member" }),
    );

    expect(screen.getAllByRole("option", { name: /Mina Chen/ })).toHaveLength(
      1,
    );
    expect(screen.queryByRole("option", { name: /Tenant Only/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Archived Staff/ })).toBeNull();
  });

  it("preserves a historical linked Staff record without offering it for new grants", async () => {
    const user = userEvent.setup();
    const historicalStaff = {
      ...person,
      activeStaff: false,
      archived: true,
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      label: "Historical Staff",
    };
    const historicalMember = {
      ...admin,
      email: "historical@example.com",
      id: "12121212-1212-4212-8212-121212121212",
      personId: historicalStaff.id,
      role: "operations_member" as const,
      userId: "13131313-1313-4313-8313-131313131313",
    };
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin, historicalMember]}
        people={[person, adminPerson, historicalStaff]}
      />,
    );
    const member = getExpandedMember(historicalMember.id);
    expect(
      within(member).getAllByText("Historical Staff").length,
    ).toBeGreaterThan(0);
    expect(within(member).getByText("Archived")).toBeTruthy();
    expect(
      within(member).queryByRole("button", {
        name: "Clear linked Staff record",
      }),
    ).toBeNull();

    await user.click(
      within(getInviteForm()).getByRole("combobox", { name: "Staff member" }),
    );
    expect(
      screen.queryByRole("option", { name: /Historical Staff/ }),
    ).toBeNull();
  });

  it("links an unlinked account through the guarded member update", async () => {
    const user = userEvent.setup();
    const unlinkedMember = {
      ...admin,
      email: "unlinked@example.com",
      id: "99999999-9999-4999-8999-999999999999",
      branchId: branch.id,
      personId: null,
      role: "operations_member" as const,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin, unlinkedMember]}
        people={[person]}
      />,
    );
    const member = getExpandedMember(unlinkedMember.id);
    expect(
      within(member).getAllByText("Not linked").length,
    ).toBeGreaterThan(0);
    expect(within(member).getByText("Unlinked")).toBeTruthy();
    await user.click(
      within(member).getByRole("combobox", { name: "Linked staff record" }),
    );
    await user.click(screen.getByRole("option", { name: /Mina Chen/ }));
    await user.click(
      within(member).getByRole("button", { name: "Link staff record" }),
    );

    await waitFor(() => expect(updateAccess).toHaveBeenCalledOnce());
    expect(
      Object.fromEntries((updateAccess.mock.calls[0][1] as FormData).entries()),
    ).toMatchObject({
      memberId: unlinkedMember.id,
      personId: person.id,
    });
  });

  it("does not allow an operations account to be unlinked from Staff", () => {
    const operationsManager = {
      ...admin,
      branchId: branch.id,
      email: "other@example.com",
      id: "55555555-5555-4555-8555-555555555555",
      role: "operations_manager" as const,
      userId: "66666666-6666-4666-8666-666666666666",
    };
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin, operationsManager]}
        people={[person, adminPerson]}
      />,
    );
    const member = getExpandedMember(operationsManager.id);
    expect(
      within(member).queryByRole("button", {
        name: "Clear linked Staff record",
      }),
    ).toBeNull();
  });

  it("focuses the invalid email and announces one actionable error", async () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: "",
          personId: person.id,
          staffEmail: person.primaryEmail,
        }}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = getInviteForm();
    const email = within(addForm).getByLabelText(
      "Invitation email",
    ) as HTMLInputElement;
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.click(
      within(addForm).getByRole("button", { name: "Send invitation" }),
    );

    await waitFor(() => expect(document.activeElement).toBe(email));
    expect(within(addForm).getAllByRole("alert")).toHaveLength(1);
    expect(within(addForm).getByText("Enter a valid email.")).toBeTruthy();
    expect(addAccess).not.toHaveBeenCalled();
  });

  it("locks a non-idempotent add synchronously and focuses a server error", async () => {
    let resolveAction: (value: {
      status: "error";
      message: string;
    }) => void = () => undefined;
    addAccess.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: "",
          personId: person.id,
          staffEmail: person.primaryEmail,
        }}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = getInviteForm();
    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "new@example.com" },
    });
    const save = within(addForm).getByRole("button", {
      name: "Send invitation",
    });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(addAccess).toHaveBeenCalledTimes(1);
    resolveAction({ status: "error", message: "Invite could not be sent." });
    const alert = await within(addForm).findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(alert.textContent).toContain("Invite could not be sent.");
    expect(
      (within(addForm).getByLabelText("Invitation email") as HTMLInputElement)
        .value,
    ).toBe("new@example.com");
    expect(within(addForm).getAllByText("Mina Chen").length).toBeGreaterThan(0);
  });

  it("keeps an invitation finalization error actionable in the drawer", async () => {
    addAccess.mockResolvedValueOnce({
      status: "error",
      message: "Invitation state could not be finalized.",
    });
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: person.primaryEmail,
          personId: person.id,
          staffEmail: person.primaryEmail,
        }}
        members={[admin]}
        people={[person]}
      />,
    );

    const addForm = getInviteForm();
    fireEvent.click(
      within(addForm).getByRole("button", { name: "Send invitation" }),
    );

    const alert = await within(addForm).findByRole("alert");
    expect(alert.textContent).toContain(
      "Invitation state could not be finalized.",
    );
    expect(screen.getByRole("dialog", { name: "Invite Staff" })).toBeTruthy();
    expect(
      (
        within(addForm).getByRole("button", {
          name: "Send invitation",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("freezes access fields while saving and closes after full success", async () => {
    const user = userEvent.setup();
    let resolveAction: (value: {
      status: "success";
      message: string;
    }) => void = () => undefined;
    addAccess.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Invite Staff" });
    await user.click(trigger);
    const addForm = within(
      screen.getByRole("dialog", { name: "Invite Staff" }),
    ).getByTestId("add-access-form");
    await user.click(
      within(addForm).getByRole("combobox", { name: "Staff member" }),
    );
    await user.click(screen.getByRole("option", { name: /Mina Chen/ }));
    const email = within(addForm).getByLabelText(
      "Invitation email",
    ) as HTMLInputElement;
    fireEvent.click(
      within(addForm).getByRole("button", { name: "Send invitation" }),
    );

    expect(email.disabled).toBe(true);
    expect(
      (
        within(addForm).getByRole("combobox", {
          name: "Access level",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    resolveAction({ status: "success", message: "User access added." });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Invite Staff" })).toBeNull();
    });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  // A modal Shadcn Sheet intentionally prevents editing a background member
  // while the invitation drawer is open, so this cross-modal scenario
  // is no longer reachable through the UI.
  it.skip("turns a pending navigation into a dirty decision when another draft remains", async () => {
    let resolveAction: (value: {
      status: "success";
      message: string;
    }) => void = () => undefined;
    addAccess.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const otherAdmin = {
      ...admin,
      email: "other@example.com",
      id: "55555555-5555-4555-8555-555555555555",
      userId: "66666666-6666-4666-8666-666666666666",
    };
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: "",
          personId: person.id,
          staffEmail: person.primaryEmail,
        }}
        members={[admin, otherAdmin]}
        people={[person]}
      />,
    );

    const member = getExpandedMember(admin.id);
    fireEvent.click(
      within(member).getByRole("combobox", {
        hidden: true,
        name: "Access level",
      }),
    );
    fireEvent.click(
      screen.getAllByRole("option", {
        hidden: true,
        name: "Operations Manager",
      })[0]!,
    );
    const addForm = getInviteForm();
    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(
      within(addForm).getByRole("button", { name: "Send invitation" }),
    );
    fireEvent.click(
      screen.getByRole("link", { hidden: true, name: "Organization" }),
    );
    expect(
      screen.getByRole("dialog", { hidden: true, name: "Open Organization?" })
        .textContent,
    ).toContain("save is still in progress");

    resolveAction({ status: "success", message: "User access added." });
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { hidden: true, name: "Open Organization?" })
          .textContent,
      ).toContain("unsaved changes");
    });
    expect(
      screen.getByRole("button", {
        hidden: true,
        name: "Discard and open Organization",
      }),
    ).toBeTruthy();
  });

  it("closes a pending navigation and focuses the submitted draft when saving fails", async () => {
    let resolveAction: (value: {
      status: "error";
      message: string;
    }) => void = () => undefined;
    addAccess.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{
          email: "",
          personId: person.id,
          staffEmail: person.primaryEmail,
        }}
        members={[admin]}
        people={[person]}
      />,
    );

    const addForm = getInviteForm();
    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(
      within(addForm).getByRole("button", { name: "Send invitation" }),
    );
    fireEvent.click(
      screen.getByRole("link", { hidden: true, name: "Organization" }),
    );
    expect(
      screen.getByRole("dialog", { hidden: true, name: "Open Organization?" })
        .textContent,
    ).toContain("save is still in progress");

    resolveAction({ status: "error", message: "Access could not be added." });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { hidden: true, name: "Open Organization?" }),
      ).toBeNull();
    });
    const alert = within(addForm).getByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(alert.textContent).toContain("Access could not be added.");
  });

  it("guards the Workspace link while an add draft is dirty and restores its focus", async () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = getInviteForm();
    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "new@example.com" },
    });
    const workspace = screen.getByRole("link", {
      hidden: true,
      name: "Organization",
    });
    fireEvent.click(workspace);

    expect(
      screen.getByRole("dialog", { hidden: true, name: "Open Organization?" })
        .textContent,
    ).toContain("unsaved changes");
    fireEvent.click(
      screen.getByRole("button", { hidden: true, name: "Keep editing" }),
    );
    expect(screen.getByRole("dialog", { name: "Invite Staff" })).not.toBeNull();
    expect(
      (within(addForm).getByLabelText("Invitation email") as HTMLInputElement)
        .value,
    ).toBe("new@example.com");
  });

  it("blocks a last-admin demotion beside the changed role control", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    const member = getExpandedMember(admin.id);
    await user.click(
      within(member).getByRole("combobox", { name: "Access level" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Operations Manager" }),
    );

    expect(
      (
        within(member).getByRole("button", {
          name: "Save access",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      within(member).getByText(
        "Add another Super Admin before changing this role.",
      ),
    ).toBeTruthy();
    expect(within(member).getByText(/Operational access/)).toBeTruthy();
  });

  it("submits the exact member access boundary when another admin remains", async () => {
    const user = userEvent.setup();
    const otherAdmin = {
      ...admin,
      email: "other@example.com",
      id: "55555555-5555-4555-8555-555555555555",
      userId: "66666666-6666-4666-8666-666666666666",
    };
    render(
      <StrictMode>
        <AccessSettingsScreen
          branches={[branch]}
          members={[admin, otherAdmin]}
          people={[person]}
        />
      </StrictMode>,
    );
    const member = getExpandedMember(admin.id);
    await user.click(
      within(member).getByRole("combobox", { name: "Access level" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Operations Manager" }),
    );
    fireEvent.click(
      within(member).getByRole("button", { name: "Save access" }),
    );

    await waitFor(() => expect(updateAccess).toHaveBeenCalledTimes(1));
    const submitted = updateAccess.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(submitted.entries())).toEqual({
      branchId: branch.id,
      memberId: admin.id,
      personId: adminPerson.id,
      role: "operations_manager",
    });
    expect(await within(member).findByText("Access updated.")).toBeTruthy();
  });

  it("signs out after removing the current administrator's own access", async () => {
    const user = userEvent.setup();
    const otherAdmin = {
      ...admin,
      email: "other@example.com",
      id: "55555555-5555-4555-8555-555555555555",
      userId: "66666666-6666-4666-8666-666666666666",
    };
    render(
      <AccessSettingsScreen
        branches={[branch]}
        currentUserId={admin.userId}
        members={[admin, otherAdmin]}
        people={[person]}
      />,
    );

    const member = getExpandedMember(admin.id);
    await user.click(
      within(member).getByRole("button", { name: "Remove access" }),
    );
    const removeDialog = within(member).getByRole("alertdialog", {
      name: "Remove workspace access?",
    });
    expect(removeDialog.textContent).toContain(
      "This account will lose workspace access immediately.",
    );
    expect(document.activeElement).toBe(
      within(removeDialog).getByRole("button", { name: "Keep access" }),
    );
    await user.click(
      within(removeDialog).getByRole("button", { name: "Keep access" }),
    );
    expect(document.activeElement).toBe(
      within(member).getByRole("button", { name: "Remove access" }),
    );
    await user.click(
      within(member).getByRole("button", { name: "Remove access" }),
    );
    await user.click(
      within(member).getByRole("button", { name: "Confirm remove access" }),
    );

    await waitFor(() => expect(removeAccess).toHaveBeenCalledTimes(1));
    const submitted = removeAccess.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(submitted.entries())).toEqual({
      memberId: admin.id,
    });
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(
      await within(member).findByText("Access removed. Signing out..."),
    ).toBeTruthy();
  });

  it("gives the member roster one header row instead of labelling every cell", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[
          admin,
          {
            ...admin,
            id: "66666666-6666-4666-8666-666666666666",
            userId: "77777777-7777-4777-8777-777777777777",
          },
        ]}
        people={[person, adminPerson]}
      />,
    );
    const active = screen.getByTestId("access-active-group");

    expect(
      within(active)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Member", "Access level", "Scope", "Staff link", "Actions"]);
    // Two rows, but each field name is rendered once.
    expect(within(active).getAllByText("Access level")).toHaveLength(1);
    expect(within(active).getAllByRole("button", { name: "Manage" })).toHaveLength(2);
  });

  it("drops a group from the page when it holds nothing", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[adminPerson]}
      />,
    );

    expect(screen.queryByTestId("access-needs-group")).toBeNull();
    expect(screen.queryByTestId("access-pending-group")).toBeNull();
    expect(screen.getByTestId("access-active-group")).toBeTruthy();
    // The actions survive the group that used to host them.
    expect(screen.getByRole("button", { name: "Invite Staff" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add Staff" })).toBeTruthy();
  });

  it("identifies a member by name and shows the email once", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );
    const member = screen.getByTestId(`access-member-${admin.id}`);

    expect(within(member).getByText(adminPerson.label)).toBeTruthy();
    expect(within(member).getAllByText(admin.email)).toHaveLength(1);
  });

  it("falls back to the email when no Staff record is linked", () => {
    const unlinked = {
      ...admin,
      email: "unlinked@example.com",
      id: "99999999-9999-4999-8999-999999999999",
      personId: null,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[unlinked]}
        people={[person]}
      />,
    );
    const member = screen.getByTestId(`access-member-${unlinked.id}`);

    expect(within(member).getAllByText(unlinked.email)).toHaveLength(1);
  });

  it("asks before closing a dirty row instead of ignoring the click", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[
          admin,
          {
            ...admin,
            id: "66666666-6666-4666-8666-666666666666",
            userId: "77777777-7777-4777-8777-777777777777",
          },
        ]}
        people={[person, adminPerson]}
      />,
    );
    const member = getExpandedMember(admin.id);
    await user.click(
      within(member).getByRole("combobox", { name: "Access level" }),
    );
    await user.click(screen.getByRole("option", { name: "Finance Manager" }));

    const close = within(member).getByRole("button", { name: /Close/ });
    expect((close as HTMLButtonElement).disabled).toBe(false);
    await user.click(close);

    const dialog = within(member).getByRole("alertdialog");
    expect(
      within(dialog).getByText("Discard unsaved access changes?"),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    );

    // Keeping the edit leaves the row open and the draft intact.
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(within(member).getByRole("combobox", { name: "Access level" })).toBeTruthy();

    await user.click(within(member).getByRole("button", { name: /Close/ }));
    await user.click(
      within(member).getByRole("button", { name: "Discard and close" }),
    );

    await waitFor(() =>
      expect(within(member).queryByRole("combobox", { name: "Access level" })).toBeNull(),
    );
    expect(within(member).getByRole("button", { name: /Manage/ })).toBeTruthy();
    expect(updateAccess).not.toHaveBeenCalled();
  });

  it("withholds All branches from a role that must name one", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = getInviteForm();

    // Operations Member is the default role.
    await user.click(
      within(addForm).getByRole("combobox", { name: "Access scope" }),
    );
    expect(screen.queryByRole("option", { name: "All branches" })).toBeNull();
    expect(screen.getByRole("option", { name: /Bangkok/ })).toBeTruthy();
  });

  it("keeps All branches as the scope an organization-wide role resolves to", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = getInviteForm();

    await user.click(
      within(addForm).getByRole("combobox", { name: "Access level" }),
    );
    await user.click(screen.getByRole("option", { name: "Finance Manager" }));

    const scope = within(addForm).getByRole("combobox", {
      name: "Access scope",
    }) as HTMLButtonElement;
    expect(scope.disabled).toBe(true);
    expect(scope.textContent).toContain("All branches");
  });

  it("marks the offending control invalid and describes it with its own error", async () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = getInviteForm();
    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "someone@example.com" },
    });
    fireEvent.click(
      within(addForm).getByRole("button", { name: "Send invitation" }),
    );

    const staff = within(addForm).getByRole("combobox", {
      name: "Staff member",
    });
    await waitFor(() =>
      expect(staff.getAttribute("aria-invalid")).toBe("true"),
    );
    const describedBy = staff.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe(
      "Choose a Staff member.",
    );
    expect(addAccess).not.toHaveBeenCalled();
  });

  it("reports every unmet requirement instead of one at a time", async () => {
    render(
      <AccessSettingsScreen
        branches={[
          branch,
          {
            ...branch,
            code: "CNX",
            id: "55555555-5555-4555-8555-555555555555",
            name: "Chiang Mai",
          },
        ]}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = getInviteForm();
    // Two branches, so nothing is preselected. A bad email makes the draft dirty
    // without satisfying anything: staff, scope and email all fail together.
    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(
      within(addForm).getByRole("button", { name: "Send invitation" }),
    );

    expect(
      await within(addForm).findByText("Choose a Staff member."),
    ).toBeTruthy();
    expect(
      within(addForm).getByText("Choose an operational branch."),
    ).toBeTruthy();
    expect(within(addForm).getByText("Enter a valid email.")).toBeTruthy();
    expect(
      within(addForm).getByText("Check the 3 highlighted fields."),
    ).toBeTruthy();
  });

  it("clears field errors once the caller edits the form again", async () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = getInviteForm();
    const email = within(addForm).getByLabelText("Invitation email");
    fireEvent.change(email, { target: { value: "someone@example.com" } });
    fireEvent.click(
      within(addForm).getByRole("button", { name: "Send invitation" }),
    );
    expect(
      await within(addForm).findByText("Choose a Staff member."),
    ).toBeTruthy();

    fireEvent.change(email, { target: { value: "someone.else@example.com" } });

    await waitFor(() =>
      expect(within(addForm).queryByText("Choose a Staff member.")).toBeNull(),
    );
  });

  it("states why a duplicate blocks the invitation next to the review action", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );
    const addForm = getInviteForm();
    await user.click(
      within(addForm).getByRole("combobox", { name: "Staff member" }),
    );
    await user.click(screen.getByRole("option", { name: /Admin Staff/ }));

    const notice = within(addForm)
      .getByText("This Staff member already has workspace access.")
      .closest("div");
    expect(notice).not.toBeNull();
    expect(
      within(notice as HTMLElement).getByRole("button", {
        name: "Review access",
      }),
    ).toBeTruthy();
    expect(
      (within(addForm).getByRole("button", { name: "Send invitation" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

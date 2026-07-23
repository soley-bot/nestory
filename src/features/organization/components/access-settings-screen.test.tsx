/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addAccess, removeAccess, resendInvite, revokeInvite, signOut, updateAccess } = vi.hoisted(() => ({
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
  role: "admin" as const,
  userId: "44444444-4444-4444-8444-444444444444",
};

const pendingInvitation = {
  branchId: branch.id,
  email: "pending@example.com",
  expiresAt: "2026-07-30T12:00:00.000Z",
  id: "77777777-7777-4777-8777-777777777777",
  invitedAt: "2026-07-21T11:00:00.000Z",
  lastSentAt: "2026-07-21T11:01:00.000Z",
  personId: person.id,
  role: "member" as const,
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
  addAccess.mockResolvedValue({ status: "success", message: "Invitation sent." });
  removeAccess.mockResolvedValue({ status: "success", message: "Access removed." });
  resendInvite.mockResolvedValue({ status: "success", message: "Invitation resent." });
  revokeInvite.mockResolvedValue({ status: "success", message: "Invitation revoked." });
  updateAccess.mockResolvedValue({ status: "success", message: "Access updated." });
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

describe("AccessSettingsScreen", () => {
  it("replaces role tutorials with a compact access workspace", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Invite Staff" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add Staff" }).getAttribute("href")).toBe(
      "/staff?action=create",
    );
    expect(screen.getByRole("heading", { name: "Pending invitations" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Active members" })).toBeTruthy();
    expect(screen.getByText("1 active member")).toBeTruthy();
    expect(screen.queryByText(/Full workspace access, settings/i)).toBeNull();
  });

  it("shows effective scope and staff linkage beside each member", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );

    const member = screen.getByTestId(`access-member-${admin.id}`);
    expect(within(member).getByText("Active membership")).toBeTruthy();
    expect(within(member).getByText("Organization-wide")).toBeTruthy();
    expect(
      within(member).getByRole("combobox", { name: "Access scope" }).textContent,
    ).toContain("All branches");
    expect(within(member).getAllByText("Admin Staff").length).toBeGreaterThan(0);
    expect(within(member).getByText("Full workspace access")).toBeTruthy();
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
    expect(within(invitation).getByText("Pending")).toBeTruthy();
    expect(within(invitation).getByText("Bangkok")).toBeTruthy();
    expect(within(invitation).getByText("Mina Chen")).toBeTruthy();

    await user.click(within(invitation).getByRole("button", { name: "Resend" }));
    expect(resendInvite).toHaveBeenCalledOnce();
    await user.click(within(invitation).getByRole("button", { name: "Revoke" }));
    const revokeDialog = within(invitation).getByRole("alertdialog", {
      name: "Revoke this invitation?",
    });
    expect(revokeDialog.textContent).toContain(
      "The invitation link will stop working immediately.",
    );
    expect(document.activeElement).toBe(
      within(revokeDialog).getByRole("button", { name: "Keep invitation" }),
    );
    await user.click(within(revokeDialog).getByRole("button", { name: "Keep invitation" }));
    expect(document.activeElement).toBe(
      within(invitation).getByRole("button", { name: "Revoke" }),
    );
    await user.click(within(invitation).getByRole("button", { name: "Revoke" }));
    await user.click(within(invitation).getByRole("button", { name: "Revoke invitation" }));
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
    expect(within(invitation).getByText("Expired")).toBeTruthy();

    await user.click(within(invitation).getByRole("button", { name: "Resend" }));
    expect(resendInvite).toHaveBeenCalledOnce();

    await user.click(within(invitation).getByRole("button", { name: "Revoke" }));
    await user.click(within(invitation).getByRole("button", { name: "Revoke invitation" }));
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

    const member = screen.getByTestId(`access-member-${admin.id}`);
    expect(
      (within(member).getByRole("button", { name: "Save access" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(member).getByText("Last administrator")).toBeTruthy();
    expect(
      within(member).getByText(/another administrator is required before this role can be reduced/i),
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

    const addForm = screen.getByTestId("add-access-form");
    expect(within(addForm).getByRole("combobox", { name: "Staff member" })).toBeTruthy();
    expect(within(addForm).getByLabelText("Invitation email")).toBeTruthy();
    expect(within(addForm).getAllByText("Access level").length).toBeGreaterThan(0);
    expect(within(addForm).getAllByText("Access scope").length).toBeGreaterThan(0);
    expect(within(addForm).getByText("The employee or contractor this login belongs to.")).toBeTruthy();
    expect(within(addForm).getByText("The address used to sign in and receive the invitation.")).toBeTruthy();
    expect(within(addForm).getByText("What this person may administer in Nestory.")).toBeTruthy();
    expect(within(addForm).getByText("Which branch or property context this person may access.")).toBeTruthy();
    expect(within(addForm).getByText(
      "Workspace access controls sign-in permissions. It does not change the person's operational Staff role.",
    )).toBeTruthy();
    const formCopy = addForm.textContent ?? "";
    expect(formCopy.indexOf("Staff member")).toBeLessThan(formCopy.indexOf("Invitation email"));
    expect(formCopy.indexOf("Invitation email")).toBeLessThan(formCopy.indexOf("Access level"));
    expect(formCopy.indexOf("Access level")).toBeLessThan(formCopy.indexOf("Access scope"));
    expect(
      (within(addForm).getByRole("button", { name: "Send invitation" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      within(addForm)
        .getByRole("region", { name: "Access effect" })
        .compareDocumentPosition(within(addForm).getByRole("button", { name: "Send invitation" }))
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps a trusted invite handoff actionable without retyping", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: "mina@example.com", personId: person.id, staffEmail: "mina@example.com" }}
        members={[admin]}
        people={[person]}
      />,
    );

    const addForm = screen.getByTestId("add-access-form");
    expect((within(addForm).getByLabelText("Invitation email") as HTMLInputElement).value).toBe("mina@example.com");
    expect(
      (within(addForm).getByRole("button", { name: "Send invitation" }) as HTMLButtonElement).disabled,
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
        inviteDefaults={{ email: person.primaryEmail, personId: person.id, staffEmail: person.primaryEmail }}
        members={[admin]}
        people={[person, secondPerson]}
        requestedStaffId={person.id}
      />,
    );
    let addForm = screen.getByTestId("add-access-form");
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

    addForm = screen.getByTestId("add-access-form");
    expect((within(addForm).getByLabelText("Invitation email") as HTMLInputElement).value).toBe(
      "nadia@example.com",
    );
    expect(within(addForm).getByRole("region", { name: "Access effect" }).textContent).toContain(
      "Nadia Wong",
    );

    addAccess.mockResolvedValueOnce({ status: "error", message: "Invitation could not be sent." });
    fireEvent.click(within(addForm).getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(within(addForm).getByText("Invitation could not be sent.")).toBeTruthy());

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
      within(screen.getByTestId("add-access-form")).getByText("Invitation could not be sent."),
    ).toBeTruthy();
  });

  it("preserves same-Staff draft feedback when revalidation materializes its invitation", async () => {
    const view = render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: person.primaryEmail, personId: person.id, staffEmail: person.primaryEmail }}
        members={[admin]}
        people={[person]}
        requestedStaffId={person.id}
      />,
    );
    let addForm = screen.getByTestId("add-access-form");
    addAccess.mockResolvedValueOnce({
      status: "error",
      message: "Invitation created, but delivery failed.",
    });
    fireEvent.click(within(addForm).getByRole("button", { name: "Send invitation" }));
    await waitFor(() => {
      expect(within(addForm).getByText("Invitation created, but delivery failed.")).toBeTruthy();
    });

    view.rerender(
      <AccessSettingsScreen
        branches={[branch]}
        invitations={[{ ...pendingInvitation, status: "send_failed" }]}
        members={[admin]}
        people={[person]}
        requestedStaffId={person.id}
      />,
    );

    addForm = screen.getByTestId("add-access-form");
    expect((within(addForm).getByLabelText("Invitation email") as HTMLInputElement).value).toBe(
      person.primaryEmail,
    );
    expect(within(addForm).getByText("Invitation created, but delivery failed.")).toBeTruthy();
    expect(
      within(addForm).getByText("This Staff member already has an invitation with failed delivery."),
    ).toBeTruthy();
  });

  it("discards a trusted invite handoff back to an empty access draft", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: "mina@example.com", personId: person.id, staffEmail: "mina@example.com" }}
        members={[admin]}
        people={[person]}
      />,
    );

    const addForm = screen.getByTestId("add-access-form");
    await user.click(within(addForm).getByRole("button", { name: "Discard" }));
    await user.click(within(addForm).getByRole("button", { name: "Discard changes" }));

    expect((within(addForm).getByLabelText("Invitation email") as HTMLInputElement).value).toBe("");
    expect(
      (within(addForm).getByRole("button", { name: "Send invitation" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps an edited sign-in email separate from the selected Staff record", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: "mina@example.com", personId: person.id, staffEmail: "mina@example.com" }}
        members={[admin]}
        people={[person, adminPerson]}
      />,
    );
    const addForm = screen.getByTestId("add-access-form");

    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "signin@example.com" },
    });

    expect(within(addForm).getByText(
      "This sign-in email differs from Mina Chen's Staff email. The Staff record will not be changed.",
    )).toBeTruthy();
    expect((within(addForm).getByRole("combobox", { name: "Staff member" }) as HTMLInputElement).value).toBe("");
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
        inviteDefaults={{ email: person.primaryEmail, personId: person.id, staffEmail: person.primaryEmail }}
        members={[admin]}
        people={[person, noEmailStaff]}
      />,
    );
    const addForm = screen.getByTestId("add-access-form");
    await user.click(within(addForm).getByRole("combobox", { name: "Staff member" }));
    await user.click(screen.getByRole("option", { name: /No Email Staff/ }));

    expect((within(addForm).getByLabelText("Invitation email") as HTMLInputElement).value).toBe("");
  });

  it("clears and disables branch scope for Administrator invitations", async () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: "mina@example.com", personId: person.id, staffEmail: "mina@example.com" }}
        members={[]}
        people={[person]}
      />,
    );
    const addForm = screen.getByTestId("add-access-form");
    fireEvent.click(within(addForm).getByRole("combobox", { name: "Access scope" }));
    fireEvent.click(screen.getByRole("option", { name: "BKK - Bangkok" }));
    fireEvent.click(within(addForm).getByRole("combobox", { name: "Access level" }));
    fireEvent.click(screen.getByRole("option", { name: "Administrator" }));

    expect(
      (within(addForm).getByRole("combobox", { name: "Access scope" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.submit(addForm);
    await waitFor(() => expect(addAccess).toHaveBeenCalledOnce());
    expect(Object.fromEntries((addAccess.mock.calls[0][1] as FormData).entries())).toMatchObject({
      branchId: "",
      personId: person.id,
      role: "admin",
    });
  });

  it("blocks a duplicate grant and focuses the server-loaded invitation", async () => {
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
    const addForm = screen.getByTestId("add-access-form");
    await user.click(within(addForm).getByRole("combobox", { name: "Staff member" }));
    await user.click(screen.getByRole("option", { name: /Mina Chen/ }));

    expect(within(addForm).getByText("This Staff member already has a pending invitation.")).toBeTruthy();
    await user.click(within(addForm).getByRole("button", { name: "Review invitation" }));
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByTestId(`access-invitation-${pendingInvitation.id}`),
    ));
    expect(addAccess).not.toHaveBeenCalled();
  });

  it("keeps failed invitation feedback safe and operational", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        invitations={[{ ...pendingInvitation, lastSentAt: null, status: "send_failed" }]}
        members={[admin]}
        people={[person]}
      />,
    );
    const invitation = screen.getByTestId(`access-invitation-${pendingInvitation.id}`);
    expect(within(invitation).getByText("Delivery failed")).toBeTruthy();
    expect(within(invitation).getByText(
      "The invitation was created, but email delivery did not complete.",
    )).toBeTruthy();
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
          { ...person, description: "Staff, Tenant · mina@example.com", roles: ["staff", "tenant"] },
          tenantOnly,
          archivedStaff,
        ]}
      />,
    );
    const addForm = screen.getByTestId("add-access-form");
    await user.click(within(addForm).getByRole("combobox", { name: "Staff member" }));

    expect(screen.getAllByRole("option", { name: /Mina Chen/ })).toHaveLength(1);
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
      role: "member" as const,
      userId: "13131313-1313-4313-8313-131313131313",
    };
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin, historicalMember]}
        people={[person, adminPerson, historicalStaff]}
      />,
    );
    const member = screen.getByTestId(`access-member-${historicalMember.id}`);
    expect(within(member).getAllByText("Historical Staff").length).toBeGreaterThan(0);
    expect(within(member).getByRole("button", { name: "Clear linked Staff record" })).toBeTruthy();

    await user.click(within(screen.getByTestId("add-access-form")).getByRole("combobox", { name: "Staff member" }));
    expect(screen.queryByRole("option", { name: /Historical Staff/ })).toBeNull();
  });

  it("links a legacy unlinked account through the guarded member update", async () => {
    const user = userEvent.setup();
    const legacyMember = {
      ...admin,
      email: "legacy@example.com",
      id: "99999999-9999-4999-8999-999999999999",
      personId: null,
      role: "member" as const,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin, legacyMember]}
        people={[person]}
      />,
    );
    const member = screen.getByTestId(`access-member-${legacyMember.id}`);
    expect(within(member).getAllByText("Not linked to a Staff record").length).toBeGreaterThan(0);
    await user.click(within(member).getByRole("combobox", { name: "Linked staff record" }));
    await user.click(screen.getByRole("option", { name: /Mina Chen/ }));
    await user.click(within(member).getByRole("button", { name: "Link staff record" }));

    await waitFor(() => expect(updateAccess).toHaveBeenCalledOnce());
    expect(Object.fromEntries((updateAccess.mock.calls[0][1] as FormData).entries())).toMatchObject({
      memberId: legacyMember.id,
      personId: person.id,
    });
  });

  it("requires an explicit confirmation before unlinking a Staff record", async () => {
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
        members={[admin, otherAdmin]}
        people={[person, adminPerson]}
      />,
    );
    const member = screen.getByTestId(`access-member-${admin.id}`);
    await user.click(within(member).getByRole("button", { name: "Clear linked Staff record" }));
    await user.click(within(member).getByRole("button", { name: "Save access" }));

    expect(updateAccess).not.toHaveBeenCalled();
    const unlinkDialog = within(member).getByRole("alertdialog", {
      name: "Unlink this Staff record?",
    });
    expect(unlinkDialog.textContent).toContain(
      "Workspace access will remain, but it will no longer be tied to Admin Staff's Staff record.",
    );
    expect(document.activeElement).toBe(
      within(unlinkDialog).getByRole("button", { name: "Keep current link" }),
    );
    await user.click(within(unlinkDialog).getByRole("button", { name: "Keep current link" }));
    expect(document.activeElement).toBe(
      within(member).getByRole("button", { name: "Save access" }),
    );
    await user.click(within(member).getByRole("button", { name: "Save access" }));
    await user.click(within(member).getByRole("button", { name: "Confirm unlink" }));
    await waitFor(() => expect(updateAccess).toHaveBeenCalledOnce());
  });

  it("focuses the invalid email and announces one actionable error", async () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: "", personId: person.id, staffEmail: person.primaryEmail }}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = screen.getByTestId("add-access-form");
    const email = within(addForm).getByLabelText("Invitation email") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(document.activeElement).toBe(email));
    expect(within(addForm).getAllByRole("alert")).toHaveLength(1);
    expect(within(addForm).getByText("Enter a valid email.")).toBeTruthy();
    expect(addAccess).not.toHaveBeenCalled();
  });

  it("locks a non-idempotent add synchronously and focuses a server error", async () => {
    let resolveAction: (value: { status: "error"; message: string }) => void = () => undefined;
    addAccess.mockImplementation(
      () => new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: "", personId: person.id, staffEmail: person.primaryEmail }}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = screen.getByTestId("add-access-form");
    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "new@example.com" },
    });
    const save = within(addForm).getByRole("button", { name: "Send invitation" });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(addAccess).toHaveBeenCalledTimes(1);
    resolveAction({ status: "error", message: "Invite could not be sent." });
    const alert = await within(addForm).findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(alert.textContent).toContain("Invite could not be sent.");
    expect((within(addForm).getByLabelText("Invitation email") as HTMLInputElement).value).toBe("new@example.com");
    expect(within(addForm).getAllByText("Mina Chen").length).toBeGreaterThan(0);
  });

  it("freezes access fields while their submitted snapshot is saving", async () => {
    let resolveAction: (value: { status: "success"; message: string }) => void = () => undefined;
    addAccess.mockImplementation(
      () => new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: "", personId: person.id, staffEmail: person.primaryEmail }}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = screen.getByTestId("add-access-form");
    const email = within(addForm).getByLabelText("Invitation email") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "new@example.com" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Send invitation" }));

    expect(email.disabled).toBe(true);
    expect(
      (within(addForm).getByRole("combobox", { name: "Access level" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    resolveAction({ status: "success", message: "User access added." });
    expect(await within(addForm).findByText("User access added.")).toBeTruthy();
  });

  it("turns a pending navigation into a dirty decision when another draft remains", async () => {
    const user = userEvent.setup();
    let resolveAction: (value: { status: "success"; message: string }) => void = () => undefined;
    addAccess.mockImplementation(
      () => new Promise((resolve) => {
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
        inviteDefaults={{ email: "", personId: person.id, staffEmail: person.primaryEmail }}
        members={[admin, otherAdmin]}
        people={[person]}
      />,
    );

    const member = screen.getByTestId(`access-member-${admin.id}`);
    await user.click(within(member).getByRole("combobox", { name: "Access level" }));
    await user.click(screen.getByRole("option", { name: "Manager" }));
    const addForm = screen.getByTestId("add-access-form");
    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(within(addForm).getByRole("button", { name: "Send invitation" }));
    await user.click(screen.getByRole("link", { name: "Workspace" }));
    expect(screen.getByRole("dialog").textContent).toContain("save is still in progress");

    resolveAction({ status: "success", message: "User access added." });
    await waitFor(() => {
      expect(screen.getByRole("dialog").textContent).toContain("unsaved changes");
    });
    expect(screen.getByRole("button", { name: "Discard and open Workspace" })).toBeTruthy();
  });

  it("closes a pending navigation and focuses the submitted draft when saving fails", async () => {
    const user = userEvent.setup();
    let resolveAction: (value: { status: "error"; message: string }) => void = () => undefined;
    addAccess.mockImplementation(
      () => new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: "", personId: person.id, staffEmail: person.primaryEmail }}
        members={[admin]}
        people={[person]}
      />,
    );

    const addForm = screen.getByTestId("add-access-form");
    fireEvent.change(within(addForm).getByLabelText("Invitation email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(within(addForm).getByRole("button", { name: "Send invitation" }));
    await user.click(screen.getByRole("link", { name: "Workspace" }));
    expect(screen.getByRole("dialog").textContent).toContain("save is still in progress");

    resolveAction({ status: "error", message: "Access could not be added." });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const alert = within(addForm).getByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(alert.textContent).toContain("Access could not be added.");
  });

  it("guards the Workspace link while an add draft is dirty and restores its focus", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Invitation email"), {
      target: { value: "new@example.com" },
    });
    const workspace = screen.getByRole("link", { name: "Workspace" });
    await user.click(workspace);

    expect(screen.getByRole("dialog").textContent).toContain("unsaved changes");
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(document.activeElement).toBe(workspace));
    expect((screen.getByLabelText("Invitation email") as HTMLInputElement).value).toBe("new@example.com");
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
    const member = screen.getByTestId(`access-member-${admin.id}`);
    await user.click(within(member).getByRole("combobox", { name: "Access level" }));
    await user.click(screen.getByRole("option", { name: "Manager" }));

    expect(
      (within(member).getByRole("button", { name: "Save access" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(member).getByText("Add another administrator before changing this role.")).toBeTruthy();
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
    const member = screen.getByTestId(`access-member-${admin.id}`);
    await user.click(within(member).getByRole("combobox", { name: "Access level" }));
    await user.click(screen.getByRole("option", { name: "Manager" }));
    fireEvent.click(within(member).getByRole("button", { name: "Save access" }));

    await waitFor(() => expect(updateAccess).toHaveBeenCalledTimes(1));
    const submitted = updateAccess.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(submitted.entries())).toEqual({
      branchId: "",
      memberId: admin.id,
      personId: adminPerson.id,
      role: "manager",
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

    const member = screen.getByTestId(`access-member-${admin.id}`);
    await user.click(within(member).getByRole("button", { name: "Remove access" }));
    const removeDialog = within(member).getByRole("alertdialog", {
      name: "Remove workspace access?",
    });
    expect(removeDialog.textContent).toContain(
      "This account will lose workspace access immediately.",
    );
    expect(document.activeElement).toBe(
      within(removeDialog).getByRole("button", { name: "Keep access" }),
    );
    await user.click(within(removeDialog).getByRole("button", { name: "Keep access" }));
    expect(document.activeElement).toBe(
      within(member).getByRole("button", { name: "Remove access" }),
    );
    await user.click(within(member).getByRole("button", { name: "Remove access" }));
    await user.click(within(member).getByRole("button", { name: "Confirm remove access" }));

    await waitFor(() => expect(removeAccess).toHaveBeenCalledTimes(1));
    const submitted = removeAccess.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(submitted.entries())).toEqual({ memberId: admin.id });
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(await within(member).findByText("Access removed. Signing out...")).toBeTruthy();
  });
});

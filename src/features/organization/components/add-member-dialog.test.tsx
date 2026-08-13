/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createStaff, inviteMember } = vi.hoisted(() => ({
  createStaff: vi.fn(),
  inviteMember: vi.fn(),
}));

vi.mock("@/features/people/actions", () => ({ createPersonAction: createStaff }));
vi.mock("@/features/organization/actions", () => ({
  inviteOrganizationUserAction: inviteMember,
}));

import { AddMemberDialog } from "./add-member-dialog";

const branches = [
  {
    address: null,
    code: "BKK",
    id: "11111111-1111-4111-8111-111111111111",
    name: "Bangkok",
    status: "active",
  },
  {
    address: null,
    code: "CNX",
    id: "22222222-2222-4222-8222-222222222222",
    name: "Chiang Mai",
    status: "active",
  },
];

const mina = {
  activeStaff: true,
  archived: false,
  description: "Staff - mina@example.com",
  id: "33333333-3333-4333-8333-333333333333",
  label: "Mina Chen",
  primaryEmail: "mina@example.com",
  roles: ["staff" as const],
};

beforeEach(() => {
  createStaff.mockReset();
  inviteMember.mockReset();
  createStaff.mockResolvedValue({
    message: "Person added.",
    personId: "44444444-4444-4444-8444-444444444444",
    roles: ["staff"],
    status: "success",
  });
  inviteMember.mockResolvedValue({ message: "Invitation sent.", status: "success" });
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

function DialogHarness({
  defaults,
  onNavigateToInvitations = vi.fn(),
  onReviewDuplicate = vi.fn(),
}: {
  defaults?: { email?: string; personId?: string; staffEmail?: string };
  onNavigateToInvitations?: () => void;
  onReviewDuplicate?: (target: { id: string; kind: "invitation" | "member" }) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button onClick={() => setOpen(true)} ref={triggerRef} type="button">
        Add member
      </button>
      <AddMemberDialog
        branches={branches}
        defaults={defaults}
        invitations={[]}
        members={[]}
        onNavigateToInvitations={onNavigateToInvitations}
        onOpenChange={setOpen}
        onReviewDuplicate={onReviewDuplicate}
        open={open}
        people={[mina]}
        returnFocusRef={triggerRef}
      />
    </>
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add member" }));
  return screen.getByRole("dialog", { name: "Add member" });
}

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  const dialog = screen.getByRole("dialog", { name: "Add member" });
  await user.click(within(dialog).getByRole("combobox", { name: label }));
  await user.click(screen.getByRole("option", { name: option }));
}

async function reachStaffStep(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole("dialog", { name: "Add member" });
  await user.type(within(dialog).getByLabelText("Invitation email"), "ops@example.com");
  await choose(user, "Access scope", "Bangkok");
  await user.click(within(dialog).getByRole("button", { name: "Continue" }));
  return screen.getByRole("dialog", { name: "Add member" });
}

describe("AddMemberDialog", () => {
  it("uses a shadcn dialog with a concise staged heading", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    const dialog = await openDialog(user);

    expect(within(dialog).getByText("Identity and access")).toBeTruthy();
    expect(within(dialog).getByLabelText("Invitation progress")).toBeTruthy();
    expect(dialog.getAttribute("data-slot")).toBe("dialog-content");
    expect(dialog.querySelector("[data-slot='drawer-content']")).toBeNull();
  });

  it("skips the Staff step for organization-wide access", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Invitation email"), "finance@example.com");
    await choose(user, "Access level", "Finance Manager");
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));

    expect(within(dialog).getByRole("heading", { level: 3, name: "Review invitation" })).toBeTruthy();
    expect(within(dialog).queryByRole("combobox", { name: "Staff member" })).toBeNull();
  });

  it("requires branch scope before an Operations invitation can continue", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText("Invitation email"), "ops@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));

    expect(within(dialog).getByText("Choose a branch.").getAttribute("role")).toBe("alert");
    expect(within(dialog).getByText("Identity and access")).toBeTruthy();
  });

  it("keeps the invitation email separate from an existing Staff email", async () => {
    const user = userEvent.setup();
    render(<DialogHarness defaults={{ email: "signin@example.com", personId: mina.id }} />);
    const dialog = await openDialog(user);

    await choose(user, "Access scope", "Bangkok");
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));

    expect(within(dialog).getByRole("heading", { level: 3, name: "Review invitation" })).toBeTruthy();
    expect(within(dialog).getByText("signin@example.com")).toBeTruthy();
    expect(within(dialog).getByText("Not Mina Chen's Staff email.")).toBeTruthy();
  });

  it("creates a Staff record before sending its Operations invitation", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await openDialog(user);
    const dialog = await reachStaffStep(user);

    await user.click(within(dialog).getByRole("button", { name: "Create Staff" }));
    await user.type(within(dialog).getByLabelText("Staff name"), "Niran Boon");
    await user.type(within(dialog).getByLabelText("Primary phone"), "+66 80 000 0000");
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(createStaff).toHaveBeenCalledOnce());
    await waitFor(() => expect(inviteMember).toHaveBeenCalledOnce());
    expect(createStaff.mock.invocationCallOrder[0]).toBeLessThan(
      inviteMember.mock.invocationCallOrder[0],
    );
    expect(
      Object.fromEntries((createStaff.mock.calls[0][1] as FormData).entries()),
    ).toMatchObject({
      displayName: "Niran Boon",
      partyType: "individual",
      primaryEmail: "ops@example.com",
      primaryPhone: "+66 80 000 0000",
      roles: "staff",
    });
    expect(
      Object.fromEntries((inviteMember.mock.calls[0][1] as FormData).entries()),
    ).toMatchObject({
      branchId: branches[0]!.id,
      email: "ops@example.com",
      personId: "44444444-4444-4444-8444-444444444444",
      role: "operations_member",
    });
  });

  it("retries only the invitation after Staff persistence succeeds", async () => {
    const user = userEvent.setup();
    inviteMember
      .mockResolvedValueOnce({ message: "Invitation was not created.", status: "error" })
      .mockResolvedValueOnce({ message: "Invitation sent.", status: "success" });
    render(<DialogHarness />);
    await openDialog(user);
    const dialog = await reachStaffStep(user);

    await user.click(within(dialog).getByRole("button", { name: "Create Staff" }));
    await user.type(within(dialog).getByLabelText("Staff name"), "Niran Boon");
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    expect(await within(dialog).findByText("Staff saved; invitation not created")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Retry invitation" }));

    await waitFor(() => expect(inviteMember).toHaveBeenCalledTimes(2));
    expect(createStaff).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding a dirty dialog and restores the trigger focus", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Add member" });
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Invitation email"), "draft@example.com");

    await user.keyboard("{Escape}");
    const confirmation = screen.getByRole("alertdialog", {
      name: "Discard member invitation?",
    });
    expect(confirmation).toBeTruthy();
    await user.click(within(confirmation).getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add member" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

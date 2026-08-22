/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoleEditor, type EditableRole } from "./role-editor";

const existingRole: EditableRole = {
  assignedUserCount: 0,
  id: "role-finance",
  name: "Finance Manager",
  pendingInvitationCount: 0,
  permissions: ["finance.view", "finance.record_payments"],
  status: "active",
  version: 7,
};

beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(cleanup);

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof RoleEditor>> = {},
) {
  return render(
    <RoleEditor
      onArchive={vi.fn()}
      onClose={vi.fn()}
      onDuplicate={vi.fn()}
      onReload={vi.fn()}
      onSave={vi.fn()}
      open
      role={null}
      saveResult={null}
      {...overrides}
    />,
  );
}

describe("RoleEditor", () => {
  it("starts a new role Active and empty with the exact five permission groups", () => {
    const { container } = renderEditor();

    expect(screen.getByRole("dialog", { name: "New role" })).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Available after saving")).toBeTruthy();
    expect(screen.getByText("Not assignable")).toBeTruthy();
    expect(
      screen.getByText(
        "Add at least one permission before assigning this role.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("group")
        .map((group) => group.getAttribute("aria-label")),
    ).toEqual(["Properties", "People", "Leases", "Finance", "Maintenance"]);
    expect(screen.getAllByRole("checkbox")).toHaveLength(23);
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(container.textContent).not.toMatch(
      /properties\.view|finance\.publish|RLS|RPC/i,
    );
  });

  it("enables Save for a valid changed name and returns the empty selection", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderEditor({ onSave });

    await user.type(
      screen.getByRole("textbox", { name: "Role name" }),
      "Caretaker",
    );
    const save = screen.getByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    await user.click(save);

    expect(onSave).toHaveBeenCalledWith({
      confirmRemovals: false,
      expectedVersion: null,
      id: null,
      name: "Caretaker",
      permissions: [],
    });
  });

  it("adds View with a dependent and clears every dependent when View is removed", async () => {
    const user = userEvent.setup();
    renderEditor();
    const finance = screen.getByRole("group", { name: "Finance" });
    const view = within(finance).getByRole("checkbox", { name: "View" });
    const recordPayments = within(finance).getByRole("checkbox", {
      name: "Record payments",
    });
    const publish = within(finance).getByRole("checkbox", { name: "Publish" });

    await user.click(recordPayments);
    await user.click(publish);
    expect(view.getAttribute("data-state")).toBe("checked");
    expect(recordPayments.getAttribute("data-state")).toBe("checked");
    expect(publish.getAttribute("data-state")).toBe("checked");

    await user.click(view);
    expect(view.getAttribute("data-state")).toBe("unchecked");
    expect(recordPayments.getAttribute("data-state")).toBe("unchecked");
    expect(publish.getAttribute("data-state")).toBe("unchecked");
  });

  it("disables Save only while unchanged, invalid, or submitting", async () => {
    const user = userEvent.setup();
    const { rerender } = renderEditor({ role: existingRole });
    const name = screen.getByRole("textbox", { name: "Role name" });
    const save = screen.getByRole("button", { name: "Save" });

    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.clear(name);
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.type(name, "Finance Lead");
    expect((save as HTMLButtonElement).disabled).toBe(false);

    rerender(
      <RoleEditor
        onArchive={vi.fn()}
        onClose={vi.fn()}
        onDuplicate={vi.fn()}
        onReload={vi.fn()}
        onSave={vi.fn()}
        open
        role={existingRole}
        saveResult={null}
        submitting
      />,
    );
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("blocks an assigned role archive with the exact consequence", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    renderEditor({
      onArchive,
      role: {
        ...existingRole,
        assignedUserCount: 2,
        pendingInvitationCount: 1,
      },
    });

    expect(
      screen.getByText(
        "Reassign 2 assigned users and revoke 1 pending invitation before archiving.",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Archive" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("archives an unassigned active role and duplicates with server-owned naming", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    const onDuplicate = vi.fn();
    renderEditor({ onArchive, onDuplicate, role: existingRole });

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    expect(onArchive).toHaveBeenCalledWith({
      expectedVersion: existingRole.version,
      id: existingRole.id,
    });
    expect(onDuplicate).toHaveBeenCalledWith(existingRole.id);
  });

  it("omits Archive for archived roles and keeps assignment status concise", () => {
    renderEditor({
      role: {
        ...existingRole,
        assignedUserCount: 0,
        status: "archived",
      },
    });

    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByText("0 users")).toBeTruthy();
    expect(screen.getByText("Archived roles cannot be assigned.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });

  it("submits the persisted role version without removal confirmation first", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderEditor({ onSave, role: existingRole });
    const finance = screen.getByRole("group", { name: "Finance" });

    await user.click(
      within(finance).getByRole("checkbox", { name: "Submit expenses" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      confirmRemovals: false,
      expectedVersion: 7,
      id: existingRole.id,
      name: existingRole.name,
      permissions: [
        "finance.view",
        "finance.record_payments",
        "finance.submit_expenses",
      ],
    });
  });

  it("confirms a permission removal with the exact affected-user consequence", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const props = {
      onArchive: vi.fn(),
      onClose: vi.fn(),
      onDuplicate: vi.fn(),
      onReload: vi.fn(),
      onSave,
      open: true,
      role: existingRole,
      saveResult: null,
    } satisfies React.ComponentProps<typeof RoleEditor>;
    const { rerender } = render(<RoleEditor {...props} />);
    const finance = screen.getByRole("group", { name: "Finance" });

    await user.click(
      within(finance).getByRole("checkbox", { name: "Record payments" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    const attemptedSubmission = onSave.mock.calls[0][0];
    rerender(
      <RoleEditor
        {...props}
        saveResult={{
          kind: "confirmation_required",
          affectedUserCount: 3,
          submission: attemptedSubmission,
        }}
      />,
    );

    expect(
      screen.getByText(
        "Removing these permissions will affect 3 assigned users.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirm changes" }));
    expect(onSave).toHaveBeenLastCalledWith({
      confirmRemovals: true,
      expectedVersion: 7,
      id: existingRole.id,
      name: existingRole.name,
      permissions: ["finance.view"],
    });
  });

  it("drops removal confirmation as soon as the exact submitted draft changes", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const props = {
      onArchive: vi.fn(),
      onClose: vi.fn(),
      onDuplicate: vi.fn(),
      onReload: vi.fn(),
      onSave,
      open: true,
      role: existingRole,
      saveResult: null,
    } satisfies React.ComponentProps<typeof RoleEditor>;
    const { rerender } = render(<RoleEditor {...props} />);
    const finance = screen.getByRole("group", { name: "Finance" });
    const recordPayments = within(finance).getByRole("checkbox", {
      name: "Record payments",
    });

    await user.click(recordPayments);
    await user.click(screen.getByRole("button", { name: "Save" }));
    const attemptedSubmission = onSave.mock.calls[0][0];
    rerender(
      <RoleEditor
        {...props}
        saveResult={{
          kind: "confirmation_required",
          affectedUserCount: 3,
          submission: attemptedSubmission,
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Confirm changes" }),
    ).toBeTruthy();

    await user.click(recordPayments);
    await user.click(
      within(finance).getByRole("checkbox", { name: "Submit expenses" }),
    );

    expect(
      screen.queryByText(
        "Removing these permissions will affect 3 assigned users.",
      ),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Confirm changes" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenLastCalledWith({
      confirmRemovals: false,
      expectedVersion: 7,
      id: existingRole.id,
      name: existingRole.name,
      permissions: [
        "finance.view",
        "finance.record_payments",
        "finance.submit_expenses",
      ],
    });
  });

  it("states truthfully when permission removal affects no assigned users", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const props = {
      onArchive: vi.fn(),
      onClose: vi.fn(),
      onDuplicate: vi.fn(),
      onReload: vi.fn(),
      onSave,
      open: true,
      role: existingRole,
      saveResult: null,
    } satisfies React.ComponentProps<typeof RoleEditor>;
    const { rerender } = render(<RoleEditor {...props} />);
    const finance = screen.getByRole("group", { name: "Finance" });

    await user.click(
      within(finance).getByRole("checkbox", { name: "Record payments" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    rerender(
      <RoleEditor
        {...props}
        saveResult={{
          kind: "confirmation_required",
          affectedUserCount: 0,
          submission: onSave.mock.calls[0][0],
        }}
      />,
    );

    expect(
      screen.getByText(
        "Removing these permissions will not affect any assigned users.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Confirm changes" }),
    ).toBeTruthy();
  });

  it.each([
    [1, "Revoke 1 pending invitation before archiving."],
    [2, "Revoke 2 pending invitations before archiving."],
  ])(
    "uses revoke language for %i pending invitation dependencies",
    (pendingInvitationCount, consequence) => {
      renderEditor({
        role: {
          ...existingRole,
          assignedUserCount: 0,
          pendingInvitationCount,
        },
      });

      expect(screen.getByText(consequence)).toBeTruthy();
      expect(screen.queryByText(/Reassign .*pending invitation/i)).toBeNull();
    },
  );

  it("shows a changed-role recovery action and reloads the persisted role", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    renderEditor({
      onReload,
      role: existingRole,
      saveResult: { kind: "stale" },
    });

    expect(
      screen.getByText("This role changed elsewhere. Reload before saving."),
    ).toBeTruthy();
    expect(screen.queryByText(/stale|version/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledWith(existingRole.id);
  });

  it("announces and enforces role names between 2 and 80 characters", async () => {
    const user = userEvent.setup();
    renderEditor();
    const name = screen.getByRole("textbox", { name: "Role name" });

    expect(name.getAttribute("maxlength")).toBe("80");
    expect(screen.getByText("2–80 characters")).toBeTruthy();
    await user.type(name, "A");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByText("Role name must be between 2 and 80 characters."),
    ).toBeTruthy();
    expect(name.getAttribute("aria-describedby")).toContain("role-name-error");
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps archived roles read-only while allowing Duplicate", async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();
    renderEditor({
      onDuplicate,
      role: { ...existingRole, status: "archived" },
    });

    expect(
      (screen.getByRole("textbox", { name: "Role name" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      screen
        .getAllByRole("checkbox")
        .every((control) => control.hasAttribute("disabled")),
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Duplicate" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(onDuplicate).toHaveBeenCalledWith(existingRole.id);
  });

  it("disables persisted-state actions while the editor has unsaved changes", async () => {
    const user = userEvent.setup();
    renderEditor({ role: existingRole });

    await user.type(
      screen.getByRole("textbox", { name: "Role name" }),
      " updated",
    );

    expect(
      (screen.getByRole("button", { name: "Duplicate" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Archive" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

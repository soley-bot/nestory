/* @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RolePermissionPreview } from "./role-permission-preview";
import { RoleEditor } from "./role-editor";

beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});
afterEach(cleanup);

describe("role permission preview", () => {
  it("shows selected operations, existing branch limits and no management controls", () => {
    render(<RolePermissionPreview pendingChanges={false} permissions={["maintenance.view"]} />);
    const preview = screen.getByRole("region", { name: "Permission preview" });
    expect(within(preview).getByText("Current role permissions.")).toBeTruthy();
    expect(within(preview).getByText("One active assigned branch is required. Role edits do not change branch assignments.")).toBeTruthy();
    expect(within(preview).getByText("View")).toBeTruthy();
    expect(within(preview).getAllByText("None")).toHaveLength(4);
    expect(within(preview).queryByRole("checkbox")).toBeNull();
    expect(within(preview).queryByRole("button")).toBeNull();
  });

  it("explains sensitive effects only when their controlling key is selected", () => {
    const { rerender } = render(<RolePermissionPreview pendingChanges permissions={["leases.change_terms", "finance.publish"]} />);
    expect(screen.getByText("Change terms also controls deposit events and reversals.")).toBeTruthy();
    expect(screen.getByText("Publish also controls report access and PDF/Excel exports.")).toBeTruthy();
    rerender(<RolePermissionPreview pendingChanges permissions={["leases.view", "finance.view"]} />);
    expect(screen.queryByText("Related permission checks")).toBeNull();
  });

  it("shows removal impact without claiming the draft has been saved", () => {
    render(<RolePermissionPreview baseline={["finance.publish"]} pendingChanges permissions={["finance.view"]} />);
    expect(screen.getByText("Proposed permissions. Save to apply.")).toBeTruthy();
    expect(screen.getByText("Removing: Publish")).toBeTruthy();
    expect(screen.queryByText("Current role permissions.")).toBeNull();
  });

  it("keeps an archived role unavailable even if it contains permissions", () => {
    render(<RolePermissionPreview archived pendingChanges={false} permissions={["finance.publish"]} />);
    expect(screen.getByText("Archived — unavailable for assignment.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("describes sensitive consequences beside unchecked controls before selection", () => {
    const onSave = vi.fn();
    render(<RoleEditor onArchive={vi.fn()} onClose={vi.fn()} onDuplicate={vi.fn()} onReload={vi.fn()} onSave={onSave} open role={null} saveResult={null} />);
    for (const [group, label, consequence] of [
      ["Leases", "Change terms", "Change terms also controls deposit events and reversals."],
      ["Finance", "Publish", "Publish also controls report access and PDF/Excel exports."],
    ]) {
      const checkbox = within(screen.getByRole("group", { name: group })).getByRole("checkbox", { name: label });
      const hint = document.getElementById(checkbox.getAttribute("aria-describedby")!);
      expect(checkbox.getAttribute("aria-checked")).toBe("false");
      expect(hint?.textContent).toBe(consequence);
      expect(checkbox.closest("label")?.parentElement).toBe(hint?.parentElement);
    }
    expect(screen.getByText("Unavailable in current workspace controls")).toBeTruthy();
    expect(screen.queryByText("Not included in a custom role")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("updates the editor preview without granting or saving automatically", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<RoleEditor onArchive={vi.fn()} onClose={vi.fn()} onDuplicate={vi.fn()} onReload={vi.fn()} onSave={onSave} open role={null} saveResult={null} />);
    await user.type(screen.getByRole("textbox", { name: "Role name" }), "Reports reader");
    await user.click(within(screen.getByRole("group", { name: "Finance" })).getByRole("checkbox", { name: "Publish" }));
    const preview = screen.getByRole("region", { name: "Permission preview" });
    expect(within(preview).getByText("Adding: View, Publish")).toBeTruthy();
    expect(within(preview).getByText("Publish also controls report access and PDF/Excel exports.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      confirmRemovals: false, expectedVersion: null, id: null,
      name: "Reports reader", permissions: ["finance.view", "finance.publish"],
    });
  });

  it("keeps permission removal versioned and subject to the existing confirmation flow", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const role = { assignedUserCount: 3, id: "synthetic-role", name: "Daily finance", pendingInvitationCount: 1, permissions: ["finance.view", "finance.record_payments"] as const, status: "active" as const, version: 7 };
    render(<RoleEditor onArchive={vi.fn()} onClose={vi.fn()} onDuplicate={vi.fn()} onReload={vi.fn()} onSave={onSave} open role={role} saveResult={null} />);
    await user.click(within(screen.getByRole("group", { name: "Finance" })).getByRole("checkbox", { name: "Record payments" }));
    expect(within(screen.getByRole("region", { name: "Permission preview" })).getByText("Removing: Record payments")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      confirmRemovals: false, expectedVersion: 7, id: role.id,
      name: role.name, permissions: ["finance.view"],
    });
    expect(screen.queryByRole("button", { name: "Confirm changes" })).toBeNull();
  });
});

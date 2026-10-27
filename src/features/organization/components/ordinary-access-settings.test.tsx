/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { activate, refresh, routerRefresh } = vi.hoisted(() => ({
  activate: vi.fn(), refresh: vi.fn(), routerRefresh: vi.fn(),
}));
vi.mock("../ordinary-access-actions", () => ({
  activateOrdinaryAccessAction: activate,
  refreshOrdinaryAccessReadinessAction: refresh,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerRefresh }) }));
import { OrdinaryAccessSettings } from "./ordinary-access-settings";
import type { OrdinaryAccessReadiness, OrdinaryAccessReadResult } from "../ordinary-access";
import { ordinaryAccessTestReadiness } from "../ordinary-access-test-fixtures";

const ready = ordinaryAccessTestReadiness();
const enabled: OrdinaryAccessReadiness = {
  ...ready, authorization_version: 4, ordinary_access_enabled: true, activation_ready: false,
};
function renderPanel(initialReadiness: OrdinaryAccessReadResult = { kind: "ready", readiness: ready }) {
  return render(<OrdinaryAccessSettings initialReadiness={initialReadiness} organizationId={ready.organization_id} organizationName="Test company" />);
}
beforeEach(() => {
  vi.resetAllMocks();
  refresh.mockResolvedValue({ kind: "ready", readiness: ready });
  activate.mockResolvedValue({ kind: "activated", readiness: enabled });
});
afterEach(cleanup);

describe("staff access activation review", () => {
  it("requires a fresh review and deliberate confirmation, with cancel preserving containment", async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(activate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Review staff access" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Enable staff access?" });
    expect(refresh).toHaveBeenCalledOnce();
    expect(within(dialog).getByText(/Enable access for Test company/)).toBeTruthy();
    expect(within(dialog).getByText(/No memberships, role assignments, invitation acceptances or emails/)).toBeTruthy();
    expect(activate).not.toHaveBeenCalled();
    const cancel = within(dialog).getByRole("button", { name: "Keep contained" });
    // The dialog mounts before the async readiness transition clears pending.
    // user-event does not retry a click made while the button is disabled.
    await waitFor(() => expect(cancel).toHaveProperty("disabled", false));
    await user.click(cancel);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(activate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Review staff access" }));
  });

  it("submits the refreshed preconditions and displays only verified success", async () => {
    const user = userEvent.setup();
    const current = { ...ready, authorization_version: 6, impact_fingerprint: "b".repeat(64) };
    refresh.mockResolvedValue({ kind: "ready", readiness: current });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Review staff access" }));
    await user.click(await screen.findByRole("button", { name: "Confirm enable staff access" }));
    await waitFor(() => expect(screen.getByText("Staff access enabled.")).toBeTruthy());
    expect(activate).toHaveBeenCalledExactlyOnceWith({
      confirm: true, expectedVersion: 6, expectedImpactFingerprint: "b".repeat(64),
    });
    expect(screen.queryByRole("button", { name: "Review staff access" })).toBeNull();
    expect(routerRefresh).toHaveBeenCalledOnce();
  });

  it("blocks duplicate confirmation and dismissal while activation is pending", async () => {
    const user = userEvent.setup();
    let resolveActivation!: (value: unknown) => void;
    activate.mockImplementation(() => new Promise((resolve) => { resolveActivation = resolve; }));
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Review staff access" }));
    const confirm = await screen.findByRole("button", { name: "Confirm enable staff access" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(activate).toHaveBeenCalledOnce();
    await waitFor(() => expect((screen.getByRole("button", { name: "Keep contained" }) as HTMLButtonElement).disabled).toBe(true));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep contained" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await act(async () => resolveActivation({ kind: "activated", readiness: enabled }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(activate).toHaveBeenCalledOnce();
  });

  it("discards stale consent, reloads readiness and never resubmits automatically", async () => {
    const user = userEvent.setup();
    activate.mockResolvedValue({ kind: "stale", message: "Staff access changed. Review refreshed readiness before activating." });
    refresh
      .mockResolvedValueOnce({ kind: "ready", readiness: ready })
      .mockResolvedValueOnce({ kind: "ready", readiness: {
        ...ready, activation_ready: false, blockers: ["invalid_memberships"],
      } });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Review staff access" }));
    await user.click(await screen.findByRole("button", { name: "Confirm enable staff access" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(await screen.findByText(/Review existing staff memberships/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Staff access changed");
    expect(screen.queryByRole("button", { name: "Review staff access" })).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(activate).toHaveBeenCalledOnce();
  });

  it("reconciles a lost activation response through a read without repeating the mutation", async () => {
    const user = userEvent.setup();
    activate.mockRejectedValue(new Error("Lost response"));
    refresh
      .mockResolvedValueOnce({ kind: "ready", readiness: ready })
      .mockResolvedValueOnce({ kind: "ready", readiness: enabled });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Review staff access" }));
    await user.click(await screen.findByRole("button", { name: "Confirm enable staff access" }));
    expect(await screen.findByText("Enabled")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("could not be confirmed");
    expect(activate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Review staff access" })).toBeNull();
  });

  it("returns focus to the heading while a stale result is still refreshing readiness", async () => {
    const user = userEvent.setup();
    let resolveRefresh!: (result: OrdinaryAccessReadResult) => void;
    activate.mockResolvedValue({
      kind: "stale",
      message: "Staff access changed. Review refreshed readiness before activating.",
    });
    refresh
      .mockResolvedValueOnce({ kind: "ready", readiness: ready })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Review staff access" }));
    await user.click(await screen.findByRole("button", { name: "Confirm enable staff access" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect((screen.getByRole("button", { name: "Checking readiness…" }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Staff access" }),
    ));
    expect(activate).toHaveBeenCalledOnce();

    await act(async () => resolveRefresh({
      kind: "unavailable", message: "Staff access readiness could not be loaded. Refresh to try again.",
    }));
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Staff access" }));
  });

  it("keeps an unavailable refresh closed and recoverable", async () => {
    const user = userEvent.setup();
    refresh.mockRejectedValue(new Error("Read failed"));
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Review staff access" }));
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Review staff access" })).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh readiness" })).toBeTruthy();
    expect(activate).not.toHaveBeenCalled();
  });

  it("shows a contained requirement without an activation control", () => {
    renderPanel({ kind: "ready", readiness: {
      ...ready, activation_ready: false, active_branch_count: 0, blockers: ["no_active_branch"],
    } });
    expect(screen.getByText("Create or restore an active branch.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review staff access" })).toBeNull();
    expect(activate).not.toHaveBeenCalled();
  });

  it("drops open confirmation when newly received authority changes", async () => {
    const user = userEvent.setup();
    const rendered = renderPanel();
    await user.click(screen.getByRole("button", { name: "Review staff access" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    rendered.rerender(<OrdinaryAccessSettings
      initialReadiness={{ kind: "ready", readiness: { ...ready, authorization_version: 7 } }}
      organizationId={ready.organization_id}
      organizationName="Test company"
    />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(activate).not.toHaveBeenCalled();
  });

  it("refuses a refreshed preview when the current company changed", async () => {
    const user = userEvent.setup();
    refresh.mockResolvedValue({ kind: "ready", readiness: {
      ...ready, organization_id: "99999999-9999-4999-8999-999999999999",
    } });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Review staff access" }));
    expect(await screen.findByText(/The current company changed/)).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(activate).not.toHaveBeenCalled();
  });

  it("shows the exact refreshed recipients, branches and permissions after a same-count change", async () => {
    const user = userEvent.setup();
    const updated = ordinaryAccessTestReadiness();
    updated.impact_fingerprint = "c".repeat(64);
    updated.impact_memberships[0] = {
      ...updated.impact_memberships[0],
      email: "replacement@example.com",
      branch_name: "South branch",
      role_name: "Finance reviewer",
      permission_keys: ["finance.view", "finance.approve_expenses"],
    };
    refresh.mockResolvedValue({ kind: "ready", readiness: updated });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Review staff access" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("replacement@example.com")).toBeTruthy();
    expect(within(dialog).queryByText("staff-one@example.com")).toBeNull();
    expect(within(dialog).getByText("South branch · Finance reviewer")).toBeTruthy();
    expect(within(dialog).getByText("Finance: Approve expenses")).toBeTruthy();
    expect(within(dialog).getByText("invited@example.com")).toBeTruthy();
    expect(activate).not.toHaveBeenCalled();
    await user.click(await within(dialog).findByRole("button", { name: "Confirm enable staff access" }));
    expect(activate).toHaveBeenCalledWith({
      confirm: true, expectedVersion: updated.authorization_version, expectedImpactFingerprint: "c".repeat(64),
    });
  });
});

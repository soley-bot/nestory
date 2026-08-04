/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SideDrawer,
  useDrawerDraftGuard,
} from "@/components/ui/side-drawer";
import type { DraftStatus } from "@/components/ui/draft-action-bar";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function DraftGuard({
  onDiscard,
  status,
}: {
  onDiscard: () => void;
  status: DraftStatus;
}) {
  const guard = useMemo(() => ({ onDiscard, status }), [onDiscard, status]);
  useDrawerDraftGuard(guard);

  return <button type="button">Drawer field</button>;
}

function DrawerHarness({ status = "dirty" }: { status?: DraftStatus }) {
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);

  return open ? (
    <SideDrawer onClose={close} open title="Edit property">
      <DraftGuard onDiscard={close} status={status} />
    </SideDrawer>
  ) : (
    <p>Drawer closed</p>
  );
}

describe("side drawer dismissal confirmation", () => {
  it("opens a focused modal above the dirty drawer and restores focus when cancelled", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    const drawer = screen.getByRole("dialog", { name: "Edit property" });
    const closeButton = screen.getByRole("button", { name: "Close drawer" });
    await user.click(closeButton);

    const confirmation = screen.getByRole("alertdialog", {
      name: "Discard unsaved changes?",
    });
    expect(drawer.contains(confirmation)).toBe(false);
    expect(within(confirmation).getByText("Discard unsaved changes?")).not.toBeNull();
    expect(document.activeElement).toBe(
      within(confirmation).getByRole("button", { name: "Keep editing" }),
    );

    await user.click(
      within(confirmation).getByRole("button", { name: "Keep editing" }),
    );

    expect(
      screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeNull();
    expect(screen.getByRole("dialog", { name: "Edit property" })).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(closeButton));
  });

  it("discards the registered draft and closes only after confirmation", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByText("Drawer closed")).not.toBeNull();
    expect(
      screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeNull();
  });

  it("keeps the destructive dialog open on backdrop click and cancels on Escape", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    const closeButton = screen.getByRole("button", { name: "Close drawer" });
    await user.click(closeButton);

    const firstConfirmation = screen.getByRole("alertdialog", {
      name: "Discard unsaved changes?",
    });
    const confirmationBackdrop = document.querySelector<HTMLElement>(
      '[data-slot="alert-dialog-overlay"]',
    );
    expect(confirmationBackdrop).not.toBeNull();
    await user.click(confirmationBackdrop!);
    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).not.toBeNull();

    await user.click(
      within(firstConfirmation).getByRole("button", { name: "Keep editing" }),
    );

    await user.click(closeButton);
    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).not.toBeNull();
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeNull();
    expect(screen.getByRole("dialog", { name: "Edit property" })).not.toBeNull();
  });

  it("shows a non-destructive waiting modal while a save is in progress", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness status="saving" />);

    await user.click(screen.getByRole("button", { name: "Close drawer" }));

    const confirmation = screen.getByRole("alertdialog", {
      name: "Saving is still in progress",
    });
    expect(within(confirmation).getByText("Saving is still in progress")).not.toBeNull();
    expect(
      within(confirmation).queryByRole("button", { name: "Discard changes" }),
    ).toBeNull();

    await user.click(
      within(confirmation).getByRole("button", { name: "Continue waiting" }),
    );

    expect(
      screen.queryByRole("alertdialog", { name: "Saving is still in progress" }),
    ).toBeNull();
    expect(screen.getByRole("dialog", { name: "Edit property" })).not.toBeNull();
  });
});

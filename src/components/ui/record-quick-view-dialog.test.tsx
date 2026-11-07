/* @vitest-environment jsdom */

import * as Popover from "@radix-ui/react-popover";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordQuickViewDialog } from "@/components/ui/record-quick-view-dialog";
import { useOverlayDraftGuard, useOverlayFormDraftGuard } from "@/components/ui/overlay-dismissal-context";
import { DatePickerField } from "@/components/ui/date-picker-field";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RecordQuickViewDialog layered Escape handling", () => {
  it("keeps the saving notice when a save starts during discard confirmation", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    function Guard({ pending }: { pending: boolean }) { useOverlayDraftGuard({ status: pending ? "saving" : "dirty" }); return null; }
    const view = (pending: boolean) => <RecordQuickViewDialog label="Case quick view" onClose={close} open><Guard pending={pending} /></RecordQuickViewDialog>;
    const { rerender } = render(view(false));
    await user.click(screen.getByRole("button", { name: "Close quick view" }));
    rerender(view(true));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByRole("alertdialog", { name: "Saving is still in progress" })).not.toBeNull();
    expect(close).not.toHaveBeenCalled();
  });

  it("clears a saving notice when the quick view closes externally and reopens", async () => {
    const user = userEvent.setup();
    const view = (open: boolean) => <RecordQuickViewDialog label="Case quick view" onClose={vi.fn()} open={open}><GuardedInput name="note" pending /></RecordQuickViewDialog>;
    const { rerender } = render(view(true));
    await user.click(screen.getByRole("button", { name: "Close quick view" }));
    rerender(view(false));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    rerender(view(true));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Case quick view" }).hasAttribute("inert")).toBe(false);
  });

  it("closes an in-scope calendar with Escape while preserving the quick view", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(<RecordQuickViewDialog label="Case quick view" onClose={close} open><DatePickerField ariaLabel="Paid date" name="paidDate" /></RecordQuickViewDialog>);
    await user.click(screen.getByRole("combobox", { name: "Paid date" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Previous year" })).toBeNull();
    expect(close).not.toHaveBeenCalled();
  });
  it("closes a portaled actions popover before closing the quick view", async () => {
    const user = userEvent.setup();
    render(<QuickViewWithActions />);

    expect(
      screen.getByRole("dialog", { name: "Property quick view" }),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      screen.getByRole("button", { name: "Archive property" }),
    ).not.toBeNull();

    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("dialog", { name: "Property quick view" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Archive property" }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "More actions" }),
    );

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Property quick view" }),
    ).toBeNull();
  });

  it("keeps a nested calendar's Tab sequence inside its portal", async () => {
    const user = userEvent.setup();
    render(<RecordQuickViewDialog label="Case quick view" onClose={vi.fn()} open>
      <DatePickerField ariaLabel="Paid date" name="paidDate" />
    </RecordQuickViewDialog>);
    await user.click(screen.getByRole("combobox", { name: "Paid date" }));
    const yearButton = screen.getByRole("button", { name: "Previous year" });
    yearButton.focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("button", { name: "Previous year" })).not.toBeNull();
  });

  it("protects a dirty form even when another inline form is clean", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(<RecordQuickViewDialog label="Case quick view" onClose={close} open>
      <GuardedInput name="first" />
      <GuardedInput name="second" />
    </RecordQuickViewDialog>);
    await user.type(screen.getByRole("textbox", { name: "first" }), "changed");
    await user.click(screen.getByRole("button", { name: "Close quick view" }));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByText("Discard unsaved changes?")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rebases a guarded form after repeated successful saves", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const view = (pending: boolean, saved: boolean) =>
      <RecordQuickViewDialog label="Case quick view" onClose={close} open>
        <GuardedInput name="note" pending={pending} saved={saved} />
      </RecordQuickViewDialog>;
    const { rerender } = render(view(false, false));
    await user.type(screen.getByRole("textbox", { name: "note" }), "first");
    rerender(view(true, false));
    rerender(view(false, true));
    await user.type(screen.getByRole("textbox", { name: "note" }), " second");
    rerender(view(true, true));
    rerender(view(false, true));
    await user.click(screen.getByRole("button", { name: "Close quick view" }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
  });
});

function GuardedInput({ name, pending = false, saved = false }: { name: string; pending?: boolean; saved?: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const { onChangeCapture, onInput } = useOverlayFormDraftGuard(ref, pending, saved);
  return <form onChangeCapture={onChangeCapture} onInput={onInput} ref={ref}>
    <label>{name}<input name={name} /></label>
  </form>;
}

function QuickViewWithActions() {
  const [open, setOpen] = useState(true);

  return (
    <RecordQuickViewDialog
      label="Property quick view"
      onClose={() => setOpen(false)}
      open={open}
    >
      <div className="p-4">
        <Popover.Root>
          <Popover.Trigger asChild>
            <button type="button">More actions</button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content>
              <button type="button">Archive property</button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </RecordQuickViewDialog>
  );
}

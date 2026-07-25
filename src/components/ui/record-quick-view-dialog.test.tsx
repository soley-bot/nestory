/* @vitest-environment jsdom */

import * as Popover from "@radix-ui/react-popover";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordQuickViewDialog } from "@/components/ui/record-quick-view-dialog";

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
});

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

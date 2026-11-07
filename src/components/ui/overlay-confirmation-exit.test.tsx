/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/ui/modal";
import { RecordQuickViewDialog } from "@/components/ui/record-quick-view-dialog";
import { SideDrawer } from "@/components/ui/side-drawer";
import { useOverlayDraftGuard } from "@/components/ui/overlay-dismissal-context";

beforeEach(() => {
  const getStyles = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const styles = getStyles(element, pseudo);
    if (!element.getAttribute("data-slot")?.startsWith("alert-dialog-")) return styles;
    // JSDOM has no CSS animations. Give real Radix Presence the live computed
    // animation names that keep the closed confirmation mounted until exit ends.
    return new Proxy(styles, {
      get(target, property) {
        if (property === "animationName") return element.getAttribute("data-state") === "closed" ? "confirmation-exit" : "confirmation-enter";
        return Reflect.get(target, property, target);
      },
    });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function DirtyGuard() {
  const guard = useMemo(() => ({ status: "dirty" as const }), []);
  useOverlayDraftGuard(guard);
  return <input aria-label="Draft name" defaultValue="Synthetic unsaved name" />;
}

function Harness({ kind }: { kind: "drawer" | "modal" | "quick view" }) {
  const [open, setOpen] = useState(true);
  const props = { open, onClose: () => setOpen(false), children: <DirtyGuard /> };
  return kind === "drawer" ? <SideDrawer {...props} title="Synthetic draft" />
    : kind === "modal" ? <Modal {...props} title="Synthetic draft" />
      : <RecordQuickViewDialog {...props} label="Synthetic draft" />;
}

describe("confirmation exit copy", () => {
  it.each(["drawer", "modal", "quick view"] as const)("does not flash a saving message when keeping a dirty %s", async (kind) => {
    const user = userEvent.setup();
    render(<Harness kind={kind} />);
    await user.click(screen.getByRole("button", { name: `Close ${kind}` }));
    const confirmation = screen.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(confirmation.isConnected).toBe(true);
    expect(confirmation.getAttribute("data-state")).toBe("closed");
    expect(confirmation.textContent).toContain("Discard unsaved changes?");
    expect(confirmation.textContent).toContain("Keep editing");
    expect(confirmation.textContent).not.toContain("Saving is still in progress");
    expect((screen.getByLabelText("Draft name") as HTMLInputElement).value).toBe("Synthetic unsaved name");
  });
});

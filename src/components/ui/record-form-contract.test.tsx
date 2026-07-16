/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RecordField,
  RecordForm,
  type RecordFormActionState,
} from "@/components/ui/record-form";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";

beforeEach(() => {
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

function DrawerHarness({
  hideSaveOnSuccess = false,
  onCloseEffect,
  pending = false,
  state = {},
}: {
  hideSaveOnSuccess?: boolean;
  onCloseEffect?: () => void;
  pending?: boolean;
  state?: RecordFormActionState;
}) {
  const [open, setOpen] = useState(true);
  const close = () => {
    onCloseEffect?.();
    setOpen(false);
  };

  return open ? (
    <SideDrawer onClose={close} open title="Add property">
      <RecordForm
        action={() => undefined}
        ariaLabel="Add property form"
        hideSaveOnSuccess={hideSaveOnSuccess}
        onCancel={close}
        pending={pending}
        saveLabel="Add property"
        savingLabel="Adding property"
        state={state}
      >
        <RecordField
          error={state.fieldErrors?.name?.[0]}
          label="Property name"
          name="name"
          required
        >
          <Input name="name" required />
        </RecordField>
        <RecordField
          error={state.fieldErrors?.code?.[0]}
          label="Code"
          name="code"
          required
        >
          <Input name="code" required />
        </RecordField>
      </RecordForm>
    </SideDrawer>
  ) : (
    <p>Drawer closed</p>
  );
}

function PortalControlsHarness() {
  return (
    <SideDrawer onClose={vi.fn()} open title="Add lease">
      <RecordForm
        action={() => undefined}
        ariaLabel="Add lease form"
        onCancel={vi.fn()}
        pending={false}
        saveLabel="Add lease"
        state={{}}
      >
        <RecordField label="Status" name="status" required>
          <SelectControl
            defaultValue="draft"
            name="status"
            options={[
              { label: "Draft", value: "draft" },
              { label: "Active", value: "active" },
            ]}
            required
          />
        </RecordField>
        <RecordField label="Start date" name="startDate" required>
          <DatePickerField name="startDate" required />
        </RecordField>
      </RecordForm>
    </SideDrawer>
  );
}

function DeferredDefaultHarness() {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => setValue("vacant"));
  }, []);

  useEffect(() => {
    if (value) {
      inputRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, [value]);

  return (
    <RecordForm
      action={() => undefined}
      ariaLabel="Add unit form"
      onCancel={vi.fn()}
      pending={false}
      saveLabel="Add unit"
      state={{}}
    >
      <input name="status" readOnly ref={inputRef} type="hidden" value={value} />
    </RecordForm>
  );
}

describe("record form contract", () => {
  it("shows required fields and associates inline server errors with the first invalid control", () => {
    const { rerender } = render(<DrawerHarness />);

    rerender(
      <DrawerHarness
        state={{
          fieldErrors: {
            code: ["Code is required."],
            name: ["Name is required."],
          },
          message: "Review the highlighted fields.",
          status: "error",
        }}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Add property" });
    const name = within(dialog).getByRole("textbox", { name: /Property name/ });
    const error = within(dialog).getByText("Name is required.");

    expect(
      within(dialog).getAllByText("*", { selector: "[aria-hidden='true']" }),
    ).toHaveLength(2);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    expect(document.activeElement).toBe(name);
    expect(
      screen
        .getAllByRole("alert")
        .some((alert) => alert.textContent?.includes("Review the highlighted fields.")),
    ).toBe(true);
  });

  it("tracks changed and reverted values and routes every dirty close through one decision", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    const name = screen.getByRole("textbox", { name: /Property name/ });
    expect(screen.getByText("No changes")).not.toBeNull();

    await user.type(name, "Harbor House");
    expect(screen.getByText("Unsaved changes")).not.toBeNull();

    await user.clear(name);
    expect(screen.getByText("No changes")).not.toBeNull();
    await user.type(name, "Harbor House");
    expect(screen.getByText("Unsaved changes")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(screen.getByRole("dialog", { name: "Add property" })).not.toBeNull();
    expect(screen.getByText("Discard unsaved changes?")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
    expect((name as HTMLInputElement).value).toBe("Harbor House");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard unsaved changes?")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    const backdrop = document.querySelector<HTMLButtonElement>(
      "[role='dialog'] > button[aria-hidden='true']",
    );
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);
    expect(screen.getByText("Discard unsaved changes?")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    await user.keyboard("{Escape}");
    expect(screen.getByText("Discard unsaved changes?")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByText("Drawer closed")).not.toBeNull();
  });

  it("keeps explicit actions available while clean and freezes them while saving", () => {
    const { rerender } = render(<DrawerHarness />);

    expect(screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled"))
      .toBe(false);
    expect(screen.getByRole("button", { name: "Add property" }).hasAttribute("disabled"))
      .toBe(false);

    rerender(<DrawerHarness pending />);

    const form = screen.getByRole("form", { name: "Add property form" });
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Adding property")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: /Property name/ }).matches(":disabled"))
      .toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled"))
      .toBe(true);
    expect(screen.getByRole("button", { name: "Add property" }).hasAttribute("disabled"))
      .toBe(true);
  });

  it("closes in one confirmation after a dirty Cancel", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    await user.type(
      screen.getByRole("textbox", { name: /Property name/ }),
      "Harbor House",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByText("Drawer closed")).not.toBeNull();
    expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
  });

  it("calls the shared close callback once after confirmed dirty dismissal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DrawerHarness onCloseEffect={onClose} />);

    await user.type(
      screen.getByRole("textbox", { name: /Property name/ }),
      "Harbor House",
    );
    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("tracks select-only edits and keeps the select portal in the drawer focus scope", async () => {
    const user = userEvent.setup();
    render(<PortalControlsHarness />);
    const dialog = screen.getByRole("dialog", { name: "Add lease" });

    await user.click(screen.getByRole("combobox", { name: /Status/ }));
    const listbox = screen.getByRole("listbox");
    expect(dialog.querySelector("aside")?.contains(listbox)).toBe(true);
    await user.click(screen.getByRole("option", { name: "Active" }));

    expect(screen.getByText("Unsaved changes")).not.toBeNull();
  });

  it("tracks date-only edits and Escape closes the calendar before the drawer", async () => {
    const user = userEvent.setup();
    render(<PortalControlsHarness />);
    const dialog = screen.getByRole("dialog", { name: "Add lease" });

    await user.click(screen.getByRole("button", { name: /Start date/ }));
    const today = screen.getByRole("button", { name: "Today" });
    expect(dialog.querySelector("aside")?.contains(today)).toBe(true);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Add lease" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /Start date/ }));
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByText("Unsaved changes")).not.toBeNull();
  });

  it("shows a returned server error before treating later edits as a new draft", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DrawerHarness />);
    const name = screen.getByRole("textbox", { name: /Property name/ });

    await user.type(name, "Duplicate code");
    rerender(
      <DrawerHarness
        state={{ message: "That code is already used.", status: "error" }}
      />,
    );

    expect(screen.getByTestId("draft-action-bar").getAttribute("data-status")).toBe(
      "error",
    );
    expect(screen.getByText("Changes not saved")).not.toBeNull();

    await user.click(name);
    expect(screen.getByTestId("draft-action-bar").getAttribute("data-status")).toBe(
      "error",
    );

    await user.type(name, " updated");
    expect(screen.getByTestId("draft-action-bar").getAttribute("data-status")).toBe(
      "dirty",
    );

    const sameError = {
      message: "That code is already used.",
      status: "error" as const,
    };
    rerender(<DrawerHarness pending state={sameError} />);
    expect(screen.getByTestId("draft-action-bar").getAttribute("data-status")).toBe(
      "saving",
    );
    rerender(<DrawerHarness state={sameError} />);
    expect(screen.getByTestId("draft-action-bar").getAttribute("data-status")).toBe(
      "error",
    );
  });

  it("locks a completed create form and cannot create the same record twice", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DrawerHarness hideSaveOnSuccess />);
    const name = screen.getByRole("textbox", { name: /Property name/ });

    await user.type(name, "Harbor House");
    rerender(
      <DrawerHarness
        hideSaveOnSuccess
        state={{ message: "Property added.", status: "success" }}
      />,
    );

    expect(screen.getByText("Changes saved")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Add property" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).not.toBeNull();
    expect(name.matches(":disabled")).toBe(true);
  });

  it("captures the clean baseline after deferred control defaults settle", async () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    render(<DeferredDefaultHarness />);

    await waitFor(() => {
      expect(
        document.querySelector<HTMLInputElement>('input[name="status"]')?.value,
      ).toBe("vacant");
    });
    frameCallbacks.splice(0).forEach((callback) => callback(0));

    await waitFor(() => {
      expect(screen.getByText("No changes")).not.toBeNull();
    });
  });
});

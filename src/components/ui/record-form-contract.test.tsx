/* @vitest-environment jsdom */

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useActionState, useEffect, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RecordField,
  RecordForm,
  type RecordFormActionState,
} from "@/components/ui/record-form";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
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

function ModalSelectHarness() {
  return (
    <Modal onClose={vi.fn()} open title="Record payment">
      <div className="p-4">
        <label id="deposit-to-label">Deposit to</label>
        <SelectControl
          aria-labelledby="deposit-to-label"
          options={[
            { label: "Operating bank account", value: "operating" },
            { label: "Petty cash", value: "petty" },
          ]}
        />
      </div>
    </Modal>
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
      <input
        name="status"
        readOnly
        ref={inputRef}
        type="hidden"
        value={value}
      />
    </RecordForm>
  );
}

const failureAction = vi.fn(
  async (
    previousState: RecordFormActionState,
    formData: FormData,
  ): Promise<RecordFormActionState> => {
    void previousState;
    void formData;

    return {
      fieldErrors: {
        code: ["Code is already used."],
        name: ["Name needs review."],
      },
      message: "Review the highlighted fields.",
      status: "error",
    };
  },
);

function RealActionHarness() {
  const [state, action, pending] = useActionState(failureAction, {});

  return (
    <RecordForm
      action={action}
      ariaLabel="Add property form"
      onCancel={vi.fn()}
      pending={pending}
      saveLabel="Add property"
      state={state}
    >
      <RecordField
        error={state.fieldErrors?.name?.[0]}
        label="Property name"
        name="name"
      >
        <Input name="name" />
      </RecordField>
      <RecordField
        error={state.fieldErrors?.code?.[0]}
        label="Code"
        name="code"
      >
        <Input name="code" />
      </RecordField>
      <RecordField label="Address" name="address">
        <Input name="address" />
      </RecordField>
    </RecordForm>
  );
}

describe("record form contract", () => {
  it("preserves submitted values and expires only the edited field error before retry", async () => {
    const user = userEvent.setup();
    render(<RealActionHarness />);
    const name = screen.getByRole("textbox", { name: "Property name" });
    const code = screen.getByRole("textbox", { name: "Code" });
    const address = screen.getByRole("textbox", { name: "Address" });

    await user.type(name, "Harbor House");
    await user.type(code, "HBR");
    await user.type(address, "12 River Road");
    await user.click(screen.getByRole("button", { name: "Add property" }));

    await screen.findByText("Name needs review.");
    expect(failureAction).toHaveBeenCalledTimes(1);
    expect((name as HTMLInputElement).value).toBe("Harbor House");
    expect((code as HTMLInputElement).value).toBe("HBR");
    expect((address as HTMLInputElement).value).toBe("12 River Road");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(code.getAttribute("aria-invalid")).toBe("true");

    await user.type(name, " updated");

    expect(screen.queryByText("Name needs review.")).toBeNull();
    expect(name.hasAttribute("aria-invalid")).toBe(false);
    expect(screen.getByText("Code is already used.")).not.toBeNull();
    expect(code.getAttribute("aria-invalid")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Add property" }));

    await screen.findByText("Name needs review.");
    expect(failureAction).toHaveBeenCalledTimes(2);
    expect((name as HTMLInputElement).value).toBe("Harbor House updated");
    expect((code as HTMLInputElement).value).toBe("HBR");
    expect((address as HTMLInputElement).value).toBe("12 River Road");
  });

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
    expect(name.getAttribute("aria-describedby")?.split(" ")).toContain(
      error.id,
    );
    expect(document.activeElement).toBe(name);
    expect(
      screen
        .getAllByRole("alert")
        .some((alert) =>
          alert.textContent?.includes("Review the highlighted fields."),
        ),
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

    const backdrop = document.querySelector<HTMLElement>(
      '[data-slot="sheet-overlay"]',
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

    expect(
      screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen
        .getByRole("button", { name: "Add property" })
        .hasAttribute("disabled"),
    ).toBe(false);

    rerender(<DrawerHarness pending />);

    const form = screen.getByRole("form", { name: "Add property form" });
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Adding property")).not.toBeNull();
    expect(
      screen
        .getByRole("textbox", { name: /Property name/ })
        .matches(":disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Add property" })
        .hasAttribute("disabled"),
    ).toBe(true);
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

  it("tracks select-only edits through the shadcn select portal", async () => {
    const user = userEvent.setup();
    render(<PortalControlsHarness />);
    const dialog = screen.getByRole("dialog", { name: "Add lease" });

    await user.click(screen.getByRole("combobox", { name: /Status/ }));
    const listbox = screen.getByRole("listbox");
    expect(dialog.contains(listbox)).toBe(true);
    expect(screen.getByRole("dialog", { name: "Add lease" })).not.toBeNull();
    await user.click(screen.getByRole("option", { name: "Active" }));

    expect(screen.getByText("Unsaved changes")).not.toBeNull();
  });

  it("portals modal select menus outside the clipped dialog surface", async () => {
    const user = userEvent.setup();
    render(<ModalSelectHarness />);
    const dialog = screen.getByRole("dialog", { name: "Record payment" });

    await user.click(screen.getByRole("combobox", { name: "Deposit to" }));
    const listbox = screen.getByRole("listbox");

    expect(dialog.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
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

    expect(
      screen.getByTestId("draft-action-bar").getAttribute("data-status"),
    ).toBe("error");
    expect(screen.getByText("Changes not saved")).not.toBeNull();

    await user.click(name);
    expect(
      screen.getByTestId("draft-action-bar").getAttribute("data-status"),
    ).toBe("error");

    await user.type(name, " updated");
    expect(
      screen.getByTestId("draft-action-bar").getAttribute("data-status"),
    ).toBe("dirty");

    const sameError = {
      message: "That code is already used.",
      status: "error" as const,
    };
    rerender(<DrawerHarness pending state={sameError} />);
    expect(
      screen.getByTestId("draft-action-bar").getAttribute("data-status"),
    ).toBe("saving");
    rerender(<DrawerHarness state={sameError} />);
    expect(
      screen.getByTestId("draft-action-bar").getAttribute("data-status"),
    ).toBe("error");
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

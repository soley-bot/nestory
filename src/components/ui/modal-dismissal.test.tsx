/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { SideDrawer } from "@/components/ui/side-drawer";

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

function NestedFormHarness({
  childPending = false,
  modalHidden = false,
  onChildClose = () => undefined,
  parentPending = false,
}: {
  childPending?: boolean;
  modalHidden?: boolean;
  onChildClose?: () => void;
  parentPending?: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeModal = useCallback(() => {
    onChildClose();
    setModalOpen(false);
  }, [onChildClose]);

  return drawerOpen ? (
    <SideDrawer onClose={closeDrawer} open title="Edit property">
      <RecordForm
        action={() => undefined}
        ariaLabel="Edit property form"
        onCancel={closeDrawer}
        pending={parentPending}
        saveLabel="Save property"
        state={{}}
      >
        <RecordField label="Property name" name="propertyName">
          <Input defaultValue="Harbor House" name="propertyName" />
        </RecordField>
        <button onClick={() => setModalOpen(true)} type="button">
          Create owner
        </button>
      </RecordForm>
      <Modal
        description="Select the new owner for this property."
        onClose={closeModal}
        open={modalOpen && !modalHidden}
        title="Create owner"
      >
        <RecordForm
          action={() => undefined}
          ariaLabel="Add person form"
          onCancel={closeModal}
          pending={childPending}
          saveLabel="Create and select"
          state={{}}
        >
          <RecordField label="Owner name" name="ownerName">
            <Input name="ownerName" />
          </RecordField>
        </RecordForm>
      </Modal>
    </SideDrawer>
  ) : (
    <p>Parent closed</p>
  );
}

async function openChild(user: ReturnType<typeof userEvent.setup>) {
  const parentName = screen.getByRole("textbox", { name: "Property name" });
  await user.type(parentName, " updated");
  const opener = screen.getByRole("button", { name: "Create owner" });
  await user.click(opener);
  return { opener, parentName };
}

async function dismissChild(
  user: ReturnType<typeof userEvent.setup>,
  dismissal: "Cancel" | "X" | "Escape",
) {
  if (dismissal === "Escape") {
    await user.keyboard("{Escape}");
    return;
  }
  const modal = screen.getByRole("dialog", { name: "Create owner" });
  await user.click(
    within(modal).getByRole("button", {
      name: dismissal === "X" ? "Close modal" : "Cancel",
    }),
  );
}

async function expectParentPreserved(
  user: ReturnType<typeof userEvent.setup>,
  parentName: HTMLElement,
  opener: HTMLElement,
) {
  await waitFor(() => expect(document.activeElement).toBe(opener));
  expect((parentName as HTMLInputElement).value).toBe("Harbor House updated");
  const parent = screen.getByRole("dialog", { name: "Edit property" });
  expect(within(parent).getByText("Unsaved changes")).not.toBeNull();
  await user.click(within(parent).getByRole("button", { name: "Close drawer" }));
  expect(
    screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
  ).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByRole("dialog", { name: "Edit property" })).not.toBeNull();
}

describe("nested modal dismissal", () => {
  it.each(["Cancel", "X", "Escape"] as const)(
    "closes a clean child through %s and retains the parent draft guard",
    async (dismissal) => {
      const user = userEvent.setup();
      const onChildClose = vi.fn();
      render(<NestedFormHarness onChildClose={onChildClose} />);
      const { opener, parentName } = await openChild(user);

      await dismissChild(user, dismissal);

      expect(screen.queryByRole("dialog", { name: "Create owner" })).toBeNull();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(onChildClose).toHaveBeenCalledTimes(1);
      await expectParentPreserved(user, parentName, opener);
    },
  );

  it.each(["Cancel", "X", "Escape"] as const)(
    "guards a dirty child through %s and discards only the child",
    async (dismissal) => {
      const user = userEvent.setup();
      const onChildClose = vi.fn();
      render(<NestedFormHarness onChildClose={onChildClose} />);
      const { opener, parentName } = await openChild(user);
      const childName = screen.getByRole("textbox", { name: "Owner name" });
      await user.type(childName, "River Owner");

      await dismissChild(user, dismissal);
      const confirmation = screen.getByRole("alertdialog", {
        name: "Discard unsaved changes?",
      });
      expect(document.activeElement).toBe(
        within(confirmation).getByRole("button", { name: "Keep editing" }),
      );
      expect(onChildClose).not.toHaveBeenCalled();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect((childName as HTMLInputElement).value).toBe("River Owner");
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole("button", { name: "Close modal" }),
        ),
      );

      await dismissChild(user, dismissal);
      await user.click(screen.getByRole("button", { name: "Discard changes" }));

      expect(onChildClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog", { name: "Create owner" })).toBeNull();
      await expectParentPreserved(user, parentName, opener);
    },
  );

  it.each(["Cancel", "X", "Escape"] as const)(
    "keeps a saving child and parent open through %s",
    async (dismissal) => {
      const user = userEvent.setup();
      const onChildClose = vi.fn();
      render(<NestedFormHarness childPending onChildClose={onChildClose} />);
      await openChild(user);

      await dismissChild(user, dismissal);

      if (dismissal === "Cancel") {
        expect(screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(true);
        expect(screen.queryByRole("alertdialog")).toBeNull();
      } else {
        const confirmation = screen.getByRole("alertdialog", {
          name: "Saving is still in progress",
        });
        expect(within(confirmation).queryByRole("button", { name: "Discard changes" })).toBeNull();
        await user.click(within(confirmation).getByRole("button", { name: "Continue waiting" }));
      }
      expect(onChildClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Create owner" })).not.toBeNull();
      expect(screen.getByRole("dialog", { hidden: true, name: "Edit property" })).not.toBeNull();
    },
  );

  it("keeps the saving notice when a child starts saving during discard confirmation", async () => {
    const user = userEvent.setup();
    const onChildClose = vi.fn();
    const { rerender } = render(<NestedFormHarness onChildClose={onChildClose} />);
    await openChild(user);
    await user.type(screen.getByRole("textbox", { name: "Owner name" }), "Owner");
    await dismissChild(user, "X");
    rerender(<NestedFormHarness childPending onChildClose={onChildClose} />);

    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByRole("alertdialog", { name: "Saving is still in progress" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
    expect(onChildClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Continue waiting" }));
    expect(screen.getByRole("dialog", { name: "Create owner" })).not.toBeNull();
  });

  it("does not retain a child's pending guard when the modal closes externally", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<NestedFormHarness />);
    const { opener, parentName } = await openChild(user);
    await user.type(screen.getByRole("textbox", { name: "Owner name" }), "Owner");
    rerender(<NestedFormHarness childPending />);
    await dismissChild(user, "X");
    rerender(<NestedFormHarness childPending modalHidden />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await expectParentPreserved(user, parentName, opener);
    rerender(<NestedFormHarness />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await dismissChild(user, "Cancel");
    expect(screen.queryByRole("dialog", { name: "Create owner" })).toBeNull();
  });
});

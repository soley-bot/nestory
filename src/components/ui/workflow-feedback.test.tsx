/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import {
  DraftActionBar,
  type DraftStatus,
} from "@/components/ui/draft-action-bar";
import { EmptyState, type EmptyStateKind } from "@/components/ui/empty-state";
import { FormSection } from "@/components/ui/form-section";
import { RecordPreviewDrawer } from "@/components/ui/record-preview-drawer";
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

describe("DraftActionBar", () => {
  it.each([
    ["clean", "No changes", "polite"],
    ["dirty", "Unsaved changes", "polite"],
    ["saving", "Saving changes", "polite"],
    ["saved", "Changes saved", "polite"],
    ["error", "Changes not saved", "assertive"],
  ] as const)(
    "renders and announces the %s state without relying on color",
    (status, message, liveMode) => {
      render(
        <DraftActionBar
          onDiscard={vi.fn()}
          onSave={vi.fn()}
          status={status}
        />,
      );

      const bar = screen.getByTestId("draft-action-bar");
      const announcement = screen.getByText(message).closest<HTMLElement>("[aria-live]");

      expect(bar.getAttribute("data-status")).toBe(status);
      expect(announcement?.getAttribute("aria-live")).toBe(liveMode);
      expect(announcement?.getAttribute("aria-atomic")).toBe("true");
      expect(announcement?.querySelector('[aria-hidden="true"]')).not.toBeNull();
      expect(announcement?.textContent).toContain(message);
    },
  );

  it("uses caller-provided status text and only saves an actionable draft", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = render(
      <DraftActionBar
        onDiscard={vi.fn()}
        onSave={onSave}
        saveLabel="Apply role changes"
        status="clean"
      />,
    );

    expect(screen.getByRole("button", { name: "Apply role changes" }).hasAttribute("disabled"))
      .toBe(true);

    rerender(
      <DraftActionBar
        onDiscard={vi.fn()}
        onSave={onSave}
        saveLabel="Apply role changes"
        status="dirty"
        statusMessage="3 fields changed"
      />,
    );

    expect(screen.getByText("3 fields changed")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Apply role changes" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("keeps pending actions disabled and exposes busy state", () => {
    render(
      <DraftActionBar
        onDiscard={vi.fn()}
        onSave={vi.fn()}
        status="saving"
      />,
    );

    const bar = screen.getByTestId("draft-action-bar");
    expect(bar.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: "Save changes" }).hasAttribute("disabled"))
      .toBe(true);
    expect(screen.getByRole("button", { name: "Discard" }).hasAttribute("disabled"))
      .toBe(true);
  });

  it("shows and associates a permission reason while preserving consequence linkage", () => {
    render(
      <>
        <ConsequencePanel
          id="access-impact"
          summary="Existing workspace access stays unchanged."
          title="Access impact"
        />
        <DraftActionBar
          describedBy="access-impact"
          disabledReason="Only administrators can apply role changes."
          onDiscard={vi.fn()}
          onSave={vi.fn()}
          status="dirty"
        />
      </>,
    );

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    const reason = screen.getByText("Only administrators can apply role changes.");
    const describedByIds = saveButton.getAttribute("aria-describedby")?.split(" ") ?? [];

    expect(saveButton.hasAttribute("disabled")).toBe(true);
    expect(reason.id).not.toBe("");
    expect(describedByIds).toContain("access-impact");
    expect(describedByIds).toContain(reason.id);
  });

  it("announces a newly supplied disabled reason without announcing consequences", () => {
    const consequence = (
      <ConsequencePanel
        id="permission-impact"
        summary="Existing workspace access stays unchanged."
        title="Access impact"
      />
    );
    const { rerender } = render(
      <>
        {consequence}
        <DraftActionBar
          describedBy="permission-impact"
          onDiscard={vi.fn()}
          onSave={vi.fn()}
          status="dirty"
        />
      </>,
    );

    expect(screen.getByRole("status").textContent).toBe("Unsaved changes");

    rerender(
      <>
        {consequence}
        <DraftActionBar
          describedBy="permission-impact"
          disabledReason="Only administrators can apply role changes."
          onDiscard={vi.fn()}
          onSave={vi.fn()}
          status="dirty"
        />
      </>,
    );

    const announcement = screen.getByRole("status");
    const reason = screen.getByText("Only administrators can apply role changes.");
    expect(announcement.textContent).toContain("Unsaved changes");
    expect(announcement.textContent).toContain(
      "Only administrators can apply role changes.",
    );
    expect(announcement.textContent).not.toContain(
      "Existing workspace access stays unchanged.",
    );
    expect(announcement.contains(reason)).toBe(true);
  });

  it("requires an in-component discard confirmation that can be cancelled or confirmed", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    render(
      <DraftActionBar
        onDiscard={onDiscard}
        onSave={vi.fn()}
        status="dirty"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByText("Discard unsaved changes?")).not.toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Keep editing" }),
    );

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Discard" }));

    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["saving", "Saving changes"],
    ["saved", "Changes saved"],
    ["clean", "No changes"],
  ] as const)(
    "closes discard confirmation when controlled status changes to %s",
    async (status, statusText) => {
      const user = userEvent.setup();
      const onDiscard = vi.fn();
      const { rerender } = render(
        <DraftActionBar
          onDiscard={onDiscard}
          onSave={vi.fn()}
          status="dirty"
        />,
      );

      await user.click(screen.getByRole("button", { name: "Discard" }));
      const staleConfirmation = screen.getByRole("button", {
        name: "Discard changes",
      });

      rerender(
        <DraftActionBar
          onDiscard={onDiscard}
          onSave={vi.fn()}
          status={status}
        />,
      );

      expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
      expect(screen.getByText(statusText)).not.toBeNull();

      await user.click(staleConfirmation);
      expect(onDiscard).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["Keep editing", "saving", "Saving changes"],
    ["Discard changes", "saving", "Saving changes"],
    ["Keep editing", "clean", "No changes"],
    ["Discard changes", "clean", "No changes"],
  ] as const)(
    "moves focus from focused %s to status when controlled state becomes %s",
    async (focusedControl, status, statusText) => {
      const user = userEvent.setup();
      const { rerender } = render(
        <DraftActionBar
          onDiscard={vi.fn()}
          onSave={vi.fn()}
          status="dirty"
        />,
      );

      await user.click(screen.getByRole("button", { name: "Discard" }));
      const confirmationControl = screen.getByRole("button", {
        name: focusedControl,
      });
      confirmationControl.focus();
      expect(document.activeElement).toBe(confirmationControl);

      rerender(
        <DraftActionBar
          onDiscard={vi.fn()}
          onSave={vi.fn()}
          status={status}
        />,
      );

      const statusRegion = screen.getByRole("status");
      expect(statusRegion.textContent).toContain(statusText);
      expect(document.activeElement).toBe(statusRegion);
    },
  );

  it("does not steal focus when confirmation invalidates after focus moved elsewhere", async () => {
    const user = userEvent.setup();
    const outsideAction = <button type="button">Review another workflow</button>;
    const { rerender } = render(
      <>
        {outsideAction}
        <DraftActionBar
          onDiscard={vi.fn()}
          onSave={vi.fn()}
          status="dirty"
        />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Discard" }));
    const outsideButton = screen.getByRole("button", {
      name: "Review another workflow",
    });
    outsideButton.focus();

    rerender(
      <>
        {outsideAction}
        <DraftActionBar
          onDiscard={vi.fn()}
          onSave={vi.fn()}
          status="clean"
        />
      </>,
    );

    expect(document.activeElement).toBe(outsideButton);
    expect(document.activeElement).not.toBe(screen.getByRole("status"));
  });

  it("moves focus to the stable status after confirmed discard updates caller state", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();

    function ControlledDraft() {
      const [status, setStatus] = useState<DraftStatus>("dirty");

      return (
        <DraftActionBar
          onDiscard={() => {
            onDiscard();
            setStatus("clean");
          }}
          onSave={vi.fn()}
          status={status}
        />
      );
    }

    render(<ControlledDraft />);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    const status = screen.getByRole("status");
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(status.textContent).toContain("No changes");
    expect(status.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(status);
    expect(screen.getByTestId("draft-action-bar").contains(document.activeElement))
      .toBe(true);
  });
});

describe("workflow presentation primitives", () => {
  it("renders caller-owned consequence content and a stable described-by target", () => {
    const { rerender } = render(
      <>
        <ConsequencePanel
          id="posting-impact"
          rows={[
            { label: "Records", value: "12 entries" },
            { label: "Recovery", value: "Reverse the posting" },
          ]}
          summary="Posting closes this review batch."
          title="Before posting"
        >
          <p>Linked source records remain available.</p>
        </ConsequencePanel>
        <button aria-describedby="posting-impact" type="button">
          Post batch
        </button>
      </>,
    );

    const panel = screen.getByRole("region", { name: "Before posting" });
    expect(panel.id).toBe("posting-impact");
    expect(screen.getByRole("button", { name: "Post batch" }).getAttribute("aria-describedby"))
      .toBe(panel.id);
    expect(within(panel).getByText("Posting closes this review batch.")).not.toBeNull();
    expect(within(panel).getByText("12 entries")).not.toBeNull();
    expect(within(panel).getByText("Linked source records remain available.")).not.toBeNull();

    rerender(
      <ConsequencePanel
        id="posting-impact"
        summary="Posting closes this review batch."
        title="Before posting"
      />,
    );
    expect(screen.getByRole("region", { name: "Before posting" }).id).toBe(panel.id);
  });

  it("groups visible form guidance and fields under one labelled section", () => {
    render(
      <FormSection
        description="Used on tenant-facing notices."
        title="Contact details"
      >
        <label>
          Email
          <input name="email" />
        </label>
      </FormSection>,
    );

    const section = screen.getByRole("group", { name: "Contact details" });
    const description = within(section).getByText("Used on tenant-facing notices.");
    expect(section.getAttribute("aria-describedby")).toBe(description.id);
    expect(within(section).getByRole("textbox", { name: "Email" })).not.toBeNull();
  });
});

describe("EmptyState", () => {
  const states: Array<{
    body: string;
    kind: EmptyStateKind;
    live: string;
    role: "alert" | "status";
    title: string;
  }> = [
    {
      body: "Add the first property to start its operating record.",
      kind: "empty",
      live: "polite",
      role: "status",
      title: "No properties yet",
    },
    {
      body: "Clear one or more filters to broaden these results.",
      kind: "filtered",
      live: "polite",
      role: "status",
      title: "No properties match",
    },
    {
      body: "An administrator can grant access to these records.",
      kind: "permission",
      live: "polite",
      role: "status",
      title: "Property records are restricted",
    },
    {
      body: "Retry the property list request.",
      kind: "error",
      live: "assertive",
      role: "alert",
      title: "Property records did not load",
    },
  ];

  it.each(states)(
    "renders the $kind state with caller-owned copy and appropriate announcements",
    ({ body, kind, live, role, title }) => {
      render(
        <EmptyState
          action={kind === "empty" ? <button type="button">Add property</button> : undefined}
          body={body}
          kind={kind}
          retry={kind === "error" ? <button type="button">Retry</button> : undefined}
          title={title}
        />,
      );

      const message = screen.getByRole(role);
      const state = screen.getByRole("heading", { name: title }).closest("section");
      expect(state?.getAttribute("data-kind")).toBe(kind);
      expect(message.getAttribute("aria-live")).toBe(live);
      expect(within(message).getByRole("heading", { name: title })).not.toBeNull();
      expect(within(message).getByText(body)).not.toBeNull();
      expect(state?.querySelector('[data-empty-state-icon="true"][aria-hidden="true"]'))
        .not.toBeNull();
      expect(message.querySelector('[data-empty-state-icon="true"]')).toBeNull();

      if (kind === "empty") {
        const action = screen.getByRole("button", { name: "Add property" });
        expect(state?.contains(action)).toBe(true);
        expect(message.contains(action)).toBe(false);
      }

      if (kind === "error") {
        const retry = screen.getByRole("button", { name: "Retry" });
        expect(state?.contains(retry)).toBe(true);
        expect(message.contains(retry)).toBe(false);
      }
    },
  );
});

describe("drawer workflow slots", () => {
  it("keeps header, consequence summary, and footer outside the scrollable content in order", () => {
    render(
      <SideDrawer
        footer={<button type="button">Apply changes</button>}
        onClose={vi.fn()}
        open
        summary={<div>3 people gain access</div>}
        title="Edit role"
      >
        <div>Role fields</div>
      </SideDrawer>,
    );

    const dialog = screen.getByRole("dialog", { name: "Edit role" });
    const panel = dialog.querySelector("aside");
    const slots = Array.from(panel?.children ?? []).map((element) =>
      element.getAttribute("data-slot"),
    );
    const content = dialog.querySelector('[data-slot="drawer-content"]');
    const summary = dialog.querySelector('[data-slot="drawer-summary"]');
    const footer = dialog.querySelector('[data-slot="drawer-footer"]');

    expect(slots).toEqual([
      "drawer-header",
      "drawer-content",
      "drawer-summary",
      "drawer-footer",
    ]);
    expect(content?.className).toContain("overflow-y-auto");
    expect(content?.contains(screen.getByText("3 people gain access"))).toBe(false);
    expect(content?.contains(screen.getByRole("button", { name: "Apply changes" }))).toBe(false);
    expect(summary?.className).toContain("shrink-0");
    expect(footer?.className).toContain("shrink-0");
  });

  it("forwards summary and footer slots through RecordPreviewDrawer", () => {
    render(
      <RecordPreviewDrawer
        footer={<button type="button">Open record</button>}
        onClose={vi.fn()}
        open
        summary={<div>Active lease</div>}
        title="Unit 4B"
      >
        <div>Preview details</div>
      </RecordPreviewDrawer>,
    );

    const dialog = screen.getByRole("dialog", { name: "Unit 4B" });
    expect(dialog.querySelector('[data-slot="drawer-summary"]')?.textContent).toContain(
      "Active lease",
    );
    expect(dialog.querySelector('[data-slot="drawer-footer"]')?.textContent).toContain(
      "Open record",
    );
  });

  it("preserves the existing children-only drawer API", () => {
    render(
      <SideDrawer onClose={vi.fn()} open title="Existing drawer">
        <div>Existing content</div>
      </SideDrawer>,
    );

    const dialog = screen.getByRole("dialog", { name: "Existing drawer" });
    expect(dialog.querySelector('[data-slot="drawer-content"]')?.textContent).toContain(
      "Existing content",
    );
    expect(dialog.querySelector('[data-slot="drawer-summary"]')).toBeNull();
    expect(dialog.querySelector('[data-slot="drawer-footer"]')).toBeNull();
  });
});

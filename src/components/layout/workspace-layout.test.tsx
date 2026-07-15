/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceSplitView } from "@/components/layout/workspace-split-view";

type MatchMediaController = {
  setMatches: (matches: boolean) => void;
};

function installMatchMedia(initialMatches: boolean): MatchMediaController {
  let matches = initialMatches;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(min-width: 1024px)",
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener);
    },
    removeEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      listeners.delete(listener);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQueryList),
  });

  return {
    setMatches(nextMatches) {
      matches = nextMatches;
      const event = { matches, media: mediaQueryList.media } as MediaQueryListEvent;
      listeners.forEach((listener) => {
        if (typeof listener === "function") {
          listener.call(mediaQueryList, event);
        } else {
          listener.handleEvent(event);
        }
      });
    },
  };
}

beforeEach(() => {
  installMatchMedia(true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shared workspace anatomy", () => {
  it("keeps one page title with legacy detail, context, and actions in a compact row", () => {
    render(
      <PageHeader
        actions={<button type="button">Add lease</button>}
        context={<span>Riverside Heights</span>}
        description="Active leases"
        title="Leases"
      />,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Leases");

    const metaRow = screen.getByText("Riverside Heights").closest(
      '[data-slot="page-header-meta"]',
    );
    expect(metaRow).not.toBeNull();
    expect(metaRow?.contains(screen.getByText("Active leases"))).toBe(true);
    expect(metaRow?.contains(screen.getByRole("button", { name: "Add lease" }))).toBe(
      true,
    );
    expect(metaRow?.className).toContain("text-sm");
  });

  it("shows one visible active item in local workspace navigation", () => {
    render(
      <LocalWorkspaceNav
        items={[
          { href: "/leases", label: "All leases" },
          { active: true, href: "/leases?state=active", label: "Active" },
          { active: true, href: "/leases?state=ending", label: "Ending soon" },
        ]}
        label="Lease views"
      />,
    );

    const currentLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");

    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]?.textContent).toBe("Active");
    expect(currentLinks[0]?.getAttribute("class")).toContain("bg-accent-soft");
    expect(screen.getByRole("navigation", { name: "Lease views" }).className).toContain(
      "overflow-x-auto",
    );
  });

  it("owns one labelled toolbar and prevents workspace-level horizontal overflow", () => {
    render(
      <WorkspacePage
        header={<PageHeader title="Properties" />}
        toolbar={<button type="button">Filter</button>}
      >
        <div>Property list</div>
      </WorkspacePage>,
    );

    expect(screen.getAllByRole("toolbar")).toHaveLength(1);
    expect(screen.getByRole("toolbar", { name: "Workspace tools" })).not.toBeNull();

    const page = screen.getByText("Property list").closest(
      '[data-slot="workspace-page"]',
    );
    expect(page?.className).toContain("min-w-0");
    expect(page?.className).toContain("overflow-x-hidden");
  });

  it("keeps a wide inspector between 280px and 320px with the record spine", () => {
    render(
      <WorkspaceSplitView
        inspector={<div>Lease details</div>}
        inspectorLabel="Lease inspector"
        inspectorOpen
        list={<div>Lease list</div>}
      />,
    );

    expect(screen.getAllByText("Lease details")).toHaveLength(1);

    const inspector = screen.getByRole("complementary", {
      name: "Lease inspector",
    });
    expect(inspector.className).toContain("min-w-[280px]");
    expect(inspector.className).toContain("max-w-[320px]");
    expect(inspector.className).toContain("border-record-spine");

    const splitView = screen.getByText("Lease list").closest(
      '[data-slot="workspace-split-view"]',
    );
    expect(splitView?.className).toContain("min-w-0");
    expect(splitView?.className).toContain("overflow-hidden");
    expect(splitView?.className).toContain(
      "lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]",
    );
  });

  it("renders the inspector once while changing between wide and compact modes", () => {
    const media = installMatchMedia(true);

    render(
      <WorkspaceSplitView
        inspector={<div>Selected property</div>}
        inspectorLabel="Property inspector"
        inspectorOpen
        list={<div>Property list</div>}
        onInspectorOpenChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Selected property")).toHaveLength(1);
    expect(screen.getByRole("complementary", { name: "Property inspector" })).not.toBeNull();

    act(() => media.setMatches(false));

    expect(screen.getAllByText("Selected property")).toHaveLength(1);
    expect(screen.queryByRole("complementary", { name: "Property inspector" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Property inspector" })).not.toBeNull();
  });

  it("opens and closes the compact inspector drawer and returns focus to the trigger", async () => {
    installMatchMedia(false);
    const user = userEvent.setup();

    function CompactWorkspace() {
      const [open, setOpen] = useState(false);

      return (
        <WorkspaceSplitView
          inspector={<button type="button">Review selection</button>}
          inspectorLabel="Unit inspector"
          inspectorOpen={open}
          list={
            <button onClick={() => setOpen(true)} type="button">
              Open inspector
            </button>
          }
          onInspectorOpenChange={setOpen}
        />
      );
    }

    render(<CompactWorkspace />);

    const trigger = screen.getByRole("button", { name: "Open inspector" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Unit inspector" })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Review selection" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Close drawer" }));

    expect(screen.queryByRole("dialog", { name: "Unit inspector" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the main work surface directly keyboard reachable", () => {
    installMatchMedia(false);

    render(
      <WorkspaceSplitView
        inspectorLabel="Property inspector"
        inspectorOpen={false}
        list={<div>Property list</div>}
      />,
    );

    const mainSurface = screen.getByRole("region", { name: "Workspace content" });
    expect(mainSurface.getAttribute("tabindex")).toBe("0");

    mainSurface.focus();
    expect(document.activeElement).toBe(mainSurface);
  });
});

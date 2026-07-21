/* @vitest-environment jsdom */

import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceSplitView } from "@/components/layout/workspace-split-view";

type MatchMediaController = {
  setMatches: (matches: boolean) => void;
};

type WorkspaceSplitViewProps = ComponentProps<typeof WorkspaceSplitView>;

const validNoInspectorProps: WorkspaceSplitViewProps = {
  list: <div>Property list</div>,
};
void validNoInspectorProps;

// @ts-expect-error An open inspector must provide its controlled dismissal callback.
const invalidOpenInspectorProps: WorkspaceSplitViewProps = {
  inspector: <div>Property details</div>,
  inspectorLabel: "Property inspector",
  inspectorOpen: true,
  list: <div>Property list</div>,
};
void invalidOpenInspectorProps;

function installMatchMedia(initialMatches: boolean): MatchMediaController {
  let matches = initialMatches;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(min-width: 1280px)",
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

function installViewportMatchMedia(width: number) {
  const matchMedia = vi.fn((query: string) => {
    const minWidth = Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);

    return {
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: width >= minWidth,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as MediaQueryList;
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: matchMedia,
  });

  return matchMedia;
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
  document.querySelectorAll("#workspace-page-tools").forEach((node) => node.remove());
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

  it("moves detail breadcrumbs into the global workspace bar", () => {
    const pageTools = document.createElement("div");
    pageTools.id = "workspace-page-tools";
    document.body.append(pageTools);

    render(
      <PageHeader
        breadcrumb={
          <PageBreadcrumb
            current="Bassac Garden Apartments"
            items={[{ href: "/properties", label: "Properties" }]}
          />
        }
        title="Bassac Garden Apartments"
      />,
    );

    const breadcrumb = within(pageTools).getByRole("navigation", {
      name: "Breadcrumb",
    });
    expect(within(breadcrumb).getByRole("link", { name: "Properties" })).toBeTruthy();
    expect(within(breadcrumb).getByText("Bassac Garden Apartments")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "Bassac Garden Apartments" }),
    ).toBeTruthy();
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

  it("scrolls the active local item into view without stealing focus", () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const { rerender } = render(
        <>
          <button type="button">Keep focus</button>
        </>,
      );
      const focusTarget = screen.getByRole("button", { name: "Keep focus" });
      focusTarget.focus();

      rerender(
        <>
          <button type="button">Keep focus</button>
          <LocalWorkspaceNav
            items={[
              { href: "/maintenance", label: "Cases" },
              { href: "/tasks", label: "My work" },
              { href: "/recurring-tasks", label: "Recurring work" },
              { href: "/inspections", label: "Inspections" },
              { active: true, href: "/work-orders", label: "Work orders" },
            ]}
            label="Maintenance workspace"
          />
        </>,
      );

      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "nearest",
        inline: "nearest",
      });
      expect(document.activeElement).toBe(focusTarget);
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
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

  it("moves list context into the app bar and keeps actions with workspace tools", () => {
    const pageTools = document.createElement("div");
    pageTools.id = "workspace-page-tools";
    document.body.append(pageTools);

    render(
      <WorkspacePage
        actions={<button type="button">Add lease</button>}
        context="24 records"
        contextHref="/leases"
        title="Leases"
        toolbar={<button type="button">Filter leases</button>}
      >
        <div>Lease list</div>
      </WorkspacePage>,
    );

    const breadcrumb = within(pageTools).getByRole("navigation", {
      name: "Breadcrumb",
    });
    expect(within(breadcrumb).getByRole("link", { name: "Leases" })).toBeTruthy();
    expect(within(breadcrumb).getByText("24 records")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "Leases" }).className,
    ).toContain("sr-only");

    const toolbar = screen.getByRole("toolbar", { name: "Workspace tools" });
    expect(within(toolbar).getByRole("button", { name: "Filter leases" })).toBeTruthy();
    expect(within(toolbar).getByRole("button", { name: "Add lease" })).toBeTruthy();
  });

  it.each([1440, 1024, 390])(
    "keeps the workspace full-width and uses the same quick view at %ipx",
    (width) => {
      installViewportMatchMedia(width);

      render(
        <WorkspaceSplitView
          inspector={<div>Selected unit</div>}
          inspectorLabel="Unit quick view"
          inspectorOpen
          list={<div>Unit list</div>}
          onInspectorOpenChange={vi.fn()}
        />,
      );

      expect(screen.queryByRole("complementary")).toBeNull();
      const dialog = screen.getByRole("dialog", { name: "Unit quick view" });
      expect(dialog.className).toContain("max-w-[640px]");

      const splitView = screen.getByText("Unit list").closest(
        '[data-slot="workspace-split-view"]',
      );
      expect(splitView?.className).toContain("grid-cols-[minmax(0,1fr)]");
      expect(splitView?.className).not.toContain("xl:grid-cols");
    },
  );

  it("renders one quick view while the viewport media state changes", () => {
    const media = installMatchMedia(true);

    render(
      <WorkspaceSplitView
        inspector={<div>Selected property</div>}
        inspectorLabel="Property quick view"
        inspectorOpen
        list={<div>Property list</div>}
        onInspectorOpenChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Selected property")).toHaveLength(1);
    expect(
      screen.getByRole("dialog", { name: "Property quick view" }),
    ).not.toBeNull();

    act(() => media.setMatches(false));

    expect(screen.getAllByText("Selected property")).toHaveLength(1);
    expect(
      screen.getByRole("dialog", { name: "Property quick view" }),
    ).not.toBeNull();
  });

  it("closes the quick view from its Close control and returns focus", async () => {
    installMatchMedia(false);
    const user = userEvent.setup();
    const onInspectorOpenChange = vi.fn();

    function CompactWorkspace() {
      const [open, setOpen] = useState(false);

      function handleInspectorOpenChange(nextOpen: boolean) {
        onInspectorOpenChange(nextOpen);
        setOpen(nextOpen);
      }

      return (
        <WorkspaceSplitView
          inspector={<button type="button">Review selection</button>}
          inspectorLabel="Unit quick view"
          inspectorOpen={open}
          list={
            <button onClick={() => setOpen(true)} type="button">
              Open inspector
            </button>
          }
          onInspectorOpenChange={handleInspectorOpenChange}
        />
      );
    }

    render(<CompactWorkspace />);

    const trigger = screen.getByRole("button", { name: "Open inspector" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Unit quick view" })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Review selection" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Close quick view" }));

    expect(onInspectorOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("dialog", { name: "Unit quick view" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the quick view with Escape through the controlled callback", async () => {
    installMatchMedia(false);
    const user = userEvent.setup();
    const onInspectorOpenChange = vi.fn();

    function CompactWorkspace() {
      const [open, setOpen] = useState(false);

      function handleInspectorOpenChange(nextOpen: boolean) {
        onInspectorOpenChange(nextOpen);
        setOpen(nextOpen);
      }

      return (
        <WorkspaceSplitView
          inspector={<div>Unit details</div>}
          inspectorLabel="Unit quick view"
          inspectorOpen={open}
          list={
            <button onClick={() => setOpen(true)} type="button">
              Open inspector
            </button>
          }
          onInspectorOpenChange={handleInspectorOpenChange}
        />
      );
    }

    render(<CompactWorkspace />);
    await user.click(screen.getByRole("button", { name: "Open inspector" }));
    await user.keyboard("{Escape}");

    expect(onInspectorOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("dialog", { name: "Unit quick view" })).toBeNull();
  });

  it("closes the quick view from its backdrop through the controlled callback", async () => {
    installMatchMedia(false);
    const user = userEvent.setup();
    const onInspectorOpenChange = vi.fn();

    function CompactWorkspace() {
      const [open, setOpen] = useState(false);

      function handleInspectorOpenChange(nextOpen: boolean) {
        onInspectorOpenChange(nextOpen);
        setOpen(nextOpen);
      }

      return (
        <WorkspaceSplitView
          inspector={<div>Unit details</div>}
          inspectorLabel="Unit quick view"
          inspectorOpen={open}
          list={
            <button onClick={() => setOpen(true)} type="button">
              Open inspector
            </button>
          }
          onInspectorOpenChange={handleInspectorOpenChange}
        />
      );
    }

    const { container } = render(<CompactWorkspace />);
    await user.click(screen.getByRole("button", { name: "Open inspector" }));

    const backdrop = container.querySelector<HTMLElement>(
      '[data-slot="record-quick-view-backdrop"]',
    );
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);

    expect(onInspectorOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("dialog", { name: "Unit quick view" })).toBeNull();
  });

  it("does not mount an undismissable compact modal from invalid JavaScript props", () => {
    installMatchMedia(false);
    const unsafeProps = {
      inspector: <div>Unsafe inspector</div>,
      inspectorLabel: "Unsafe inspector",
      inspectorOpen: true,
      list: <div>Property list</div>,
    } as unknown as WorkspaceSplitViewProps;

    render(<WorkspaceSplitView {...unsafeProps} />);

    expect(screen.queryByRole("dialog", { name: "Unsafe inspector" })).toBeNull();
    expect(screen.queryByText("Unsafe inspector")).toBeNull();
  });

  it("keeps the main work surface directly keyboard reachable", () => {
    installMatchMedia(false);

    render(
      <WorkspaceSplitView list={<div>Property list</div>} />,
    );

    const mainSurface = screen.getByRole("region", { name: "Workspace content" });
    expect(mainSurface.getAttribute("tabindex")).toBe("0");

    mainSurface.focus();
    expect(document.activeElement).toBe(mainSurface);
  });
});

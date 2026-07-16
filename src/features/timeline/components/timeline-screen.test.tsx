/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimelineScreen } from "@/features/timeline/components/timeline-screen";
import type {
  TimelineEvent,
  TimelineScope,
  TimelineViewQuery,
} from "@/features/timeline/timeline.types";

const navigation = vi.hoisted(() => ({
  pathname: "/timeline",
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

beforeEach(() => {
  navigation.pathname = "/timeline";
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams();
  installMatchMedia(1440);
  installPointerCapture();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TimelineScreen workspace contract", () => {
  it.each([
    ["global", "Timeline History", "All history"],
    ["property", "Property Timeline", "Property records"],
    ["maintenance", "Maintenance Timeline", "Maintenance records"],
    ["financial", "Financial Timeline", "Financial records"],
  ] satisfies Array<[TimelineScope, string, string]>) (
    "keeps the %s route scope visible without duplicating the screen",
    (scope, title, scopeLabel) => {
      const { container } = renderTimeline(events, {}, { scope, title });

      expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
      expect(screen.getByRole("heading", { level: 1, name: title })).not.toBeNull();
      expect(screen.getByText(scopeLabel)).not.toBeNull();
      expect(screen.getByRole("toolbar", { name: "Workspace tools" })).not.toBeNull();
    },
  );

  it("keeps event context dense, selected, directly linked, attached, and docked at 1280+", () => {
    renderTimeline();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);

    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(
      within(rows[0]!).getByRole("link", { name: "Roof repair" }).getAttribute("href"),
    ).toBe("/timeline?archiveState=all&eventId=event-1");
    expect(within(rows[0]!).getByRole("button", { name: "Preview Roof repair" })).not.toBeNull();
    expect(within(rows[0]!).getByText("Maintenance")).not.toBeNull();
    expect(within(rows[0]!).getByText("HOME")).not.toBeNull();
    expect(within(rows[0]!).getByText("Unit 1A")).not.toBeNull();

    const inspector = screen.getByRole("complementary", {
      name: "Roof repair timeline inspector",
    });
    expect(within(inspector).getByText("inspection.pdf")).not.toBeNull();
    expect(
      within(inspector).getByRole("link", { name: "Open inspection.pdf" }).getAttribute("href"),
    ).toBe("https://example.test/inspection.pdf?token=private");
    expect(screen.queryByText(/select a (row|timeline record)/i)).toBeNull();
  });

  it("keeps nested direct links independent while row keys and Preview select one event", () => {
    renderTimeline();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const secondLink = within(rows[1]!).getByRole("link", { name: "Lease started" });
    const secondPreview = within(rows[1]!).getByRole("button", {
      name: "Preview Lease started",
    });

    expect(fireEvent.keyDown(secondLink, { key: "Enter" })).toBe(true);
    expect(rows[0]!.getAttribute("aria-selected")).toBe("true");
    expect(rows[1]!.getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(rows[1]!, { key: "Enter" });
    expect(rows[1]!.getAttribute("aria-selected")).toBe("true");
    expect(secondPreview.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(rows[0]!, { key: " " });
    expect(rows[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it.each([1024, 390])(
    "opens Preview deliberately at %ipx and replaces it with one edit drawer",
    async (width) => {
      installMatchMedia(width);
      const user = userEvent.setup();
      renderTimeline();
      const preview = screen.getByRole("button", { name: "Preview Roof repair" });

      expect(screen.queryByRole("dialog")).toBeNull();
      await user.click(preview);
      expect(screen.getByRole("dialog", { name: "Roof repair timeline inspector" })).not.toBeNull();
      await user.click(screen.getByRole("button", { name: "Edit timeline record" }));

      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: "Edit timeline event" })).not.toBeNull();
      await user.click(screen.getByRole("button", { name: "Close drawer" }));
      expect(document.activeElement).toBe(preview);
    },
  );

  it("selects a canonical event link without auto-opening compact Preview", () => {
    installMatchMedia(390);
    renderTimeline(events, {}, { initialEventId: "event-2" });

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows[1]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps ledger-controlled and locked event actions permission-correct", () => {
    renderTimeline([makeEvent("event-locked", "Locked charge", { isLocked: true, ledger: true })]);

    const inspector = screen.getByRole("complementary", {
      name: "Locked charge timeline inspector",
    });
    expect(within(inspector).getByRole("link", { name: "Open linked ledger entry" })).not.toBeNull();
    expect(within(inspector).queryByRole("button", { name: "Edit timeline record" })).toBeNull();
    expect(within(inspector).queryByRole("button", { name: "Archive timeline record" })).toBeNull();
    expect(within(inspector).getByRole("button", { name: "Attach document" })).not.toBeNull();
  });

  it("distinguishes filtered-empty from true-empty within the active scope", () => {
    navigation.pathname = "/property-timeline";
    const filtered = renderTimeline([], { query: "missing" }, { scope: "property", title: "Property Timeline" });
    const filteredState = screen.getByText("No matching timeline events").closest("section")!;
    expect(filteredState.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(filteredState).getByRole("link", { name: "Clear filters" }).getAttribute("href"),
    ).toBe("/property-timeline");
    filtered.unmount();

    renderTimeline([], {}, { scope: "property", title: "Property Timeline" });
    const emptyState = screen.getByText("No timeline events yet").closest("section")!;
    expect(emptyState.getAttribute("data-kind")).toBe("empty");
    expect(within(emptyState).getByRole("button", { name: "Add event" })).not.toBeNull();
  });

  it("keeps URL-backed filters stable and clears focus-only parameters", async () => {
    navigation.pathname = "/maintenance-timeline";
    navigation.searchParams = new URLSearchParams(
      "propertyId=property-1&page=3&eventId=event-1&archiveState=all",
    );
    const user = userEvent.setup();
    renderTimeline([], {
      archiveState: "all",
      propertyId: "property-1",
    }, { scope: "maintenance", title: "Maintenance Timeline" });

    const filtersButton = screen.getByRole("button", { name: "Filters" });
    if (filtersButton.getAttribute("aria-expanded") !== "true") {
      await user.click(filtersButton);
    }
    await user.click(screen.getByRole("combobox", { name: "Filter by event type" }));
    await user.click(await screen.findByRole("option", { name: "Repair" }));

    expect(navigation.replace).toHaveBeenCalledWith(
      "/maintenance-timeline?propertyId=property-1&archiveState=all&eventType=Repair",
      { scroll: false },
    );
  });
});

const defaultViewQuery: TimelineViewQuery = {
  archiveState: "active",
  dateFrom: null,
  dateTo: null,
  eventId: null,
  eventType: "all",
  page: 1,
  pageSize: 50,
  propertyId: "all",
  query: "",
  sort: "date_desc",
  unitId: "all",
};

const events = [makeEvent("event-1", "Roof repair"), makeEvent("event-2", "Lease started", { eventType: "Lease Started" })];

function renderTimeline(
  nextEvents: TimelineEvent[] = events,
  query: Partial<TimelineViewQuery> = {},
  route: { initialEventId?: string; scope?: TimelineScope; title?: string } = {},
) {
  return render(
    <TimelineScreen
      eventTypes={["Maintenance", "Repair", "Lease Started"]}
      events={nextEvents}
      initialEventId={route.initialEventId}
      pagination={{
        from: nextEvents.length ? 1 : 0,
        page: 1,
        pageSize: 50,
        to: nextEvents.length,
        totalCount: nextEvents.length,
        totalPages: nextEvents.length ? 1 : 0,
      }}
      propertyOptions={[{ id: "property-1", label: "HOME / Home" }]}
      recentChanges={[]}
      scope={route.scope ?? "global"}
      title={route.title ?? "Timeline History"}
      unitOptions={[{ id: "unit-1", label: "HOME / Unit 1A", propertyId: "property-1" }]}
      viewQuery={{ ...defaultViewQuery, ...query }}
    />,
  );
}

function makeEvent(
  id: string,
  title: string,
  options: { eventType?: TimelineEvent["eventType"]; isLocked?: boolean; ledger?: boolean } = {},
): TimelineEvent {
  return {
    activity: [],
    createdBy: "Admin",
    currency: "USD",
    description: `${title} detail`,
    documents: [
      {
        category: "Inspection",
        fileName: "inspection.pdf",
        id: `document-${id}`,
        mimeType: "application/pdf",
        sizeBytes: 2048,
        uploadedAt: "2026-07-10T00:00:00.000Z",
        url: "https://example.test/inspection.pdf?token=private",
      },
    ],
    eventDate: "2026-07-10",
    eventType: options.eventType ?? "Maintenance",
    hasAttachment: true,
    hrefs: {
      documents: `/documents?query=${id}`,
      ledger: options.ledger ? `/ledger?entryId=ledger-${id}` : undefined,
      property: "/properties/property-1",
      timeline: `/timeline?archiveState=all&eventId=${id}`,
      unit: "/units/unit-1",
    },
    id,
    isLocked: options.isLocked ?? false,
    ledgerEntryId: options.ledger ? `ledger-${id}` : undefined,
    nextAction: {
      description: "Review the record",
      href: `/timeline?archiveState=all&eventId=${id}`,
      label: "Review record",
      tone: "neutral",
    },
    propertyCode: "HOME",
    propertyId: "property-1",
    propertyName: "Home",
    recordCounts: { activity: 0, documents: 1, linkedRecords: options.ledger ? 4 : 3 },
    riskIndicators: [],
    title,
    unitId: "unit-1",
    unitNumber: "1A",
    cost: 250,
  };
}

function installMatchMedia(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => {
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
      };
    }),
  });
}

function installPointerCapture() {
  Object.defineProperties(Element.prototype, {
    hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    scrollIntoView: { configurable: true, value: vi.fn() },
    setPointerCapture: { configurable: true, value: vi.fn() },
  });
}

/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import { ModuleLoading } from "@/components/layout/module-loading";
import { BoardSurface } from "@/features/maintenance/components/maintenance-board-surface";
import { MaintenanceScreen } from "@/features/maintenance/components/maintenance-screen";
import {
  MaintenanceWorkflowSurface,
  type MaintenanceSurfaceVariant,
} from "@/features/maintenance/components/maintenance-work-surfaces";
import type {
  MaintenanceCase,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";

const navigation = vi.hoisted(() => ({
  pathname: "/maintenance",
  refresh: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));
const maintenanceActions = vi.hoisted(() => ({
  archive: vi.fn(async () => ({})),
  create: vi.fn(async () => ({})),
  executeAssigned: vi.fn(async () => ({})),
  executeCoordinated: vi.fn(async () => ({})),
  restore: vi.fn(async () => ({})),
  review: vi.fn(async () => ({})),
  update: vi.fn(async () => ({})),
  updateStatus: vi.fn(async () => ({})),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    refresh: navigation.refresh,
    replace: navigation.replace,
  }),
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("@/features/maintenance/actions", () => ({
  archiveMaintenanceCaseAction: maintenanceActions.archive,
  createMaintenanceCaseAction: maintenanceActions.create,
  executeAssignedMaintenanceTaskAction: maintenanceActions.executeAssigned,
  executeCoordinatedMaintenanceTaskAction: maintenanceActions.executeCoordinated,
  restoreMaintenanceCaseAction: maintenanceActions.restore,
  reviewMaintenanceCompletionAction: maintenanceActions.review,
  updateMaintenanceCaseAction: maintenanceActions.update,
  updateMaintenanceStatusAction: maintenanceActions.updateStatus,
}));

const defaultViewQuery: MaintenanceViewQuery = {
  archiveState: "active",
  month: "2026-07",
  page: 1,
  pageSize: 25,
  priority: "all",
  propertyId: "all",
  query: "",
  review: "open",
  scope: "focused",
  sort: "due_asc",
  status: "all",
  taskId: "all",
  unitId: "all",
  view: "list",
};

beforeEach(() => {
  navigation.pathname = "/maintenance";
  navigation.refresh.mockReset();
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams();
  Object.values(maintenanceActions).forEach((action) => {
    action.mockReset();
    action.mockResolvedValue({});
  });
  installMatchMedia(1440);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("maintenance workspace redesign contract", () => {
  it.each(["Cases", "Tasks", "Recurring Work", "Inspections", "Work Orders"])(
    "announces the %s loading state",
    (title) => {
      render(<ModuleLoading title={title} />);

      expect(screen.getByText(`${title} is loading`)).not.toBeNull();
    },
  );

  it.each([
    ["/maintenance", "Cases", "table"],
    ["/tasks", "My work", "board"],
    ["/recurring-tasks", "Recurring work", "routine"],
    ["/inspections", "Inspections", "checklist"],
    ["/work-orders", "Work orders", "board"],
  ] as const)(
    "shows one local maintenance navigation with %s active",
    (pathname, currentLabel, surfaceVariant) => {
      navigation.pathname = pathname;
      renderMaintenance({ surfaceVariant });

      const localNavigation = screen.getByRole("navigation", {
        name: "Maintenance workspace",
      });
      const currentLinks = within(localNavigation)
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page");

      expect(screen.getAllByRole("navigation", { name: "Maintenance workspace" })).toHaveLength(1);
      expect(currentLinks).toHaveLength(1);
      expect(currentLinks[0]?.textContent).toBe(currentLabel);
    },
  );

  it("uses the shared workspace anatomy and a 320px docked Preview at 1280px", () => {
    installMatchMedia(1280);
    const { container } = renderMaintenance();

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();
    const inspector = screen.getByRole("complementary", {
      name: "Repair sink Preview",
    });
    expect(inspector.className).toContain("max-w-[320px]");
    expect(inspector.className).toContain("border-record-spine");
  });

  it.each([1024, 390])(
    "opens one deliberate Preview drawer at %ipx and returns focus",
    (width) => {
      installMatchMedia(width);
      renderMaintenance();
      const row = within(screen.getByRole("table")).getAllByRole("row")[1]!;

      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(row);
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(
        screen.getByRole("dialog", { name: "Repair sink Preview" }),
      ).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));
      expect(document.activeElement).toBe(row);
    },
  );

  it("returns focus to a table row after a pointer click lands on row content", () => {
    installMatchMedia(390);
    renderMaintenance();
    const row = within(screen.getByRole("table")).getAllByRole("row")[1]!;

    fireEvent.click(within(row).getByText("High"));
    fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));

    expect(document.activeElement).toBe(row);
  });

  it("replaces compact Preview with one edit drawer and returns focus to the case row", () => {
    installMatchMedia(390);
    renderMaintenance();
    const row = within(screen.getByRole("table")).getAllByRole("row")[1]!;

    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.getByRole("dialog", { name: "Edit maintenance case" }),
    ).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Repair sink Preview" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(document.activeElement).toBe(row);
  });

  it("keeps the wide Preview docked while a mutation drawer opens", () => {
    installMatchMedia(1440);
    renderMaintenance();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.getByRole("complementary", { name: "Repair sink Preview" }),
    ).not.toBeNull();
  });

  it("announces a drawer mutation error and keeps the recovery action available", async () => {
    maintenanceActions.archive.mockResolvedValueOnce({
      message: "The case could not be archived. Refresh and try again.",
      status: "error",
    });
    renderMaintenance();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive case" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "The case could not be archived. Refresh and try again.",
    );
    expect(screen.getByRole("button", { name: "Archive case" })).not.toBeNull();
  });

  it("distinguishes filtered and true empty states with role-correct actions", () => {
    const filtered = renderMaintenance({
      cases: [],
      viewQuery: { ...defaultViewQuery, query: "missing" },
    });
    const filteredState = screen.getByText("No matching cases").closest("section");
    expect(filteredState?.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(filteredState!).getByRole("link", { name: "Clear filters" }),
    ).not.toBeNull();
    filtered.unmount();

    renderMaintenance({ actorRole: "member", cases: [] });
    const emptyState = screen.getByText("No cases yet").closest("section");
    expect(emptyState?.getAttribute("data-kind")).toBe("empty");
    expect(screen.queryByRole("button", { name: "New case" })).toBeNull();
  });

  it("keeps one primary create action for an authorized true-empty workspace", () => {
    renderMaintenance({ cases: [] });

    expect(screen.getAllByRole("button", { name: "New case" })).toHaveLength(1);
    expect(screen.getByText("No cases yet").closest("section")?.getAttribute("data-kind")).toBe(
      "empty",
    );
  });

  it.each([
    ["board", "work_orders"],
    ["calendar", "scheduled"],
  ] as const)(
    "recovers an empty derived %s view into the unfiltered case list",
    (view, review) => {
      navigation.searchParams = new URLSearchParams(`view=${view}&review=${review}`);
      renderMaintenance({
        cases: [],
        surfaceVariant: view === "board" ? "board" : "agenda",
        viewQuery: { ...defaultViewQuery, review, view },
      });

      const emptyState = screen.getByText("No matching cases").closest("section");
      const recoveryLink = within(emptyState!).getByRole("link", {
        name: "View all cases",
      });

      expect(recoveryLink.getAttribute("href")).toBe("/maintenance?view=list");
      expect(within(emptyState!).queryByRole("link", { name: "Clear filters" })).toBeNull();
    },
  );

  it("normalizes a member board request to the list control and table surface", () => {
    navigation.searchParams = new URLSearchParams("view=board&review=work_orders");
    renderMaintenance({
      actorRole: "member",
      showCaseViewTabs: true,
      surfaceVariant: "board",
      viewQuery: { ...defaultViewQuery, review: "work_orders", view: "board" },
    });

    expect(screen.getByRole("table")).not.toBeNull();
    expect(screen.getByRole("link", { name: "List" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Board" }).getAttribute("aria-current")).toBeNull();
    expect(screen.queryByRole("group", { name: "Work order display" })).toBeNull();
  });

  it("marks one selected maintenance row and supports Enter and Space", () => {
    renderMaintenance({ cases: [makeCase(), makeCase("task-2", "Replace fan")] });
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);

    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(1);
    rows[1]!.focus();
    fireEvent.keyDown(rows[1]!, { key: "Enter" });
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    rows[0]!.focus();
    fireEvent.keyDown(rows[0]!, { key: " " });
    expect(rows[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps direct title links independent from table-row Preview keyboard handling", () => {
    renderMaintenance({ cases: [makeCase(), makeCase("task-2", "Replace fan")] });
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const titleLink = within(rows[1]!).getByRole("link", { name: "Replace fan" });

    expect(titleLink.getAttribute("href")).toBe("/maintenance?taskId=task-2");
    fireEvent.keyDown(titleLink, { key: "Enter" });
    fireEvent.click(titleLink);
    expect(rows[0]?.getAttribute("aria-selected")).toBe("true");
    expect(rows[1]?.getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(rows[1]!, { key: "Enter" });
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it.each([
    ["table", "table", ""],
    ["board", "group", "Work order display"],
    ["agenda", "link", "Today"],
    ["checklist", "heading", "Inspection cards"],
    ["routine", "heading", "Routine plan"],
    ["inbox", "heading", "Triage inbox"],
    ["workload", "heading", "Staff workload"],
  ] as const)(
    "keeps the %s surface visible and keyboard-addressable",
    (surfaceVariant, role, accessibleName) => {
      renderMaintenance({ surfaceVariant });

      if (role === "table") {
        expect(screen.getByRole("table")).not.toBeNull();
      } else {
        expect(
          screen.getByRole(role, accessibleName ? { name: accessibleName } : undefined),
        ).not.toBeNull();
      }
    },
  );

  it("lets calendar users open the selected record Preview", () => {
    installMatchMedia(390);
    renderMaintenance({ surfaceVariant: "agenda" });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Repair sink, Pending, High, Riverside House, Pich, Rapid Repairs/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Preview" }));

    expect(
      screen.getByRole("dialog", { name: "Repair sink Preview" }),
    ).not.toBeNull();
  });

  it("gives calendar events 24px targets and restores focus from its dialog", async () => {
    const onSelect = vi.fn();
    renderWorkflowSurface("agenda", [makeCase()], onSelect);
    const eventButton = screen.getByRole("button", {
      name: /Repair sink, Pending, High, Riverside House, Pich, Rapid Repairs/,
    });

    expect(eventButton.className).toContain("min-h-6");
    expect(eventButton.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(eventButton);

    const dialog = screen.getByRole("dialog", { name: "Repair sink calendar event" });
    const directLink = within(dialog).getByRole("link", { name: "Repair sink" });
    const closeButton = within(dialog).getByRole("button", { name: "Close event" });
    expect(directLink.getAttribute("href")).toBe("/maintenance?taskId=task-1");
    expect(dialog.querySelector("button a, a button")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(closeButton));
    fireEvent.keyDown(closeButton, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Repair sink calendar event" })).toBeNull();
    expect(document.activeElement).toBe(eventButton);

    fireEvent.click(eventButton);
    fireEvent.click(screen.getByRole("button", { name: "Close event" }));
    expect(document.activeElement).toBe(eventButton);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("discloses every hidden calendar case with direct and Preview access", async () => {
    installMatchMedia(390);
    renderMaintenance({
      cases: [
        makeCase(),
        makeCase("task-2", "Replace fan"),
        makeCase("task-3", "Check alarm"),
        makeCase("task-4", "Seal window"),
        makeCase("task-5", "Inspect boiler"),
      ],
      surfaceVariant: "agenda",
    });
    const moreButton = screen.getByRole("button", { name: "2 more" });

    expect(moreButton.className).toContain("min-h-6");
    expect(moreButton.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(moreButton);
    const disclosure = screen.getByRole("dialog", { name: "2 more calendar events" });
    const hiddenList = within(disclosure).getByRole("list", {
      name: "More calendar events",
    });
    const sealLink = within(hiddenList).getByRole("link", { name: "Seal window" });
    const boilerLink = within(hiddenList).getByRole("link", { name: "Inspect boiler" });

    expect(sealLink.getAttribute("href")).toBe("/maintenance?taskId=task-4");
    expect(boilerLink.getAttribute("href")).toBe("/maintenance?taskId=task-5");
    expect(within(hiddenList).getByRole("button", { name: "Preview Seal window" })).not.toBeNull();
    expect(within(hiddenList).getByRole("button", { name: "Preview Inspect boiler" })).not.toBeNull();
    expect(disclosure.querySelector("button a, a button")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(sealLink));

    fireEvent.click(within(disclosure).getByRole("button", { name: "Close events" }));
    expect(document.activeElement).toBe(moreButton);

    fireEvent.click(moreButton);
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "2 more calendar events" }),
      ).getByRole("button", { name: "Preview Inspect boiler" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Inspect boiler Preview" }),
    ).not.toBeNull();
  });
});

describe("maintenance board accessible alternative", () => {
  it("keeps member work in the keyboard list without a misleading board switch", () => {
    render(
      <BoardSurface
        actorRole="member"
        cases={[makeCase()]}
        emptyLabel="No assigned work found."
        onSelect={vi.fn()}
        selectedTaskId="task-1"
      />,
    );

    expect(screen.getByRole("table", { name: "Work order list" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Board" })).toBeNull();
  });

  it("offers a keyboard-operable list with complete operating context", async () => {
    const user = userEvent.setup();
    render(
      <BoardSurface
        actorRole="manager"
        cases={[makeCase()]}
        emptyLabel="No work orders found."
        onSelect={vi.fn()}
        selectedTaskId="task-1"
      />,
    );

    const listButton = screen.getByRole("button", { name: "List" });
    listButton.focus();
    await user.keyboard("{Enter}");

    const table = screen.getByRole("table", { name: "Work order list" });
    expect(within(table).getByText("Pending")).not.toBeNull();
    expect(within(table).getByText("High")).not.toBeNull();
    expect(within(table).getByText("Pich")).not.toBeNull();
    expect(within(table).getByText("Riverside House")).not.toBeNull();
    expect(within(table).getByText("Rapid Repairs")).not.toBeNull();
    expect(listButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("separates board title navigation, Preview, and drag interactions", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <BoardSurface
        actorRole="manager"
        cases={[makeCase()]}
        emptyLabel="No work orders found."
        onStatusChange={vi.fn()}
        onSelect={onSelect}
        selectedTaskId="task-1"
      />,
    );
    const titleLink = screen.getByRole("link", { name: "Repair sink" });

    expect(titleLink.getAttribute("href")).toBe("/maintenance?taskId=task-1");
    fireEvent.keyDown(titleLink, { key: "Enter" });
    fireEvent.click(titleLink);
    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector("button a, a button")).toBeNull();

    const previewButton = screen.getByRole("button", { name: "Preview Repair sink" });
    expect(previewButton.getAttribute("type")).toBe("button");
    previewButton.focus();
    previewButton.click();
    expect(onSelect).toHaveBeenCalledWith("task-1");
    expect(screen.getByRole("button", { name: "Move Repair sink" })).not.toBeNull();
  });

  it("keeps board-list direct links independent from row Preview handling", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <BoardSurface
        actorRole="manager"
        cases={[makeCase()]}
        emptyLabel="No work orders found."
        onSelect={onSelect}
        selectedTaskId=""
      />,
    );
    await user.click(screen.getByRole("button", { name: "List" }));
    const row = within(screen.getByRole("table", { name: "Work order list" })).getAllByRole(
      "row",
    )[1]!;
    const titleLink = within(row).getByRole("link", { name: "Repair sink" });

    expect(titleLink.getAttribute("href")).toBe("/maintenance?taskId=task-1");
    fireEvent.keyDown(titleLink, { key: "Enter" });
    fireEvent.click(titleLink);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("task-1");
  });
});

describe("maintenance record cards", () => {
  it.each(["inbox", "checklist", "routine", "workload"] as const)(
    "keeps %s title navigation independent from its Preview control",
    (variant) => {
      const onSelect = vi.fn();
      const { container } = renderWorkflowSurface(variant, [makeCase()], onSelect);
      const titleLink = screen.getByRole("link", { name: "Repair sink" });

      expect(titleLink.getAttribute("href")).toBe("/maintenance?taskId=task-1");
      fireEvent.keyDown(titleLink, { key: "Enter" });
      fireEvent.click(titleLink);
      expect(onSelect).not.toHaveBeenCalled();
      expect(container.querySelector("button a, a button")).toBeNull();

      const previewButton = screen.getByRole("button", { name: "Preview Repair sink" });
      expect(previewButton.getAttribute("type")).toBe("button");
      previewButton.focus();
      previewButton.click();
      expect(onSelect).toHaveBeenCalledWith("task-1");
    },
  );
});

function renderMaintenance({
  actorRole = "admin",
  cases = [makeCase()],
  surfaceVariant = "table",
  showCaseViewTabs = false,
  viewQuery = defaultViewQuery,
}: {
  actorRole?: "admin" | "manager" | "member";
  cases?: MaintenanceCase[];
  surfaceVariant?: MaintenanceSurfaceVariant;
  showCaseViewTabs?: boolean;
  viewQuery?: MaintenanceViewQuery;
} = {}) {
  return render(
    <MaintenanceScreen
      actor={{ branchId: "branch-1", personId: "person-1", role: actorRole }}
      branchOptions={[]}
      capabilities={getMaintenanceCapabilities(actorRole)}
      cases={cases}
      createButtonLabel="New case"
      emptyLabel="No maintenance cases found."
      flowLabel="Work queue"
      listLabel="cases"
      pagination={{
        from: cases.length ? 1 : 0,
        page: 1,
        pageSize: 25,
        to: cases.length,
        totalCount: cases.length,
        totalPages: cases.length ? 1 : 0,
      }}
      propertyOptions={[{ id: "property-1", label: "Riverside House" }]}
      recordLabel="case"
      staffOptions={[]}
      showCaseViewTabs={showCaseViewTabs}
      summary={makeSummary(cases.length)}
      surfaceVariant={surfaceVariant}
      title="Cases"
      unitOptions={[]}
      vendorOptions={[]}
      viewQuery={viewQuery}
    />,
  );
}

function renderWorkflowSurface(
  variant: Exclude<MaintenanceSurfaceVariant, "table">,
  cases: MaintenanceCase[],
  onSelect: (taskId: string) => void,
) {
  return render(
    <MaintenanceWorkflowSurface
      actorRole="manager"
      cases={cases}
      emptyLabel="No maintenance cases found."
      month="2026-07"
      onSelect={onSelect}
      pagination={{
        from: cases.length ? 1 : 0,
        page: 1,
        pageSize: 25,
        to: cases.length,
        totalCount: cases.length,
        totalPages: cases.length ? 1 : 0,
      }}
      selectedTaskId=""
      variant={variant}
    />,
  );
}

function makeCase(id = "task-1", title = "Repair sink"): MaintenanceCase {
  return {
    activity: [],
    actualCostAmount: 0,
    actualCostLabel: "No actual cost",
    assigneeLabel: "Pich",
    assigneePersonId: "person-1",
    branchId: "branch-1",
    branchLabel: "Main branch",
    category: "Plumbing",
    checklist: [{ completed: false, id: "check-1", label: "Check valve" }],
    checklistDoneCount: 0,
    checklistTotalCount: 1,
    costEstimateAmount: 100,
    costEstimateLabel: "USD 100.00",
    createdAt: "2026-07-15T00:00:00Z",
    description: "Repair the kitchen sink.",
    documents: [],
    dueDate: "2026-07-18",
    dueLabel: "Due Jul 18",
    executionMode: "member_assigned",
    formValues: {
      assigneePersonId: "person-1",
      branchId: "branch-1",
      category: "Plumbing",
      checklistText: "[ ] Check valve",
      costEstimateAmount: 100,
      dueDate: "2026-07-18",
      priority: "high",
      propertyId: "property-1",
      recurrenceFrequency: "none",
      status: "pending",
      title,
      vendorPersonId: "vendor-1",
    },
    hrefs: { task: `/maintenance?taskId=${id}` },
    id,
    isArchived: false,
    isHighCost: false,
    isOpen: true,
    isOverdue: false,
    isReminderDue: false,
    isUpcoming: true,
    priority: "high",
    priorityLabel: "High",
    priorityTone: "warning",
    progressLabel: "Pending",
    progressState: "open",
    progressTone: "neutral",
    propertyId: "property-1",
    propertyLabel: "Riverside House",
    recurrenceFrequency: "none",
    recurrenceLabel: "One-time",
    reminderLabel: "No reminder",
    requestId: `request-${id}`,
    status: "pending",
    statusLabel: "Pending",
    statusTone: "neutral",
    title,
    unitLabel: "Unit 2A",
    vendorLabel: "Rapid Repairs",
    vendorPersonId: "vendor-1",
  };
}

function makeSummary(total: number) {
  return {
    actualCostDisplay: { primary: "USD 0.00" },
    blocked: 0,
    categoryStats: [],
    completed: 0,
    estimateCostDisplay: { primary: "USD 100.00" },
    highCost: 0,
    highPriority: total,
    inProgress: 0,
    open: total,
    overdue: 0,
    pending: total,
    propertyStats: [],
    readyForReview: 0,
    recurring: 0,
    reminderDue: 0,
    repeatedIssues: [],
    scheduled: 0,
    total,
    unitStats: [],
    upcoming: total,
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

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

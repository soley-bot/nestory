/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import { MaintenanceScreen } from "@/features/maintenance/components/maintenance-screen";
import type {
  MaintenanceCase,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";

const navigation = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams("view=board&review=work_orders"),
}));

const maintenanceActions = vi.hoisted(() => ({
  archive: vi.fn(async () => ({})),
  create: vi.fn(async () => ({})),
  executeAssigned: vi.fn(async () => ({})),
  executeCoordinated: vi.fn(async () => ({})),
  restore: vi.fn(async () => ({})),
  review: vi.fn(async () => ({})),
  update: vi.fn(async () => ({})),
  updateStatus: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/maintenance",
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

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: {
    children: React.ReactNode;
    onDragEnd: (event: {
      active: { id: string };
      over: { id: string };
    }) => void;
  }) => (
    <div>
      <button
        onClick={() =>
          onDragEnd({ active: { id: "task-1" }, over: { id: "scheduled" } })
        }
        type="button"
      >
        Move case to scheduled
      </button>
      {children}
    </div>
  ),
  KeyboardSensor: function KeyboardSensor() {},
  PointerSensor: function PointerSensor() {},
  useDraggable: () => ({
    attributes: {},
    isDragging: false,
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
  }),
  useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

const viewQuery: MaintenanceViewQuery = {
  archiveState: "active",
  month: "2026-07",
  page: 1,
  pageSize: 25,
  priority: "all",
  propertyId: "all",
  query: "",
  review: "work_orders",
  scope: "focused",
  sort: "due_asc",
  status: "all",
  taskId: "all",
  unitId: "all",
  view: "board",
};

beforeEach(() => {
  navigation.refresh.mockReset();
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams("view=board&review=work_orders");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: true,
      media: "(min-width: 1280px)",
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("ResizeObserver", class ResizeObserverStub {
    disconnect() {}
    observe() {}
    unobserve() {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("maintenance status recovery", () => {
  it("rolls back a failed optimistic transition and leaves the action retryable", async () => {
    let resolveTransition: (value: { message: string; status: "error" }) => void = () => {};
    const transition = new Promise<{ message: string; status: "error" }>((resolve) => {
      resolveTransition = resolve;
    });
    maintenanceActions.updateStatus
      .mockReset()
      .mockImplementationOnce(() => transition)
      .mockResolvedValueOnce({ message: "Maintenance status updated.", status: "success" });

    const maintenanceCase = makeCase();
    render(makeMaintenanceStatusScreen([maintenanceCase]));

    const transitionButton = await screen.findByRole("button", {
      name: "Move case to scheduled",
    });
    fireEvent.click(transitionButton);

    expect(maintenanceActions.updateStatus).toHaveBeenCalledWith("task-1", "scheduled");
    await waitFor(() => {
      const card = document.querySelector<HTMLElement>('[data-task-card="task-1"]');
      expect(card).not.toBeNull();
      expect(within(card!).getByText("Scheduled")).not.toBeNull();
    });

    await act(async () => {
      resolveTransition({ message: "Status update failed. Try again.", status: "error" });
      await transition;
    });

    const error = await screen.findByRole("alert");
    expect(error.textContent).toBe("Status update failed. Try again.");
    expect(error.className).toContain("danger");
    const rolledBackCard = document.querySelector<HTMLElement>('[data-task-card="task-1"]');
    expect(within(rolledBackCard!).getByText("Pending")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Move case to scheduled" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Move case to scheduled" }));
    await waitFor(() => expect(maintenanceActions.updateStatus).toHaveBeenCalledTimes(2));
  });

  it("reconciles a successful optimistic status with newer canonical cases", async () => {
    let resolveTransition: (value: { message: string; status: "success" }) => void =
      () => {};
    const transition = new Promise<{ message: string; status: "success" }>(
      (resolve) => {
        resolveTransition = resolve;
      },
    );
    maintenanceActions.updateStatus.mockReset().mockImplementationOnce(() => transition);

    const { rerender } = render(makeMaintenanceStatusScreen([makeCase()]));
    fireEvent.click(
      await screen.findByRole("button", { name: "Move case to scheduled" }),
    );

    expect(maintenanceActions.updateStatus).toHaveBeenCalledWith("task-1", "scheduled");
    await waitFor(() => {
      const card = document.querySelector<HTMLElement>('[data-task-card="task-1"]');
      expect(within(card!).getByText("Scheduled")).not.toBeNull();
    });

    await act(async () => {
      resolveTransition({
        message: "Maintenance status updated.",
        status: "success",
      });
      await transition;
    });

    expect(await screen.findByRole("status")).not.toBeNull();
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    rerender(makeMaintenanceStatusScreen([makeCase("in_progress")]));

    await waitFor(() => {
      const card = document.querySelector<HTMLElement>('[data-task-card="task-1"]');
      expect(within(card!).getByText("In Progress")).not.toBeNull();
      expect(within(card!).queryByText("Scheduled")).toBeNull();
    });
    const inProgressColumn = document.querySelector<HTMLElement>(
      '[data-status-column="in_progress"]',
    );
    expect(within(inProgressColumn!).getByRole("link", { name: "Repair sink" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview Repair sink" }));
    expect(
      within(
        screen.getByRole("dialog", { name: "Repair sink quick view" }),
      ).getAllByText("In Progress").length,
    ).toBeGreaterThan(0);
    expect(maintenanceActions.updateStatus).toHaveBeenCalledTimes(1);
  });

  it("waits for a post-success cases prop before reconciling an optimistic status", async () => {
    let resolveTransition: (value: { message: string; status: "success" }) => void =
      () => {};
    const transition = new Promise<{ message: string; status: "success" }>(
      (resolve) => {
        resolveTransition = resolve;
      },
    );
    maintenanceActions.updateStatus.mockReset().mockImplementationOnce(() => transition);

    const { rerender } = render(makeMaintenanceStatusScreen([makeCase()]));
    fireEvent.click(
      await screen.findByRole("button", { name: "Move case to scheduled" }),
    );

    await waitFor(() => {
      const card = document.querySelector<HTMLElement>('[data-task-card="task-1"]');
      expect(within(card!).getByText("Scheduled")).not.toBeNull();
    });

    rerender(makeMaintenanceStatusScreen([makeCase()]));
    expect(
      within(
        document.querySelector<HTMLElement>('[data-task-card="task-1"]')!,
      ).getByText("Scheduled"),
    ).not.toBeNull();

    await act(async () => {
      resolveTransition({
        message: "Maintenance status updated.",
        status: "success",
      });
      await transition;
    });

    expect(await screen.findByRole("status")).not.toBeNull();
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const card = document.querySelector<HTMLElement>('[data-task-card="task-1"]');
      expect(within(card!).getByText("Scheduled")).not.toBeNull();
      expect(within(card!).queryByText("Pending")).toBeNull();
    });

    rerender(makeMaintenanceStatusScreen([makeCase("in_progress")]));
    await waitFor(() => {
      const card = document.querySelector<HTMLElement>('[data-task-card="task-1"]');
      expect(within(card!).getByText("In Progress")).not.toBeNull();
      expect(within(card!).queryByText("Scheduled")).toBeNull();
    });
    expect(maintenanceActions.updateStatus).toHaveBeenCalledTimes(1);
  });
});

function makeMaintenanceStatusScreen(cases: MaintenanceCase[]) {
  return (
    <MaintenanceScreen
      actor={{ branchId: "branch-1", personId: "person-1", role: "manager" }}
      branchOptions={[]}
      capabilities={getMaintenanceCapabilities("manager")}
      cases={cases}
      pagination={{
        from: cases.length ? 1 : 0,
        page: 1,
        pageSize: 25,
        to: cases.length,
        totalCount: cases.length,
        totalPages: cases.length ? 1 : 0,
      }}
      propertyOptions={[{ id: "property-1", label: "Riverside House" }]}
      staffOptions={[]}
      summary={makeSummary()}
      surfaceVariant="board"
      title="Cases"
      unitOptions={[]}
      vendorOptions={[]}
      viewQuery={viewQuery}
    />
  );
}

function makeCase(status: "in_progress" | "pending" = "pending"): MaintenanceCase {
  const statusLabel = status === "in_progress" ? "In Progress" : "Pending";

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
    executionMode: "manager_coordinated",
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
      status,
      title: "Repair sink",
      vendorPersonId: "vendor-1",
    },
    hrefs: { task: "/maintenance?taskId=task-1" },
    id: "task-1",
    isArchived: false,
    isBlocked: false,
    isHighCost: false,
    isHighPriority: true,
    isOpen: true,
    isOverdue: false,
    isReminderDue: false,
    isUpcoming: true,
    priority: "high",
    priorityLabel: "High",
    priorityTone: "warning",
    progressLabel: statusLabel,
    progressState: "open",
    progressTone: "neutral",
    propertyId: "property-1",
    propertyLabel: "Riverside House",
    recurrenceFrequency: "none",
    recurrenceLabel: "One-time",
    reminderLabel: "No reminder",
    requestId: "request-task-1",
    status,
    statusLabel,
    statusTone: status === "in_progress" ? "accent" : "neutral",
    title: "Repair sink",
    unitLabel: "Unit 2A",
    vendorLabel: "Rapid Repairs",
    vendorPersonId: "vendor-1",
  };
}

function makeSummary() {
  return {
    actualCostDisplay: { primary: "USD 0.00" },
    blocked: 0,
    categoryStats: [],
    completed: 0,
    estimateCostDisplay: { primary: "USD 100.00" },
    highCost: 0,
    highPriority: 1,
    inProgress: 0,
    open: 1,
    overdue: 0,
    pending: 1,
    propertyStats: [],
    readyForReview: 0,
    recurring: 0,
    reminderDue: 0,
    repeatedIssues: [],
    scheduled: 0,
    total: 1,
    unitStats: [],
    upcoming: 1,
  };
}

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
    render(
      <MaintenanceScreen
        actor={{ branchId: "branch-1", personId: "person-1", role: "manager" }}
        branchOptions={[]}
        capabilities={getMaintenanceCapabilities("manager")}
        cases={[maintenanceCase]}
        pagination={{
          from: 1,
          page: 1,
          pageSize: 25,
          to: 1,
          totalCount: 1,
          totalPages: 1,
        }}
        propertyOptions={[{ id: "property-1", label: "Riverside House" }]}
        staffOptions={[]}
        summary={makeSummary()}
        surfaceVariant="board"
        title="Cases"
        unitOptions={[]}
        vendorOptions={[]}
        viewQuery={viewQuery}
      />,
    );

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
});

function makeCase(): MaintenanceCase {
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
      status: "pending",
      title: "Repair sink",
      vendorPersonId: "vendor-1",
    },
    hrefs: { task: "/maintenance?taskId=task-1" },
    id: "task-1",
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
    requestId: "request-task-1",
    status: "pending",
    statusLabel: "Pending",
    statusTone: "neutral",
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

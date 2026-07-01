import { describe, expect, it } from "vitest";
import {
  buildMaintenanceHrefs,
  buildMaintenanceSummary,
  filterMaintenanceCases,
  getMaintenanceProgressState,
  maintenanceMatchesReview,
} from "@/features/maintenance/data/maintenance";
import type {
  MaintenanceCase,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";

function makeCase(
  overrides: Partial<MaintenanceCase> = {},
): MaintenanceCase {
  return {
    activity: [],
    actualCostAmount: 0,
    actualCostLabel: "No actual cost",
    archivedAt: undefined,
    assigneeLabel: "Unassigned",
    branchLabel: "No branch",
    category: "General",
    checklist: [],
    checklistDoneCount: 0,
    checklistTotalCount: 0,
    costEstimateAmount: 0,
    costEstimateLabel: "No estimate",
    createdAt: "2026-06-01T00:00:00.000Z",
    description: "",
    documents: [],
    dueDate: undefined,
    dueLabel: "No due date",
    dueTime: undefined,
    formValues: {
      category: "General",
      checklistText: "",
      priority: "normal",
      propertyId: "property-1",
      recurrenceFrequency: "none",
      status: "pending",
      title: "General task",
    },
    hrefs: {
      documents: "/documents",
      documentUpload: "/documents?action=create",
      property: "/properties/property-1",
      task: "/maintenance?taskId=task-1",
    },
    id: "task-1",
    isArchived: false,
    isHighCost: false,
    isOpen: true,
    isOverdue: false,
    isReminderDue: false,
    isUpcoming: false,
    priority: "normal",
    priorityLabel: "Normal",
    priorityTone: "accent",
    progressLabel: "Open",
    progressState: "open",
    progressTone: "accent",
    propertyId: "property-1",
    propertyLabel: "P1 - Property One",
    recurrenceFrequency: "none",
    recurrenceLabel: "One-time",
    reminderLabel: "No reminder",
    requestId: "request-1",
    status: "pending",
    statusLabel: "Pending",
    statusTone: "neutral",
    title: "General task",
    unitLabel: "Property level",
    vendorLabel: "No vendor/person",
    ...overrides,
  };
}

function makeViewQuery(
  overrides: Partial<MaintenanceViewQuery> = {},
): MaintenanceViewQuery {
  return {
    archiveState: "all",
    month: "2026-06",
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
    ...overrides,
  };
}

describe("maintenance progress helpers", () => {
  it("classifies completed, overdue, due-today, and upcoming states", () => {
    expect(getMaintenanceProgressState({ dueDate: "2026-06-20", status: "completed" }, "2026-06-28")).toBe("completed");
    expect(getMaintenanceProgressState({ dueDate: "2026-06-20", status: "pending" }, "2026-06-28")).toBe("overdue");
    expect(getMaintenanceProgressState({ dueDate: "2026-06-28", status: "scheduled" }, "2026-06-28")).toBe("due_today");
    expect(getMaintenanceProgressState({ dueDate: "2026-07-03", status: "scheduled" }, "2026-06-28")).toBe("upcoming");
  });

  it("matches open, overdue, inspection, high-cost, high-priority, recurring, and reminder reviews", () => {
    const maintenanceCase = makeCase({
      costEstimateAmount: 1_200,
      dueDate: "2026-06-30",
      isHighCost: true,
      isOverdue: true,
      isReminderDue: true,
      priority: "urgent",
      recurrenceFrequency: "monthly",
      status: "in_progress",
      title: "Monthly inspection follow-up",
    });

    expect(maintenanceMatchesReview(maintenanceCase, "open")).toBe(true);
    expect(maintenanceMatchesReview(maintenanceCase, "overdue")).toBe(true);
    expect(maintenanceMatchesReview(maintenanceCase, "high_cost")).toBe(true);
    expect(maintenanceMatchesReview(maintenanceCase, "high_priority")).toBe(true);
    expect(maintenanceMatchesReview(maintenanceCase, "recurring")).toBe(true);
    expect(maintenanceMatchesReview(maintenanceCase, "reminders")).toBe(true);
    expect(maintenanceMatchesReview(maintenanceCase, "scheduled")).toBe(true);
    expect(maintenanceMatchesReview(maintenanceCase, "work_orders")).toBe(true);
    expect(maintenanceMatchesReview(maintenanceCase, "inspections")).toBe(true);
    expect(maintenanceMatchesReview(maintenanceCase, "completed")).toBe(false);
  });

  it("keeps an exact task selection even outside the current review queue", () => {
    const completedCase = makeCase({
      id: "task-completed",
      isOpen: false,
      status: "completed",
    });

    expect(
      filterMaintenanceCases(
        [makeCase({ id: "task-open" }), completedCase],
        makeViewQuery({ taskId: "task-completed" }),
        "2026-06-28",
      ),
    ).toEqual([completedCase]);
  });
});

describe("maintenance route contracts", () => {
  it("opens document upload as maintenance evidence", () => {
    const task = {
      id: "task-1",
      ledger_entry_id: null,
      property_id: "property-1",
      timeline_event_id: null,
      unit_id: "unit-1",
      vendor_person_id: null,
    } as Parameters<typeof buildMaintenanceHrefs>[0];

    expect(buildMaintenanceHrefs(task).documentUpload).toBe(
      "/documents?action=create&category=Maintenance&propertyId=property-1&taskId=task-1&unitId=unit-1",
    );
    expect(buildMaintenanceHrefs(task).task).toBe(
      "/maintenance?archiveState=all&taskId=task-1",
    );
  });
});

describe("buildMaintenanceSummary", () => {
  it("builds report inputs for category mix, repeated issues, costs, and progress", () => {
    const cases = [
      makeCase({
        actualCostAmount: 250,
        category: "Leaking",
        dueDate: "2026-06-10",
        id: "task-1",
        isOverdue: true,
        propertyId: "property-1",
        recurrenceFrequency: "none",
        unitId: "unit-1",
        unitLabel: "Unit A1",
      }),
      makeCase({
        category: "Leaking",
        costEstimateAmount: 1_200,
        id: "task-2",
        isHighCost: true,
        propertyId: "property-1",
        unitId: "unit-1",
        unitLabel: "Unit A1",
      }),
      makeCase({
        category: "Pest control",
        id: "task-3",
        isOpen: false,
        propertyId: "property-2",
        propertyLabel: "P2 - Property Two",
        status: "completed",
      }),
      makeCase({
        category: "Leaking",
        id: "task-4",
        propertyId: "property-1",
        unitId: "unit-2",
        unitLabel: "Unit A2",
      }),
    ];
    const summary = buildMaintenanceSummary(cases, "2026-06-28", "2026-06");

    expect(summary).toMatchObject({
      actualCostDisplay: { primary: "USD 250.00" },
      highCost: 1,
      open: 3,
      overdue: 1,
      pending: 3,
      total: 4,
    });
    expect(summary.categoryStats[0]).toMatchObject({
      caseCount: 3,
      category: "Leaking",
      percentLabel: "75%",
    });
    expect(summary.repeatedIssues[0]).toMatchObject({
      caseCount: 3,
      category: "Leaking",
      propertyLabel: "P1 - Property One",
      scopeLabel: "Property-wide",
      unitLabel: "Across units",
    });
    expect(summary.repeatedIssues[1]).toMatchObject({
      caseCount: 2,
      category: "Leaking",
      scopeLabel: "Unit repeat",
      unitLabel: "Unit A1",
    });
    expect(summary.unitStats[0]).toMatchObject({
      open: 2,
      pending: 2,
      unitLabel: "Unit A1",
    });
  });
});

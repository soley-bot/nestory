/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import { MaintenanceInspector } from "@/features/maintenance/components/maintenance-screen";
import type { MaintenanceCase } from "@/features/maintenance/maintenance.types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/maintenance",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

describe("MaintenanceInspector role-safe workflow", () => {
  it("shows coordinated controls without admin links or upload for a manager", () => {
    render(
      <MaintenanceInspector
        actor={{ branchId: "branch-1", role: "manager" }}
        capabilities={getMaintenanceCapabilities("manager")}
        maintenanceCase={makeCase()}
        onArchive={vi.fn()}
        onEdit={vi.fn()}
        onRestore={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("Manager-coordinated work")).toBeTruthy();
    expect(screen.getByRole("button", { name: /start coordinated work/i })).toBeTruthy();
    expect(screen.queryByText("Upload doc")).toBeNull();
    expect(screen.queryByRole("link", { name: "Property" })).toBeNull();
    expect(screen.getByText(/HOME - Home/)).toBeTruthy();
  });

  it("formats activity dates in a deterministic timezone", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";

    try {
      render(
        <MaintenanceInspector
          actor={{ branchId: "branch-1", role: "manager" }}
          capabilities={getMaintenanceCapabilities("manager")}
          maintenanceCase={{
            ...makeCase(),
            activity: [
              {
                action: "maintenance_task_created",
                actionLabel: "Created",
                createdAt: "2026-07-13T00:30:00Z",
                details: [],
                entityLabel: "Maintenance",
                href: "/maintenance?taskId=task-1",
                id: "activity-1",
                recordLabel: "Repair leak",
                tone: "neutral",
              },
            ],
          }}
          onArchive={vi.fn()}
          onEdit={vi.fn()}
          onRestore={vi.fn()}
          onStatusMessage={vi.fn()}
        />,
      );

      expect(screen.getByText("Jul 13")).toBeTruthy();
    } finally {
      process.env.TZ = originalTimeZone;
    }
  });
});

function makeCase(): MaintenanceCase {
  return {
    activity: [],
    actualCostAmount: 0,
    actualCostLabel: "No actual cost",
    assigneeLabel: "Offline vendor",
    branchId: "branch-1",
    branchLabel: "HQ - Main",
    category: "Plumbing",
    checklist: [],
    checklistDoneCount: 0,
    checklistTotalCount: 0,
    costEstimateAmount: 0,
    costEstimateLabel: "No estimate",
    createdAt: "2026-07-13T00:00:00Z",
    description: "Repair the leak.",
    documents: [],
    dueLabel: "No due date",
    executionMode: "manager_coordinated",
    formValues: {
      assigneePersonId: "offline-1",
      branchId: "branch-1",
      category: "Plumbing",
      checklistText: "",
      priority: "normal",
      propertyId: "property-1",
      recurrenceFrequency: "none",
      status: "pending",
      title: "Repair leak",
    },
    hrefs: { task: "/maintenance?archiveState=all&taskId=task-1" },
    id: "task-1",
    isArchived: false,
    isHighCost: false,
    isOpen: true,
    isOverdue: false,
    isReminderDue: false,
    isUpcoming: false,
    priority: "normal",
    priorityLabel: "Normal",
    priorityTone: "neutral",
    progressLabel: "Open",
    progressState: "open",
    progressTone: "accent",
    propertyId: "property-1",
    propertyLabel: "HOME - Home",
    recurrenceFrequency: "none",
    recurrenceLabel: "One-time",
    reminderLabel: "No reminder",
    requestId: "request-1",
    status: "pending",
    statusLabel: "Pending",
    statusTone: "neutral",
    title: "Repair leak",
    unitLabel: "Property level",
    vendorLabel: "Offline vendor",
  };
}

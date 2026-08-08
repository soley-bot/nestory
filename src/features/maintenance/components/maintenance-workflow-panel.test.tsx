/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import { MaintenanceInspector } from "@/features/maintenance/components/maintenance-screen";
import { MaintenanceWorkflowPanel } from "@/features/maintenance/components/maintenance-workflow-panel";
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
        actor={{ branchId: "branch-1", role: "operations_manager" }}
        capabilities={getMaintenanceCapabilities("operations_manager")}
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
          actor={{ branchId: "branch-1", role: "operations_manager" }}
          capabilities={getMaintenanceCapabilities("operations_manager")}
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

  it("keeps manager transition consequences beside coordinated actions", () => {
    render(
      <MaintenanceWorkflowPanel
        actor={{ branchId: "branch-1", role: "operations_manager" }}
        capabilities={getMaintenanceCapabilities("operations_manager")}
        maintenanceCase={makeCase()}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /start coordinated work/i })).toBeTruthy();
    const consequence = screen.getByRole("region", {
      name: "Start coordinated work consequence",
    });
    expect(consequence.textContent).toContain(
      "Starting marks the case in progress. Manager coordination remains responsible.",
    );
    expect(consequence.textContent).toContain("VendorOffline vendor");
    expect(consequence.textContent).toContain(
      "NotificationNo automatic message",
    );
  });

  it("lets an Operations Manager hand a recorded cost to Finance", () => {
    render(
      <MaintenanceWorkflowPanel
        actor={{ branchId: "branch-1", role: "operations_manager" }}
        capabilities={getMaintenanceCapabilities("operations_manager")}
        maintenanceCase={{
          ...makeCase(),
          actualCostAmount: 125.5,
          actualCostLabel: "USD 125.50",
          documents: [
            {
              category: "Maintenance",
              fileName: "receipt.pdf",
              href: "/documents?documentId=document-1",
              id: "document-1",
              mimeType: "application/pdf",
              sizeBytes: 100,
              uploadedAt: "2026-08-08T08:00:00Z",
            },
          ],
        }}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("Finance handoff")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Submit cost to Finance" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Choose a linked document or enter a reference."),
    ).toBeTruthy();
    expect(screen.queryByText("Link actual cost to ledger")).toBeNull();
  });

  it("shows a submitted maintenance cost as locked and awaiting Finance", () => {
    render(
      <MaintenanceWorkflowPanel
        actor={{ branchId: "branch-1", role: "operations_manager" }}
        capabilities={getMaintenanceCapabilities("operations_manager")}
        maintenanceCase={{
          ...makeCase(),
          actualCostAmount: 125.5,
          actualCostLabel: "USD 125.50",
          costSubmission: {
            id: "submission-1",
            reviewReason: null,
            status: "submitted",
            submittedAt: "2026-08-08T08:00:00Z",
          },
        }}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("Awaiting Finance")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Submit cost to Finance" }),
    ).toBeNull();
  });

  it("reopens an approved cost for an explicit append-only adjustment", () => {
    const baseCase = {
      ...makeCase(),
      actualCostAmount: 150,
      actualCostLabel: "USD 150.00",
    };
    const { container, rerender } = render(
      <MaintenanceWorkflowPanel
        actor={{ branchId: "branch-1", role: "operations_manager" }}
        capabilities={getMaintenanceCapabilities("operations_manager")}
        maintenanceCase={baseCase}
        onStatusMessage={vi.fn()}
      />,
    );
    const originalKey = container.querySelector<HTMLInputElement>(
      'input[name="idempotencyKey"]',
    )?.value;

    rerender(
      <MaintenanceWorkflowPanel
        actor={{ branchId: "branch-1", role: "operations_manager" }}
        capabilities={getMaintenanceCapabilities("operations_manager")}
        maintenanceCase={{
          ...baseCase,
          costSubmission: {
            id: "submission-1",
            reviewReason: null,
            status: "approved",
            submittedAt: "2026-08-08T08:00:00Z",
          },
        }}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("Approved by Finance")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Submit cost adjustment" }),
    ).toBeTruthy();
    expect(screen.getByText(/Approved history stays unchanged/)).toBeTruthy();
    expect(
      container.querySelector<HTMLInputElement>(
        'input[name="idempotencyKey"]',
      )?.value,
    ).not.toBe(originalKey);
  });

  it("shows the member submission handoff without manager-only controls", () => {
    render(
      <MaintenanceWorkflowPanel
        actor={{ branchId: "branch-1", personId: "person-1", role: "operations_member" }}
        capabilities={getMaintenanceCapabilities("operations_member")}
        maintenanceCase={{
          ...makeCase(),
          assigneeLabel: "Pich",
          assigneePersonId: "person-1",
          executionMode: "member_assigned",
          status: "in_progress",
          statusLabel: "In progress",
        }}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /submit for review/i })).toBeTruthy();
    const consequence = screen.getByRole("region", {
      name: "Submit for review consequence",
    });
    expect(consequence.textContent).toContain(
      "Submission keeps the case open and hands completion review to a manager.",
    );
    expect(consequence.textContent).toContain("ResponsiblePich");
    expect(consequence.textContent).toContain(
      "NotificationWorkspace handoff only",
    );
    expect(screen.queryByText("Completion review")).toBeNull();
  });

  it("states approval and return outcomes before completion review", () => {
    render(
      <MaintenanceWorkflowPanel
        actor={{ branchId: "branch-1", role: "super_admin" }}
        capabilities={getMaintenanceCapabilities("super_admin")}
        maintenanceCase={{
          ...makeCase(),
          assigneeLabel: "Pich",
          executionMode: "member_assigned",
          status: "ready_for_review",
          statusLabel: "Ready for review",
        }}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Approval completes the task and closes its request. Returning work reopens execution and records the review note.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /approve completion/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /return to assignee/i })).toBeTruthy();
  });

  it("keeps inspector mutations aligned to admin and member capabilities", () => {
    const admin = render(
      <MaintenanceInspector
        actor={{ branchId: "branch-1", role: "super_admin" }}
        capabilities={getMaintenanceCapabilities("super_admin")}
        maintenanceCase={{
          ...makeCase(),
          hrefs: { documentUpload: "/documents?action=create", task: "/maintenance" },
        }}
        onArchive={vi.fn()}
        onEdit={vi.fn()}
        onRestore={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /edit/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /archive/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /upload doc/i })).toBeTruthy();
    admin.unmount();

    render(
      <MaintenanceInspector
        actor={{ branchId: "branch-1", personId: "person-1", role: "operations_member" }}
        capabilities={getMaintenanceCapabilities("operations_member")}
        maintenanceCase={{
          ...makeCase(),
          assigneeLabel: "Pich",
          assigneePersonId: "person-1",
          executionMode: "member_assigned",
        }}
        onArchive={vi.fn()}
        onEdit={vi.fn()}
        onRestore={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /start work/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /archive/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /upload doc/i })).toBeNull();
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
    isBlocked: false,
    isHighCost: false,
    isHighPriority: false,
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

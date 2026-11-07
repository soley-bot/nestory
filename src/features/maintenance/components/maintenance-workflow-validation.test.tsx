/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MaintenanceWorkflowPanel } from "./maintenance-workflow-panel";
import type { MaintenanceCase } from "@/features/maintenance/maintenance.types";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
const mocks = vi.hoisted(() => ({ submit: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/maintenance/actions", () => ({ submitMaintenanceCostAction: mocks.submit, executeAssignedMaintenanceTaskAction: vi.fn(), executeCoordinatedMaintenanceTaskAction: vi.fn(), reviewMaintenanceCompletionAction: vi.fn() }));
beforeEach(() => mocks.submit.mockReset());
afterEach(cleanup);

it("shows and associates receipt validation returned without a general message", async () => {
  const error = "Use a PDF, JPEG, PNG, or WebP receipt evidence file.";
  mocks.submit.mockResolvedValue({ status: "error", fieldErrors: { supportingDocumentId: [error] } });
  render(<MaintenanceWorkflowPanel actor={{ dataScope: "branch", workflowMode: "coordinator", branchId: "branch-1" }} capabilities={getMaintenanceCapabilities({ isSuperAdmin: false, permissionKeys: new Set(["maintenance.create_assign", "maintenance.review"]) })} maintenanceCase={{ ...makeCase(), actualCostAmount: 125.5, vendorPersonId: "vendor-1" }} onStatusMessage={vi.fn()} />);
  const input = screen.getByLabelText("Receipt") as HTMLInputElement;
  await userEvent.setup({ applyAccept: false }).upload(input, new File(["synthetic"], "receipt.txt", { type: "text/plain" }));
  await act(async () => fireEvent.submit(screen.getByRole("button", { name: "Submit cost to Finance" }).closest("form")!));
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
  expect(screen.getByRole("alert").textContent).toBe(error);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe(error);
  expect(screen.getByRole("button", { name: "Submit cost to Finance" })).toHaveProperty("disabled", false);
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
    unitLabel: "No specific unit",
    vendorLabel: "Offline vendor",
  };
}

import { describe, expect, it } from "vitest";
import {
  canTransitionMaintenanceStatus,
  getCompletionReviewWarnings,
  getLatestMaintenanceReviewInstruction,
  getMaintenanceWorkflowState,
} from "@/features/maintenance/maintenance.workflow";

describe("maintenance workflow", () => {
  it("makes submitted work a manager handoff and a member waiting state", () => {
    const maintenanceCase = {
      activity: [],
      assigneeLabel: "Pich",
      status: "ready_for_review" as const,
    };

    expect(getMaintenanceWorkflowState(maintenanceCase, { role: "manager" })).toMatchObject({
      currentOwnerLabel: "Manager review",
      isWaitingOnCurrentActor: true,
      nextActionLabel: "Review completion",
    });
    expect(getMaintenanceWorkflowState(maintenanceCase, { role: "member" })).toMatchObject({
      isWaitingOnCurrentActor: false,
      nextActionLabel: "Waiting for review",
      stageLabel: "Waiting for review",
    });
  });

  it("keeps review and completion out of ordinary status changes", () => {
    expect(canTransitionMaintenanceStatus("in_progress", "blocked")).toBe(true);
    expect(canTransitionMaintenanceStatus("in_progress", "ready_for_review")).toBe(false);
    expect(canTransitionMaintenanceStatus("ready_for_review", "in_progress")).toBe(false);
    expect(canTransitionMaintenanceStatus("ready_for_review", "completed")).toBe(false);
  });

  it("returns advisory checklist, blocker, and cost warnings without evidence warnings", () => {
    expect(getCompletionReviewWarnings({
      actualCostAmount: 0,
      activity: [],
      blockedReason: "Waiting for a replacement part",
      checklistDoneCount: 1,
      checklistTotalCount: 2,
    }).map((warning) => warning.code)).toEqual([
      "checklist_incomplete",
      "blocked",
      "actual_cost_missing",
    ]);
  });

  it("returns the latest reopen instruction from activity", () => {
    expect(getLatestMaintenanceReviewInstruction([{
      action: "maintenance_task_completion_reopened",
      actionLabel: "Completion returned",
      createdAt: "2026-07-13T00:00:00Z",
      details: [{ after: "Tighten the fitting", before: "-", field: "Review note" }],
      entityLabel: "Maintenance",
      href: "/maintenance",
      id: "log-1",
      recordLabel: "Repair sink",
      tone: "warning",
    }])).toBe("Tighten the fitting");
  });
});

import { describe, expect, it } from "vitest";
import {
  canTransitionMaintenanceStatus,
  getCompletionReviewWarnings,
  getCoordinatedMaintenanceActions,
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
    const memberAssigned = { actorRole: "manager" as const, executionMode: "member_assigned" as const };
    const coordinated = { actorRole: "manager" as const, executionMode: "manager_coordinated" as const };

    expect(canTransitionMaintenanceStatus("pending", "scheduled", memberAssigned)).toBe(true);
    expect(canTransitionMaintenanceStatus("scheduled", "pending", memberAssigned)).toBe(true);
    expect(canTransitionMaintenanceStatus("in_progress", "blocked", memberAssigned)).toBe(false);
    expect(canTransitionMaintenanceStatus("in_progress", "ready_for_review", memberAssigned)).toBe(false);
    expect(canTransitionMaintenanceStatus("ready_for_review", "in_progress", memberAssigned)).toBe(false);
    expect(canTransitionMaintenanceStatus("ready_for_review", "completed", memberAssigned)).toBe(false);
    expect(canTransitionMaintenanceStatus("in_progress", "cancelled", memberAssigned)).toBe(true);

    expect(canTransitionMaintenanceStatus("pending", "scheduled", coordinated)).toBe(true);
    expect(canTransitionMaintenanceStatus("scheduled", "pending", coordinated)).toBe(true);
    expect(canTransitionMaintenanceStatus("pending", "in_progress", coordinated)).toBe(false);
    expect(canTransitionMaintenanceStatus("in_progress", "blocked", coordinated)).toBe(false);
    expect(canTransitionMaintenanceStatus("blocked", "in_progress", coordinated)).toBe(false);
    expect(canTransitionMaintenanceStatus("in_progress", "completed", coordinated)).toBe(false);
    expect(canTransitionMaintenanceStatus("blocked", "cancelled", coordinated)).toBe(true);
    expect(canTransitionMaintenanceStatus("pending", "scheduled", {
      actorRole: "member",
      executionMode: "member_assigned",
    })).toBe(false);
  });

  it("returns only current checklist, blocker, and estimated-cost warnings", () => {
    expect(getCompletionReviewWarnings({
      actualCostAmount: 0,
      blockedReason: "Waiting for a replacement part",
      checklistDoneCount: 1,
      checklistTotalCount: 2,
      costEstimateAmount: 200,
      status: "blocked",
    }).map((warning) => warning.code)).toEqual([
      "checklist_incomplete",
      "blocked",
      "actual_cost_missing",
    ]);

    expect(getCompletionReviewWarnings({
      actualCostAmount: 0,
      blockedReason: undefined,
      checklistDoneCount: 0,
      checklistTotalCount: 0,
      costEstimateAmount: 0,
      status: "in_progress",
    })).toEqual([]);
  });

  it("makes blocked member work a manager coordination handoff", () => {
    expect(getMaintenanceWorkflowState({
      activity: [],
      assigneeLabel: "Pich",
      blockedReason: "Waiting for access",
      executionMode: "member_assigned",
      latestReviewInstruction: undefined,
      status: "blocked",
    }, { role: "member" })).toMatchObject({
      currentOwnerLabel: "Manager coordination",
      isWaitingOnCurrentActor: false,
      nextActionLabel: "Waiting for manager",
      nextHandoffLabel: "Return the task to Pich after the blocker is resolved",
    });

    expect(getMaintenanceWorkflowState({
      activity: [],
      assigneeLabel: "Pich",
      blockedReason: "Waiting for access",
      executionMode: "member_assigned",
      latestReviewInstruction: undefined,
      status: "blocked",
    }, { role: "manager" })).toMatchObject({
      currentOwnerLabel: "Manager coordination",
      isWaitingOnCurrentActor: true,
      nextActionLabel: "Resolve blocker",
      nextHandoffLabel: "Return the task to Pich after the blocker is resolved",
    });
  });

  it("keeps coordinated blocked work with the manager", () => {
    expect(getMaintenanceWorkflowState({
      activity: [],
      assigneeLabel: "Offline vendor",
      blockedReason: "Part unavailable",
      executionMode: "manager_coordinated",
      latestReviewInstruction: undefined,
      status: "blocked",
    }, { role: "manager" })).toMatchObject({
      currentOwnerLabel: "Manager coordination",
      isWaitingOnCurrentActor: true,
      nextActionLabel: "Resolve blocker",
    });
  });

  it("exposes explicit coordinated controls only to managers and admins", () => {
    expect(getCoordinatedMaintenanceActions({
      executionMode: "manager_coordinated",
      status: "pending",
    }, { role: "manager" })).toEqual(["start"]);
    expect(getCoordinatedMaintenanceActions({
      executionMode: "manager_coordinated",
      status: "in_progress",
    }, { role: "admin" })).toEqual(["block", "complete"]);
    expect(getCoordinatedMaintenanceActions({
      executionMode: "manager_coordinated",
      status: "blocked",
    }, { role: "manager" })).toEqual(["resume"]);
    expect(getCoordinatedMaintenanceActions({
      executionMode: "member_assigned",
      status: "in_progress",
    }, { role: "manager" })).toEqual([]);
    expect(getCoordinatedMaintenanceActions({
      executionMode: "manager_coordinated",
      status: "in_progress",
    }, { role: "member" })).toEqual([]);
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

  it("uses the separately loaded reopen instruction on the case", () => {
    expect(getMaintenanceWorkflowState({
      activity: [],
      assigneeLabel: "Pich",
      executionMode: "member_assigned",
      latestReviewInstruction: "Tighten the fitting",
      status: "in_progress",
    }, { role: "member" }).latestReviewInstruction).toBe("Tighten the fitting");
  });
});

import type {
  MaintenanceActor,
  MaintenanceCase,
  MaintenanceStatus,
} from "@/features/maintenance/maintenance.types";

export type MaintenanceWorkflowState = {
  blockerLabel?: string;
  currentOwnerLabel: string;
  isWaitingOnCurrentActor: boolean;
  latestReviewInstruction?: string;
  nextActionLabel: string;
  nextHandoffLabel: string;
  stageLabel: string;
};

export type MaintenanceCompletionReviewWarning = {
  code: "actual_cost_missing" | "blocked" | "checklist_incomplete";
  label: string;
};

export function getMaintenanceWorkflowState(
  maintenanceCase: Pick<
    MaintenanceCase,
    "activity" | "assigneeLabel" | "blockedReason" | "status"
  >,
  actor: MaintenanceActor,
): MaintenanceWorkflowState {
  const latestReviewInstruction = getLatestMaintenanceReviewInstruction(
    maintenanceCase.activity,
  );
  const isMember = actor.role === "member";

  if (maintenanceCase.status === "ready_for_review") {
    return {
      currentOwnerLabel: "Manager review",
      isWaitingOnCurrentActor: actor.role !== "member",
      latestReviewInstruction,
      nextActionLabel: isMember ? "Waiting for review" : "Review completion",
      nextHandoffLabel: "Approve completion or return the work with instructions",
      stageLabel: isMember ? "Waiting for review" : "Ready for review",
    };
  }

  if (maintenanceCase.status === "completed") {
    return {
      currentOwnerLabel: "Complete",
      isWaitingOnCurrentActor: false,
      latestReviewInstruction,
      nextActionLabel: "No action required",
      nextHandoffLabel: "Responsibility has ended",
      stageLabel: "Completed",
    };
  }

  if (maintenanceCase.status === "cancelled") {
    return {
      currentOwnerLabel: "Closed",
      isWaitingOnCurrentActor: false,
      latestReviewInstruction,
      nextActionLabel: "No action required",
      nextHandoffLabel: "Work has been cancelled",
      stageLabel: "Cancelled",
    };
  }

  const assignee = maintenanceCase.assigneeLabel || "Unassigned";
  const unassigned = assignee.toLowerCase() === "unassigned";
  const stageLabel = getOperationalStageLabel(maintenanceCase.status);

  return {
    blockerLabel:
      maintenanceCase.status === "blocked"
        ? maintenanceCase.blockedReason ?? "A blocker needs coordination."
        : undefined,
    currentOwnerLabel: unassigned ? "Manager coordination" : assignee,
    isWaitingOnCurrentActor:
      (isMember && !unassigned) || (!isMember && unassigned),
    latestReviewInstruction,
    nextActionLabel: getOperationalNextAction(maintenanceCase.status, isMember),
    nextHandoffLabel: unassigned
      ? "Assign the work to a branch member"
      : "Member submits finished work for manager review",
    stageLabel,
  };
}

export function canTransitionMaintenanceStatus(
  from: MaintenanceStatus,
  to: MaintenanceStatus,
) {
  if (from === to) {
    return true;
  }

  if (
    from === "ready_for_review" ||
    from === "completed" ||
    from === "cancelled" ||
    to === "ready_for_review" ||
    to === "completed"
  ) {
    return false;
  }

  return to === "pending" || to === "scheduled" || to === "in_progress" ||
    to === "blocked" || to === "cancelled";
}

export function getCompletionReviewWarnings(
  maintenanceCase: Pick<
    MaintenanceCase,
    | "actualCostAmount"
    | "activity"
    | "blockedReason"
    | "checklistDoneCount"
    | "checklistTotalCount"
  >,
): MaintenanceCompletionReviewWarning[] {
  const warnings: MaintenanceCompletionReviewWarning[] = [];

  if (
    maintenanceCase.checklistTotalCount > 0 &&
    maintenanceCase.checklistDoneCount < maintenanceCase.checklistTotalCount
  ) {
    warnings.push({
      code: "checklist_incomplete",
      label: `${maintenanceCase.checklistTotalCount - maintenanceCase.checklistDoneCount} checklist item(s) remain incomplete.`,
    });
  }

  const historicalBlocker = maintenanceCase.activity
    .find((change) => change.action === "maintenance_task_work_blocked")
    ?.details.find((detail) => detail.field === "Blocker")?.after;
  const blocker = maintenanceCase.blockedReason ??
    (historicalBlocker && historicalBlocker !== "-" ? historicalBlocker : undefined);

  if (blocker) {
    warnings.push({ code: "blocked", label: `Recorded blocker: ${blocker}` });
  }

  if (maintenanceCase.actualCostAmount <= 0) {
    warnings.push({
      code: "actual_cost_missing",
      label: "No actual cost has been recorded.",
    });
  }

  return warnings;
}

export function getLatestMaintenanceReviewInstruction(
  activity: MaintenanceCase["activity"],
) {
  const reopen = activity.find(
    (change) => change.action === "maintenance_task_completion_reopened",
  );
  const note = reopen?.details.find((detail) => detail.field === "Review note")?.after;

  return note && note !== "-" ? note : undefined;
}

function getOperationalStageLabel(status: MaintenanceStatus) {
  if (status === "in_progress") return "In progress";
  if (status === "blocked") return "Blocked";
  if (status === "scheduled") return "Scheduled";
  return "Pending";
}

function getOperationalNextAction(status: MaintenanceStatus, isMember: boolean) {
  if (status === "blocked") return isMember ? "Resume when unblocked" : "Coordinate blocker";
  if (status === "in_progress") return isMember ? "Complete checklist or submit for review" : "Monitor execution";
  if (status === "pending" || status === "scheduled") return isMember ? "Start work" : "Confirm assignment";
  return "No action required";
}

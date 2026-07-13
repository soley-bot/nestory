import type {
  MaintenanceActor,
  MaintenanceCase,
  MaintenanceExecutionMode,
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

export type CoordinatedMaintenanceAction = "block" | "complete" | "resume" | "start";

export function getCoordinatedMaintenanceActions(
  maintenanceCase: Pick<MaintenanceCase, "executionMode" | "status">,
  actor: Pick<MaintenanceActor, "role">,
): CoordinatedMaintenanceAction[] {
  if (
    actor.role === "member" ||
    maintenanceCase.executionMode !== "manager_coordinated"
  ) {
    return [];
  }

  if (maintenanceCase.status === "pending" || maintenanceCase.status === "scheduled") {
    return ["start"];
  }
  if (maintenanceCase.status === "blocked") {
    return ["resume"];
  }
  if (maintenanceCase.status === "in_progress") {
    return ["block", "complete"];
  }
  return [];
}

export function getMaintenanceWorkflowState(
  maintenanceCase: Pick<MaintenanceCase, "assigneeLabel" | "status"> &
    Partial<Pick<MaintenanceCase, "activity" | "blockedReason" | "executionMode" | "latestReviewInstruction">>,
  actor: MaintenanceActor,
): MaintenanceWorkflowState {
  const latestReviewInstruction = maintenanceCase.latestReviewInstruction;
  const isMember = actor.role === "member";
  const executionMode = maintenanceCase.executionMode ?? "manager_coordinated";

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

  if (maintenanceCase.status === "blocked") {
    return {
      blockerLabel: maintenanceCase.blockedReason ?? "A blocker needs coordination.",
      currentOwnerLabel: "Manager coordination",
      isWaitingOnCurrentActor: !isMember,
      latestReviewInstruction,
      nextActionLabel: isMember ? "Waiting for manager" : "Resolve blocker",
      nextHandoffLabel: executionMode === "member_assigned"
        ? `Return the task to ${assignee} after the blocker is resolved`
        : "Manager coordinates the work through completion",
      stageLabel,
    };
  }

  if (executionMode === "manager_coordinated") {
    return {
      currentOwnerLabel: "Manager coordination",
      isWaitingOnCurrentActor: !isMember,
      latestReviewInstruction,
      nextActionLabel: maintenanceCase.status === "in_progress"
        ? "Complete or block work"
        : "Start coordinated work",
      nextHandoffLabel: "Manager coordinates the work through completion",
      stageLabel,
    };
  }

  return {
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
  context: {
    actorRole: MaintenanceActor["role"];
    executionMode: MaintenanceExecutionMode;
  },
) {
  if (context.actorRole === "member") {
    return false;
  }

  if (from === to) {
    return true;
  }

  if (from === "completed" || from === "cancelled") {
    return false;
  }

  if (to === "cancelled") {
    return true;
  }

  const genericTransitions: Record<MaintenanceExecutionMode, boolean> = {
    manager_coordinated:
      (from === "pending" && to === "scheduled") ||
      (from === "scheduled" && to === "pending"),
    member_assigned:
      (from === "pending" && to === "scheduled") ||
      (from === "scheduled" && to === "pending"),
  };

  return genericTransitions[context.executionMode];
}

export function getCompletionReviewWarnings(
  maintenanceCase: Pick<
    MaintenanceCase,
    | "actualCostAmount"
    | "blockedReason"
    | "checklistDoneCount"
    | "checklistTotalCount"
    | "costEstimateAmount"
    | "status"
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

  const blocker = maintenanceCase.blockedReason ??
    (maintenanceCase.status === "blocked" ? "A blocker remains unresolved." : undefined);

  if (blocker) {
    warnings.push({ code: "blocked", label: `Recorded blocker: ${blocker}` });
  }

  if (
    maintenanceCase.costEstimateAmount > 0 &&
    maintenanceCase.actualCostAmount <= 0
  ) {
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

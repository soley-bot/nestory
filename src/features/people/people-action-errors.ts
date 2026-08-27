import {
  isPrivilegedStepUpRequiredError,
  privilegedStepUpRequiredActionMessage,
} from "@/lib/auth/privileged-step-up-error";

type PeopleMutationOperation = "archive" | "create" | "restore" | "update";

export function getPeopleMutationErrorMessage(
  error: {
    code?: string;
    details?: string | null;
    message?: string;
  },
  operation: PeopleMutationOperation,
) {
  if (isPrivilegedStepUpRequiredError(error)) {
    return privilegedStepUpRequiredActionMessage;
  }

  if (
    operation === "archive" &&
    error.details === "relationship_transition_required"
  ) {
    return "End or cancel the open Lease role through a checked relationship transition before archiving this person.";
  }

  const message = error.message ?? "";

  if (message.includes("duplicate key")) {
    return "That person or role already exists.";
  }

  if (
    message.includes("Not authorized") ||
    message.includes("row-level security")
  ) {
    return `You do not have access to ${operation} this person.`;
  }

  if (message.includes("Person not found")) {
    return "We could not find that person.";
  }

  return `We could not ${operation} the person. Please check the fields and try again.`;
}

export function getPeopleMutationErrorMessage(error: {
  details?: string | null;
  message?: string;
}) {
  if (error.details === "relationship_transition_required") {
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
    return "You do not have access to save this person.";
  }

  if (message.includes("Person not found")) {
    return "We could not find that person.";
  }

  return "We could not save the person. Please check the fields and try again.";
}

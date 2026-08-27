export const privilegedStepUpRequiredActionMessage =
  "Verify this signed-in session by email, then retry saving.";

export const privilegedStepUpRequiredMessage =
  "Privileged email verification required.";

export function isPrivilegedStepUpRequiredError(error: unknown) {
  if (error instanceof Error) {
    return error.message === privilegedStepUpRequiredMessage;
  }
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "42501" &&
    (candidate.message === privilegedStepUpRequiredMessage ||
      candidate.message === "Privileged email verification required")
  );
}

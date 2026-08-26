import { z } from "zod";
import {
  isPrivilegedStepUpRequiredError,
  privilegedStepUpRequiredActionMessage,
} from "@/lib/auth/privileged-step-up-error";
import { postgresUuid } from "@/lib/validation/postgres-uuid";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const paymentFrequencySchema = z.enum(
  ["annual", "monthly", "one_time", "quarterly", "semi_annual"],
  "Choose a payment frequency.",
);
const requiredRentAmountSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce
    .number("Enter a rent amount of at least 1.")
    .min(1, "Enter a rent amount of at least 1."),
);
const requiredRentDueDaySchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce
    .number("Enter a due day from 1 to 31.")
    .int("Enter a due day from 1 to 31.")
    .min(1, "Enter a due day from 1 to 31.")
    .max(31, "Enter a due day from 1 to 31."),
);

const futureRentTermSchema = z
  .object({
    endDate: dateSchema,
    leaseId: postgresUuid("Choose a lease."),
    paymentFrequency: paymentFrequencySchema,
    rentAmount: requiredRentAmountSchema,
    rentDueDay: requiredRentDueDaySchema,
    startDate: dateSchema,
    supersedesTermId: postgresUuid("Choose the active term."),
  })
  .superRefine((data, context) => {
    if (data.endDate <= data.startDate) {
      context.addIssue({
        code: "custom",
        message: "End date must be after the start date.",
        path: ["endDate"],
      });
    }
  });

export function parseFutureRentTermInput(
  input: Record<string, FormDataEntryValue | string>,
) {
  return futureRentTermSchema.safeParse(input);
}

export function parseIdempotencyKey(value: string) {
  const candidate = value.trim();

  if (candidate.length < 8 || candidate.length > 200) {
    return {
      error: "Refresh the form and try again.",
      success: false as const,
    };
  }

  return { data: candidate, success: true as const };
}

type LeaseMutationOperation = "archive" | "restore" | "update";

export function getLeaseMutationErrorMessage(
  error: {
    code?: string;
    details?: string | null;
    message?: string;
  },
  operation: LeaseMutationOperation,
) {
  if (isPrivilegedStepUpRequiredError(error)) {
    return privilegedStepUpRequiredActionMessage;
  }

  if (
    operation === "update" &&
    error.details === "relationship_transition_required"
  ) {
    return "Keep the current tenant in this edit. Changing Lease parties requires a checked relationship transition.";
  }

  if (
    operation === "update" &&
    error.details === "occupancy_transition_required"
  ) {
    return "Keep the current unit and status in this edit. Changing property or occupancy requires a checked occupancy transition.";
  }

  if (
    operation === "archive" &&
    error.details === "occupancy_transition_required"
  ) {
    return "End or cancel the open occupancy through a checked transition before archiving this Lease.";
  }

  if (
    operation === "archive" &&
    error.details === "relationship_transition_required"
  ) {
    return "End or cancel the open Lease role through a checked relationship transition before archiving this Lease.";
  }

  if (
    operation === "restore" &&
    error.details === "lease_restore_transition_required"
  ) {
    return "Restore is unavailable until relationship, occupancy, and dependency review is implemented.";
  }

  return null;
}

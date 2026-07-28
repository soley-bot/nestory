import { z } from "zod";

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
    leaseId: z.uuid("Choose a lease."),
    paymentFrequency: paymentFrequencySchema,
    rentAmount: requiredRentAmountSchema,
    rentDueDay: requiredRentDueDaySchema,
    startDate: dateSchema,
    supersedesTermId: z.uuid("Choose the active term."),
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

export function getMonthlyRentGenerationErrorMessage(error: {
  details?: string | null;
  message?: string;
}) {
  return error.details === "rent_generation_blocked_plan_09"
    ? "Automatic rent generation is paused until the authoritative term-and-policy generator is implemented in Plan 09."
    : "We could not generate this month's rent charges. Please try again.";
}

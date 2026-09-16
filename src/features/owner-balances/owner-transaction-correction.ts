import { z } from "zod";
import { canonicalizeOwnerOpeningAmount } from "./owner-balance.money";

export type OwnerCashCorrectionEntry = {
  id: string;
  kind: "distribution" | "contribution";
  date: string;
  amount: string;
  reference: string | null;
};

export const ownerCashCorrectionFields = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.").refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Choose a real calendar date."),
  amount: z.string().trim().transform((value, context) => {
    try {
      const amount = canonicalizeOwnerOpeningAmount(value);
      if (amount === "0.00") throw new Error();
      return amount;
    } catch {
      context.addIssue({ code: "custom", message: "Enter an amount greater than zero with up to 12 integer digits and 2 decimal places." });
      return z.NEVER;
    }
  }),
  reference: z.string().trim().max(240, "Keep the reference to 240 characters or fewer."),
  reason: z.string().trim().min(8, "Explain the correction in at least 8 characters.").max(500),
});

export type OwnerCashCorrectionFields = z.output<typeof ownerCashCorrectionFields>;

export function correctionChangesEntry(entry: OwnerCashCorrectionEntry, values: OwnerCashCorrectionFields) {
  return entry.date !== values.date || entry.amount !== values.amount || (entry.reference ?? "").trim() !== values.reference;
}

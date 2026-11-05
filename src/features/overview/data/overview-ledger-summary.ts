import { z } from "zod";

const exactCount = z.number().int().nonnegative().safe();
const overviewLedgerSummarySchema = z.object({
  ledger_entry_count: exactCount,
  large_recent_expense_count: exactCount,
  months: z.array(z.object({
    // Reversal entries can make a monthly income aggregate negative.
    amount: z.number(),
    currency: z.literal("USD"),
    direction: z.enum(["income", "expense"]),
    transaction_date: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  })),
});

export function parseOverviewLedgerSummary(value: unknown) {
  const result = overviewLedgerSummarySchema.safeParse(value);
  if (!result.success) {
    throw new Error("Could not load overview ledger summary: complete exact totals are missing or invalid.");
  }
  return result.data;
}

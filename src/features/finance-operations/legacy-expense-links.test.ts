import { expect, it, vi } from "vitest";
import { loadLegacyExpenseLinks, attachLegacyExpenseLinks } from "./legacy-expense-links";
import type { ExpenseSubmissionSummary } from "./finance-operations.types";
it("batches scoped links and deduplicates a relation returned in both directions", async () => {
  const link = { submission_id: "original", transaction_id: "replacement" };
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn().mockResolvedValue({ data: [link], error: null }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  const db = { from: vi.fn().mockReturnValue(query) };
  expect(await loadLegacyExpenseLinks(db as unknown as Parameters<typeof loadLegacyExpenseLinks>[0], "org", Array.from({length:501},(_,i)=>String(i)), ["replacement", "replacement"])).toEqual([link]);
  expect(query.in.mock.calls.map(call=>call[1].length)).toEqual([500,1,1]);
  for(const call of query.eq.mock.calls) expect(call).toEqual(["organization_id","org"]);
});
it("fails closed rather than hiding correction links", async () => {
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn().mockResolvedValue({ error: { message: "denied" } }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  await expect(loadLegacyExpenseLinks({from:()=>query} as unknown as Parameters<typeof loadLegacyExpenseLinks>[0], "org", ["original"], [])).rejects.toThrow("Could not load expense correction links");
});
it("attaches links without adding hidden records", () => {
  const rows = [{id:"original"},{id:"replacement-line",transactionId:"replacement"},{id:"unrelated"}] as ExpenseSubmissionSummary[];
  const result=attachLegacyExpenseLinks(rows,[{submission_id:"original",transaction_id:"replacement"},{submission_id:"hidden",transaction_id:"hidden-replacement"}]);
  expect(result).toHaveLength(3);
  expect(result[0].replacementTransactionId).toBe("replacement");
  expect(result[1].replacesSubmissionId).toBe("original");
  expect(result[2].replacementTransactionId).toBeUndefined();
});

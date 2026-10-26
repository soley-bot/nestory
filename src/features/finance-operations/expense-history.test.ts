import { beforeEach, expect, it, vi } from "vitest";
const { readBoundary } = vi.hoisted(() => ({ readBoundary: vi.fn() }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({ withFinancialIntentReadContext: readBoundary }));
beforeEach(() => { readBoundary.mockReset(); readBoundary.mockImplementation(async (_org, _intent, read) => read({ generation: 2, status: "open", enforced: true, financial_start_date: "2026-08-01" })); });
const { rpc, context } = vi.hoisted(() => ({ rpc: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireFinanceContext: context }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
import { getExpenseHistory } from "./expense-history";
const transaction = "00000000-0000-4000-8000-000000000001";
const legacy = "00000000-0000-4000-8000-000000000002";
beforeEach(() => { vi.clearAllMocks(); context.mockResolvedValue({ organizationId: "authorized-org" }); rpc.mockResolvedValue({ data: [], error: null }); });
it("rejects an obsolete session before returning history or author data", async () => {
  readBoundary.mockRejectedValueOnce(new Error("The financial session changed"));
  const intent = new FormData(); intent.set("__financialGeneration", "1");
  await expect(getExpenseHistory(transaction, undefined, intent)).rejects.toThrow("session changed");
  expect(readBoundary).toHaveBeenCalledWith("authorized-org", intent, expect.any(Function));
  expect(rpc).not.toHaveBeenCalled();
});
it("discards assembled history when sources change before the read finishes", async () => {
  readBoundary.mockImplementationOnce(async (_org, _intent, read) => { await read(); throw new Error("Financial data changed while loading"); });
  await expect(getExpenseHistory(transaction)).rejects.toThrow("changed while");
  expect(rpc).toHaveBeenCalledOnce();
});
it("reads legacy history only through the organization-scoped authority", async () => {
  expect(await getExpenseHistory(transaction, legacy)).toEqual([]);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("get_legacy_expense_history", { p_organization_id: "authorized-org", p_submission_id: legacy });
});
it("preserves grouped history routing", async () => {
  await getExpenseHistory(transaction);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("get_expense_transaction_history", { p_organization_id: "authorized-org", p_transaction_id: transaction });
});
it("fails closed when legacy history is denied", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
  await expect(getExpenseHistory(transaction, legacy)).rejects.toThrow("Could not load change history");
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("rejects invalid legacy identity before querying", async () => {
  await expect(getExpenseHistory(transaction, "bad")).rejects.toThrow("Invalid expense");
  expect(context).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});

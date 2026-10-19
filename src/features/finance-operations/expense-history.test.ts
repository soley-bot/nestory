import { beforeEach, expect, it, vi } from "vitest";
const { rpc, context } = vi.hoisted(() => ({ rpc: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireFinanceContext: context }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
import { getExpenseHistory } from "./expense-history";
const transaction = "00000000-0000-4000-8000-000000000001";
const legacy = "00000000-0000-4000-8000-000000000002";
beforeEach(() => { vi.clearAllMocks(); context.mockResolvedValue({ organizationId: "authorized-org" }); rpc.mockResolvedValue({ data: [], error: null }); });
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

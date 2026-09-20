import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/context", () => ({ requireFinanceCorrectionContext: mocks.context }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
import { deleteTransactionAction } from "./transaction-delete-actions";
const id = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const reversal = "00000000-0000-4000-8000-000000000003";
function form(overrides = {}) { const data = new FormData(); Object.entries({ id, propertyId, kind: "distribution", date: "2026-08-31", reason: "Duplicate transaction", idempotencyKey: "delete-test-key", expectedLines: JSON.stringify([{id,amount:"50.00"}]), ...overrides }).forEach(([key, value]) => data.set(key, value)); return data; }
describe("delete financial transaction", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ organizationId: "org" }); });
  it.each([
    ["distribution", "reverse_property_withdrawal", { property_withdrawal_id: reversal, reversal_of_id: id }],
    ["contribution", "void_owner_contribution", { originalId: id, reversalId: reversal }],
    ["tenant-invoice", "void_tenant_invoice_checked", { correction_id: reversal, invoice_id: id, action: "void" }],
    ["tenant-payment", "reverse_tenant_invoice_payment", reversal],
    ["owner-collection", "reverse_owner_collection_confirmation", reversal],
  ])("uses one atomic %s command", async (kind, name, data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await deleteTransactionAction({}, form({ kind }))).toMatchObject({ status: "success" });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(name, expect.objectContaining({ p_organization_id: "org", p_reason: "Duplicate transaction" }));
  });
  it.each([{ reason: "short" }, { id: "invalid" }, { date: "2026-02-30" }, { kind: "unknown" }])("rejects invalid input %j", async overrides => {
    expect(await deleteTransactionAction({}, form(overrides))).toMatchObject({ status: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([null, {}, { property_withdrawal_id: "invalid" }])("does not claim success for missing receipt", async data => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await deleteTransactionAction({}, form())).toMatchObject({ status: "error" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([["dependent_owner_cash:test", "used by another"], ["Financial month is locked", "month is closed"], ["tenant_invoice_has_settlements", "payments attached"]])("explains %s", async (error, message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: error } });
    expect((await deleteTransactionAction({}, form())).message).toContain(message);
  });
});

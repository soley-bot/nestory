import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  revalidate: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/context", () => ({
  requireFinanceCorrectionContext: mocks.context,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ rpc: mocks.rpc }),
}));

import { deleteTransactionAction } from "./transaction-delete-actions";

const id = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const reversal = "00000000-0000-4000-8000-000000000003";

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const values = {
    date: "2026-08-31",
    expectedLines: JSON.stringify([{ amount: "50.00", id }]),
    id,
    idempotencyKey: "delete-test-key",
    kind: "distribution",
    propertyId,
    reason: "Duplicate transaction",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("delete financial transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({ organizationId: "org" });
  });

  it.each([
    ["distribution", "reverse_property_withdrawal", { property_withdrawal_id: reversal, reversal_of_id: id }],
    ["contribution", "void_owner_contribution", { originalId: id, reversalId: reversal }],
    ["tenant-invoice", "void_tenant_invoice_checked", { action: "void", correction_id: reversal, invoice_id: id }],
    ["tenant-payment", "reverse_tenant_invoice_payment", reversal],
    ["owner-collection", "reverse_owner_collection_confirmation", reversal],
  ])("uses one atomic %s command", async (kind, name, resultData) => {
    mocks.rpc.mockResolvedValue({ data: resultData, error: null });

    const result = await deleteTransactionAction({}, form({ kind }));

    expect(result).toMatchObject({ status: "success" });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      name,
      expect.objectContaining({
        p_organization_id: "org",
        p_reason: "Duplicate transaction",
      }),
    );
  });

  it("returns invoice wording and refreshes Rent & collections after a void", async () => {
    mocks.rpc.mockResolvedValue({
      data: { action: "void", correction_id: reversal, invoice_id: id },
      error: null,
    });

    expect(
      await deleteTransactionAction({}, form({ kind: "tenant-invoice" })),
    ).toEqual({
      message: "Invoice voided and removed from Rent & collections. Review the lease to prevent future charges.",
      status: "success",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/rent-income", "layout");
  });

  it.each([
    { reason: "short" },
    { id: "invalid" },
    { date: "2026-02-30" },
    { kind: "unknown" },
  ])("rejects invalid input %j", async (overrides) => {
    expect(await deleteTransactionAction({}, form(overrides))).toMatchObject({
      status: "error",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([null, {}, { property_withdrawal_id: "invalid" }])(
    "does not claim success for missing receipt",
    async (resultData) => {
      mocks.rpc.mockResolvedValue({ data: resultData, error: null });
      expect(await deleteTransactionAction({}, form())).toMatchObject({
        status: "error",
      });
      expect(mocks.revalidate).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["dependent_owner_cash:test", "used by another"],
    ["Financial month is locked", "month is closed"],
    ["tenant_invoice_has_settlements", "payments attached"],
    ["Tenant invoice payment is already reversed", "Refresh the list"],
    ["owner_collection_sources_changed", "Refresh and review"],
  ])("explains %s", async (error, message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: error } });
    expect((await deleteTransactionAction({}, form())).message).toContain(message);
  });
});

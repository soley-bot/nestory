import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminContext,
  requireLeaseConfigurationContext,
  revalidatePath,
  rpc,
} = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
  requireLeaseConfigurationContext: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireAdminContext,
  requireLeaseConfigurationContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));

import { recoverRentGenerationExceptionAction } from "@/features/finance-operations/actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const exceptionId = "00000000-0000-4000-8000-000000000002";

describe("rent generation recovery action", () => {
  beforeEach(() => {
    requireAdminContext.mockReset();
    requireLeaseConfigurationContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireLeaseConfigurationContext.mockResolvedValue({ organizationId });
  });

  it("uses the lease-configuration context and retries only the selected exception", async () => {
    rpc.mockResolvedValue({
      data: { invoiceId: "invoice-1", status: "generated" },
      error: null,
    });
    const formData = new FormData();
    formData.set("exceptionId", exceptionId);

    await expect(
      recoverRentGenerationExceptionAction({}, formData),
    ).resolves.toEqual({
      message: "Rent generation retried.",
      status: "success",
    });
    expect(requireLeaseConfigurationContext).toHaveBeenCalledOnce();
    expect(requireAdminContext).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("recover_rent_generation_exception", {
      p_exception_id: exceptionId,
      p_organization_id: organizationId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/rent-income");
  });

  it("returns the database-approved safe message when setup still blocks rent", async () => {
    rpc.mockResolvedValue({
      data: {
        code: "billing_recipient_invalid",
        message: "Select an active billing recipient for the lease.",
        status: "failed",
      },
      error: null,
    });
    const formData = new FormData();
    formData.set("exceptionId", exceptionId);

    await expect(
      recoverRentGenerationExceptionAction({}, formData),
    ).resolves.toEqual({
      message: "Select an active billing recipient for the lease.",
      status: "error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an invalid exception identity before authorization or RPC access", async () => {
    const formData = new FormData();
    formData.set("exceptionId", "not-a-record");

    await expect(
      recoverRentGenerationExceptionAction({}, formData),
    ).resolves.toMatchObject({ status: "error" });
    expect(requireLeaseConfigurationContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

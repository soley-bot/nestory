import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireLeaseConfigurationContext, revalidatePath, rpc } = vi.hoisted(() => ({
  requireLeaseConfigurationContext: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requireLeaseConfigurationContext }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));

import {
  createLeaseAction,
  recordCurrentLeaseOccupancyEvidenceAction,
} from "@/features/leases/actions";

const leaseId = "00000000-0000-4000-8000-000000000006";
const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000003";
const tenantPersonId = "00000000-0000-4000-8000-000000000007";
const unitId = "00000000-0000-4000-8000-000000000008";

describe("Lease occupancy evidence input", () => {
  beforeEach(() => {
    requireLeaseConfigurationContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireLeaseConfigurationContext.mockResolvedValue({ organizationId });
    rpc.mockResolvedValue({ data: { leaseId }, error: null });
  });

  it("passes actor-entered scheduled and actual dates without copying term dates", async () => {
    const formData = leaseForm();
    formData.set("scheduledMoveInDate", "2027-05-01");
    formData.set("scheduledMoveOutDate", "2028-04-30");
    formData.set("actualMoveInDate", "2027-05-03");

    await expect(createLeaseAction({}, formData)).resolves.toMatchObject({
      leaseId,
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_lease_with_relationships",
      expect.objectContaining({
        p_relationship_payload: expect.objectContaining({
          occupancy: expect.objectContaining({
            actualMoveIn: expect.objectContaining({ date: "2027-05-03" }),
            scheduledMoveIn: expect.objectContaining({ date: "2027-05-01" }),
            scheduledMoveOut: expect.objectContaining({ date: "2028-04-30" }),
          }),
          participants: [
            expect.objectContaining({
              personId: tenantPersonId,
              startedOn: expect.objectContaining({ date: "2027-05-03" }),
            }),
          ],
        }),
      }),
    );
  });

  it("records current occupancy through the narrow append-only repair RPC", async () => {
    const occupancyId = "00000000-0000-4000-8000-000000000009";
    const repairedOccupancyId = "00000000-0000-4000-8000-000000000010";
    rpc.mockResolvedValueOnce({ data: repairedOccupancyId, error: null });
    const formData = new FormData();
    formData.set("actualMoveInDate", "2027-05-03");
    formData.set("leaseId", leaseId);
    formData.set("occupancyId", occupancyId);
    formData.set("reason", "Keys received and resident confirmed in person");
    formData.set("scheduledMoveInDate", "2027-05-01");
    formData.set("scheduledMoveOutDate", "2028-04-30");

    await expect(
      recordCurrentLeaseOccupancyEvidenceAction({}, formData),
    ).resolves.toMatchObject({ leaseId, status: "success" });
    expect(rpc).toHaveBeenCalledWith(
      "record_current_lease_occupancy_evidence",
      {
        p_actual_move_in_date: "2027-05-03",
        p_expected_occupancy_id: occupancyId,
        p_lease_id: leaseId,
        p_organization_id: organizationId,
        p_reason: "Keys received and resident confirmed in person",
        p_scheduled_move_in_date: "2027-05-01",
        p_scheduled_move_out_date: "2028-04-30",
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/leases");
  });
});

function leaseForm() {
  const formData = new FormData();
  formData.set("actualMoveInDate", "");
  formData.set("actualMoveOutDate", "");
  formData.set("depositAmount", "500");
  formData.set("idempotencyKey", "lease-occupancy-evidence-1");
  formData.set("leaseEndDate", "2028-04-30");
  formData.set("leaseStartDate", "2027-05-01");
  formData.set("monthlyRentAmount", "900");
  formData.set("paymentFrequency", "monthly");
  formData.set("propertyId", propertyId);
  formData.set("rentDueDay", "1");
  formData.set("scheduledMoveInDate", "");
  formData.set("scheduledMoveOutDate", "");
  formData.set("status", "active");
  formData.set("tenantPersonId", tenantPersonId);
  formData.set("termStatus", "active");
  formData.set("unitId", unitId);
  return formData;
}

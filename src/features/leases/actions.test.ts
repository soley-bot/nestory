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
  recordLeaseDepositEventAction,
  recordCurrentLeaseOccupancyEvidenceAction,
  reverseLeaseDepositEventAction,
  scheduleLeaseActivationAction,
  transitionLeaseLifecycleAction,
} from "@/features/leases/actions";

const leaseId = "30000000-0000-0000-0000-000000000001";
const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "10000000-0000-0000-0000-000000000001";
const tenantPersonId = "80000000-0000-0000-0000-000000000001";
const unitId = "20000000-0000-0000-0000-000000000001";

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
      "create_simplified_unit_lease",
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

  it("rejects zero rent before calling the authoritative write", async () => {
    const formData = leaseForm();
    formData.set("monthlyRentAmount", "0");

    await expect(createLeaseAction({}, formData)).resolves.toMatchObject({
      fieldErrors: {
        monthlyRentAmount: ["Enter a rent amount greater than zero."],
      },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a Unit field error when dates became unavailable before save", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Unit is already reserved for the selected Lease dates",
      },
    });

    await expect(createLeaseAction({}, leaseForm())).resolves.toMatchObject({
      fieldErrors: {
        unitId: ["This unit is already reserved for those dates."],
      },
      status: "error",
    });
  });

  it("uses the checked Property-only mutation when the fixed context has no Unit", async () => {
    const formData = leaseForm();
    formData.set("status", "draft");
    formData.set("termStatus", "draft");
    formData.set("unitId", "");

    await expect(createLeaseAction({}, formData)).resolves.toMatchObject({
      leaseId,
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("create_property_lease", {
      p_deposit_amount: 500,
      p_deposit_currency: "USD",
      p_idempotency_key: "lease-occupancy-evidence-1",
      p_lease_end_date: "2028-04-30",
      p_lease_start_date: "2027-05-01",
      p_lease_status: "draft",
      p_organization_id: organizationId,
      p_payment_frequency: "monthly",
      p_primary_tenant_person_id: tenantPersonId,
      p_property_id: propertyId,
      p_rent_amount: 900,
      p_rent_currency: "USD",
      p_rent_due_day: 1,
      p_term_status: "draft",
    });
  });

  it("records current occupancy through the narrow append-only repair RPC", async () => {
    const occupancyId = "40000000-0000-0000-0000-000000000001";
    const repairedOccupancyId = "40000000-0000-0000-0000-000000000002";
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

  it("records notice through the checked lifecycle RPC", async () => {
    const occupancyId = "40000000-0000-0000-0000-000000000001";
    const successorId = "40000000-0000-0000-0000-000000000002";
    rpc.mockResolvedValueOnce({
      data: {
        leaseId,
        occupancyId: successorId,
        status: "notice_given",
      },
      error: null,
    });
    const formData = new FormData();
    formData.set("effectiveDate", "2027-04-01");
    formData.set("expectedOccupancyId", occupancyId);
    formData.set("expectedStatus", "active");
    formData.set("idempotencyKey", "lease-notice-v1");
    formData.set("leaseId", leaseId);
    formData.set("reason", "Tenant notice received and move-out confirmed");
    formData.set("scheduledMoveOutDate", "2027-04-30");
    formData.set("transition", "give_notice");

    await expect(
      transitionLeaseLifecycleAction({}, formData),
    ).resolves.toMatchObject({
      leaseId,
      message: "Notice recorded.",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("transition_lease_lifecycle", {
      p_effective_date: "2027-04-01",
      p_expected_occupancy_id: occupancyId,
      p_expected_status: "active",
      p_idempotency_key: "lease-notice-v1",
      p_lease_id: leaseId,
      p_organization_id: organizationId,
      p_reason: "Tenant notice received and move-out confirmed",
      p_scheduled_move_out_date: "2027-04-30",
      p_transition: "give_notice",
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/leases/${leaseId}`);
  });

  it("refreshes tenant archive eligibility after cancelling a draft lease", async () => {
    const occupancyId = "40000000-0000-0000-0000-000000000001";
    rpc.mockResolvedValueOnce({
      data: {
        leaseId,
        occupancyId,
        status: "cancelled",
      },
      error: null,
    });
    const formData = new FormData();
    formData.set("effectiveDate", "2027-04-01");
    formData.set("expectedOccupancyId", occupancyId);
    formData.set("expectedStatus", "draft");
    formData.set("idempotencyKey", "lease-cancel-v1");
    formData.set("leaseId", leaseId);
    formData.set("reason", "Duplicate draft created in error");
    formData.set("transition", "cancel");

    await expect(
      transitionLeaseLifecycleAction({}, formData),
    ).resolves.toMatchObject({
      leaseId,
      message: "Draft lease cancelled.",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("transition_lease_lifecycle", {
      p_effective_date: "2027-04-01",
      p_expected_occupancy_id: occupancyId,
      p_expected_status: "draft",
      p_idempotency_key: "lease-cancel-v1",
      p_lease_id: leaseId,
      p_organization_id: organizationId,
      p_reason: "Duplicate draft created in error",
      p_scheduled_move_out_date: null,
      p_transition: "cancel",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/people");
    expect(revalidatePath).toHaveBeenCalledWith("/tenants");
  });

  it("requests simple Lease activation without an operator explanation", async () => {
    const occupancyId = "40000000-0000-0000-0000-000000000001";
    const formData = new FormData();
    formData.set("activationDate", "2027-05-01");
    formData.set("expectedOccupancyId", occupancyId);
    formData.set("expectedStatus", "draft");
    formData.set("idempotencyKey", "lease-activation-v1");
    formData.set("leaseId", leaseId);
    rpc.mockResolvedValueOnce({
      data: { leaseId, status: "scheduled" },
      error: null,
    });

    await expect(scheduleLeaseActivationAction({}, formData)).resolves.toMatchObject({
      leaseId,
      message: "Lease activation scheduled for 2027-05-01.",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("request_lease_activation", {
      p_activation_date: "2027-05-01",
      p_expected_occupancy_id: occupancyId,
      p_expected_status: "draft",
      p_idempotency_key: "lease-activation-v1",
      p_lease_id: leaseId,
      p_organization_id: organizationId,
    });
  });

  it("records deposit activity with a deterministic PostgreSQL fixture identifier", async () => {
    const leaseDepositId = "50000000-0000-0000-0000-000000000001";
    const formData = new FormData();
    formData.set("amount", "500");
    formData.set("eventDate", "2027-05-03");
    formData.set("eventType", "received");
    formData.set("leaseDepositId", leaseDepositId);
    formData.set("reference", "Receipt 1001");

    await expect(
      recordLeaseDepositEventAction({}, formData),
    ).resolves.toMatchObject({ status: "success" });
    expect(rpc).toHaveBeenCalledWith("record_lease_deposit_event", {
      p_amount: 500,
      p_event_date: "2027-05-03",
      p_event_type: "received",
      p_lease_deposit_id: leaseDepositId,
      p_organization_id: organizationId,
      p_reference: "Receipt 1001",
    });
  });

  it("reverses deposit activity with a deterministic PostgreSQL fixture identifier", async () => {
    const eventId = "60000000-0000-0000-0000-000000000001";
    const formData = new FormData();
    formData.set("eventDate", "2027-05-04");
    formData.set("eventId", eventId);
    formData.set("reference", "Duplicate receipt");

    await expect(
      reverseLeaseDepositEventAction({}, formData),
    ).resolves.toMatchObject({ status: "success" });
    expect(rpc).toHaveBeenCalledWith("reverse_lease_deposit_event", {
      p_event_date: "2027-05-04",
      p_event_id: eventId,
      p_organization_id: organizationId,
      p_reference: "Duplicate receipt",
    });
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

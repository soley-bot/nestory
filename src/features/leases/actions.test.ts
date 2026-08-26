import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  from,
  leasePathQuery,
  requirePermission,
  revalidatePath,
  rpc,
} = vi.hoisted(
  () => ({
    from: vi.fn(),
    leasePathQuery: {
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      select: vi.fn(),
    },
    requirePermission: vi.fn(),
    revalidatePath: vi.fn(),
    rpc: vi.fn(),
  }),
);

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requirePermission }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ from, rpc }),
}));

import {
  createLeaseAction,
  recordLeaseDepositEventAction,
  recordCurrentLeaseOccupancyEvidenceAction,
  reverseLeaseDepositEventAction,
  scheduleLeaseActivationAction,
  transitionLeaseLifecycleAction,
  updateLeaseAction,
} from "@/features/leases/actions";

const leaseId = "30000000-0000-0000-0000-000000000001";
const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "10000000-0000-0000-0000-000000000001";
const tenantPersonId = "80000000-0000-0000-0000-000000000001";
const unitId = "20000000-0000-0000-0000-000000000001";
const userId = "40000000-0000-4000-8000-000000000001";

describe("Lease occupancy evidence input", () => {
  beforeEach(() => {
    from.mockReset();
    leasePathQuery.eq.mockReset();
    leasePathQuery.maybeSingle.mockReset();
    leasePathQuery.select.mockReset();
    requirePermission.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    from.mockReturnValue(leasePathQuery);
    leasePathQuery.eq.mockReturnValue(leasePathQuery);
    leasePathQuery.maybeSingle.mockResolvedValue({
      data: { property_id: propertyId, unit_id: unitId },
      error: null,
    });
    leasePathQuery.select.mockReturnValue(leasePathQuery);
    requirePermission.mockResolvedValue({ organizationId, userId });
    rpc.mockResolvedValue({ data: { leaseId }, error: null });
  });

  it("explains a database-side verification race during lease save", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "42501",
        message: "Privileged email verification required",
      },
    });

    await expect(createLeaseAction({}, leaseForm())).resolves.toMatchObject({
      message:
        "Verify this signed-in session by email, then retry saving.",
      status: "error",
    });
  });

  it("explains a database-side verification race during lease update", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "42501",
        message: "Privileged email verification required",
      },
    });
    const formData = leaseForm();
    formData.set("leaseId", leaseId);

    await expect(updateLeaseAction({}, formData)).resolves.toMatchObject({
      message:
        "Verify this signed-in session by email, then retry saving.",
      status: "error",
    });
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
      "create_lease_with_deposit_receipt",
      expect.objectContaining({
        p_billing_rule: {
          billingRecipientKind: "individual",
          billingRecipientPersonId: tenantPersonId,
          chargeManagementFeeWhenActive: true,
          chargeThroughLeaseEnd: true,
          collectionRoute: "through_ips",
          finalPeriodProratedAmount: null,
          firstPeriodProratedAmount: null,
          fullManagementFeeDuringProration: false,
          leaseEndProrationRule: "actual_days",
          leaseStartProrationRule: "actual_days",
          managementFeeMode: "percentage",
          managementFeeValue: 8,
          midPeriodRentChangeRule: "next_full_month",
          rentCalculationTimezone: "Asia/Bangkok",
          shortMonthDueDayRule: "last_calendar_day",
        },
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
    expect(requirePermission).toHaveBeenCalledWith("leases.prepare");
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
    expect(rpc).toHaveBeenCalledWith("create_lease_with_deposit_receipt", {
      p_billing_rule: expect.objectContaining({
        billingRecipientPersonId: tenantPersonId,
        rentCalculationTimezone: "Asia/Bangkok",
      }),
      p_deposit_amount: 500,
      p_deposit_currency: "USD",
      p_deposit_received: false,
      p_deposit_received_amount: null,
      p_deposit_received_on: null,
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
      p_relationship_payload: expect.any(Object),
      p_term_status: "draft",
      p_unit_id: null,
    });
  });

  it("rejects an incomplete initial billing snapshot before creating any lease rows", async () => {
    const formData = leaseForm();
    formData.set("billingRecipientPersonId", "");

    await expect(createLeaseAction({}, formData)).resolves.toMatchObject({
      fieldErrors: {
        billingRecipientPersonId: ["Choose a billing recipient."],
      },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("normalizes a zero deposit to no deposit before the checked mutation", async () => {
    const formData = leaseForm();
    formData.set("depositAmount", "0");

    await expect(createLeaseAction({}, formData)).resolves.toMatchObject({
      leaseId,
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_lease_with_deposit_receipt",
      expect.objectContaining({
        p_deposit_amount: null,
        p_deposit_currency: null,
      }),
    );
  });

  it("records an explicitly received deposit in the same checked creation command", async () => {
    const formData = leaseForm();
    formData.set("depositReceived", "yes");
    formData.set("depositReceivedAmount", "");
    formData.set("depositReceivedOn", "2027-05-03");

    await expect(createLeaseAction({}, formData)).resolves.toMatchObject({
      leaseId,
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_lease_with_deposit_receipt",
      expect.objectContaining({
        p_deposit_amount: 500,
        p_deposit_received: true,
        p_deposit_received_amount: 500,
        p_deposit_received_on: "2027-05-03",
      }),
    );
    expect(requirePermission).toHaveBeenCalledWith("leases.prepare");
    expect(requirePermission).toHaveBeenCalledWith("leases.change_terms");
  });

  it("updates a whole-property draft with a nullable Unit RPC argument", async () => {
    const formData = leaseForm();
    formData.set("leaseId", leaseId);
    formData.set("status", "draft");
    formData.set("termStatus", "draft");
    formData.set("unitId", "");
    formData.set("rentDueDay", "22");
    leasePathQuery.maybeSingle.mockResolvedValueOnce({
      data: { property_id: propertyId, unit_id: null },
      error: null,
    });

    await expect(updateLeaseAction({}, formData)).resolves.toMatchObject({
      leaseId,
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith(
      "update_lease_with_billing_rules",
      expect.objectContaining({
        p_billing_rule: expect.objectContaining({
          billingRecipientPersonId: tenantPersonId,
          collectionRoute: "through_ips",
        }),
        p_lease_id: leaseId,
        p_rent_due_day: 22,
        p_unit_id: null,
      }),
    );
    const updatePayload = rpc.mock.calls.at(-1)?.[1];
    expect(updatePayload).not.toHaveProperty("p_deposit_received");
    expect(updatePayload).not.toHaveProperty("p_deposit_received_amount");
    expect(updatePayload).not.toHaveProperty("p_deposit_received_on");
    expect(requirePermission).toHaveBeenCalledWith("leases.prepare");
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
    expect(requirePermission).toHaveBeenCalledWith("leases.activate");
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
    expect(requirePermission).toHaveBeenCalledWith("leases.close");
  });

  it("explains an unsupported lease scope returned by the lifecycle RPC", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        details: "Lease scope is not supported or no longer exists",
        message: "Database transaction failed",
      },
    });
    const formData = new FormData();
    formData.set("effectiveDate", "2027-04-01");
    formData.set("expectedOccupancyId", "40000000-0000-0000-0000-000000000001");
    formData.set("expectedStatus", "active");
    formData.set("idempotencyKey", "lease-terminate-v1");
    formData.set("leaseId", leaseId);
    formData.set("reason", "Lease ended by mutual agreement");
    formData.set("scheduledMoveOutDate", "");
    formData.set("transition", "terminate");

    await expect(
      transitionLeaseLifecycleAction({}, formData),
    ).resolves.toMatchObject({
      message:
        "This lease is no longer linked to a supported property or unit. Refresh the lease before trying again.",
      status: "error",
    });
  });

  it("explains an exact step-up denial from a lease lifecycle write", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "42501",
        message: "Privileged email verification required",
      },
    });
    const formData = new FormData();
    formData.set("effectiveDate", "2027-04-01");
    formData.set("expectedOccupancyId", "40000000-0000-0000-0000-000000000001");
    formData.set("expectedStatus", "active");
    formData.set("idempotencyKey", "lease-terminate-v1");
    formData.set("leaseId", leaseId);
    formData.set("reason", "Lease ended by mutual agreement");
    formData.set("scheduledMoveOutDate", "");
    formData.set("transition", "terminate");

    await expect(
      transitionLeaseLifecycleAction({}, formData),
    ).resolves.toMatchObject({
      message:
        "Verify this signed-in session by email, then retry saving.",
      status: "error",
    });
  });

  it("does not label sentinel text without SQLSTATE 42501 as step-up", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "XX000",
        message: "Privileged email verification required",
      },
    });
    const formData = new FormData();
    formData.set("effectiveDate", "2027-04-01");
    formData.set("expectedOccupancyId", "40000000-0000-0000-0000-000000000001");
    formData.set("expectedStatus", "active");
    formData.set("idempotencyKey", "lease-terminate-v1");
    formData.set("leaseId", leaseId);
    formData.set("reason", "Lease ended by mutual agreement");
    formData.set("scheduledMoveOutDate", "");
    formData.set("transition", "terminate");

    await expect(
      transitionLeaseLifecycleAction({}, formData),
    ).resolves.toMatchObject({
      message: "We could not save the lease. Please check the fields and try again.",
      status: "error",
    });
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

    await expect(
      scheduleLeaseActivationAction({}, formData),
    ).resolves.toMatchObject({
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
    expect(requirePermission).toHaveBeenCalledWith("leases.activate");
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
    expect(requirePermission).toHaveBeenCalledWith("leases.change_terms");
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
    expect(requirePermission).toHaveBeenCalledWith("leases.change_terms");
  });
});

function leaseForm() {
  const formData = new FormData();
  formData.set("actualMoveInDate", "");
  formData.set("actualMoveOutDate", "");
  formData.set("billingRecipientKind", "individual");
  formData.set("billingRecipientPersonId", tenantPersonId);
  formData.set("chargeManagementFeeWhenActive", "yes");
  formData.set("chargeThroughLeaseEnd", "yes");
  formData.set("collectionRoute", "through_ips");
  formData.set("depositAmount", "500");
  formData.set("depositReceived", "no");
  formData.set("depositReceivedAmount", "");
  formData.set("depositReceivedOn", "");
  formData.set("finalPeriodProratedAmount", "");
  formData.set("firstPeriodProratedAmount", "");
  formData.set("fullManagementFeeDuringProration", "no");
  formData.set("idempotencyKey", "lease-occupancy-evidence-1");
  formData.set("leaseEndProrationRule", "actual_days");
  formData.set("leaseEndDate", "2028-04-30");
  formData.set("leaseStartProrationRule", "actual_days");
  formData.set("leaseStartDate", "2027-05-01");
  formData.set("managementFeeMode", "percentage");
  formData.set("managementFeeValue", "8");
  formData.set("midPeriodRentChangeRule", "next_full_month");
  formData.set("monthlyRentAmount", "900");
  formData.set("paymentFrequency", "monthly");
  formData.set("propertyId", propertyId);
  formData.set("rentDueDay", "1");
  formData.set("rentCalculationTimezone", "Asia/Bangkok");
  formData.set("scheduledMoveInDate", "");
  formData.set("scheduledMoveOutDate", "");
  formData.set("status", "active");
  formData.set("shortMonthDueDayRule", "last_calendar_day");
  formData.set("tenantPersonId", tenantPersonId);
  formData.set("termStatus", "active");
  formData.set("unitId", unitId);
  return formData;
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireReadContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireOwnerBalanceReadContext: mocks.requireReadContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

import { getOwnerBalanceData } from "@/features/owner-balances/data/owner-balances";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";
const propertyOwnerId = "00000000-0000-4000-8000-000000000004";
const periodId = "00000000-0000-4000-8000-000000000005";
const blockedPeriodId = "00000000-0000-4000-8000-000000000006";
const sourceId = "00000000-0000-4000-8000-000000000007";
const sourceLineId = "00000000-0000-4000-8000-000000000008";
const allocationId = "00000000-0000-4000-8000-000000000009";
const movementId = "00000000-0000-4000-8000-000000000010";
const reversalSetId = "00000000-0000-4000-8000-000000000011";
const reversalAllocationId = "00000000-0000-4000-8000-000000000012";
const reversalMovementId = "00000000-0000-4000-8000-000000000013";

describe("authoritative owner balance loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadContext.mockResolvedValue({ organizationId });

    const tableResults = {
      people: {
        data: [{ archived_at: null, display_name: "Nora Owner", id: ownerId }],
        error: null,
      },
      properties: {
        data: [{ archived_at: null, code: "RS-01", id: propertyId, name: "Riverside" }],
        error: null,
      },
      property_owners: {
        data: [{
          archived_at: null,
          ended_on: null,
          id: propertyOwnerId,
          person_id: ownerId,
          property_id: propertyId,
          started_on: "2026-07-01",
        }],
        error: null,
      },
      owner_event_allocation_sets: {
        data: [
          {
            allocation_basis: "effective_roster",
            event_date: "2026-08-10",
            gross_signed_amount: "100.01",
            id: periodId,
            reversal_of_allocation_set_id: null,
            source_fingerprint: "b".repeat(64),
            source_id: sourceId,
            source_line_id: sourceLineId,
            source_type: "tenant_rent_receipt",
          },
          {
            allocation_basis: "effective_roster",
            event_date: "2026-08-20",
            gross_signed_amount: "-100.01",
            id: reversalSetId,
            reversal_of_allocation_set_id: periodId,
            source_fingerprint: "c".repeat(64),
            source_id: sourceId,
            source_line_id: reversalMovementId,
            source_type: "reversal",
          },
        ],
        error: null,
      },
      owner_event_owner_allocations: {
        data: [
          {
            allocated_gross_signed_amount: "100.01",
            allocation_set_id: periodId,
            id: allocationId,
            ownership_percent_snapshot: "100.000",
            ownership_roster_hash: "d".repeat(64),
          },
          {
            allocated_gross_signed_amount: "-100.01",
            allocation_set_id: reversalSetId,
            id: reversalAllocationId,
            ownership_percent_snapshot: "100.000",
            ownership_roster_hash: "d".repeat(64),
          },
        ],
        error: null,
      },
      owner_component_movements: {
        data: [
          {
            component: "ips_held_owner_cash",
            event_date: "2026-08-10",
            id: movementId,
            owner_event_owner_allocation_id: allocationId,
            reversal_of_movement_id: null,
            signed_amount: "100.01",
          },
          {
            component: "ips_held_owner_cash",
            event_date: "2026-08-20",
            id: reversalMovementId,
            owner_event_owner_allocation_id: reversalAllocationId,
            reversal_of_movement_id: movementId,
            signed_amount: "-100.01",
          },
        ],
        error: null,
      },
    };
    mocks.from.mockImplementation((table: keyof typeof tableResults) =>
      query(tableResults[table]),
    );
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_owner_balance_ledger") {
        return query({ data: ledgerRows(), error: null });
      }
      if (name === "get_owner_event_allocation_queue") {
        return query({
          data: [{
            allocation_set_id: null,
            allocation_state: "blocked",
            event_date: "2026-08-15",
            gross_signed_amount: "-100.01",
            remediation_code: "owner_roster_missing",
            remediation_detail: { setup_path: `/properties/${propertyId}` },
            source_id: sourceId,
            source_line_id: sourceLineId,
            source_type: "owner_paid_cost",
          }],
          error: null,
        });
      }
      if (name === "get_owner_balance_source_ledger") {
        return query({ data: sourceLedgerRows(), error: null });
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
  });

  it("maps exact four-component periods, authority metadata, and typed remediation", async () => {
    const result = await getOwnerBalanceData({
      currency: "USD",
      ownerPersonId: ownerId,
      periodEnd: "2026-09-01",
      periodStart: "2026-08-01",
      propertyId,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("get_owner_balance_ledger", {
      p_currency: "USD",
      p_organization_id: organizationId,
      p_owner_person_id: ownerId,
      p_period_end: "2026-09-01",
      p_period_start: "2026-08-01",
      p_property_id: propertyId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_owner_event_allocation_queue", {
      p_currency: "USD",
      p_organization_id: organizationId,
      p_period_end: "2026-09-30",
      p_period_start: "2026-08-01",
      p_property_id: propertyId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_owner_balance_source_ledger", {
      p_currency: "USD",
      p_organization_id: organizationId,
      p_owner_person_id: ownerId,
      p_period_end: "2026-09-01",
      p_period_start: "2026-08-01",
      p_property_id: propertyId,
    });
    expect(result.periods).toEqual([
      expect.objectContaining({
        availableWithdrawal: "900719925474.09",
        blockedReasonCode: null,
        components: [
          {
            closingAmount: "900719925474.09",
            component: "ips_held_owner_cash",
            movementAmount: "0.09",
            openingAmount: "900719925474.00",
          },
          {
            closingAmount: "2.00",
            component: "owner_due_to_ips",
            movementAmount: "-3.00",
            openingAmount: "5.00",
          },
          {
            closingAmount: "4.00",
            component: "ips_due_to_owner",
            movementAmount: "4.00",
            openingAmount: "0.00",
          },
          {
            closingAmount: "50.00",
            component: "security_deposit_custody",
            movementAmount: "50.00",
            openingAmount: "0.00",
          },
        ],
        inputHash: "a".repeat(64),
        inputWatermark: "2026-08-31T00:00:00Z",
        monthStart: "2026-08-01",
        status: "ready",
      }),
      expect.objectContaining({
        blockedReasonCode: "unresolved_owner_sources",
        blockedReasonDetail: { source_count: 1 },
        components: [],
        id: blockedPeriodId,
        monthStart: "2026-09-01",
        status: "blocked",
      }),
    ]);
    expect(result.queue).toEqual([
      {
        allocationSetId: null,
        allocationState: "blocked",
        eventDate: "2026-08-15",
        grossSignedAmount: "-100.01",
        remediationCode: "owner_roster_missing",
        remediationDetail: { setup_path: `/properties/${propertyId}` },
        sourceId,
        sourceLineId,
        sourceType: "owner_paid_cost",
      },
    ]);
    expect(result.sources).toEqual([
      {
        allocatedGrossSignedAmount: "100.01",
        allocationBasis: "effective_roster",
        allocationSetId: periodId,
        eventDate: "2026-08-10",
        grossSignedAmount: "100.01",
        movements: [{
          component: "ips_held_owner_cash",
          id: movementId,
          reversalOfMovementId: null,
          signedAmount: "100.01",
        }],
        ownershipPercentSnapshot: "100.000",
        ownershipRosterHash: "d".repeat(64),
        reversalOfAllocationSetId: null,
        sourceFingerprint: "b".repeat(64),
        sourceId,
        sourceLineId,
        sourceType: "tenant_rent_receipt",
      },
      expect.objectContaining({
        allocationSetId: reversalSetId,
        grossSignedAmount: "-100.01",
        reversalOfAllocationSetId: periodId,
        sourceType: "reversal",
        movements: [expect.objectContaining({
          reversalOfMovementId: movementId,
          signedAmount: "-100.01",
        })],
      }),
    ]);
  });

  it("builds choices from explicit owner assignments and never guesses a primary owner", async () => {
    const result = await getOwnerBalanceData({
      currency: "USD",
      periodEnd: "2026-08-01",
      periodStart: "2026-08-01",
    });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.propertyOptions).toEqual([{ id: propertyId, label: "RS-01 — Riverside" }]);
    expect(result.ownerOptions).toEqual([{ id: ownerId, label: "Nora Owner" }]);
    expect(result.periods).toEqual([]);
    expect(result.queue).toEqual([]);
    expect(result.sources).toEqual([]);
  });

  it("fails closed on database errors", async () => {
    mocks.rpc.mockImplementation((name: string) =>
      query({ data: null, error: { message: `${name} failed` } }),
    );

    await expect(getOwnerBalanceData({
      currency: "USD",
      ownerPersonId: ownerId,
      periodEnd: "2026-08-01",
      periodStart: "2026-08-01",
      propertyId,
    })).rejects.toThrow("Unable to load authoritative owner balances");
  });
});

function ledgerRows() {
  const base = {
    available_withdrawal: "900719925474.09",
    blocked_reason_code: null,
    blocked_reason_detail: null,
    input_hash: "a".repeat(64),
    input_watermark: "2026-08-31T00:00:00Z",
    month_start: "2026-08-01",
    period_id: periodId,
    period_status: "ready",
  };
  return [
    { ...base, closing_amount: "900719925474.09", component: "ips_held_owner_cash", movement_amount: "0.09", opening_amount: "900719925474.00" },
    { ...base, closing_amount: "2.00", component: "owner_due_to_ips", movement_amount: "-3.00", opening_amount: "5.00" },
    { ...base, closing_amount: "4.00", component: "ips_due_to_owner", movement_amount: "4.00", opening_amount: "0.00" },
    { ...base, closing_amount: "50.00", component: "security_deposit_custody", movement_amount: "50.00", opening_amount: "0.00" },
    {
      ...base,
      available_withdrawal: null,
      blocked_reason_code: "unresolved_owner_sources",
      blocked_reason_detail: { source_count: 1 },
      closing_amount: null,
      component: null,
      input_hash: null,
      input_watermark: null,
      month_start: "2026-09-01",
      movement_amount: null,
      opening_amount: null,
      period_id: blockedPeriodId,
      period_status: "blocked",
    },
  ];
}

function sourceLedgerRows() {
  return [
    {
      allocated_gross_signed_amount: "100.01",
      allocation_basis: "effective_roster",
      allocation_set_id: periodId,
      component: "ips_held_owner_cash",
      event_date: "2026-08-10",
      gross_signed_amount: "100.01",
      movement_id: movementId,
      ownership_percent_snapshot: "100.000",
      ownership_roster_hash: "d".repeat(64),
      reversal_of_allocation_set_id: null,
      reversal_of_movement_id: null,
      signed_amount: "100.01",
      source_fingerprint: "b".repeat(64),
      source_id: sourceId,
      source_line_id: sourceLineId,
      source_type: "tenant_rent_receipt",
    },
    {
      allocated_gross_signed_amount: "-100.01",
      allocation_basis: "effective_roster",
      allocation_set_id: reversalSetId,
      component: "ips_held_owner_cash",
      event_date: "2026-08-20",
      gross_signed_amount: "-100.01",
      movement_id: reversalMovementId,
      ownership_percent_snapshot: "100.000",
      ownership_roster_hash: "d".repeat(64),
      reversal_of_allocation_set_id: periodId,
      reversal_of_movement_id: movementId,
      signed_amount: "-100.01",
      source_fingerprint: "c".repeat(64),
      source_id: sourceId,
      source_line_id: reversalMovementId,
      source_type: "reversal",
    },
  ];
}

function query(result: { data: unknown; error: unknown }) {
  const builder = {
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

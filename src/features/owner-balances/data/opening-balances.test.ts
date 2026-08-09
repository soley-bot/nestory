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

import { getOpeningBalanceAuthorityData } from "@/features/owner-balances/data/opening-balances";
import { OWNER_BALANCE_COMPONENTS } from "@/features/owner-balances/owner-balance.types";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";
const propertyOwnerId = "00000000-0000-4000-8000-000000000004";
const requestId = "00000000-0000-4000-8000-000000000005";
const correctionRequestId = "00000000-0000-4000-8000-000000000006";
const openingEntryId = "00000000-0000-4000-8000-000000000007";
const reversalEntryId = "00000000-0000-4000-8000-000000000008";
const replacementEntryId = "00000000-0000-4000-8000-000000000009";
const documentId = "00000000-0000-4000-8000-000000000010";
const hash = "b".repeat(64);

describe("opening balance authority loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadContext.mockResolvedValue({ organizationId });
    mocks.rpc.mockReturnValue(query({
      data: [
        {
          active_owner_count: 1,
          boundary_date: "2026-08-01",
          canonical_roster: null,
          issue_code: "owner_share_total_not_100",
          next_boundary_date: null,
          organization_id: organizationId,
          ownership_percent_total_text: "90.000",
          ownership_roster_hash: null,
          property_id: propertyId,
          property_owner_ids: [propertyOwnerId],
          setup_path: `/properties/${propertyId}`,
        },
      ],
      error: null,
    }));
    const results = rowResults();
    mocks.from.mockImplementation((table: string) => {
      if (!(table in results)) throw new Error(`Unexpected table ${table}`);
      return query(results[table as keyof typeof results]);
    });
  });

  it("maps all four components and distinguishes unknown from approved zero", async () => {
    const result = await getOpeningBalanceAuthorityData({
      currency: "USD",
      effectiveDate: "2026-08-01",
      ownerPersonId: ownerId,
      propertyId,
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.components.map((item) => item.component)).toEqual(
      OWNER_BALANCE_COMPONENTS,
    );
    expect(result.groups[0]?.components[0]?.authority).toEqual({
      amount: "0.00",
      entryCount: 1,
      knownZero: true,
      latestEntryAt: "2026-08-02T00:00:00Z",
      state: "known",
    });
    expect(result.groups[0]?.components[1]?.authority).toEqual({
      state: "unknown",
    });
    expect(result.groups[0]?.components[2]?.authority).toMatchObject({
      amount: "12.34",
      knownZero: false,
      state: "known",
    });
  });

  it("retains request, correction, resubmission, evidence, and ownership snapshots", async () => {
    const result = await getOpeningBalanceAuthorityData({
      effectiveDate: "2026-08-01",
    });
    const dueToOwner = result.groups[0]?.components.find(
      (item) => item.component === "ips_due_to_owner",
    );

    expect(dueToOwner?.currentAuthorityEntryId).toBe(replacementEntryId);
    expect(dueToOwner?.entries.map((entry) => entry.signedAmount)).toEqual([
      "10.00",
      "-10.00",
      "12.34",
    ]);
    expect(dueToOwner?.requests[0]).toMatchObject({
      correctionOfEntryId: openingEntryId,
      evidence: {
        contentSha256: hash,
        hashMatchesRequest: true,
        id: documentId,
      },
      evidenceSha256: hash,
      ownershipPercentSnapshot: "100.000",
      propertyOwnerId,
      resubmissionOfRequestId: requestId,
      status: "approved",
    });
  });

  it("queries only the authorized organization and exact requested scope", async () => {
    await getOpeningBalanceAuthorityData({
      currency: "USD",
      effectiveDate: "2026-08-01",
      ownerPersonId: ownerId,
      propertyId,
    });

    expect(mocks.requireReadContext).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("get_owner_roster_readiness", {
      p_cutover_date: "2026-08-01",
      p_organization_id: organizationId,
    });
    for (const call of mocks.from.mock.results.slice(0, 3)) {
      const builder = call.value;
      expect(builder.eq).toHaveBeenCalledWith("organization_id", organizationId);
      expect(builder.eq).toHaveBeenCalledWith("effective_date", "2026-08-01");
      expect(builder.eq).toHaveBeenCalledWith("property_id", propertyId);
      expect(builder.eq).toHaveBeenCalledWith("owner_person_id", ownerId);
      expect(builder.eq).toHaveBeenCalledWith("currency", "USD");
    }
    const readinessBuilder = mocks.rpc.mock.results[0]?.value;
    expect(readinessBuilder.select).toHaveBeenCalledWith(
      expect.stringContaining(
        "ownership_percent_total_text:ownership_percent_total::text",
      ),
    );
    expect(readinessBuilder.eq).toHaveBeenCalledWith("property_id", propertyId);
  });

  it("maps readiness percentages as exact cast text on both sides of 100", async () => {
    mocks.rpc.mockReturnValue(
      query({
        data: [
          readiness("99.999", propertyId),
          readiness("100.001", "00000000-0000-4000-8000-000000000099"),
        ],
        error: null,
      }),
    );

    const result = await getOpeningBalanceAuthorityData({
      effectiveDate: "2026-08-01",
    });

    expect(result.readiness.map((row) => row.ownershipPercentTotal)).toEqual([
      "99.999",
      "100.001",
    ]);
  });

  it("fails closed if a client result ever contains a cross-organization row", async () => {
    const results = rowResults();
    results.owner_opening_balance_requests.data[0] = {
      ...results.owner_opening_balance_requests.data[0],
      organization_id: "00000000-0000-4000-8000-000000000099",
    };
    mocks.from.mockImplementation((table: string) =>
      query(results[table as keyof typeof results]),
    );

    await expect(
      getOpeningBalanceAuthorityData({ effectiveDate: "2026-08-01" }),
    ).rejects.toThrow("Cross-organization opening balance data was rejected.");
  });

  it("sorts queue groups and readiness blockers deterministically", async () => {
    const results = rowResults();
    results.owner_opening_balance_requests.data.push({
      ...results.owner_opening_balance_requests.data[0],
      id: "00000000-0000-4000-8000-000000000020",
      owner_person_id: "00000000-0000-4000-8000-000000000001",
      property_id: "00000000-0000-4000-8000-000000000001",
    });
    mocks.from.mockImplementation((table: string) =>
      query(results[table as keyof typeof results]),
    );

    const result = await getOpeningBalanceAuthorityData({
      effectiveDate: "2026-08-01",
    });

    expect(result.groups.map((group) => group.propertyId)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      propertyId,
    ]);
    expect(result.readiness).toEqual([
      expect.objectContaining({
        issueCode: "owner_share_total_not_100",
        ownershipPercentTotal: "90.000",
        propertyId,
      }),
    ]);
  });
});

function rowResults() {
  return {
    owner_opening_balance_entries: {
      data: [
        entry(openingEntryId, requestId, "ips_held_owner_cash", "opening", "0.00", null, "2026-08-02T00:00:00Z"),
        entry("00000000-0000-4000-8000-000000000011", requestId, "ips_due_to_owner", "opening", "10.00", null, "2026-08-03T00:00:00Z"),
        entry(reversalEntryId, correctionRequestId, "ips_due_to_owner", "correction_reversal", "-10.00", "00000000-0000-4000-8000-000000000011", "2026-08-04T00:00:00Z"),
        entry(replacementEntryId, correctionRequestId, "ips_due_to_owner", "correction_replacement", "12.34", null, "2026-08-04T00:00:01Z"),
      ],
      error: null,
    },
    owner_opening_balance_known_authority_v1: {
      data: [
        known("ips_held_owner_cash", "0.00", 1, "2026-08-02T00:00:00Z"),
        known("ips_due_to_owner", "12.34", 3, "2026-08-04T00:00:01Z"),
      ],
      error: null,
    },
    owner_opening_balance_requests: {
      data: [
        request(requestId, "ips_held_owner_cash", "initial", "approved", "0.00"),
        {
          ...request(correctionRequestId, "ips_due_to_owner", "correction", "approved", "12.34"),
          correction_of_entry_id: openingEntryId,
          resubmission_of_request_id: requestId,
          supporting_document_id: documentId,
        },
        request("00000000-0000-4000-8000-000000000012", "owner_due_to_ips", "initial", "submitted", "5.00"),
      ],
      error: null,
    },
    documents: {
      data: [
        {
          archived_at: null,
          category: "owner_opening_balance_evidence",
          content_sha256: hash,
          file_name: "opening-evidence.pdf",
          id: documentId,
          organization_id: organizationId,
          property_id: propertyId,
          storage_path: `${organizationId}/${propertyId}/opening-evidence.pdf`,
        },
      ],
      error: null,
    },
  };
}

function request(id: string, component: string, requestKind: string, status: string, amount: string) {
  return {
    component,
    correction_of_entry_id: null,
    created_at: "2026-08-01T00:00:00Z",
    currency: "USD",
    effective_date: "2026-08-01",
    evidence_sha256: hash,
    id,
    organization_id: organizationId,
    owner_person_id: ownerId,
    ownership_percent_snapshot_text: "100.000",
    ownership_roster_hash: "c".repeat(64),
    payload_hash: "d".repeat(64),
    property_id: propertyId,
    property_owner_id: propertyOwnerId,
    proposed_amount_text: amount,
    reason: "Reconciled opening evidence",
    request_kind: requestKind,
    resubmission_of_request_id: null,
    review_reason: null,
    reviewed_at: status === "submitted" ? null : "2026-08-02T00:00:00Z",
    reviewed_by: status === "submitted" ? null : "00000000-0000-4000-8000-000000000030",
    source_reference: "IPS workbook row",
    status,
    submitted_at: "2026-08-01T00:00:00Z",
    submitted_by: "00000000-0000-4000-8000-000000000031",
    supporting_document_id: null,
  };
}

function entry(
  id: string,
  linkedRequestId: string,
  component: string,
  entryKind: string,
  signedAmount: string,
  reversalOfEntryId: string | null,
  createdAt: string,
) {
  return {
    component,
    created_at: createdAt,
    created_by: "00000000-0000-4000-8000-000000000030",
    currency: "USD",
    effective_date: "2026-08-01",
    entry_kind: entryKind,
    id,
    organization_id: organizationId,
    owner_person_id: ownerId,
    ownership_percent_snapshot_text: "100.000",
    ownership_roster_hash: "c".repeat(64),
    property_id: propertyId,
    property_owner_id: propertyOwnerId,
    request_id: linkedRequestId,
    reversal_of_entry_id: reversalOfEntryId,
    signed_amount_text: signedAmount,
  };
}

function known(component: string, amount: string, entryCount: number, latestEntryAt: string) {
  return {
    authority_state: "known",
    component,
    currency: "USD",
    current_amount_text: amount,
    effective_date: "2026-08-01",
    entry_count: entryCount,
    latest_entry_at: latestEntryAt,
    organization_id: organizationId,
    owner_person_id: ownerId,
    property_id: propertyId,
  };
}

function query(result: { data: unknown; error: unknown }) {
  const builder = {
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

function readiness(ownershipPercentTotal: string, scopedPropertyId: string) {
  return {
    active_owner_count: 1,
    boundary_date: "2026-08-01",
    canonical_roster: null,
    issue_code: "owner_share_total_not_100",
    next_boundary_date: null,
    organization_id: organizationId,
    ownership_percent_total_text: ownershipPercentTotal,
    ownership_roster_hash: null,
    property_id: scopedPropertyId,
    property_owner_ids: [propertyOwnerId],
    setup_path: `/properties/${scopedPropertyId}`,
  };
}

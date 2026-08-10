import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireReadiness: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireOwnerCloseReadinessContext: mocks.requireReadiness,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

import { getOwnerCloseData } from "@/features/owner-close/data/owner-close";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";
const seriesId = "00000000-0000-4000-8000-000000000004";
const revisionOneId = "00000000-0000-4000-8000-000000000005";
const revisionTwoId = "00000000-0000-4000-8000-000000000006";
const lineId = "00000000-0000-4000-8000-000000000007";
const sourceId = "00000000-0000-4000-8000-000000000008";
const sourceLineId = "00000000-0000-4000-8000-000000000009";
const movementId = "00000000-0000-4000-8000-000000000010";
const publicationId = "00000000-0000-4000-8000-000000000020";
const artifactId = "00000000-0000-4000-8000-000000000021";

describe("owner close authority loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadiness.mockResolvedValue({ organizationId });
    const readiness = {
        blockers: [{ code: "owner_close_reopen_required", series_id: seriesId, state: "closed" }],
        components: [
          { closing_amount: "900719925474.09", component: "ips_held_owner_cash", movement_amount: "0.09", opening_amount: "900719925474.00" },
          { closing_amount: "5.00", component: "owner_due_to_ips", movement_amount: "0.00", opening_amount: "5.00" },
          { closing_amount: "7.00", component: "ips_due_to_owner", movement_amount: "7.00", opening_amount: "0.00" },
          { closing_amount: "50.00", component: "security_deposit_custody", movement_amount: "50.00", opening_amount: "0.00" },
        ],
        currency: "USD",
        input_hash: "b".repeat(64),
        input_watermark: "allocations=2|movements=3|openings=4|month=2026-08-01",
        is_ready: false,
        month_start: "2026-08-01",
        organization_id: organizationId,
        owner_person_id: ownerId,
        period_id: "00000000-0000-4000-8000-000000000011",
        property_id: propertyId,
        series_id: seriesId,
        series_state: "closed",
    };

    const rows = {
      owner_close_corrections: [{
        component: "ips_held_owner_cash",
        created_at: "2026-09-02T05:00:00Z",
        created_by: "00000000-0000-4000-8000-000000000012",
        effective_date: "2026-08-31",
        evidence_sha256: "c".repeat(64),
        id: "00000000-0000-4000-8000-000000000013",
        owner_close_revision_id: revisionTwoId,
        reason: "Late bank charge",
        signed_amount: "-0.09",
        source_reference: "BANK-ADVICE-001",
      }],
      owner_close_line_sources: [{
        close_line_id: lineId,
        id: "00000000-0000-4000-8000-000000000014",
        owner_balance_period_component_id: null,
        owner_close_revision_id: revisionOneId,
        owner_component_movement_id: movementId,
        owner_event_owner_allocation_id: null,
        owner_opening_balance_entry_id: null,
        source_fingerprint: "d".repeat(64),
        source_id: sourceId,
        source_line_id: sourceLineId,
        source_type: "tenant_rent_receipt",
      }],
      owner_close_lines: [{
        business_date: "2026-08-05",
        component: "ips_held_owner_cash",
        description: "Tenant rent receipt - ips held owner cash",
        id: lineId,
        line_kind: "movement",
        line_number: 5,
        owner_close_revision_id: revisionOneId,
        signed_amount: "900719925474.09",
        source_count: 1,
      }],
      owner_close_revisions: [
        {
          close_reason: "Reviewed against bank reconciliation",
          closed_at: "2026-09-01T04:00:00Z",
          closed_by: "00000000-0000-4000-8000-000000000012",
          content_hash: "e".repeat(64),
          id: revisionOneId,
          input_hash: "b".repeat(64),
          input_watermark: "allocations=1|movements=1|openings=4|month=2026-08-01",
          prepared_at: "2026-09-01T03:59:00Z",
          prepared_by: "00000000-0000-4000-8000-000000000012",
          reopen_reason: null,
          revision_number: 1,
          status: "closed",
          supersedes_revision_id: null,
        },
        {
          close_reason: null,
          closed_at: null,
          closed_by: null,
          content_hash: null,
          id: revisionTwoId,
          input_hash: null,
          input_watermark: null,
          prepared_at: "2026-09-02T04:00:00Z",
          prepared_by: "00000000-0000-4000-8000-000000000012",
          reopen_reason: "Late paid cost belongs to August",
          revision_number: 2,
          status: "preparing",
          supersedes_revision_id: revisionOneId,
        },
      ],
      owner_close_series: [{
        active_revision_id: revisionTwoId,
        current_closed_revision_id: revisionOneId,
        id: seriesId,
        state: "preparing",
        state_changed_at: "2026-09-02T04:00:00Z",
      }],
    };
    mocks.from.mockImplementation((table: keyof typeof rows) => query(rows[table]));
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_owner_close_readiness") {
        return Promise.resolve({ data: readiness, error: null });
      }
      if (name === "get_owner_close_history") {
        return Promise.resolve({
          data: {
            corrections: rows.owner_close_corrections,
            revisions: rows.owner_close_revisions.map((revision) => ({
              ...revision,
              lines: revision.id === revisionOneId
                ? [{
                    ...rows.owner_close_lines[0],
                    sources: rows.owner_close_line_sources,
                  }]
                : [],
            })),
            series: rows.owner_close_series[0],
          },
          error: null,
        });
      }
      if (name === "get_owner_statement_readiness") {
        return Promise.resolve({
          data: {
            blockers: [{ code: "owner_statement_revision_not_current_closed" }],
            existing_publication_id: publicationId,
            is_ready: false,
            revision_id: revisionOneId,
          },
          error: null,
        });
      }
      if (name === "get_owner_statement_publications_for_series") {
        return Promise.resolve({
          data: [{
            artifacts: [{ format: "pdf", id: artifactId }],
            content_hash: "f".repeat(64),
            generated_at: "2026-09-01T05:00:00Z",
            id: publicationId,
            owner_close_revision_id: revisionOneId,
            revision_number: 1,
            statement_number: "OS-202608-000000000000",
            superseded_by_publication_id: null,
            supersedes_publication_id: null,
          }],
          error: null,
        });
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
  });

  it("maps typed readiness, immutable history, exact decimals, and source drill-through", async () => {
    const result = await getOwnerCloseData({
      currency: "USD",
      monthStart: "2026-08-01",
      ownerPersonId: ownerId,
      propertyId,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("get_owner_close_readiness", {
      p_currency: "USD",
      p_month_start: "2026-08-01",
      p_organization_id: organizationId,
      p_owner_person_id: ownerId,
      p_property_id: propertyId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_owner_close_history", {
      p_currency: "USD",
      p_month_start: "2026-08-01",
      p_organization_id: organizationId,
      p_owner_person_id: ownerId,
      p_property_id: propertyId,
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result.publicationReadiness).toEqual({
      blockers: [{ code: "owner_statement_revision_not_current_closed" }],
      existingPublicationId: publicationId,
      isReady: false,
      revisionId: revisionOneId,
    });
    expect(result.publications).toEqual([expect.objectContaining({
      artifacts: [{ format: "pdf", id: artifactId }],
      id: publicationId,
      statementNumber: "OS-202608-000000000000",
    })]);
    expect(result.readiness).toEqual(expect.objectContaining({
      blockers: [expect.objectContaining({ code: "owner_close_reopen_required" })],
      components: [
        { closingAmount: "900719925474.09", component: "ips_held_owner_cash", movementAmount: "0.09", openingAmount: "900719925474.00" },
        { closingAmount: "5.00", component: "owner_due_to_ips", movementAmount: "0.00", openingAmount: "5.00" },
        { closingAmount: "7.00", component: "ips_due_to_owner", movementAmount: "7.00", openingAmount: "0.00" },
        { closingAmount: "50.00", component: "security_deposit_custody", movementAmount: "50.00", openingAmount: "0.00" },
      ],
      isReady: false,
      seriesState: "closed",
    }));
    expect(result.series).toEqual(expect.objectContaining({
      activeRevisionId: revisionTwoId,
      currentClosedRevisionId: revisionOneId,
      id: seriesId,
      state: "preparing",
    }));
    expect(result.revisions.map((revision) => revision.revisionNumber)).toEqual([2, 1]);
    expect(result.revisions[1]).toEqual(expect.objectContaining({
      contentHash: "e".repeat(64),
      lines: [expect.objectContaining({
        lineNumber: 5,
        signedAmount: "900719925474.09",
        sources: [expect.objectContaining({
          ownerComponentMovementId: movementId,
          sourceFingerprint: "d".repeat(64),
          sourceLineId,
        })],
      })],
      status: "closed",
    }));
    expect(result.corrections).toEqual([expect.objectContaining({
      evidenceSha256: "c".repeat(64),
      revisionId: revisionTwoId,
      signedAmount: "-0.09",
    })]);
  });

  it("does not invoke scoped RPCs or tables when an exact scope is absent", async () => {
    const result = await getOwnerCloseData({
      currency: "USD",
      monthStart: "2026-08-01",
    });

    expect(mocks.requireReadiness).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result).toEqual({
      corrections: [], publicationReadiness: null, publications: [], readiness: null,
      revisions: [], series: null,
    });
  });

  it("fails closed on malformed money instead of coercing through Number", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        blockers: [], components: [{
          closing_amount: "1e3", component: "ips_held_owner_cash",
          movement_amount: "0.00", opening_amount: "1000.00",
        }], currency: "USD", input_hash: null, input_watermark: null,
        is_ready: true, month_start: "2026-08-01", organization_id: organizationId,
        owner_person_id: ownerId, period_id: null, property_id: propertyId,
        series_id: null, series_state: null,
      }, error: null,
    });

    await expect(getOwnerCloseData({
      currency: "USD", monthStart: "2026-08-01", ownerPersonId: ownerId, propertyId,
    })).rejects.toThrow(/owner close/i);
  });
});

function query(data: unknown[]) {
  const result = { data, error: null };
  const builder = {
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({
      data: data.length === 0 ? null : data[0], error: null,
    })),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

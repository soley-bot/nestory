import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));

import { getFinanceSourcesData } from "@/features/finance-sources/data/finance-sources";

describe("getFinanceSourcesData", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
  });

  it("returns active and archived sources with stable property labels", async () => {
    const sourceQuery = chainQuery({
      data: [
        {
          archived_at: null,
          code: "IPS_COLLECTIONS",
          currency: "USD",
          display_name: "IPS collected funds",
          id: "source-1",
          masked_reference: null,
          property_id: null,
          scope_kind: "organization_pooled",
          source_kind: "clearing",
        },
        {
          archived_at: "2026-08-30T10:00:00.000Z",
          code: "RIVERSIDE_BANK",
          currency: "USD",
          display_name: "Riverside operating account",
          id: "source-2",
          masked_reference: "Ending 4821",
          property_id: "property-1",
          scope_kind: "property_dedicated",
          source_kind: "bank",
        },
      ],
      error: null,
    });
    const propertyQuery = chainQuery({
      data: [{ code: "RIV", id: "property-1", name: "Riverside House" }],
      error: null,
    });
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) =>
        table === "financial_reconciliation_sources"
          ? sourceQuery
          : propertyQuery,
      ),
    });

    await expect(getFinanceSourcesData("organization-1")).resolves.toEqual({
      properties: [{ id: "property-1", label: "RIV · Riverside House" }],
      sources: [
        {
          archivedAt: null,
          code: "IPS_COLLECTIONS",
          currency: "USD",
          displayName: "IPS collected funds",
          id: "source-1",
          maskedReference: null,
          propertyId: null,
          propertyLabel: null,
          scopeKind: "organization_pooled",
          sourceKind: "clearing",
        },
        {
          archivedAt: "2026-08-30T10:00:00.000Z",
          code: "RIVERSIDE_BANK",
          currency: "USD",
          displayName: "Riverside operating account",
          id: "source-2",
          maskedReference: "Ending 4821",
          propertyId: "property-1",
          propertyLabel: "RIV · Riverside House",
          scopeKind: "property_dedicated",
          sourceKind: "bank",
        },
      ],
    });
    expect(sourceQuery.is).not.toHaveBeenCalledWith("archived_at", null);
    expect(propertyQuery.is).toHaveBeenCalledWith("archived_at", null);
  });

  it("fails closed when either authoritative read fails", async () => {
    const sourceQuery = chainQuery({
      data: null,
      error: { message: "permission denied" },
    });
    const propertyQuery = chainQuery({ data: [], error: null });
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) =>
        table === "financial_reconciliation_sources"
          ? sourceQuery
          : propertyQuery,
      ),
    });

    await expect(getFinanceSourcesData("organization-1")).rejects.toThrow(
      "Could not load funding sources: permission denied",
    );
  });
});

function chainQuery(result: { data: unknown; error: { message: string } | null }) {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.order.mockReturnValueOnce(query).mockResolvedValueOnce(result);
  return query;
}

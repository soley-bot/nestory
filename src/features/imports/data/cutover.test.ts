import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import { getLatestIpsCutoverDetail } from "./cutover";

describe("getLatestIpsCutoverDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps canonical exact-money totals, selected months, and blockers", async () => {
    const query = {
      eq: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "10000000-0000-4000-8000-000000000001" },
        error: null,
      }),
      order: vi.fn(),
      select: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const rpc = vi.fn().mockResolvedValue({
      data: {
        authority_start_date: "2026-09-01",
        batch_id: "10000000-0000-4000-8000-000000000001",
        data_owner: "REDACTED-IPS-DATA-OWNER",
        items: [{ issue_code: "owner_share_total_not_100", status: "blocked" }],
        manifest: {
          importRuns: [
            {
              expectedCommittedRows: 1,
              importType: "properties",
              sourceKey: "cutover-central-property-v1",
            },
          ],
          ownerOpeningComponents: [
            { amount: "1250.00", currency: "USD" },
            { amount: "0.00", currency: "USD" },
            { amount: "240.50", currency: "USD" },
            { amount: "800.00", currency: "USD" },
            { amount: "4000000.00", currency: "KHR" },
          ],
          tenantOpeningBalances: [
            {
              currency: "USD",
              expectedBalance: "875.00",
              selectedRentMonths: ["2026-08-01", "2026-07-01"],
            },
            {
              currency: "KHR",
              expectedBalance: "500000.00",
              selectedRentMonths: ["2026-08-01"],
            },
          ],
          signedExceptions: [
            {
              approvedAt: "2026-08-10T01:02:03Z",
              approvedBy: "REDACTED-DATA-OWNER",
              reason: "Redacted source exception independently approved",
              sourceKey: "cutover-exception-v1",
            },
          ],
        },
        manifest_sha256: "a".repeat(64),
        reconciliation: null,
        reconciliation_differences: [],
        status: "blocked",
      },
      error: null,
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(query),
      rpc,
    });

    await expect(
      getLatestIpsCutoverDetail("00000000-0000-4000-8000-000000000001"),
    ).resolves.toEqual({
      authorityStartDate: "2026-09-01",
      batchId: "10000000-0000-4000-8000-000000000001",
      blockers: ["owner share total not 100"],
      dataOwner: "REDACTED-IPS-DATA-OWNER",
      importCounts: [
        { actual: null, expected: "1", label: "properties" },
      ],
      manifestSha256: "a".repeat(64),
      ownerOpeningTotals: [
        { amount: "4000000.00", currency: "KHR" },
        { amount: "2290.50", currency: "USD" },
      ],
      reconciliationDifferences: [],
      reconciliationSha256: null,
      selectedRentMonths: ["2026-07-01", "2026-08-01"],
      signedExceptions: [
        {
          approvedAt: "2026-08-10T01:02:03Z",
          approvedBy: "REDACTED-DATA-OWNER",
          reason: "Redacted source exception independently approved",
          sourceKey: "cutover-exception-v1",
        },
      ],
      status: "blocked",
      tenantOpeningTotals: [
        { amount: "500000.00", currency: "KHR" },
        { amount: "875.00", currency: "USD" },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("get_ips_cutover_batch", {
      p_batch_id: "10000000-0000-4000-8000-000000000001",
      p_organization_id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("returns null before the first staged batch", async () => {
    const query = {
      eq: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn(),
      select: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    mocks.createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(query),
      rpc: vi.fn(),
    });

    await expect(
      getLatestIpsCutoverDetail("00000000-0000-4000-8000-000000000001"),
    ).resolves.toBeNull();
  });
});

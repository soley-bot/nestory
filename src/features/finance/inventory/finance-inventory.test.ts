import { describe, expect, it, vi } from "vitest";

import {
  assertLocalInventoryEnvironment,
  buildIsolatedSupabaseConfig,
  buildFinanceInventoryArtifact,
  buildParitySummary,
  collectInventoryPages,
  compareWatermarks,
  inventoryArtifactJson,
  normalizeInventoryRows,
  parseMoneyToMinor,
  type FinanceInventoryPageRow,
} from "@/features/finance/inventory/finance-inventory";

const scope = {
  currency: "USD",
  organizationId: "00000000-0000-0000-0000-000000000001",
  periodEnd: "2026-07-31",
  periodStart: "2026-07-01",
  propertyId: "10000000-0000-0000-0000-000000000001",
} as const;

function row(
  section: FinanceInventoryPageRow["section"],
  stableKey: string,
  payload: Record<string, unknown>,
): FinanceInventoryPageRow {
  return {
    contract_version: "finance_inventory_v1",
    payload,
    section,
    stable_key: stableKey,
  };
}

describe("finance inventory exact money", () => {
  it.each([
    ["0", 0n],
    ["0.01", 1n],
    ["12.30", 1230n],
    ["999999999999.99", 99_999_999_999_999n],
    ["-12.34", -1234n],
  ])("parses %s without JavaScript floating-point arithmetic", (value, expected) => {
    expect(parseMoneyToMinor(value)).toBe(expected);
  });

  it.each(["", "1.001", "1e3", "NaN", "Infinity"])(
    "rejects a non-contract money value %s",
    (value) => {
      expect(() => parseMoneyToMinor(value)).toThrow(/exact decimal money/i);
    },
  );
});

describe("finance inventory pagination and ordering", () => {
  it("paginates beyond the 1,000 and 5,000 row limits without dropping a row", async () => {
    const rows = Array.from({ length: 5_205 }, (_, index) =>
      row("sources", `ledger_entry:${String(index).padStart(6, "0")}`, {
        amount: "1.00",
        sourceType: "ledger_entry",
      }),
    );
    const fetchPage = vi.fn(
      async ({ afterKey, limit }: { afterKey: string | null; limit: number }) => {
        const start = afterKey
          ? rows.findIndex((candidate) => candidate.stable_key === afterKey) + 1
          : 0;
        return rows.slice(start, start + limit);
      },
    );

    const result = await collectInventoryPages({
      fetchPage,
      pageSize: 317,
    });

    expect(result).toHaveLength(5_205);
    expect(new Set(result.map((candidate) => candidate.stable_key)).size).toBe(
      5_205,
    );
    expect(fetchPage).toHaveBeenCalledTimes(17);
  });

  it("normalizes database rows into stable section and typed-source ordering", () => {
    const normalized = normalizeInventoryRows([
      row("diagnostics", "z", {
        issueCode: "MANUAL_LEDGER_ROW",
        proposedResolutionClass: "unsupported_current_source",
      }),
      row("sources", "b", { amount: "2.00", sourceType: "ledger_entry" }),
      row("sources", "a", {
        amount: "1.00",
        sourceType: "receipt_allocation",
      }),
    ]);

    expect(normalized.map((candidate) => `${candidate.section}:${candidate.stableKey}`)).toEqual([
      "sources:a",
      "sources:b",
      "diagnostics:z",
    ]);
  });
});

describe("finance inventory environment safety", () => {
  it("accepts only the explicit disposable loopback project identity", () => {
    expect(() =>
      assertLocalInventoryEnvironment({
        environmentId: "local-disposable",
        expectedEnvironmentId: "local-disposable",
        expectedProjectId: "nestory-finance-inventory",
        projectId: "nestory-finance-inventory",
        supabaseUrl: "http://127.0.0.1:55321",
      }),
    ).not.toThrow();
  });

  it.each([
    ["https://project.supabase.co", "nestory-finance-inventory", "local-disposable"],
    ["http://localhost:55321", "nestory", "local-disposable"],
    ["http://localhost:55321", "nestory-finance-inventory", "preview"],
  ])(
    "rejects hosted or mismatched identity %s %s %s",
    (supabaseUrl, projectId, environmentId) => {
      expect(() =>
        assertLocalInventoryEnvironment({
          environmentId,
          expectedEnvironmentId: "local-disposable",
          expectedProjectId: "nestory-finance-inventory",
          projectId,
          supabaseUrl,
        }),
      ).toThrow(/disposable local finance inventory environment/i);
    },
  );
});

describe("finance inventory artifact contract", () => {
  const sourceRows = [
    row("sources", "receipt_allocation:r1", {
      amount: "125.50",
      currency: "USD",
      economicArea: "operating_income",
      eventDate: "2026-07-04",
      sourceId: "r1",
      sourceType: "receipt_allocation",
    }),
    row("sources", "ledger_entry:l1", {
      amount: "125.50",
      currency: "USD",
      direction: "income",
      economicArea: "operating_income",
      eventDate: "2026-07-04",
      sourceId: "l1",
      sourceType: "ledger_entry",
    }),
  ];
  const diagnosticRows = [
    row("diagnostics", "MANUAL_LEDGER_ROW:l2", {
      affectedSurfaces: ["ledger", "property_performance"],
      currentState: {
        ledgerAmount: "9.00",
        ledgerEntryId: "l2",
      },
      explanation: "Ledger row has no domain-owned source identity.",
      issueCode: "MANUAL_LEDGER_ROW",
      proposedClassification: {
        class: "unsupported_current_source",
        nonAuthoritative: true,
      },
      proposedResolutionClass: "unsupported_current_source",
      severity: "Critical",
      sourceId: "l2",
      sourceType: "ledger_entry",
    }),
  ];
  const accessRows = [
    row("access", "table:ledger_entries:authenticated:UPDATE", {
      allowed: true,
      evidenceType: "table_privilege",
      role: "authenticated",
    }),
  ];
  const watermark = {
    hash: "abc123",
    rowCount: 3,
  };

  it("keeps current facts structurally separate from non-authoritative proposals", () => {
    const artifact = buildFinanceInventoryArtifact({
      accessRows,
      diagnosticRows,
      migrationIdentity: "20260727010101_finance_inventory_diagnostics",
      repositorySha: "823deb4735b8124edefd1e68e451c21f1962b075",
      scope,
      sourceRows,
      watermark,
    });

    expect(artifact.currentState.diagnostics[0]).toMatchObject({
      issueCode: "MANUAL_LEDGER_ROW",
      severity: "Critical",
    });
    expect(artifact.proposedClassification.rows[0]).toEqual({
      diagnosticKey: "MANUAL_LEDGER_ROW:l2",
      proposal: {
        class: "unsupported_current_source",
        nonAuthoritative: true,
      },
    });
    expect(JSON.stringify(artifact.currentState)).not.toContain(
      "proposedResolutionClass",
    );
  });

  it("emits byte-stable normalized JSON for unchanged inputs", () => {
    const first = buildFinanceInventoryArtifact({
      accessRows,
      diagnosticRows,
      migrationIdentity: "20260727010101_finance_inventory_diagnostics",
      repositorySha: "823deb4735b8124edefd1e68e451c21f1962b075",
      scope,
      sourceRows,
      watermark,
    });
    const second = buildFinanceInventoryArtifact({
      accessRows: [...accessRows].reverse(),
      diagnosticRows: [...diagnosticRows].reverse(),
      migrationIdentity: "20260727010101_finance_inventory_diagnostics",
      repositorySha: "823deb4735b8124edefd1e68e451c21f1962b075",
      scope,
      sourceRows: [...sourceRows].reverse(),
      watermark,
    });

    expect(inventoryArtifactJson(first)).toBe(inventoryArtifactJson(second));
  });

  it("reports gross current totals and a separately labelled proposed total", () => {
    const summary = buildParitySummary({
      diagnosticRows,
      scope,
      sourceRows,
    });

    expect(summary.currentGrossTotals).toMatchObject({
      ledgerIncome: "125.50",
      operatingCashFromReceiptAllocations: "125.50",
    });
    expect(summary.proposedDeduplicated).toMatchObject({
      amount: "125.50",
      confidence: "unresolved",
      label: "non_authoritative_proposed_deduplicated_total",
    });
    expect(summary.proposedDeduplicated.includedSources).toEqual([
      "receipt_allocation:r1",
    ]);
    expect(summary.proposedDeduplicated.excludedSources).toEqual([
      "ledger_entry:l1",
    ]);
  });

  it("derives a collision-free disposable Supabase config without hosted linkage", () => {
    const derived = buildIsolatedSupabaseConfig(`
project_id = "nestory"
[api]
port = 54321
[db]
port = 54322
shadow_port = 54320
[db.pooler]
port = 54329
[studio]
port = 54323
[inbucket]
port = 54324
[edge_runtime]
inspector_port = 8083
[analytics]
port = 54327
[db.seed]
enabled = true
sql_paths = ["./seed.sql"]
`);

    expect(derived).toContain('project_id = "nestory-finance-inventory"');
    expect(derived).toContain("port = 55321");
    expect(derived).toContain("port = 55322");
    expect(derived).toContain("shadow_port = 55320");
    expect(derived).toContain("inspector_port = 8183");
    expect(derived).toContain("[db.seed]\nenabled = false");
    expect(derived).not.toContain('sql_paths = ["./seed.sql"]');
  });
});

describe("finance inventory staleness", () => {
  it("marks a run stale whenever its source watermark changes", () => {
    expect(
      compareWatermarks(
        { hash: "before", rowCount: 10 },
        { hash: "after", rowCount: 10 },
      ),
    ).toEqual({
      stale: true,
      reason: "Finance inventory sources changed during analysis.",
    });
  });

  it("keeps an unchanged run current", () => {
    expect(
      compareWatermarks(
        { hash: "same", rowCount: 10 },
        { hash: "same", rowCount: 10 },
      ),
    ).toEqual({ stale: false, reason: null });
  });
});

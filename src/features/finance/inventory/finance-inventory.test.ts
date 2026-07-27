import { describe, expect, it, vi } from "vitest";

import {
  assertLocalInventoryEnvironment,
  assertInventoryContractVersions,
  assertDisposableStackIdentity,
  assertKnownFinanceInventoryIssueCodes,
  assertRepositoryState,
  buildBusinessGapEvidence,
  buildIsolatedSupabaseConfig,
  buildFinanceInventoryArtifact,
  buildParitySummary,
  buildReadPathParity,
  buildUnitContextCoverage,
  collectInventoryPages,
  compareWatermarks,
  financeInventoryContractVersion,
  inventoryArtifactJson,
  isPathInside,
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
    contract_version: financeInventoryContractVersion,
    payload,
    section,
    stable_key: stableKey,
  };
}

describe("finance inventory exact money", () => {
  it.each([
    ["0", BigInt(0)],
    ["0.01", BigInt(1)],
    ["12.30", BigInt(1230)],
    ["999999999999.99", BigInt("99999999999999")],
    ["-12.34", BigInt(-1234)],
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

describe("finance inventory issue taxonomy", () => {
  it("accepts executable issue filters and rejects undocumented codes", () => {
    expect(() =>
      assertKnownFinanceInventoryIssueCodes([
        "DEPOSIT_INCOME_WITHOUT_DEPOSIT_EVENT",
        "LEDGER_JOURNAL_SOURCE_REVERSAL_MISMATCH",
      ]),
    ).not.toThrow();
    expect(() =>
      assertKnownFinanceInventoryIssueCodes(["OFFLINE_ONLY_INTERPRETATION"]),
    ).toThrow(/unknown finance inventory issue code/i);
  });
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
    ["http://localhost:54321", "nestory-finance-inventory", "local-disposable"],
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

  it("checks path containment without assuming Windows separators", () => {
    expect(isPathInside("C:\\repo\\artifacts", "C:\\repo\\artifacts\\stack")).toBe(
      true,
    );
    expect(isPathInside("/repo/artifacts", "/repo/artifacts/stack")).toBe(true);
    expect(isPathInside("/repo/artifacts", "/repo/artifacts-other")).toBe(false);
  });

  it("proves disposable identity from actual workdir config and status", () => {
    expect(() =>
      assertDisposableStackIdentity({
        config: 'project_id = "nestory-finance-inventory"\n[api]\nport = 55321',
        repositoryRoot: "/repo",
        stackStatus: { API_URL: "http://127.0.0.1:55321" },
        stackWorkdir: "/repo/artifacts/finance-inventory-stack",
      }),
    ).not.toThrow();

    expect(() =>
      assertDisposableStackIdentity({
        config: 'project_id = "nestory-finance-inventory"\n[api]\nport = 55321',
        repositoryRoot: "/repo",
        stackStatus: { API_URL: "http://127.0.0.1:54321" },
        stackWorkdir: "/repo/artifacts/finance-inventory-stack",
      }),
    ).toThrow(/stack identity/i);
  });

  it("fails closed on a dirty repository unless explicitly recorded", () => {
    expect(() =>
      assertRepositoryState({ allowDirty: false, porcelainStatus: " M file.ts" }),
    ).toThrow(/dirty/i);
    expect(
      assertRepositoryState({
        allowDirty: true,
        porcelainStatus: " M file.ts",
      }),
    ).toEqual({ dirty: true });
  });
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
      ledgerIncomeControl: "125.50",
      operatingIncomeReceived: "125.50",
    });
    expect(summary.proposedBuckets.operatingIncomeReceived).toMatchObject({
      amount: "125.50",
      includedSources: ["receipt_allocation:r1"],
    });
    expect(summary.proposedBuckets.operatingNetMovement.amount).toBe("125.50");
    expect(summary.proposedBuckets.depositCustodyMovement.amount).toBe("0.00");
    expect(summary).not.toHaveProperty("proposedDeduplicated");
  });

  it("uses exact signed effects for receipt, payment, and deposit reversals", () => {
    const summary = buildParitySummary({
      diagnosticRows: [],
      scope,
      sourceRows: [
        row("sources", "receipt_allocation:original", {
          amount: "100.00",
          economicClass: "operating_income",
          signedAmount: "100.00",
          sourceType: "receipt_allocation",
        }),
        row("sources", "receipt_allocation:reversal", {
          amount: "100.00",
          economicClass: "operating_income",
          isReversal: true,
          signedAmount: "-100.00",
          sourceType: "receipt_allocation",
        }),
        row("sources", "payment_allocation:original", {
          amount: "40.00",
          economicClass: "property_expense",
          signedAmount: "40.00",
          sourceType: "payment_allocation",
        }),
        row("sources", "payment_allocation:reversal", {
          amount: "40.00",
          economicClass: "property_expense",
          isReversal: true,
          signedAmount: "-40.00",
          sourceType: "payment_allocation",
        }),
        row("sources", "deposit_event:received", {
          amount: "250.00",
          economicClass: "deposit_custody",
          signedAmount: "250.00",
          sourceType: "deposit_event",
        }),
        row("sources", "deposit_event:reversal", {
          amount: "250.00",
          economicClass: "deposit_custody",
          isReversal: true,
          signedAmount: "-250.00",
          sourceType: "deposit_event",
        }),
      ],
    });

    expect(summary.currentGrossTotals).toMatchObject({
      depositCustodyMovement: "0.00",
      operatingIncomeReceived: "0.00",
      propertyExpensesPaid: "0.00",
    });
    expect(summary.proposedBuckets.operatingNetMovement.amount).toBe("0.00");
  });

  it("keeps owner cash, company costs, fees, and deposits out of operating net", () => {
    const summary = buildParitySummary({
      diagnosticRows: [],
      scope,
      sourceRows: [
        row("sources", "receipt_allocation:rent", {
          amount: "1000.00",
          economicClass: "operating_income",
          signedAmount: "1000.00",
          sourceType: "receipt_allocation",
        }),
        row("sources", "receipt_allocation:owner", {
          amount: "500.00",
          economicClass: "owner_contribution",
          signedAmount: "500.00",
          sourceType: "receipt_allocation",
        }),
        row("sources", "receipt_allocation:fee", {
          amount: "100.00",
          economicClass: "management_fee",
          signedAmount: "100.00",
          sourceType: "receipt_allocation",
        }),
        row("sources", "payment_allocation:property", {
          amount: "200.00",
          economicClass: "property_expense",
          signedAmount: "200.00",
          sourceType: "payment_allocation",
        }),
        row("sources", "payment_allocation:owner", {
          amount: "150.00",
          economicClass: "owner_distribution",
          signedAmount: "150.00",
          sourceType: "payment_allocation",
        }),
        row("sources", "payment_allocation:company", {
          amount: "75.00",
          economicClass: "company_cost",
          signedAmount: "75.00",
          sourceType: "payment_allocation",
        }),
        row("sources", "deposit_event:security", {
          amount: "300.00",
          economicClass: "deposit_custody",
          eventDate: "2026-07-10",
          signedAmount: "300.00",
          sourceType: "deposit_event",
        }),
      ],
    });

    expect(summary.proposedBuckets).toMatchObject({
      depositCustodyMovement: { amount: "300.00" },
      managementFeeEffects: { amount: "100.00" },
      operatingIncomeReceived: { amount: "1000.00" },
      operatingNetMovement: { amount: "800.00" },
      ownerContributions: { amount: "500.00" },
      ownerDistributions: { amount: "150.00" },
      ownerLiabilityMovement: { amount: "1050.00" },
      propertyExpensesPaid: { amount: "200.00" },
    });
    expect(
      summary.proposedBuckets.operatingNetMovement.includedSources,
    ).toEqual([
      "payment_allocation:property",
      "receipt_allocation:rent",
    ]);
    expect(
      summary.proposedBuckets.propertyExpensesPaid.excludedSources,
    ).toContain("payment_allocation:company");
    expect(
      summary.proposedBuckets.operatingNetMovement.includedSources,
    ).not.toContain("deposit_event:security");
  });

  it("counts only operating income obligations under a non-tenant-specific label", () => {
    const summary = buildParitySummary({
      diagnosticRows: [],
      scope,
      sourceRows: [
        row("sources", "income_obligation:rent", {
          amount: "1000.00",
          economicClass: "operating_income",
          incomeType: "rent",
          outstandingAmount: "250.00",
          sourceType: "income_obligation",
        }),
        row("sources", "income_obligation:owner", {
          amount: "500.00",
          economicClass: "owner_contribution",
          incomeType: "owner_contribution",
          outstandingAmount: "500.00",
          sourceType: "income_obligation",
        }),
        row("sources", "income_obligation:fee", {
          amount: "125.00",
          economicClass: "management_fee",
          incomeType: "management_fee",
          outstandingAmount: "125.00",
          sourceType: "income_obligation",
        }),
        row("sources", "income_obligation:deposit", {
          amount: "300.00",
          economicClass: "deposit_custody",
          incomeType: "security_deposit",
          outstandingAmount: "300.00",
          sourceType: "income_obligation",
        }),
      ],
    });

    expect(summary.currentGrossTotals).toMatchObject({
      operatingObligations: "1000.00",
      operatingOutstandingBalance: "250.00",
    });
    expect(summary.currentGrossTotals).not.toHaveProperty("tenantCharges");
    expect(summary.currentGrossTotals).not.toHaveProperty(
      "tenantOutstandingBalance",
    );
  });

  it("rejects any row returned under a different diagnostic contract", () => {
    expect(() =>
      assertInventoryContractVersions([
        row("sources", "ledger_entry:l1", {
          amount: "1.00",
          sourceType: "ledger_entry",
        }),
        {
          ...row("diagnostics", "issue:i1", {}),
          contract_version: "finance_inventory_v0",
        },
      ]),
    ).toThrow(/contract version/i);
  });

  it("labels named production read paths and their shared Ledger calculation", () => {
    const parity = buildReadPathParity([
      row("sources", "receipt_allocation:r1", {
        amount: "100.00",
        economicClass: "operating_income",
        signedAmount: "100.00",
        sourceType: "receipt_allocation",
      }),
      row("sources", "payment_allocation:p1", {
        amount: "25.00",
        economicClass: "property_expense",
        signedAmount: "25.00",
        sourceType: "payment_allocation",
      }),
      row("sources", "ledger_entry:l1", {
        amount: "90.00",
        archived: false,
        direction: "income",
        sourceType: "ledger_entry",
        unitId: "unit-1",
      }),
      row("sources", "ledger_entry:l2", {
        amount: "20.00",
        archived: false,
        direction: "expense",
        sourceType: "ledger_entry",
        unitId: null,
      }),
      row("sources", "journal_line:j1", {
        amount: "90.00",
        creditAmount: "90.00",
        debitAmount: "0.00",
        sourceType: "journal_line",
      }),
    ]);

    expect(parity.ownerStatementPropertyCash.totals).toMatchObject({
      operatingIncomeReceived: "100.00",
      propertyExpensesPaid: "25.00",
    });
    expect(parity.ledger.totals).toEqual({
      expense: "20.00",
      income: "90.00",
      net: "70.00",
    });
    expect(parity.propertyPerformance.sharesCalculationWith).toBe("ledger");
    expect(parity.unitPerformance.unitContext).toEqual({
      legitimatePropertyLevelRows: 1,
      rowsWithUnitId: 1,
      unexpectedlyMissingUnitId: 0,
    });
    expect(parity.incomeAndExpense.sharesCalculationWith).toBe("ledger");
    expect(parity.propertyRecordFinanceSummary.sharesCalculationWith).toBe(
      "ledger",
    );
    expect(parity.journalAccountingControl.totals.credit).toBe("90.00");
  });

  it("inventories unit context per typed source family", () => {
    expect(
      buildUnitContextCoverage([
        row("sources", "receipt_allocation:rent", {
          incomeType: "rent",
          leaseId: "lease-1",
          sourceType: "receipt_allocation",
          unitId: "unit-1",
        }),
        row("sources", "receipt_allocation:missing-unit", {
          incomeType: "rent",
          leaseId: "lease-2",
          sourceType: "receipt_allocation",
        }),
        row("sources", "ledger_entry:property-level", {
          sourceType: "ledger_entry",
        }),
      ]),
    ).toEqual({
      ledger_entry: {
        legitimatePropertyLevelRows: 1,
        rowsWithUnitId: 0,
        unexpectedMissingSourceIdentities: [],
        unexpectedlyMissingUnitId: 0,
      },
      receipt_allocation: {
        legitimatePropertyLevelRows: 0,
        rowsWithUnitId: 1,
        unexpectedMissingSourceIdentities: [
          "receipt_allocation:missing-unit",
        ],
        unexpectedlyMissingUnitId: 1,
      },
    });
  });

  it("reports the confirmed IPS category and owner-balance gaps separately", () => {
    const gaps = buildBusinessGapEvidence();

    expect(gaps.incomeCategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "Cleaning",
          state: "missing_stable_type",
        }),
      ]),
    );
    expect(gaps.expenseCategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "General Supplies",
          currentStableType: true,
          mappedExpenseType: "supplies",
          state: "broad_current_type",
        }),
        expect.objectContaining({
          category: "Other Expense",
          currentStableType: true,
          mappedExpenseType: "other",
          state: "broad_current_type",
        }),
        expect.objectContaining({
          broadCurrentType: "utilities",
          category: "Electricity",
          currentStableType: false,
          state: "broad_type_not_specific",
        }),
        expect.objectContaining({
          category: "Property Taxes",
          state: "free_text_category_only",
        }),
      ]),
    );
    expect(gaps.confirmedGaps).toContain(
      "no_durable_owner_balance_chain",
    );
    expect(gaps.confirmedGaps).toContain(
      "deposits_excluded_from_operating_and_carried_balance_totals",
    );
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

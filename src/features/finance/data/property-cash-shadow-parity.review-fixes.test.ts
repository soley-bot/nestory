import { describe, expect, it } from "vitest";
import type { PropertyCashEvent } from "@/features/finance/data/property-cash-events.types";
import {
  buildPropertyCashShadowParity,
  type PropertyCashParityIdentity,
  type PropertyCashShadowParityInput,
} from "@/features/finance/data/property-cash-shadow-parity";
import type { FinanceInventoryPageRow } from "@/features/finance/inventory/finance-inventory";
import { buildTrustedReport } from "@/features/reports/data/trusted-report";
import { toOwnerStatementInput } from "@/features/reports/data/owner-statement-input";
import { buildPropertySummary } from "@/features/properties/data/property-summary";

type TrustedReportInput = Parameters<typeof buildTrustedReport>[0];
type OwnerStatementRows = Parameters<typeof toOwnerStatementInput>[0];
type PropertySummaryInput = Parameters<typeof buildPropertySummary>[0];
type PropertySummaryParityInput = Omit<
  PropertySummaryInput,
  "ledgerEntries"
> & {
  ledgerEntries: Array<
    PropertySummaryInput["ledgerEntries"][number] & { id: string }
  >;
};

describe("property cash shadow parity review fixes", () => {
  it("rejects every Owner Statement collection before invoking a builder", async () => {
    const samples: Array<
      [
        Exclude<keyof OwnerStatementRows, "monthScope">,
        readonly unknown[],
      ]
    > = [
      [
        "contactRows",
        [{ email: "owner@example.com", person_id: "owner-1", phone: null }],
      ],
      ["currentReceiptRows", [ownerStatementRows().currentReceiptRows[0]!]],
      ["depositRows", [ownerStatementRows().depositRows[0]!]],
      ["dueIncomeItems", [ownerStatementRows().dueIncomeItems[0]!]],
      [
        "historicalReceiptRows",
        [ownerStatementRows().currentReceiptRows[0]!],
      ],
      ["ownerRows", [ownerStatementRows().ownerRows[0]!]],
      ["paymentRows", [ownerStatementRows().paymentRows[0]!]],
      ["personRows", [ownerStatementRows().personRows[0]!]],
      ["propertyIds", ["property-1"]],
    ];

    for (const [key, sample] of samples) {
      const rows = ownerStatementRows();
      (rows as unknown as Record<string, unknown>)[key] = Array.from(
        { length: 11 },
        () => sample[0],
      );
      await expect(
        buildPropertyCashShadowParity(
          parityInput({ identityLimit: 10, ownerStatementRows: rows }),
        ),
        `ownerStatementRows.${key}`,
      ).rejects.toThrow(`ownerStatementRows.${key}`);
    }

    const combined = ownerStatementRows();
    combined.currentReceiptRows = Array.from(
      { length: 6 },
      () => ownerStatementRows().currentReceiptRows[0]!,
    );
    combined.paymentRows = Array.from(
      { length: 5 },
      () => ownerStatementRows().paymentRows[0]!,
    );
    combined.depositRows = [];
    combined.dueIncomeItems = [];
    await expect(
      buildPropertyCashShadowParity(
        parityInput({ identityLimit: 10, ownerStatementRows: combined }),
      ),
    ).rejects.toThrow("ownerStatementRows.sourceLines");
  });

  it("rejects every TrustedReport collection before invoking a builder", async () => {
    const seed = trustedReportWithAllSourceShapes();
    const keys = [
      "documents",
      "ledgerEntries",
      "leases",
      "maintenanceTasks",
      "owners",
      "people",
      "properties",
      "timelineEvents",
      "units",
    ] as const;

    for (const key of keys) {
      const input = trustedReportWithAllSourceShapes();
      (input as unknown as Record<string, unknown>)[key] = Array.from(
        { length: 11 },
        () => seed[key][0],
      );
      await expect(
        buildPropertyCashShadowParity(
          parityInput({ identityLimit: 10, trustedReportInput: input }),
        ),
        `trustedReportInput.${key}`,
      ).rejects.toThrow(`trustedReportInput.${key}`);
    }
  });

  it("rejects PropertySummary, canonical, and Plan 01 overflow before builders", async () => {
    const summaryCases = [
      "ledgerEntries",
      "units",
    ] as const satisfies ReadonlyArray<keyof PropertySummaryInput>;
    for (const key of summaryCases) {
      const summary = propertySummaryInput();
      (summary as unknown as Record<string, unknown>)[key] = Array.from(
        { length: 11 },
        () => summary[key][0],
      );
      await expect(
        buildPropertyCashShadowParity(
          parityInput({ identityLimit: 10, propertySummaryInput: summary }),
        ),
        `propertySummaryInput.${key}`,
      ).rejects.toThrow(`propertySummaryInput.${key}`);
    }

    const canonicalEvents = Array.from({ length: 11 }, (_, index) =>
      event({
        eventKey: `receipt_allocation:overflow-${index}`,
        sourceId: `overflow-${index}`,
      }),
    );
    await expect(
      buildPropertyCashShadowParity(
        parityInput({ canonicalEvents, identityLimit: 10 }),
      ),
    ).rejects.toThrow("canonicalEvents");

    const planRows = Array.from({ length: 11 }, (_, index) =>
      inventoryRow("sources", `receipt_allocation:overflow-${index}`, {
        amount: "1.00",
        economicClass: "operating_income",
        signedAmount: "1.00",
        sourceType: "receipt_allocation",
      }),
    );
    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          financeInventorySourceRows: planRows,
          identityLimit: 10,
        }),
      ),
    ).rejects.toThrow("financeInventorySourceRows");
  });

  it("rejects the combined canonical and current report contributor set before builders", async () => {
    const rows = ownerStatementRows();
    rows.contactRows = [];
    rows.currentReceiptRows = [];
    rows.depositRows = [];
    rows.dueIncomeItems = [];
    rows.historicalReceiptRows = [];
    rows.ownerRows = [];
    rows.paymentRows = [];
    rows.personRows = [];
    const trusted = trustedReportInput();
    trusted.ledgerEntries = Array.from({ length: 4 }, (_, index) =>
      ledgerRow(`combined-${index}`, 1, "income", "unit-1"),
    );

    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          canonicalEvents: Array.from({ length: 4 }, (_, index) =>
            event({
              eventKey: `receipt_allocation:combined-${index}`,
              sourceId: `canonical-combined-${index}`,
            }),
          ),
          financeInventorySourceRows: Array.from(
            { length: 4 },
            (_, index) => planLedgerRow(`combined-${index}`, "income", false),
          ),
          identityLimit: 10,
          ownerStatementRows: rows,
          trustedReportInput: trusted,
        }),
      ),
    ).rejects.toThrow("combinedReportContributors");
  });

  it("rejects oversized raw report arrays before constructing derived maps", async () => {
    const trusted = trustedReportInput();
    const oversized = Array.from({ length: 3 }, (_, index) =>
      ledgerRow(`raw-overflow-${index}`, 1, "income", "unit-1"),
    );
    Object.defineProperty(oversized, "map", {
      value: () => {
        throw new Error("derived report map constructed before raw bound");
      },
    });
    trusted.ledgerEntries = oversized;

    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          identityLimit: 2,
          ownerStatementRows: emptyOwnerStatementRows(),
          trustedReportInput: trusted,
        }),
      ),
    ).rejects.toThrow("trustedReportInput.ledgerEntries");
  });

  it("preflights historical receipt obligation and allocation identities", async () => {
    const rows = emptyOwnerStatementRows();
    const receipts = Array.from({ length: 3 }, (_, index) => {
      const item = incomeItem(
        `historical-income-${index}`,
        "rent",
        "1.00",
      );
      return receiptRow(`historical-allocation-${index}`, "1.00", item);
    });
    rows.historicalReceiptRows = receipts;

    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          identityLimit: 4,
          ownerStatementRows: rows,
        }),
      ),
    ).rejects.toThrow("combinedPropertyCashContributorIdentities");
  });

  it("preflights multi-owner allocation evidence fanout", async () => {
    const rows = emptyOwnerStatementRows();
    rows.currentReceiptRows = Array.from({ length: 2 }, (_, index) => {
      const item = incomeItem(`fanout-income-${index}`, "rent", "1.00");
      return receiptRow(`fanout-allocation-${index}`, "1.00", item);
    });
    rows.ownerRows = [
      ownerLinkRow("owner-link-1", "owner-1", "50"),
      ownerLinkRow("owner-link-2", "owner-2", "50"),
    ];
    rows.personRows = [
      personRow("owner-1", "Owner One"),
      personRow("owner-2", "Owner Two"),
    ];

    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          identityLimit: 6,
          ownerStatementRows: rows,
        }),
      ),
    ).rejects.toThrow("ownerStatementRows.allocationFanout");
  });

  it("preflights owner fanout across off-scope properties and the actual statement month", async () => {
    const rows = emptyOwnerStatementRows();
    rows.propertyIds = ["property-1", "property-2"];
    const otherPropertyItem = incomeItem(
      "other-property-income",
      "rent",
      "1.00",
    );
    otherPropertyItem.property_id = "property-2";
    rows.currentReceiptRows = [
      receiptRow("other-property-allocation", "1.00", otherPropertyItem),
    ];
    rows.ownerRows = [
      {
        ...ownerLinkRow("other-owner-link-1", "other-owner-1", "50"),
        property_id: "property-2",
      },
      {
        ...ownerLinkRow("other-owner-link-2", "other-owner-2", "50"),
        property_id: "property-2",
      },
    ];
    rows.personRows = [
      personRow("other-owner-1", "Other Owner One"),
      personRow("other-owner-2", "Other Owner Two"),
    ];
    rows.monthScope = { before: "2026-09-01", from: "2026-08-01" };

    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          identityLimit: 5,
          ownerStatementRows: rows,
        }),
      ),
    ).rejects.toThrow("ownerStatementRows.allocationFanout");
  });

  it("counts repeated raw payment, deposit, and receipt occurrences in owner fanout", async () => {
    const repeatedPaymentAndDeposit = emptyOwnerStatementRows();
    repeatedPaymentAndDeposit.ownerRows = [
      ownerLinkRow("owner-link-1", "owner-1", "100"),
    ];
    repeatedPaymentAndDeposit.personRows = [
      personRow("owner-1", "Owner One"),
    ];
    const payment = paymentRow("repeated-payment", "1.00", "maintenance");
    const deposit = ownerStatementRows().depositRows[0]!;
    repeatedPaymentAndDeposit.paymentRows = [payment, payment];
    repeatedPaymentAndDeposit.depositRows = [deposit, deposit];

    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          identityLimit: 4,
          ownerStatementRows: repeatedPaymentAndDeposit,
        }),
      ),
      "repeated payment and deposit",
    ).rejects.toThrow("ownerStatementRows.allocationFanout");

    const repeatedReceipt = emptyOwnerStatementRows();
    repeatedReceipt.ownerRows = [
      ownerLinkRow("owner-link-1", "owner-1", "100"),
    ];
    repeatedReceipt.personRows = [personRow("owner-1", "Owner One")];
    const item = incomeItem("repeated-income", "rent", "1.00");
    const receipt = receiptRow("repeated-receipt", "1.00", item);
    repeatedReceipt.currentReceiptRows = [receipt, receipt];

    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          identityLimit: 4,
          ownerStatementRows: repeatedReceipt,
        }),
      ),
      "repeated receipt",
    ).rejects.toThrow("ownerStatementRows.allocationFanout");
  });

  it.each([
    ["fully paid", "10.00"],
    ["partially paid", "5.00"],
  ])(
    "preflights %s management-fee evidence reused across statement facts",
    async (_case, receiptAmount) => {
      const rows = emptyOwnerStatementRows();
      const fee = incomeItem(
        "management-fee-income",
        "management_fee",
        "10.00",
      );
      rows.currentReceiptRows = [
        receiptRow("management-fee-allocation", receiptAmount, fee),
      ];
      rows.ownerRows = [
        ownerLinkRow("owner-link-1", "owner-1", "100"),
      ];
      rows.personRows = [personRow("owner-1", "Owner One")];

      await expect(
        buildPropertyCashShadowParity(
          parityInput({
            identityLimit: 3,
            ownerStatementRows: rows,
          }),
        ),
      ).rejects.toThrow("ownerStatementRows.allocationFanout");
    },
  );

  it("bounds mixed repeated source work when no owner rows exist", async () => {
    const rows = emptyOwnerStatementRows();
    const rent = incomeItem("shared-rent-income", "rent", "10.00");
    rows.currentReceiptRows = Array.from({ length: 5 }, (_, index) =>
      receiptRow(`shared-rent-allocation-${index}`, "2.00", rent),
    );
    const repeatedPayment = paymentRow(
      "repeated-payment",
      "1.00",
      "maintenance",
    );
    rows.paymentRows = Array.from({ length: 5 }, () => repeatedPayment);

    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          identityLimit: 10,
          ownerStatementRows: rows,
        }),
      ),
    ).rejects.toThrow("ownerStatementRows.sourceLines");
  });

  it.each([
    ["receiptRows", 6, 5],
    ["incomeItems", 5, 6],
  ])(
    "bounds the combined Owner Statement %s candidate array before builders",
    async (expectedLabel, currentCount, dueCount) => {
      const rows = emptyOwnerStatementRows();
      const item = incomeItem("combined-income", "rent", "1.00");
      const receipt = receiptRow("combined-receipt", "1.00", item);
      rows.currentReceiptRows = Array.from(
        { length: currentCount },
        () => receipt,
      );
      if (expectedLabel === "receiptRows") {
        rows.historicalReceiptRows = Array.from(
          { length: dueCount },
          () => receipt,
        );
      } else {
        rows.dueIncomeItems = Array.from({ length: dueCount }, () => item);
      }

      await expect(
        buildPropertyCashShadowParity(
          parityInput({
            identityLimit: 10,
            ownerStatementRows: rows,
          }),
        ),
      ).rejects.toThrow(`ownerStatementRows.${expectedLabel}`);
    },
  );

  it("fails closed when a canonical event is outside the stamped scope", async () => {
    const invalidEvents = [
      event({
        eventKey: "receipt_allocation:other-org",
        organizationId: "organization-2",
        sourceId: "other-org",
      }),
      event({
        eventKey: "receipt_allocation:other-property",
        propertyId: "property-2",
        sourceId: "other-property",
      }),
      event({
        currency: "EUR" as "USD",
        eventKey: "receipt_allocation:other-currency",
        sourceId: "other-currency",
      }),
      event({
        eventDate: "2026-06-30",
        eventKey: "receipt_allocation:before-period",
        sourceId: "before-period",
      }),
      event({
        eventDate: "2026-08-01",
        eventKey: "receipt_allocation:after-period",
        sourceId: "after-period",
      }),
    ];

    for (const invalidEvent of invalidEvents) {
      await expect(
        buildPropertyCashShadowParity(
          parityInput({ canonicalEvents: [invalidEvent] }),
        ),
        invalidEvent.eventKey,
      ).rejects.toThrow(/canonical event .* scope/i);
    }

    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          canonicalEvents: [
            event({
              classificationStatus: "unresolved_evidence",
              depositLiabilityEffectCents: null,
              economicClass: "legacy_unclassified",
              eventDate: null,
              eventKey: "ledger_entry:null-date",
              ledgerEntryId: "null-date",
              managementFeeEffectCents: null,
              operatingCashEffectCents: null,
              ownerCashEffectCents: null,
              requiresResolution: true,
              sourceId: "null-date",
              sourceType: "ledger_entry",
            }),
          ],
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("rejects a null-dated canonical event that is countable or not explicitly unresolved", async () => {
    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          canonicalEvents: [
            event({
              eventDate: null,
              eventKey: "receipt_allocation:null-countable",
              operatingCashEffectCents: BigInt(100),
              ownerCashEffectCents: BigInt(100),
              sourceId: "null-countable",
            }),
          ],
        }),
      ),
    ).rejects.toThrow(/null-dated canonical event .* unresolved/i);
  });

  it("emits exact field-specific PropertyCash provenance and disjoint partitions", async () => {
    const result = await buildPropertyCashShadowParity(parityInput());
    const records = propertyCashRecords(result);
    const expected: Record<string, string[]> = {
      arrearsCents: ["cash:receipt_allocation:rent", "income:income-rent"],
      managementFeesEarnedCents: ["income:income-fee"],
      managementFeesOutstandingCents: [
        "cash:receipt_allocation:fee",
        "income:income-fee",
      ],
      managementFeesReceivedCents: ["cash:receipt_allocation:fee"],
      netOwnerCashMovementCents: [
        "cash:payment_allocation:expense",
        "cash:payment_allocation:payout",
        "cash:receipt_allocation:contribution",
        "cash:receipt_allocation:fee",
        "cash:receipt_allocation:rent",
      ],
      operatingCashReceivedCents: ["cash:receipt_allocation:rent"],
      ownerContributionCents: ["cash:receipt_allocation:contribution"],
      ownerPayoutCents: ["cash:payment_allocation:payout"],
      propertyExpensesPaidCents: ["cash:payment_allocation:expense"],
      rentDueCents: ["income:income-rent"],
      rentReceivedCents: [
        "cash:receipt_allocation:rent",
        "income:income-rent",
      ],
      securityDepositHeldCents: ["cash:deposit_event:held"],
    };

    for (const record of records) {
      expect(
        record.included.map(identityToken),
        record.metric,
      ).toEqual(expected[record.metric]);
      expect(partitionKeys(record.included, record.excluded)).toEqual([]);
      expect(partitionKeys(record.included, record.unresolved)).toEqual([]);
      expect(partitionKeys(record.excluded, record.unresolved)).toEqual([]);
    }
  });

  it("keeps archived canonical settlement separate from current loader provenance", async () => {
    const result = await buildPropertyCashShadowParity(
      parityInput({
        canonicalEvents: [
          event({
            archivedAt: "2026-07-20T00:00:00.000Z",
            eventKey: "receipt_allocation:archived-rent",
            operatingCashEffectCents: BigInt(5_000),
            ownerCashEffectCents: BigInt(5_000),
            sourceId: "archived-rent",
          }),
        ],
      }),
    );
    const operating = propertyCashRecords(result).find(
      (record) => record.metric === "operatingCashReceivedCents",
    )!;

    expect(operating).toMatchObject({
      canonicalCents: BigInt(5_000),
      currentCents: BigInt(10_000),
      deltaCents: BigInt(5_000),
      status: "mismatch",
    });
    expect(operating.included.map(identityToken)).toEqual([
      "canonical:receipt_allocation:archived-rent",
      "cash:receipt_allocation:rent",
    ]);
  });

  it("keeps historical obligation settlement out of selected-period flow provenance", async () => {
    const rows = ownerStatementRows();
    const historical = receiptRow(
      "historical-rent",
      "20.00",
      rows.dueIncomeItems[0]!,
    );
    historical.finance_receipts!.received_date = "2026-06-20";
    rows.historicalReceiptRows = [historical];
    const result = await buildPropertyCashShadowParity(
      parityInput({ ownerStatementRows: rows }),
    );
    const records = Object.fromEntries(
      propertyCashRecords(result).map((record) => [record.metric, record]),
    );

    expect(records.operatingCashReceivedCents!.included.map(identityToken))
      .toEqual(["cash:receipt_allocation:rent"]);
    expect(records.rentReceivedCents!.included.map(identityToken)).toEqual([
      "cash:receipt_allocation:historical-rent",
      "cash:receipt_allocation:rent",
      "income:income-rent",
    ]);
    expect(records.arrearsCents!.included.map(identityToken)).toEqual([
      "cash:receipt_allocation:historical-rent",
      "cash:receipt_allocation:rent",
      "income:income-rent",
    ]);
  });

  it("keeps current cash identities distinct by source type", async () => {
    const rows = ownerStatementRows();
    rows.currentReceiptRows[0]!.id = "shared-allocation";
    rows.paymentRows[0]!.id = "shared-allocation";
    const result = await buildPropertyCashShadowParity(
      parityInput({ ownerStatementRows: rows }),
    );
    const net = propertyCashRecords(result).find(
      (record) => record.metric === "netOwnerCashMovementCents",
    )!;

    expect(net.included.map(identityToken)).toEqual(
      expect.arrayContaining([
        "cash:payment_allocation:shared-allocation",
        "cash:receipt_allocation:shared-allocation",
      ]),
    );
  });

  it("uses exact metric-specific Owner Statement evidence", async () => {
    const result = await buildPropertyCashShadowParity(parityInput());
    const records = Object.fromEntries(
      result.records
        .filter((record) => record.surface === "owner_statement_allocation")
        .map((record) => [record.metric, record]),
    );

    expect(records.managementFeesEarnedCents!.included.map(identityToken))
      .toEqual(["income:income-fee", "owner:owner-link-1:owner-1"]);
    expect(records.managementFeesOutstandingCents!.included.map(identityToken))
      .toEqual([
        "cash:receipt_allocation:fee",
        "income:income-fee",
        "owner:owner-link-1:owner-1",
      ]);
    expect(records.managementFeesReceivedCents!.included.map(identityToken))
      .toEqual([
        "cash:receipt_allocation:fee",
        "income:income-fee",
        "owner:owner-link-1:owner-1",
      ]);
    expect(records.operatingCashReceivedCents!.included.map(identityToken))
      .toEqual([
        "cash:receipt_allocation:rent",
        "income:income-rent",
        "owner:owner-link-1:owner-1",
      ]);
    expect(records.ownerContributionCents!.included.map(identityToken)).toEqual([
      "cash:receipt_allocation:contribution",
      "income:income-contribution",
      "owner:owner-link-1:owner-1",
    ]);
    expect(records.ownerPayoutCents!.included.map(identityToken)).toEqual([
      "cash:payment_allocation:payout",
      "expense:expense-payout",
      "owner:owner-link-1:owner-1",
    ]);
    expect(records.propertyExpensesPaidCents!.included.map(identityToken))
      .toEqual([
        "cash:payment_allocation:expense",
        "expense:expense-expense",
        "owner:owner-link-1:owner-1",
      ]);
    expect(records.securityDepositHeldCents!.included.map(identityToken))
      .toEqual([
        "cash:deposit_event:held",
        "owner:owner-link-1:owner-1",
      ]);
    expect(records.netOwnerCashMovementCents!.included.map(identityToken))
      .toEqual([
        "cash:payment_allocation:expense",
        "cash:payment_allocation:payout",
        "cash:receipt_allocation:contribution",
        "cash:receipt_allocation:fee",
        "cash:receipt_allocation:rent",
        "expense:expense-expense",
        "expense:expense-payout",
        "income:income-contribution",
        "income:income-fee",
        "income:income-rent",
        "owner:owner-link-1:owner-1",
      ]);
  });

  it("uses exact metric-specific TrustedReport contributors", async () => {
    const trustedInput = trustedReportInput();
    trustedInput.ledgerEntries.push(
      ledgerRow("ledger-property-income", 20, "income", null),
    );
    const sourceRows = [
      planLedgerRow("ledger-income", "income", false),
      planLedgerRow("ledger-expense", "expense", false),
      planLedgerRow("ledger-property-income", "income", false),
      planLedgerRow("unrelated", "income", false),
      planLedgerRow("archived", "income", true),
      inventoryRow("sources", "ledger_entry:wrong-direction", {
        amount: "100.00",
        archived: false,
        direction: "expense",
        sourceId: "ledger-income",
        sourceType: "ledger_entry",
      }),
    ];
    const result = await buildPropertyCashShadowParity(
      parityInput({
        canonicalEvents: [
          event({
            eventKey: "receipt_allocation:unit-income",
            operatingCashEffectCents: BigInt(10_000),
            ownerCashEffectCents: BigInt(10_000),
            sourceId: "unit-income",
            unitId: "unit-1",
          }),
          event({
            eventKey: "receipt_allocation:property-income",
            operatingCashEffectCents: BigInt(2_000),
            ownerCashEffectCents: BigInt(2_000),
            sourceId: "property-income",
            unitId: null,
          }),
          event({
            economicClass: "operating_expense",
            eventKey: "payment_allocation:unit-expense",
            operatingCashEffectCents: -BigInt(3_000),
            ownerCashEffectCents: -BigInt(3_000),
            sourceId: "unit-expense",
            sourceType: "payment_allocation",
            unitId: "unit-1",
          }),
        ],
        financeInventorySourceRows: sourceRows,
        trustedReportInput: trustedInput,
      }),
    );

    for (const surface of [
      "property_performance",
      "unit_performance_summary",
      "income_expense",
    ]) {
      expect(
        currentReportTokens(reportMetrics(result, surface).income),
        `${surface}.income`,
      ).toEqual([
        "ledger:ledger-income",
        "ledger:ledger-property-income",
        "plan:ledger_entry:ledger-income",
        "plan:ledger_entry:ledger-property-income",
      ]);
      expect(
        currentReportTokens(reportMetrics(result, surface).expenses),
        `${surface}.expenses`,
      ).toEqual([
        "ledger:ledger-expense",
        "plan:ledger_entry:ledger-expense",
      ]);
      expect(
        currentReportTokens(reportMetrics(result, surface).noi),
        `${surface}.noi`,
      ).toEqual([
        "ledger:ledger-expense",
        "ledger:ledger-income",
        "ledger:ledger-property-income",
        "plan:ledger_entry:ledger-expense",
        "plan:ledger_entry:ledger-income",
        "plan:ledger_entry:ledger-property-income",
      ]);
    }
    expect(
      currentReportTokens(
        reportMetrics(result, "unit_performance_visible_rows").income,
      ),
    ).toEqual(["ledger:ledger-income", "plan:ledger_entry:ledger-income"]);
    expect(
      currentReportTokens(
        reportMetrics(result, "unit_performance_visible_rows").expenses,
      ),
    ).toEqual([
      "ledger:ledger-expense",
      "plan:ledger_entry:ledger-expense",
    ]);
    expect(
      currentReportTokens(
        reportMetrics(result, "unit_performance_visible_rows").noi,
      ),
    ).toEqual([
      "ledger:ledger-expense",
      "ledger:ledger-income",
      "plan:ledger_entry:ledger-expense",
      "plan:ledger_entry:ledger-income",
    ]);
  });

  it("marks only a matching legacy-unclassified Ledger contributor unresolved", async () => {
    const result = await buildPropertyCashShadowParity(
      parityInput({
        canonicalEvents: [
          unresolvedLedgerEvent("ledger-income"),
          unresolvedLedgerEvent("unrelated-ledger"),
        ],
        financeInventorySourceRows: [
          planLedgerRow("ledger-income", "income", false),
          planLedgerRow("ledger-expense", "expense", false),
        ],
      }),
    );
    const metrics = reportMetrics(result, "property_performance");

    expect(metrics.income).toMatchObject({
      canonicalCents: null,
      deltaCents: null,
      status: "unresolved",
      unresolved: [
        expect.objectContaining({ eventKey: "ledger_entry:ledger-income" }),
      ],
    });
    expect(metrics.noi).toMatchObject({
      canonicalCents: null,
      deltaCents: null,
      status: "unresolved",
    });
    expect(metrics.expenses).toMatchObject({
      canonicalCents: BigInt(0),
      currentCents: BigInt(3_000),
      deltaCents: BigInt(3_000),
      status: "mismatch",
      unresolved: [],
    });
    expect(metrics.income.excluded.map(identityToken)).toContain(
      "canonical:ledger_entry:unrelated-ledger",
    );
  });

  it("matches unresolved projected petty cash by exact expense Ledger ID", async () => {
    const result = await buildPropertyCashShadowParity(
      parityInput({
        canonicalEvents: [
          event({
            classificationStatus: "unresolved_evidence",
            economicClass: "legacy_unclassified",
            eventKey: "petty_cash_entry:uncleared",
            ledgerEntryId: "ledger-expense",
            managementFeeEffectCents: null,
            operatingCashEffectCents: null,
            ownerCashEffectCents: null,
            requiresResolution: true,
            sourceId: "petty-cash-1",
            sourceType: "petty_cash_entry",
          }),
        ],
      }),
    );
    const metrics = reportMetrics(result, "property_performance");

    expect(metrics.expenses).toMatchObject({
      canonicalCents: null,
      deltaCents: null,
      status: "unresolved",
      unresolved: [
        expect.objectContaining({ eventKey: "petty_cash_entry:uncleared" }),
      ],
    });
    expect(metrics.noi).toMatchObject({
      canonicalCents: null,
      deltaCents: null,
      status: "unresolved",
    });
    expect(metrics.income).toMatchObject({
      canonicalCents: BigInt(0),
      currentCents: BigInt(10_000),
      deltaCents: BigInt(10_000),
      status: "mismatch",
      unresolved: [],
    });
  });

  it("uses only exact all-time PropertySummary Ledger identities", async () => {
    const result = await buildPropertyCashShadowParity(
      parityInput({
        financeInventorySourceRows: [
          planLedgerRow("selected-period-unrelated", "income", false),
        ],
        propertySummaryInput: propertySummaryInput(),
      }),
    );

    for (const record of Object.values(reportMetrics(result, "property_summary"))) {
      expect(record.status).toBe("not_comparable");
      expect(record.included.map(identityToken)).toEqual([
        "ledger:summary-expense",
        "ledger:summary-income",
      ]);
    }
  });

  it("rejects missing and duplicate PropertySummary Ledger identities before the builder", async () => {
    const missing = propertySummaryInput();
    delete (missing.ledgerEntries[0] as { id?: string }).id;
    await expect(
      buildPropertyCashShadowParity(
        parityInput({
          propertySummaryInput:
            missing as unknown as PropertyCashShadowParityInput["propertySummaryInput"],
        }),
      ),
    ).rejects.toThrow("propertySummaryInput.ledgerEntries[0].id");

    const duplicate = propertySummaryInput();
    duplicate.ledgerEntries[1]!.id = duplicate.ledgerEntries[0]!.id;
    await expect(
      buildPropertyCashShadowParity(
        parityInput({ propertySummaryInput: duplicate }),
      ),
    ).rejects.toThrow(/duplicate PropertySummary Ledger id/i);
  });

  it("keeps canonical deltas null for current-path controls and parses negative NOI", async () => {
    const trustedInput = trustedReportInput();
    trustedInput.ledgerEntries = [
      ledgerRow("small-income", 10, "income", "unit-1"),
      ledgerRow("large-expense", 30, "expense", "unit-1"),
    ];
    const result = await buildPropertyCashShadowParity(
      parityInput({
        financeInventoryDiagnosticRows: [
          inventoryRow(
            "diagnostics",
            "REPORT_TOTAL_CONTRADICTION:property-1:2026-07-01",
            {
              issueCode: "REPORT_TOTAL_CONTRADICTION",
              ledgerAmount: "70.00",
              settlementAmount: "90.00",
            },
          ),
        ],
        trustedReportInput: trustedInput,
      }),
    );
    const integrity = result.records.find(
      (record) =>
        record.surface === "owner_statement_allocation_integrity" &&
        record.metric === "netOwnerCashMovementCents",
    )!;
    const contradiction = result.records.find(
      (record) =>
        record.surface === "plan01_diagnostic" &&
        record.metric === "REPORT_TOTAL_CONTRADICTION",
    )!;

    expect(integrity).toMatchObject({
      canonicalCents: null,
      deltaCents: null,
      referenceCents: BigInt(9_000),
      referenceDeltaCents: BigInt(0),
      currentCents: BigInt(9_000),
      status: "match",
    });
    expect(contradiction).toMatchObject({
      canonicalCents: null,
      deltaCents: null,
      referenceCents: BigInt(9_000),
      referenceDeltaCents: -BigInt(2_000),
      currentCents: BigInt(7_000),
      status: "mismatch",
    });
    expect(reportMetrics(result, "property_performance").noi.currentCents)
      .toBe(-BigInt(2_000));
  });

  it("never invents journal IDs and retains missing payload identity as unresolved", async () => {
    const result = await buildPropertyCashShadowParity(
      parityInput({
        financeInventorySourceRows: [
          inventoryRow("sources", "journal_line:exact", {
            creditAmount: "10.00",
            debitAmount: "10.00",
            journalEntryId: "journal-1",
            journalLineId: "line-1",
            sourceType: "journal_line",
          }),
          inventoryRow("sources", "journal_line:missing", {
            creditAmount: "5.00",
            debitAmount: "5.00",
            sourceType: "journal_line",
          }),
        ],
      }),
    );

    for (const record of Object.values(reportMetrics(result, "journal_control"))) {
      expect(record.included.map(identityToken)).toEqual([
        "journal:journal-1:line-1",
      ]);
      expect(record.unresolved.map(identityToken)).toEqual([
        "plan:journal_line:missing",
      ]);
      expect(record.status).toBe("unresolved");
    }
  });
});

function parityInput(
  overrides: Partial<PropertyCashShadowParityInput> = {},
): PropertyCashShadowParityInput {
  return {
    canonicalEvents: [],
    financeInventoryDiagnosticRows: [],
    financeInventorySourceRows: [],
    ownerStatementRows: ownerStatementRows(),
    propertySummaryInput: propertySummaryInput(),
    scope: {
      currency: "USD",
      organizationId: "organization-1",
      periodEnd: "2026-07-31",
      periodStart: "2026-07-01",
      propertyId: "property-1",
    },
    trustedReportInput: trustedReportInput(),
    ...overrides,
  };
}

function ownerStatementRows(): OwnerStatementRows {
  const rentItem = incomeItem("income-rent", "rent", "100.00");
  const feeItem = incomeItem("income-fee", "management_fee", "10.00");
  const contributionItem = incomeItem(
    "income-contribution",
    "owner_contribution",
    "50.00",
  );
  return {
    contactRows: [],
    currentReceiptRows: [
      receiptRow("rent", "100.00", rentItem),
      receiptRow("fee", "10.00", feeItem),
      receiptRow("contribution", "50.00", contributionItem),
    ],
    depositRows: [
      {
        amount: "25.00",
        event_date: "2026-07-02",
        event_type: "received",
        id: "held",
        property_id: "property-1",
        reversal_of_id: null,
      },
    ],
    dueIncomeItems: [rentItem, feeItem, contributionItem],
    historicalReceiptRows: [],
    monthScope: { before: "2026-08-01", from: "2026-07-01" },
    ownerRows: [
      {
        archived_at: null,
        ended_on: null,
        id: "owner-link-1",
        is_primary: true,
        ownership_percent: "100",
        person_id: "owner-1",
        property_id: "property-1",
        started_on: "2020-01-01",
      },
    ],
    paymentRows: [
      paymentRow("expense", "30.00", "maintenance"),
      paymentRow("payout", "20.00", "owner_payout"),
    ],
    personRows: [
      {
        display_name: "Owner One",
        id: "owner-1",
        primary_email: "owner@example.com",
        primary_phone: null,
      },
    ],
    propertyIds: ["property-1"],
  };
}

function emptyOwnerStatementRows(): OwnerStatementRows {
  return {
    contactRows: [],
    currentReceiptRows: [],
    depositRows: [],
    dueIncomeItems: [],
    historicalReceiptRows: [],
    monthScope: { before: "2026-08-01", from: "2026-07-01" },
    ownerRows: [],
    paymentRows: [],
    personRows: [],
    propertyIds: ["property-1"],
  };
}

function ownerLinkRow(
  id: string,
  personId: string,
  ownershipPercent: string,
): OwnerStatementRows["ownerRows"][number] {
  return {
    archived_at: null,
    ended_on: null,
    id,
    is_primary: id === "owner-link-1",
    ownership_percent: ownershipPercent,
    person_id: personId,
    property_id: "property-1",
    started_on: "2020-01-01",
  };
}

function personRow(
  id: string,
  displayName: string,
): OwnerStatementRows["personRows"][number] {
  return {
    display_name: displayName,
    id,
    primary_email: `${id}@example.com`,
    primary_phone: null,
  };
}

function incomeItem(id: string, incomeType: string, amount: string) {
  return {
    amount_due: amount,
    due_date: "2026-07-01",
    id,
    income_type: incomeType,
    property_id: "property-1",
  };
}

function receiptRow(
  id: string,
  amount: string,
  item: OwnerStatementRows["dueIncomeItems"][number],
): OwnerStatementRows["currentReceiptRows"][number] {
  return {
    amount,
    finance_income_items: item,
    finance_receipts: {
      id: `receipt-${id}`,
      received_date: "2026-07-05",
      reversal_of_id: null,
    },
    id,
    income_item_id: item.id,
  };
}

function paymentRow(
  id: string,
  amount: string,
  expenseType: string,
): OwnerStatementRows["paymentRows"][number] {
  return {
    amount,
    expense_item_id: `expense-${id}`,
    finance_expense_items: {
      economic_scope: "property_expense",
      expense_type: expenseType,
      id: `expense-${id}`,
      property_id: "property-1",
    },
    finance_payments: {
      id: `payment-${id}`,
      paid_date: "2026-07-06",
      reversal_of_id: null,
    },
    id,
  };
}

function trustedReportInput(): TrustedReportInput {
  return {
    documents: [],
    generatedAt: "2026-08-01T00:00:00.000Z",
    ledgerEntries: [
      ledgerRow("ledger-income", 100, "income", "unit-1"),
      ledgerRow("ledger-expense", 30, "expense", "unit-1"),
    ],
    leases: [],
    maintenanceTasks: [],
    owners: [],
    people: [],
    periodEnd: "2026-07-31",
    periodStart: "2026-07-01",
    properties: [
      {
        code: "P1",
        id: "property-1",
        name: "Property One",
        owner: null,
        property_type: "Apartment",
        status: "active",
      },
    ],
    timelineEvents: [],
    units: [
      {
        current_rent_amount: null,
        current_rent_currency: null,
        floor: "1",
        id: "unit-1",
        property_id: "property-1",
        size_sqm: 50,
        status: "occupied",
        unit_number: "1A",
      },
    ],
    viewQuery: {
      month: "2026-07",
      ownerPersonId: "all",
      peopleArchiveState: "active",
      peopleView: "relationship",
      propertyId: "property-1",
      report: "property-performance",
      status: "all",
      unitId: "all",
    },
  };
}

function trustedReportWithAllSourceShapes(): TrustedReportInput {
  const input = trustedReportInput();
  input.documents = [
    {
      file_name: "lease.pdf",
      id: "document-1",
      lease_id: "lease-1",
      ledger_entry_id: null,
      property_id: "property-1",
      timeline_event_id: null,
      unit_id: "unit-1",
    },
  ];
  input.leases = [
    {
      id: "lease-1",
      lease_end_date: "2027-06-30",
      lease_start_date: "2026-07-01",
      monthly_rent_amount: 100,
      monthly_rent_currency: "USD",
      primary_tenant_person_id: null,
      property_id: "property-1",
      status: "active",
      tenant_name: "Tenant One",
      unit_id: "unit-1",
    },
  ];
  input.maintenanceTasks = [
    {
      actual_cost_amount: null,
      actual_cost_currency: null,
      category: "repair",
      cost_estimate_amount: 10,
      cost_estimate_currency: "USD",
      created_at: "2026-07-01T00:00:00.000Z",
      due_date: "2026-07-10",
      due_time: null,
      id: "task-1",
      ledger_entry_id: null,
      priority: "normal",
      property_id: "property-1",
      recurrence_frequency: "none",
      status: "open",
      timeline_event_id: null,
      title: "Repair",
      unit_id: "unit-1",
    },
  ];
  input.owners = [
    {
      id: "owner-link-1",
      ownership_label: null,
      ownership_percent: 100,
      person_id: "owner-1",
      property_id: "property-1",
    },
  ];
  input.people = [{ display_name: "Owner One", id: "owner-1" }];
  input.timelineEvents = [
    {
      cost_amount: null,
      cost_currency: null,
      description: null,
      event_date: "2026-07-02",
      event_type: "Inspection",
      id: "timeline-1",
      lease_id: null,
      ledger_entry_id: null,
      property_id: "property-1",
      title: "Inspection",
      unit_id: "unit-1",
    },
  ];
  return input;
}

function ledgerRow(
  id: string,
  amount: number,
  direction: string,
  unitId: string | null,
): TrustedReportInput["ledgerEntries"][number] {
  return {
    amount,
    category: direction === "income" ? "rent" : "maintenance",
    currency: "USD",
    description: id,
    direction,
    id,
    property_id: "property-1",
    transaction_date: "2026-07-10",
    unit_id: unitId,
  };
}

function propertySummaryInput(): PropertySummaryParityInput {
  return {
    activeOwner: null,
    hasActiveOwnerLink: false,
    ledgerEntries: [
      {
        amount: 100,
        currency: "USD",
        direction: "income",
        id: "summary-income",
      },
      {
        amount: 30,
        currency: "USD",
        direction: "expense",
        id: "summary-expense",
      },
    ],
    property: {
      address: null,
      code: "P1",
      id: "property-1",
      name: "Property One",
      owner: null,
      property_type: "Apartment",
      status: "active",
    },
    units: [{ status: "occupied" }],
  };
}

function event(
  overrides: Partial<PropertyCashEvent> &
    Pick<PropertyCashEvent, "eventKey" | "sourceId">,
): PropertyCashEvent {
  return {
    amountCents: BigInt(100),
    archivedAt: null,
    categoryCode: "test",
    classificationStatus: "source_stable",
    contractVersion: "property_cash_events_v1",
    createdAt: "2026-07-01T00:00:00.000Z",
    createdBy: null,
    currency: "USD",
    depositLiabilityEffectCents: BigInt(0),
    economicClass: "operating_income",
    eventDate: "2026-07-01",
    isLegacy: false,
    isReversal: false,
    journalEntryId: null,
    leaseId: null,
    ledgerEntryId: null,
    managementFeeEffectCents: BigInt(0),
    obligationId: null,
    obligationType: null,
    operatingCashEffectCents: BigInt(0),
    organizationId: "organization-1",
    ownerCashEffectCents: BigInt(0),
    ownerPersonId: null,
    periodStart: "2026-07-01",
    projectionStatus: null,
    propertyId: "property-1",
    reconciliationSourceId: null,
    reconciliationState: "not_required",
    requiresResolution: false,
    resolutionCodes: [],
    reversalSourceId: null,
    reversalSourceType: null,
    sourceParentId: null,
    sourceParentType: null,
    sourceType: "receipt_allocation",
    statementSection: "test",
    taskId: null,
    tenantPersonId: null,
    unitId: null,
    updatedAt: null,
    updatedBy: null,
    vendorPersonId: null,
    ...overrides,
  };
}

function unresolvedLedgerEvent(id: string) {
  return event({
    classificationStatus: "unresolved_evidence",
    economicClass: "legacy_unclassified",
    eventKey: `ledger_entry:${id}`,
    ledgerEntryId: id,
    managementFeeEffectCents: null,
    operatingCashEffectCents: null,
    ownerCashEffectCents: null,
    reconciliationState: "missing_stable_identity",
    requiresResolution: true,
    resolutionCodes: ["legacy_ledger_unclassified"],
    sourceId: id,
    sourceType: "ledger_entry",
  });
}

function inventoryRow(
  section: FinanceInventoryPageRow["section"],
  stableKey: string,
  payload: Record<string, unknown>,
): FinanceInventoryPageRow {
  return {
    contract_version: "finance_inventory_v2",
    payload,
    section,
    stable_key: stableKey,
  };
}

function planLedgerRow(
  id: string,
  direction: "expense" | "income",
  archived: boolean,
) {
  return inventoryRow("sources", `ledger_entry:${id}`, {
    amount: direction === "income" ? "100.00" : "30.00",
    archived,
    direction,
    sourceId: id,
    sourceType: "ledger_entry",
    unitId: id === "ledger-property-income" ? null : "unit-1",
  });
}

function propertyCashRecords(
  result: Awaited<ReturnType<typeof buildPropertyCashShadowParity>>,
) {
  return result.records
    .filter((record) => record.surface === "property_cash")
    .toSorted((first, second) => first.metric.localeCompare(second.metric));
}

function reportMetrics(
  result: Awaited<ReturnType<typeof buildPropertyCashShadowParity>>,
  surface: string,
) {
  return Object.fromEntries(
    result.records
      .filter((record) => record.surface === surface)
      .map((record) => [record.metric, record]),
  );
}

function identityToken(identity: PropertyCashParityIdentity): string {
  if (identity.kind === "canonical_event") {
    return `canonical:${identity.eventKey}`;
  }
  if (identity.kind === "current_cash_source") {
    return `cash:${identity.sourceType}:${identity.id}`;
  }
  if (identity.kind === "obligation") {
    return `${identity.obligationType}:${identity.id}`;
  }
  if (identity.kind === "owner_link") {
    return `owner:${identity.id}:${identity.ownerPersonId}`;
  }
  if (identity.kind === "ledger_source") {
    return `ledger:${identity.id}`;
  }
  if (identity.kind === "journal_control") {
    return `journal:${identity.journalEntryId}:${identity.journalLineId}`;
  }
  return `plan:${identity.stableKey}`;
}

function currentReportTokens(record: {
  included: PropertyCashParityIdentity[];
}) {
  return record.included
    .filter(
      (identity) =>
        identity.kind === "ledger_source" ||
        identity.kind === "plan01_source",
    )
    .map(identityToken);
}

function partitionKeys(
  first: PropertyCashParityIdentity[],
  second: PropertyCashParityIdentity[],
) {
  const firstKeys = new Set(first.map(identityToken));
  return second.map(identityToken).filter((key) => firstKeys.has(key));
}

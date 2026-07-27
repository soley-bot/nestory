import type { PropertyCashEvent } from "@/features/finance/data/property-cash-events.types";
import { summarizePropertyCashMovements } from "@/features/finance/data/property-cash-events.totals";
import {
  buildPropertyCash,
  type PropertyCashPropertyFacts,
  type PropertyCashTotals,
} from "@/features/finance/property-cash";
import {
  buildParitySummary,
  buildReadPathParity,
  buildUnitContextCoverage,
  parseMoneyToMinor,
  type FinanceInventoryPageRow,
} from "@/features/finance/inventory/finance-inventory";
import {
  buildOwnerStatement,
  type OwnerStatementEvidenceLine,
  type OwnerStatementReadyRow,
} from "@/features/reports/data/owner-statement";
import { buildTrustedReport } from "@/features/reports/data/trusted-report";
import { toOwnerStatementInput } from "@/features/reports/data/owner-statement-input";
import { buildPropertySummary } from "@/features/properties/data/property-summary";

export type PropertyCashParityBasis =
  | "period_flow"
  | "period_obligation"
  | "closing_balance"
  | "control";

export type PropertyCashParityStatus =
  | "match"
  | "mismatch"
  | "unresolved"
  | "not_comparable";

export type PropertyCashParityIdentity =
  | {
      eventKey: string;
      kind: "canonical_event";
      sourceId: string;
      sourceType: PropertyCashEvent["sourceType"];
    }
  | {
      kind: "plan01_source";
      stableKey: string;
    }
  | {
      issueCode: string;
      kind: "plan01_diagnostic";
      stableKey: string;
    }
  | {
      id: string;
      kind: "obligation";
      obligationType: "expense" | "income";
    }
  | {
      id: string;
      kind: "owner_link";
      ownerPersonId: string;
    }
  | {
      id: string;
      kind: "ledger_source";
    }
  | {
      journalEntryId: string;
      journalLineId: string;
      kind: "journal_control";
    }
  | {
      id: string;
      kind: "current_cash_source";
      sourceType:
        | "deposit_event"
        | "payment_allocation"
        | "receipt_allocation";
    };

export type PropertyCashParityRecord = {
  basis: PropertyCashParityBasis;
  canonicalCents: bigint | null;
  currency: "USD";
  currentCents: bigint | null;
  deltaCents: bigint | null;
  excluded: PropertyCashParityIdentity[];
  explanation: string;
  included: PropertyCashParityIdentity[];
  metric: string;
  organizationId: string;
  periodEnd: string;
  periodStart: string;
  propertyId: string;
  status: PropertyCashParityStatus;
  surface: string;
  unresolved: PropertyCashParityIdentity[];
};

export type PropertyCashShadowParityInput = {
  canonicalEvents: PropertyCashEvent[];
  financeInventoryDiagnosticRows: FinanceInventoryPageRow[];
  financeInventorySourceRows: FinanceInventoryPageRow[];
  identityLimit?: number;
  ownerStatementRows: Parameters<typeof toOwnerStatementInput>[0];
  propertySummaryInput: Parameters<typeof buildPropertySummary>[0];
  scope: {
    currency: "USD";
    organizationId: string;
    periodEnd: string;
    periodStart: string;
    propertyId: string;
  };
  trustedReportInput: Parameters<typeof buildTrustedReport>[0];
};

export type PropertyCashShadowParityResult = {
  records: PropertyCashParityRecord[];
};

export async function buildPropertyCashShadowParity(
  input: PropertyCashShadowParityInput,
): Promise<PropertyCashShadowParityResult> {
  const identityLimit = validateIdentityLimit(input.identityLimit);
  assertInputBounds(input, identityLimit);
  const ownerStatementInput = toOwnerStatementInput(input.ownerStatementRows);
  const propertyCash = buildPropertyCash(ownerStatementInput.cashInput);
  const propertyFacts =
    propertyCash.properties.find(
      (candidate) => candidate.propertyId === input.scope.propertyId,
    ) ?? emptyPropertyCashFacts(input.scope.propertyId);
  const canonical = await summarizePropertyCashMovements(
    toAsyncIterable(input.canonicalEvents),
    { diagnosticSourceLimit: identityLimit },
  );
  const ownerStatement = buildOwnerStatement(ownerStatementInput);
  const propertyRecords = buildPropertyCashRecords({
    canonical,
    events: input.canonicalEvents,
    facts: propertyFacts,
    identityLimit,
    input,
  });

  return {
    records: [
      ...propertyRecords,
      ...buildOwnerStatementRecords({
        facts: propertyFacts,
        identityLimit,
        input,
        ownerStatement,
        ownerStatementInput,
        propertyRecords,
      }),
      ...(await buildTrustedReportRecords({
        events: input.canonicalEvents,
        identityLimit,
        input,
      })),
      ...buildPlan01Records({ identityLimit, input }),
      ...buildPropertySummaryRecords({ identityLimit, input }),
    ],
  };
}

type CanonicalTotals = Awaited<
  ReturnType<typeof summarizePropertyCashMovements>
>;

type PropertyCashMetric = keyof PropertyCashTotals;

type CanonicalMetric =
  | "management_fee"
  | "operating_income"
  | "owner_cash"
  | "owner_contribution"
  | "owner_distribution"
  | "operating_expense";

function buildPropertyCashRecords({
  canonical,
  events,
  facts,
  identityLimit,
  input,
}: {
  canonical: CanonicalTotals;
  events: PropertyCashEvent[];
  facts: PropertyCashPropertyFacts;
  identityLimit: number;
  input: PropertyCashShadowParityInput;
}) {
  const nonComparable: Array<{
    basis: PropertyCashParityBasis;
    metric: PropertyCashMetric;
  }> = [
    { basis: "period_obligation", metric: "arrearsCents" },
    { basis: "period_obligation", metric: "managementFeesEarnedCents" },
    {
      basis: "period_obligation",
      metric: "managementFeesOutstandingCents",
    },
    { basis: "period_obligation", metric: "rentDueCents" },
    { basis: "period_obligation", metric: "rentReceivedCents" },
    { basis: "closing_balance", metric: "securityDepositHeldCents" },
  ];
  const comparable: Array<{
    canonicalCents: bigint;
    canonicalMetric: CanonicalMetric;
    metric: PropertyCashMetric;
  }> = [
    {
      canonicalCents: canonical.managementFeeEffectCents,
      canonicalMetric: "management_fee",
      metric: "managementFeesReceivedCents",
    },
    {
      canonicalCents: canonical.ownerCashMovementCents,
      canonicalMetric: "owner_cash",
      metric: "netOwnerCashMovementCents",
    },
    {
      canonicalCents: canonical.operatingIncomeCents,
      canonicalMetric: "operating_income",
      metric: "operatingCashReceivedCents",
    },
    {
      canonicalCents: canonical.ownerContributionCents,
      canonicalMetric: "owner_contribution",
      metric: "ownerContributionCents",
    },
    {
      canonicalCents: -canonical.ownerDistributionCents,
      canonicalMetric: "owner_distribution",
      metric: "ownerPayoutCents",
    },
    {
      canonicalCents: -canonical.operatingExpenseCents,
      canonicalMetric: "operating_expense",
      metric: "propertyExpensesPaidCents",
    },
  ];

  return [
    ...nonComparable.map(({ basis, metric }) =>
      boundedRecord(
        {
          ...scopeFields(input),
          basis,
          canonicalCents: null,
          currentCents: BigInt(facts[metric]),
          deltaCents: null,
          excluded: events.map(canonicalIdentity),
          explanation:
            metric === "securityDepositHeldCents"
              ? "Current cash reports a period-end held balance while the canonical contract exposes selected-period deposit movement; this shadow record does not declare either source authoritative."
              : "Current cash reports an obligation or obligation-state value while the canonical contract exposes settlement flows; this shadow record is intentionally not comparable.",
          included: propertyCashIdentities(facts, metric),
          metric,
          status: "not_comparable",
          surface: "property_cash",
          unresolved: [],
        },
        identityLimit,
      ),
    ),
    ...comparable.map(({ canonicalCents, canonicalMetric, metric }) => {
      const identities = canonicalIdentitiesForMetric(events, canonicalMetric);
      const currentCents = BigInt(facts[metric]);
      const hasUnresolved = identities.unresolved.length > 0;
      const comparableCanonicalCents = hasUnresolved ? null : canonicalCents;
      const deltaCents =
        comparableCanonicalCents === null
          ? null
          : currentCents - comparableCanonicalCents;

      return boundedRecord(
        {
          ...scopeFields(input),
          basis: "period_flow",
          canonicalCents: comparableCanonicalCents,
          currentCents,
          deltaCents,
          excluded: identities.excluded,
          explanation:
            "Shadow comparison of the existing property-cash builder and the versioned canonical event contract; neither side is promoted as authority by this record.",
          included: [
            ...identities.included,
            ...currentPropertyCashIdentities(facts, metric),
          ],
          metric,
          status: hasUnresolved
            ? "unresolved"
            : deltaCents === BigInt(0)
              ? "match"
              : "mismatch",
          surface: "property_cash",
          unresolved: identities.unresolved,
        },
        identityLimit,
      );
    }),
  ];
}

const ownerStatementMoneyMetrics = [
  "managementFeesEarnedCents",
  "managementFeesOutstandingCents",
  "managementFeesReceivedCents",
  "netOwnerCashMovementCents",
  "operatingCashReceivedCents",
  "ownerContributionCents",
  "ownerPayoutCents",
  "propertyExpensesPaidCents",
  "securityDepositHeldCents",
] as const;

type OwnerStatementMoneyMetric = (typeof ownerStatementMoneyMetrics)[number];

function buildOwnerStatementRecords({
  facts,
  identityLimit,
  input,
  ownerStatement,
  ownerStatementInput,
  propertyRecords,
}: {
  facts: PropertyCashPropertyFacts;
  identityLimit: number;
  input: PropertyCashShadowParityInput;
  ownerStatement: ReturnType<typeof buildOwnerStatement>;
  ownerStatementInput: ReturnType<typeof toOwnerStatementInput>;
  propertyRecords: PropertyCashParityRecord[];
}) {
  const records: PropertyCashParityRecord[] = propertyRecords
    .filter((record) =>
      ownerStatementMoneyMetrics.includes(
        record.metric as OwnerStatementMoneyMetric,
      ),
    )
    .map((record) => ({
      ...record,
      explanation:
        "Property-level Owner Statement cash is built from its current cashInput before any owner allocation; this shadow comparison does not establish authority.",
      surface: "owner_statement_property_cash",
    }));
  const rows = ownerStatement.rows.filter(
    (row) => row.propertyId === input.scope.propertyId,
  );
  const ownerLinks = ownerStatementInput.ownerLinks.filter(
    (link) => link.propertyId === input.scope.propertyId,
  );

  for (const row of rows) {
    const evidence = evidenceIdentities(row.evidence);
    const linkIdentities = ownerLinks
      .filter((link) =>
        row.status === "ready"
          ? row.ownerLinkIds.includes(link.id)
          : evidence.some(
              (identity) =>
                identity.kind === "owner_link" && identity.id === link.id,
            ),
      )
      .map(ownerLinkIdentity);

    records.push(
      boundedRecord(
        {
          ...scopeFields(input),
          basis: "control",
          canonicalCents: null,
          currentCents: null,
          deltaCents: null,
          excluded: [],
          explanation:
            row.status === "blocked"
              ? `Current Owner Statement allocation is blocked: ${row.reasons.join("; ")}. The blockers and evidence are retained without substituting zero.`
              : "Current Owner Statement allocation readiness passed its effective-roster checks; this is an internal readiness control, not canonical cash authority.",
          included: row.status === "ready" ? [...linkIdentities, ...evidence] : [],
          metric: "readiness",
          status: row.status === "ready" ? "match" : "unresolved",
          surface: "owner_statement_readiness",
          unresolved:
            row.status === "blocked"
              ? uniqueIdentities([...linkIdentities, ...evidence])
              : [],
        },
        identityLimit,
      ),
    );

    if (row.status === "ready") {
      for (const metric of ownerStatementMoneyMetrics) {
        records.push(
          boundedRecord(
            {
              ...scopeFields(input),
              basis: ownerStatementMetricBasis(metric),
              canonicalCents: null,
              currentCents: BigInt(row[metric]),
              deltaCents: null,
              excluded: [],
              explanation:
                "Current owner allocation uses the effective ownership roster; direct owner IDs on canonical events are not treated as that roster and no authoritative canonical owner allocation is inferred.",
              included: linkIdentities,
              metric,
              status: "not_comparable",
              surface: "owner_statement_allocation",
              unresolved: [],
            },
            identityLimit,
          ),
        );
      }
    }
  }

  const readyRows = rows.filter(
    (row): row is OwnerStatementReadyRow => row.status === "ready",
  );
  const blocked = rows.some((row) => row.status === "blocked");
  const blockedEvidence = uniqueIdentities(
    rows.flatMap((row) =>
      row.status === "blocked" ? evidenceIdentities(row.evidence) : [],
    ),
  );
  for (const metric of ownerStatementMoneyMetrics) {
    if (blocked) {
      records.push(
        boundedRecord(
          {
            ...scopeFields(input),
            basis: "control",
            canonicalCents: null,
            currentCents: null,
            deltaCents: null,
            excluded: [],
            explanation:
              "Current owner allocation integrity cannot be evaluated while the property is blocked; omitted summary amounts are not converted to zero.",
            included: [],
            metric,
            status: "unresolved",
            surface: "owner_statement_allocation_integrity",
            unresolved: blockedEvidence,
          },
          identityLimit,
        ),
      );
      continue;
    }

    const allocatedCents = readyRows.reduce(
      (total, row) => total + BigInt(row[metric]),
      BigInt(0),
    );
    const propertyCents = BigInt(facts[metric]);
    const deltaCents = allocatedCents - propertyCents;
    records.push(
      boundedRecord(
        {
          ...scopeFields(input),
          basis: "control",
          canonicalCents: propertyCents,
          currentCents: allocatedCents,
          deltaCents,
          excluded: [],
          explanation:
            "Internal current-path control comparing the sum of ready owner allocations with property-level current cash; the canonical event contract is not the comparison target.",
          included: uniqueIdentities(
            readyRows.flatMap((row) =>
              row.ownerLinkIds.map((id) => ({
                id,
                kind: "owner_link" as const,
                ownerPersonId: row.ownerPersonId,
              })),
            ),
          ),
          metric,
          status: deltaCents === BigInt(0) ? "match" : "mismatch",
          surface: "owner_statement_allocation_integrity",
          unresolved: [],
        },
        identityLimit,
      ),
    );
  }

  return records;
}

function ownerStatementMetricBasis(
  metric: OwnerStatementMoneyMetric,
): PropertyCashParityBasis {
  if (
    metric === "managementFeesEarnedCents" ||
    metric === "managementFeesOutstandingCents"
  ) {
    return "period_obligation";
  }
  return metric === "securityDepositHeldCents"
    ? "closing_balance"
    : "period_flow";
}

function ownerLinkIdentity(
  link: ReturnType<typeof toOwnerStatementInput>["ownerLinks"][number],
): PropertyCashParityIdentity {
  return {
    id: link.id,
    kind: "owner_link",
    ownerPersonId: link.personId,
  };
}

function evidenceIdentities(lines: OwnerStatementEvidenceLine[]) {
  const identities: PropertyCashParityIdentity[] = [];
  for (const line of lines) {
    if (line.ownerLinkId && line.ownerPersonId) {
      identities.push({
        id: line.ownerLinkId,
        kind: "owner_link",
        ownerPersonId: line.ownerPersonId,
      });
    }
    if (line.incomeItemId) {
      identities.push({
        id: line.incomeItemId,
        kind: "obligation",
        obligationType: "income",
      });
    }
    if (line.expenseItemId) {
      identities.push({
        id: line.expenseItemId,
        kind: "obligation",
        obligationType: "expense",
      });
    }
    if (line.allocationId) {
      identities.push({
        id: line.allocationId,
        kind: "current_cash_source",
        sourceType: line.paymentId
          ? "payment_allocation"
          : "receipt_allocation",
      });
    }
    if (line.depositEventId) {
      identities.push({
        id: line.depositEventId,
        kind: "current_cash_source",
        sourceType: "deposit_event",
      });
    }
  }
  return uniqueIdentities(identities);
}

async function buildTrustedReportRecords({
  events,
  identityLimit,
  input,
}: {
  events: PropertyCashEvent[];
  identityLimit: number;
  input: PropertyCashShadowParityInput;
}) {
  const propertyReport = buildTrustedReport(
    trustedReportInputFor(input.trustedReportInput, "property-performance"),
  );
  const unitReport = buildTrustedReport(
    trustedReportInputFor(input.trustedReportInput, "unit-performance"),
  );
  const incomeExpenseReport = buildTrustedReport(
    trustedReportInputFor(input.trustedReportInput, "income-expense"),
  );
  const canonical = await summarizePropertyCashMovements(
    toAsyncIterable(events),
    { diagnosticSourceLimit: identityLimit },
  );
  const visibleUnitIds = new Set(unitReport.rows.map((row) => row.id));
  const unitEvents = events.filter(
    (event) => event.unitId !== null && visibleUnitIds.has(event.unitId),
  );
  const unitCanonical = await summarizePropertyCashMovements(
    toAsyncIterable(unitEvents),
    { diagnosticSourceLimit: identityLimit },
  );
  const plan01LedgerIdentities = input.financeInventorySourceRows
    .filter((row) => row.payload.sourceType === "ledger_entry")
    .map(plan01SourceIdentity);
  const records: PropertyCashParityRecord[] = [];

  records.push(
    ...reportSummaryRecords({
      canonical,
      canonicalEvents: events,
      current: reportSummaryMoney(propertyReport),
      identityLimit,
      input,
      reportIdentities: uniqueIdentities([
        ...ledgerIdentitiesFromReport(propertyReport),
        ...plan01LedgerIdentities,
      ]),
      surface: "property_performance",
    }),
  );
  records.push(
    ...reportSummaryRecords({
      canonical,
      canonicalEvents: events,
      current: reportSummaryMoney(unitReport),
      identityLimit,
      input,
      reportIdentities: uniqueIdentities([
        ...ledgerIdentitiesFromReport(unitReport),
        ...plan01LedgerIdentities,
      ]),
      surface: "unit_performance_summary",
    }),
  );
  records.push(
    ...reportSummaryRecords({
      canonical: unitCanonical,
      canonicalEvents: unitEvents,
      current: visibleUnitRowMoney(unitReport),
      identityLimit,
      input,
      reportIdentities: ledgerIdentitiesFromReport(unitReport),
      surface: "unit_performance_visible_rows",
    }),
  );
  records.push(
    ...reportSummaryRecords({
      canonical,
      canonicalEvents: events,
      current: reportSummaryMoney(incomeExpenseReport),
      identityLimit,
      input,
      reportIdentities: uniqueIdentities([
        ...ledgerIdentitiesFromReport(incomeExpenseReport),
        ...plan01LedgerIdentities,
      ]),
      surface: "income_expense",
    }),
  );

  return records;
}

type ReportMoney = {
  expenses: bigint;
  income: bigint;
  noi: bigint;
};

function reportSummaryRecords({
  canonical,
  canonicalEvents,
  current,
  identityLimit,
  input,
  reportIdentities,
  surface,
}: {
  canonical: CanonicalTotals;
  canonicalEvents: PropertyCashEvent[];
  current: ReportMoney;
  identityLimit: number;
  input: PropertyCashShadowParityInput;
  reportIdentities: PropertyCashParityIdentity[];
  surface: string;
}) {
  return (["income", "expenses", "noi"] as const).map((metric) => {
    const canonicalMetrics: CanonicalMetric[] =
      metric === "income"
        ? ["operating_income"]
        : metric === "expenses"
          ? ["operating_expense"]
          : ["operating_income", "operating_expense"];
    const identities = canonicalIdentitiesForMetrics(
      canonicalEvents,
      canonicalMetrics,
    );
    const unresolved = identities.unresolved;
    const canonicalCents =
      unresolved.length > 0
        ? null
        : metric === "income"
          ? canonical.operatingIncomeCents
          : metric === "expenses"
            ? -canonical.operatingExpenseCents
            : canonical.operatingIncomeCents +
              canonical.operatingExpenseCents;
    const currentCents = current[metric];
    const deltaCents =
      canonicalCents === null ? null : currentCents - canonicalCents;

    return boundedRecord(
      {
        ...scopeFields(input),
        basis: "period_flow",
        canonicalCents,
        currentCents,
        deltaCents,
        excluded: identities.excluded,
        explanation:
          "The current amount is parsed exactly from the returned TrustedReport value and retains returned Ledger source links plus Plan 01 stable keys; the comparison remains shadow-only.",
        included: uniqueIdentities([
          ...reportIdentities,
          ...identities.included,
        ]),
        metric,
        status:
          canonicalCents === null
            ? "unresolved"
            : deltaCents === BigInt(0)
              ? "match"
              : "mismatch",
        surface,
        unresolved,
      },
      identityLimit,
    );
  });
}

function trustedReportInputFor(
  input: Parameters<typeof buildTrustedReport>[0],
  report:
    | "income-expense"
    | "property-performance"
    | "unit-performance",
): Parameters<typeof buildTrustedReport>[0] {
  return {
    ...input,
    viewQuery: {
      ...input.viewQuery,
      report,
    },
  };
}

function reportSummaryMoney(
  report: ReturnType<typeof buildTrustedReport>,
): ReportMoney {
  const income = exactReportMetric(report, "Income");
  const expenses = exactReportMetric(report, "Expenses");
  const noi = exactReportMetric(report, "NOI");
  return { expenses, income, noi };
}

function visibleUnitRowMoney(
  report: ReturnType<typeof buildTrustedReport>,
): ReportMoney {
  let income = BigInt(0);
  let expenses = BigInt(0);
  let noi = BigInt(0);
  for (const row of report.rows) {
    income += parseUsdDisplay(requiredCell(row.cells, "income"));
    expenses += parseUsdDisplay(requiredCell(row.cells, "expenses"));
    noi += parseUsdDisplay(requiredCell(row.cells, "noi"));
  }
  return { expenses, income, noi };
}

function exactReportMetric(
  report: ReturnType<typeof buildTrustedReport>,
  label: string,
) {
  const metric = report.summary.find((candidate) => candidate.label === label);
  if (!metric) {
    throw new Error(`${report.title} is missing its ${label} metric.`);
  }
  return parseUsdDisplay(metric.value);
}

function requiredCell(cells: Record<string, string>, key: string) {
  const value = cells[key];
  if (value === undefined) {
    throw new Error(`Trusted report row is missing its ${key} cell.`);
  }
  return value;
}

function parseUsdDisplay(value: string) {
  const match = /^(-)?USD (0|[1-9]\d{0,2}(?:,\d{3})*)(?:\.(\d{2}))$/.exec(
    value,
  );
  if (!match) {
    throw new Error(`Expected exact returned USD display value: ${value}`);
  }
  const [, sign, whole, fraction] = match;
  return parseMoneyToMinor(
    `${sign ?? ""}${whole!.replaceAll(",", "")}.${fraction}`,
  );
}

function ledgerIdentitiesFromReport(
  report: ReturnType<typeof buildTrustedReport>,
) {
  return uniqueIdentities(
    report.rows.flatMap((row) =>
      row.sourceLinks.flatMap((source) =>
        source.recordType === "ledger"
          ? [
              {
                id: source.id,
                kind: "ledger_source" as const,
              },
            ]
          : [],
      ),
    ),
  );
}

function buildPlan01Records({
  identityLimit,
  input,
}: {
  identityLimit: number;
  input: PropertyCashShadowParityInput;
}) {
  const records: PropertyCashParityRecord[] = [];
  const parity = buildParitySummary({
    diagnosticRows: input.financeInventoryDiagnosticRows,
    scope: input.scope,
    sourceRows: input.financeInventorySourceRows,
  });
  const readPath = buildReadPathParity(input.financeInventorySourceRows);
  const unitCoverage = buildUnitContextCoverage(
    input.financeInventorySourceRows,
  );

  for (const [metric, bucket] of Object.entries(parity.proposedBuckets)) {
    const unresolved = bucket.unresolvedSources.map(plan01StableKeyIdentity);
    records.push(
      boundedRecord(
        {
          ...scopeFields(input),
          basis: "control",
          canonicalCents: null,
          currentCents: parseMoneyToMinor(bucket.amount),
          deltaCents: null,
          excluded: bucket.excludedSources.map(plan01StableKeyIdentity),
          explanation:
            "Plan 01 proposed bucket only. Its included, excluded, and unresolved stable keys are preserved exactly; this record is diagnostic and does not establish financial authority or force gross settlement evidence into a canonical economic bucket.",
          included: bucket.includedSources.map(plan01StableKeyIdentity),
          metric,
          status:
            unresolved.length > 0 ? "unresolved" : "not_comparable",
          surface: "plan01_parity",
          unresolved,
        },
        identityLimit,
      ),
    );
  }

  for (const row of input.financeInventoryDiagnosticRows) {
    const issueCode = requiredPayloadString(row, "issueCode");
    const identity: PropertyCashParityIdentity = {
      issueCode,
      kind: "plan01_diagnostic",
      stableKey: row.stable_key,
    };
    const isContradiction = issueCode === "REPORT_TOTAL_CONTRADICTION";
    const currentCents = isContradiction
      ? payloadMoney(row, "ledgerAmount")
      : null;
    const canonicalCents = isContradiction
      ? payloadMoney(row, "settlementAmount")
      : null;
    const deltaCents =
      currentCents === null || canonicalCents === null
        ? null
        : currentCents - canonicalCents;
    records.push(
      boundedRecord(
        {
          ...scopeFields(input),
          basis: "control",
          canonicalCents,
          currentCents,
          deltaCents,
          excluded: [],
          explanation: isContradiction
            ? "Plan 01 cross-report diagnostic retains its gross settlementAmount and ledgerAmount under the diagnostic stable key; it is not reclassified as canonical economics."
            : issueCode === "SOURCE_LOAD_LIMIT_EXCEEDED"
              ? `Plan 01 reports sourceRowCount ${String(row.payload.sourceRowCount)} above a current loader boundary; no monetary zero is substituted.`
              : "Plan 01 diagnostic is retained as unresolved evidence without claiming financial authority.",
          included: [],
          metric: issueCode,
          status:
            isContradiction && deltaCents !== null
              ? deltaCents === BigInt(0)
                ? "match"
                : "mismatch"
              : "unresolved",
          surface: "plan01_diagnostic",
          unresolved: [identity],
        },
        identityLimit,
      ),
    );
  }

  for (const [sourceType, coverage] of Object.entries(unitCoverage)) {
    records.push(
      boundedRecord(
        {
          ...scopeFields(input),
          basis: "control",
          canonicalCents: null,
          currentCents: null,
          deltaCents: null,
          excluded: [],
          explanation: `Plan 01 unit-context control: ${coverage.rowsWithUnitId} rows carry unit identity, ${coverage.legitimatePropertyLevelRows} are legitimate property-level rows, and ${coverage.unexpectedlyMissingUnitId} unexpectedly lack unit identity.`,
          included: [],
          metric: sourceType,
          status:
            coverage.unexpectedlyMissingUnitId > 0 ? "unresolved" : "match",
          surface: "unit_context",
          unresolved: coverage.unexpectedMissingSourceIdentities.map(
            plan01StableKeyIdentity,
          ),
        },
        identityLimit,
      ),
    );
  }

  const journalIdentities = input.financeInventorySourceRows
    .filter((row) => row.payload.sourceType === "journal_line")
    .map(journalIdentity);
  const debit = parseMoneyToMinor(
    readPath.journalAccountingControl.totals.debit,
  );
  const credit = parseMoneyToMinor(
    readPath.journalAccountingControl.totals.credit,
  );
  const balance = debit - credit;
  for (const [metric, currentCents] of [
    ["debit", debit],
    ["credit", credit],
  ] as const) {
    records.push(
      boundedRecord(
        {
          ...scopeFields(input),
          basis: "control",
          canonicalCents: null,
          currentCents,
          deltaCents: null,
          excluded: [],
          explanation:
            "Current journal debit/credit is an internal accounting control and is not comparable to canonical property cash.",
          included: journalIdentities,
          metric,
          status: "not_comparable",
          surface: "journal_control",
          unresolved: [],
        },
        identityLimit,
      ),
    );
  }
  records.push(
    boundedRecord(
      {
        ...scopeFields(input),
        basis: "control",
        canonicalCents: null,
        currentCents: balance,
        deltaCents: null,
        excluded: [],
        explanation:
          "Current journal balance is an internal debit-minus-credit control. Match means balanced internally, not parity with canonical cash.",
        included: journalIdentities,
        metric: "balance",
        status: balance === BigInt(0) ? "match" : "mismatch",
        surface: "journal_control",
        unresolved: [],
      },
      identityLimit,
    ),
  );

  return records;
}

function buildPropertySummaryRecords({
  identityLimit,
  input,
}: {
  identityLimit: number;
  input: PropertyCashShadowParityInput;
}) {
  const summary = buildPropertySummary(input.propertySummaryInput);
  const ledgerIdentities = input.financeInventorySourceRows
    .filter((row) => row.payload.sourceType === "ledger_entry")
    .map(plan01SourceIdentity);
  const values = {
    netIncome: parseUsdDisplay(summary.netIncome.primary),
    netIncomeUsd: parseMoneyToMinor(String(summary.netIncomeUsd)),
  };

  return Object.entries(values).map(([metric, currentCents]) =>
    boundedRecord(
      {
        ...scopeFields(input),
        basis: "control",
        canonicalCents: null,
        currentCents,
        deltaCents: null,
        excluded: [],
        explanation:
          "PropertySummary is an all-time active-Ledger value while canonical events are selected-period flows; the scopes are intentionally not comparable.",
        included: ledgerIdentities,
        metric,
        status: "not_comparable",
        surface: "property_summary",
        unresolved: [],
      },
      identityLimit,
    ),
  );
}

function plan01SourceIdentity(
  row: FinanceInventoryPageRow,
): PropertyCashParityIdentity {
  return plan01StableKeyIdentity(row.stable_key);
}

function plan01StableKeyIdentity(
  stableKey: string,
): PropertyCashParityIdentity {
  return { kind: "plan01_source", stableKey };
}

function journalIdentity(
  row: FinanceInventoryPageRow,
): PropertyCashParityIdentity {
  return {
    journalEntryId:
      typeof row.payload.journalEntryId === "string"
        ? row.payload.journalEntryId
        : row.stable_key,
    journalLineId:
      typeof row.payload.journalLineId === "string"
        ? row.payload.journalLineId
        : row.stable_key,
    kind: "journal_control",
  };
}

function requiredPayloadString(row: FinanceInventoryPageRow, key: string) {
  const value = row.payload[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Finance inventory ${row.stable_key} is missing ${key}.`,
    );
  }
  return value;
}

function payloadMoney(row: FinanceInventoryPageRow, key: string) {
  const value = requiredPayloadString(row, key);
  return parseMoneyToMinor(value);
}

function canonicalIdentitiesForMetric(
  events: PropertyCashEvent[],
  metric: CanonicalMetric,
) {
  const included: PropertyCashParityIdentity[] = [];
  const excluded: PropertyCashParityIdentity[] = [];
  const unresolved: PropertyCashParityIdentity[] = [];

  for (const event of events) {
    const identity = canonicalIdentity(event);
    if (!canonicalEventSupportsMetric(event, metric)) {
      excluded.push(identity);
    } else if (canonicalEffectForMetric(event, metric) === null) {
      unresolved.push(identity);
    } else {
      included.push(identity);
    }
  }

  return { excluded, included, unresolved };
}

function canonicalIdentitiesForMetrics(
  events: PropertyCashEvent[],
  metrics: CanonicalMetric[],
) {
  const included: PropertyCashParityIdentity[] = [];
  const excluded: PropertyCashParityIdentity[] = [];
  const unresolved: PropertyCashParityIdentity[] = [];

  for (const event of events) {
    const supported = metrics.filter((metric) =>
      canonicalEventSupportsMetric(event, metric),
    );
    const identity = canonicalIdentity(event);
    if (supported.length === 0) {
      excluded.push(identity);
    } else if (
      supported.some(
        (metric) => canonicalEffectForMetric(event, metric) === null,
      )
    ) {
      unresolved.push(identity);
    } else {
      included.push(identity);
    }
  }
  return {
    excluded: uniqueIdentities(excluded),
    included: uniqueIdentities(included),
    unresolved: uniqueIdentities(unresolved),
  };
}

function canonicalEventSupportsMetric(
  event: PropertyCashEvent,
  metric: CanonicalMetric,
) {
  if (metric === "owner_cash") return true;
  if (metric === "management_fee") return event.economicClass === "management_fee";
  if (metric === "operating_income") {
    return event.economicClass === "operating_income";
  }
  if (metric === "operating_expense") {
    return event.economicClass === "operating_expense";
  }
  if (metric === "owner_contribution") {
    return event.economicClass === "owner_contribution";
  }
  return event.economicClass === "owner_distribution";
}

function canonicalEffectForMetric(
  event: PropertyCashEvent,
  metric: CanonicalMetric,
) {
  if (metric === "management_fee") return event.managementFeeEffectCents;
  if (metric === "operating_income" || metric === "operating_expense") {
    return event.operatingCashEffectCents;
  }
  return event.ownerCashEffectCents;
}

function propertyCashIdentities(
  facts: PropertyCashPropertyFacts,
  metric: PropertyCashMetric,
): PropertyCashParityIdentity[] {
  const classifications =
    metric === "rentDueCents" ||
    metric === "rentReceivedCents" ||
    metric === "arrearsCents"
      ? new Set(["rent_due"])
      : metric === "managementFeesEarnedCents" ||
          metric === "managementFeesOutstandingCents"
        ? new Set(["management_fee_earned", "management_fee_received"])
        : new Set(["security_deposit"]);
  const identities = new Map<string, PropertyCashParityIdentity>();

  for (const line of facts.sourceLines) {
    if (!classifications.has(line.classification)) continue;
    if (line.incomeItemId) {
      identities.set(`income:${line.incomeItemId}`, {
        id: line.incomeItemId,
        kind: "obligation",
        obligationType: "income",
      });
    } else if (line.expenseItemId) {
      identities.set(`expense:${line.expenseItemId}`, {
        id: line.expenseItemId,
        kind: "obligation",
        obligationType: "expense",
      });
    } else if (line.depositEventId) {
      identities.set(`deposit:${line.depositEventId}`, {
        eventKey: `deposit_event:${line.depositEventId}`,
        kind: "canonical_event",
        sourceId: line.depositEventId,
        sourceType: "deposit_event",
      });
    }
  }

  return [...identities.values()];
}

function currentPropertyCashIdentities(
  facts: PropertyCashPropertyFacts,
  metric: PropertyCashMetric,
): PropertyCashParityIdentity[] {
  const classifications =
    metric === "managementFeesReceivedCents"
      ? new Set(["management_fee_received"])
      : metric === "netOwnerCashMovementCents"
        ? new Set([
            "management_fee_received",
            "operating_receipt",
            "owner_contribution",
            "owner_payout",
            "property_expense",
          ])
        : metric === "operatingCashReceivedCents"
          ? new Set(["operating_receipt"])
          : metric === "ownerContributionCents"
            ? new Set(["owner_contribution"])
            : metric === "ownerPayoutCents"
              ? new Set(["owner_payout"])
              : new Set(["property_expense"]);

  return uniqueIdentities(
    facts.sourceLines.flatMap((line) => {
      if (!classifications.has(line.classification) || !line.allocationId) {
        return [];
      }
      return [
        {
          id: line.allocationId,
          kind: "current_cash_source" as const,
          sourceType: line.paymentId
            ? ("payment_allocation" as const)
            : ("receipt_allocation" as const),
        },
      ];
    }),
  );
}

function canonicalIdentity(
  event: PropertyCashEvent,
): PropertyCashParityIdentity {
  return {
    eventKey: event.eventKey,
    kind: "canonical_event",
    sourceId: event.sourceId,
    sourceType: event.sourceType,
  };
}

function scopeFields(input: PropertyCashShadowParityInput) {
  return {
    currency: input.scope.currency,
    organizationId: input.scope.organizationId,
    periodEnd: input.scope.periodEnd,
    periodStart: input.scope.periodStart,
    propertyId: input.scope.propertyId,
  };
}

function boundedRecord(
  record: PropertyCashParityRecord,
  identityLimit: number,
): PropertyCashParityRecord {
  const normalized = {
    ...record,
    excluded: uniqueIdentities(record.excluded, identityLimit),
    included: uniqueIdentities(record.included, identityLimit),
    unresolved: uniqueIdentities(record.unresolved, identityLimit),
  };
  const count =
    normalized.included.length +
    normalized.excluded.length +
    normalized.unresolved.length;
  if (count > identityLimit) {
    throw new Error(
      `Property cash parity identity limit exceeded for ${record.surface}.${record.metric}: ${count} identities exceeds ${identityLimit}.`,
    );
  }
  return normalized;
}

function uniqueIdentities(
  identities: PropertyCashParityIdentity[],
  limit = 10_000,
) {
  const unique = new Map<string, PropertyCashParityIdentity>();
  for (const identity of identities) {
    const key = identityKey(identity);
    if (!unique.has(key) && unique.size >= limit) {
      throw new Error(
        `Property cash parity identity limit exceeded while collecting identities: more than ${limit}.`,
      );
    }
    unique.set(key, identity);
  }
  return [...unique.entries()]
    .toSorted(([first], [second]) => first.localeCompare(second))
    .map(([, identity]) => identity);
}

function identityKey(identity: PropertyCashParityIdentity) {
  if (identity.kind === "canonical_event") {
    return `${identity.kind}:${identity.eventKey}`;
  }
  if (
    identity.kind === "plan01_source" ||
    identity.kind === "plan01_diagnostic"
  ) {
    return `${identity.kind}:${identity.stableKey}`;
  }
  if (identity.kind === "obligation") {
    return `${identity.kind}:${identity.obligationType}:${identity.id}`;
  }
  if (identity.kind === "owner_link") {
    return `${identity.kind}:${identity.id}:${identity.ownerPersonId}`;
  }
  if (
    identity.kind === "ledger_source" ||
    identity.kind === "current_cash_source"
  ) {
    return `${identity.kind}:${identity.id}`;
  }
  return `${identity.kind}:${identity.journalEntryId}:${identity.journalLineId}`;
}

function validateIdentityLimit(value: number | undefined) {
  const limit = value ?? 10_000;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error(
      "Property cash parity identity limit must be between 1 and 10,000.",
    );
  }
  return limit;
}

function assertInputBounds(
  input: PropertyCashShadowParityInput,
  identityLimit: number,
) {
  const ownerRows = input.ownerStatementRows;
  const sources = [
    ["canonical events", input.canonicalEvents.length],
    [
      "finance inventory source identities",
      input.financeInventorySourceRows.length,
    ],
    [
      "finance inventory diagnostic identities",
      input.financeInventoryDiagnosticRows.length,
    ],
    ["Owner Statement owner links", ownerRows.ownerRows.length],
    [
      "Owner Statement cash identities",
      ownerRows.currentReceiptRows.length +
        ownerRows.historicalReceiptRows.length +
        ownerRows.paymentRows.length +
        ownerRows.depositRows.length +
        ownerRows.dueIncomeItems.length,
    ],
    [
      "TrustedReport Ledger identities",
      input.trustedReportInput.ledgerEntries.length,
    ],
  ] as const;
  const exceeded = sources.find(([, count]) => count > identityLimit);
  if (exceeded) {
    throw new Error(
      `Property cash parity identity limit exceeded for ${exceeded[0]}: ${exceeded[1]} identities exceeds ${identityLimit}.`,
    );
  }
}

function emptyPropertyCashFacts(
  propertyId: string,
): PropertyCashPropertyFacts {
  return {
    arrearsCents: 0,
    managementFeesEarnedCents: 0,
    managementFeesOutstandingCents: 0,
    managementFeesReceivedCents: 0,
    netOwnerCashMovementCents: 0,
    operatingCashReceivedCents: 0,
    ownerContributionCents: 0,
    ownerPayoutCents: 0,
    propertyExpensesPaidCents: 0,
    propertyId,
    rentDueCents: 0,
    rentReceivedCents: 0,
    securityDepositHeldCents: 0,
    sourceLines: [],
  };
}

async function* toAsyncIterable(events: PropertyCashEvent[]) {
  yield* events;
}

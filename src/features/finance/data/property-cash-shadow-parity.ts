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
  referenceCents: bigint | null;
  referenceDeltaCents: bigint | null;
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
  propertySummaryInput: Omit<
    Parameters<typeof buildPropertySummary>[0],
    "ledgerEntries"
  > & {
    ledgerEntries: Array<
      Parameters<
        typeof buildPropertySummary
      >[0]["ledgerEntries"][number] & {
        id: string;
      }
    >;
  };
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
  assertCanonicalEventScope(input);
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
          included: propertyCashIdentities(
            facts,
            metric,
            input,
            identityLimit,
          ),
          metric,
          status: "not_comparable",
          surface: "property_cash",
          unresolved: [],
        },
        identityLimit,
      ),
    ),
    ...comparable.map(({ canonicalCents, canonicalMetric, metric }) => {
      const identities = canonicalIdentitiesForMetric(
        events,
        canonicalMetric,
        identityLimit,
      );
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
          included: mergeIdentities(
            identityLimit,
            `${metric} canonical and current contributors`,
            identities.included,
            currentPropertyCashIdentities(
              facts,
              metric,
              input,
              identityLimit,
            ),
          ),
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
    const evidence = evidenceIdentities(row.evidence, identityLimit);
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
          included:
            row.status === "ready"
              ? mergeIdentities(
                  identityLimit,
                  "Owner Statement readiness",
                  linkIdentities,
                  evidence,
                )
              : [],
          metric: "readiness",
          status: row.status === "ready" ? "match" : "unresolved",
          surface: "owner_statement_readiness",
          unresolved:
            row.status === "blocked"
              ? mergeIdentities(
                  identityLimit,
                  "blocked Owner Statement readiness",
                  linkIdentities,
                  evidence,
                )
              : [],
        },
        identityLimit,
      ),
    );

    if (row.status === "ready") {
      for (const metric of ownerStatementMoneyMetrics) {
        const metricEvidence = evidenceIdentities(
          ownerMetricEvidence(row.evidence, metric),
          identityLimit,
        );
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
              included: mergeIdentities(
                identityLimit,
                `Owner Statement allocation ${metric}`,
                linkIdentities,
                metricEvidence,
              ),
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
    blockedOwnerEvidence(rows),
    identityLimit,
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
          canonicalCents: null,
          currentCents: allocatedCents,
          deltaCents: null,
          excluded: [],
          explanation:
            "Internal current-path control comparing the sum of ready owner allocations with property-level current cash; the canonical event contract is not the comparison target.",
          included: uniqueIdentities(
            readyOwnerLinkIdentities(readyRows),
            identityLimit,
          ),
          metric,
          referenceCents: propertyCents,
          referenceDeltaCents: deltaCents,
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

function ownerMetricEvidence(
  lines: OwnerStatementEvidenceLine[],
  metric: OwnerStatementMoneyMetric,
) {
  const facts =
    metric === "managementFeesEarnedCents"
      ? new Set(["management_fees_earned"])
      : metric === "managementFeesOutstandingCents"
        ? new Set(["management_fees_outstanding"])
        : metric === "managementFeesReceivedCents"
          ? new Set(["management_fees_received"])
          : metric === "operatingCashReceivedCents"
            ? new Set(["operating_cash_received"])
            : metric === "ownerContributionCents"
              ? new Set(["owner_contributions"])
              : metric === "ownerPayoutCents"
                ? new Set(["owner_payouts"])
                : metric === "propertyExpensesPaidCents"
                  ? new Set(["property_expenses_paid"])
                  : metric === "securityDepositHeldCents"
                    ? new Set(["security_deposits_held"])
                    : new Set([
                        "management_fees_received",
                        "operating_cash_received",
                        "owner_contributions",
                        "owner_payouts",
                        "property_expenses_paid",
                      ]);
  return lines.filter((line) => facts.has(line.statementFact));
}

function* blockedOwnerEvidence(
  rows: ReturnType<typeof buildOwnerStatement>["rows"],
): Generator<PropertyCashParityIdentity> {
  for (const row of rows) {
    if (row.status === "blocked") {
      yield* evidenceIdentityCandidates(row.evidence);
    }
  }
}

function* readyOwnerLinkIdentities(
  rows: OwnerStatementReadyRow[],
): Generator<PropertyCashParityIdentity> {
  for (const row of rows) {
    for (const id of row.ownerLinkIds) {
      yield {
        id,
        kind: "owner_link",
        ownerPersonId: row.ownerPersonId,
      };
    }
  }
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

function evidenceIdentities(
  lines: Iterable<OwnerStatementEvidenceLine>,
  identityLimit: number,
) {
  return uniqueIdentities(evidenceIdentityCandidates(lines), identityLimit);
}

function* evidenceIdentityCandidates(
  lines: Iterable<OwnerStatementEvidenceLine>,
): Generator<PropertyCashParityIdentity> {
  for (const line of lines) {
    if (line.ownerLinkId && line.ownerPersonId) {
      yield {
        id: line.ownerLinkId,
        kind: "owner_link",
        ownerPersonId: line.ownerPersonId,
      };
    }
    if (line.incomeItemId) {
      yield {
        id: line.incomeItemId,
        kind: "obligation",
        obligationType: "income",
      };
    }
    if (line.expenseItemId) {
      yield {
        id: line.expenseItemId,
        kind: "obligation",
        obligationType: "expense",
      };
    }
    if (line.allocationId) {
      yield {
        id: line.allocationId,
        kind: "current_cash_source",
        sourceType: line.paymentId
          ? "payment_allocation"
          : "receipt_allocation",
      };
    }
    if (line.depositEventId) {
      yield {
        id: line.depositEventId,
        kind: "current_cash_source",
        sourceType: "deposit_event",
      };
    }
  }
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
  const scopedLedgerEntries = input.trustedReportInput.ledgerEntries.filter(
    (entry) =>
      input.trustedReportInput.viewQuery.unitId === "all" ||
      entry.unit_id === input.trustedReportInput.viewQuery.unitId,
  );
  const summaryContributors = reportContributorSets(
    scopedLedgerEntries,
    input.financeInventorySourceRows,
    identityLimit,
  );
  const visibleContributors = reportContributorSets(
    scopedLedgerEntries.filter(
      (entry) => entry.unit_id !== null && visibleUnitIds.has(entry.unit_id),
    ),
    input.financeInventorySourceRows,
    identityLimit,
  );
  const records: PropertyCashParityRecord[] = [];

  records.push(
    ...reportSummaryRecords({
      canonical,
      canonicalEvents: events,
      current: reportSummaryMoney(propertyReport),
      identityLimit,
      input,
      reportContributors: summaryContributors,
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
      reportContributors: summaryContributors,
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
      reportContributors: visibleContributors,
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
      reportContributors: summaryContributors,
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

type ReportMetric = keyof ReportMoney;

type ReportContributorSet = {
  identities: PropertyCashParityIdentity[];
  ledgerIds: ReadonlySet<string>;
};

type ReportContributorSets = Record<ReportMetric, ReportContributorSet>;

function reportSummaryRecords({
  canonical,
  canonicalEvents,
  current,
  identityLimit,
  input,
  reportContributors,
  surface,
}: {
  canonical: CanonicalTotals;
  canonicalEvents: PropertyCashEvent[];
  current: ReportMoney;
  identityLimit: number;
  input: PropertyCashShadowParityInput;
  reportContributors: ReportContributorSets;
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
      identityLimit,
      reportContributors[metric].ledgerIds,
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
        included: mergeIdentities(
          identityLimit,
          `${surface}.${metric} contributors`,
          reportContributors[metric].identities,
          identities.included,
        ),
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

function reportContributorSets(
  ledgerEntries: Parameters<typeof buildTrustedReport>[0]["ledgerEntries"],
  plan01Rows: FinanceInventoryPageRow[],
  identityLimit: number,
): ReportContributorSets {
  const income = ledgerEntries.filter((entry) => entry.direction !== "expense");
  const expenses = ledgerEntries.filter(
    (entry) => entry.direction === "expense",
  );
  return {
    expenses: reportContributorSet(
      expenses,
      plan01Rows,
      "expense",
      identityLimit,
    ),
    income: reportContributorSet(
      income,
      plan01Rows,
      "income",
      identityLimit,
    ),
    noi: reportContributorSet(
      ledgerEntries,
      plan01Rows,
      "both",
      identityLimit,
    ),
  };
}

function reportContributorSet(
  ledgerEntries: Parameters<typeof buildTrustedReport>[0]["ledgerEntries"],
  plan01Rows: FinanceInventoryPageRow[],
  direction: "both" | "expense" | "income",
  identityLimit: number,
): ReportContributorSet {
  const ledgerIds = new Set(ledgerEntries.map((entry) => entry.id));
  const ledgerDirections = new Map(
    ledgerEntries.map((entry) => [
      entry.id,
      entry.direction === "expense" ? "expense" : "income",
    ] as const),
  );
  return {
    identities: mergeIdentities(
      identityLimit,
      `TrustedReport ${direction} contributors`,
      ledgerEntries.map(
        (entry): PropertyCashParityIdentity => ({
          id: entry.id,
          kind: "ledger_source",
        }),
      ),
      matchingPlan01LedgerIdentities(
        plan01Rows,
        ledgerDirections,
      ),
    ),
    ledgerIds,
  };
}

function* matchingPlan01LedgerIdentities(
  rows: FinanceInventoryPageRow[],
  ledgerDirections: ReadonlyMap<string, "expense" | "income">,
): Generator<PropertyCashParityIdentity> {
  for (const row of rows) {
    if (
      row.payload.sourceType !== "ledger_entry" ||
      row.payload.archived === true
    ) {
      continue;
    }
    const sourceId =
      typeof row.payload.sourceId === "string"
        ? row.payload.sourceId
        : row.stable_key.startsWith("ledger_entry:")
          ? row.stable_key.slice("ledger_entry:".length)
          : null;
    const rowDirection =
      row.payload.direction === "expense" ? "expense" : "income";
    if (
      sourceId !== null &&
      ledgerDirections.get(sourceId) === rowDirection
    ) {
      yield plan01SourceIdentity(row);
    }
  }
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
    const referenceCents = isContradiction
      ? payloadMoney(row, "settlementAmount")
      : null;
    const referenceDeltaCents =
      currentCents === null || referenceCents === null
        ? null
        : currentCents - referenceCents;
    records.push(
      boundedRecord(
        {
          ...scopeFields(input),
          basis: "control",
          canonicalCents: null,
          currentCents,
          deltaCents: null,
          excluded: [],
          explanation: isContradiction
            ? "Plan 01 cross-report diagnostic retains its gross settlementAmount and ledgerAmount under the diagnostic stable key; it is not reclassified as canonical economics."
            : issueCode === "SOURCE_LOAD_LIMIT_EXCEEDED"
              ? `Plan 01 reports sourceRowCount ${String(row.payload.sourceRowCount)} above a current loader boundary; no monetary zero is substituted.`
              : "Plan 01 diagnostic is retained as unresolved evidence without claiming financial authority.",
          included: [],
          metric: issueCode,
          referenceCents,
          referenceDeltaCents,
          status:
            isContradiction && referenceDeltaCents !== null
              ? referenceDeltaCents === BigInt(0)
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

  const journalRows = input.financeInventorySourceRows.filter(
    (row) => row.payload.sourceType === "journal_line",
  );
  const journalIdentities = uniqueIdentities(
    exactJournalIdentities(journalRows),
    identityLimit,
  );
  const unresolvedJournalIdentities = uniqueIdentities(
    missingJournalIdentities(journalRows),
    identityLimit,
  );
  const journalUnresolved = unresolvedJournalIdentities.length > 0;
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
          status: journalUnresolved ? "unresolved" : "not_comparable",
          surface: "journal_control",
          unresolved: unresolvedJournalIdentities,
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
        referenceCents: BigInt(0),
        referenceDeltaCents: balance,
        status: journalUnresolved
          ? "unresolved"
          : balance === BigInt(0)
            ? "match"
            : "mismatch",
        surface: "journal_control",
        unresolved: unresolvedJournalIdentities,
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
  const ledgerIdentities = uniqueIdentities(
    propertySummaryLedgerIdentities(input.propertySummaryInput.ledgerEntries),
    identityLimit,
  );
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

function* propertySummaryLedgerIdentities(
  rows: PropertyCashShadowParityInput["propertySummaryInput"]["ledgerEntries"],
): Generator<PropertyCashParityIdentity> {
  for (const row of rows) {
    yield { id: row.id, kind: "ledger_source" };
  }
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

function* exactJournalIdentities(
  rows: FinanceInventoryPageRow[],
): Generator<PropertyCashParityIdentity> {
  for (const row of rows) {
    if (
      typeof row.payload.journalEntryId === "string" &&
      row.payload.journalEntryId.trim() !== "" &&
      typeof row.payload.journalLineId === "string" &&
      row.payload.journalLineId.trim() !== ""
    ) {
      yield {
        journalEntryId: row.payload.journalEntryId,
        journalLineId: row.payload.journalLineId,
        kind: "journal_control",
      };
    }
  }
}

function* missingJournalIdentities(
  rows: FinanceInventoryPageRow[],
): Generator<PropertyCashParityIdentity> {
  for (const row of rows) {
    if (
      typeof row.payload.journalEntryId !== "string" ||
      row.payload.journalEntryId.trim() === "" ||
      typeof row.payload.journalLineId !== "string" ||
      row.payload.journalLineId.trim() === ""
    ) {
      yield plan01SourceIdentity(row);
    }
  }
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
  identityLimit: number,
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

  return collectIdentityPartitions(
    { excluded: [excluded], included: [included], unresolved: [unresolved] },
    identityLimit,
    `canonical metric ${metric}`,
  );
}

function canonicalIdentitiesForMetrics(
  events: PropertyCashEvent[],
  metrics: CanonicalMetric[],
  identityLimit: number,
  relevantLedgerIds: ReadonlySet<string> = new Set(),
) {
  const included: PropertyCashParityIdentity[] = [];
  const excluded: PropertyCashParityIdentity[] = [];
  const unresolved: PropertyCashParityIdentity[] = [];

  for (const event of events) {
    const supported = metrics.filter((metric) =>
      canonicalEventSupportsMetric(event, metric),
    );
    const identity = canonicalIdentity(event);
    const matchesCurrentLedger =
      (event.sourceType === "ledger_entry" &&
        relevantLedgerIds.has(event.sourceId)) ||
      (event.ledgerEntryId !== null &&
        relevantLedgerIds.has(event.ledgerEntryId));
    if (
      matchesCurrentLedger &&
      event.economicClass === "legacy_unclassified" &&
      event.operatingCashEffectCents === null
    ) {
      unresolved.push(identity);
    } else if (supported.length === 0) {
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
  return collectIdentityPartitions(
    { excluded: [excluded], included: [included], unresolved: [unresolved] },
    identityLimit,
    `canonical metrics ${metrics.join(",")}`,
  );
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
  input: PropertyCashShadowParityInput,
  identityLimit: number,
): PropertyCashParityIdentity[] {
  const rentIds = incomeItemIdsForClassification(facts, "rent_due");
  const feeIds = incomeItemIdsForClassification(
    facts,
    "management_fee_earned",
  );
  const lines = facts.sourceLines.filter((line) => {
    if (metric === "rentDueCents") return line.classification === "rent_due";
    if (metric === "rentReceivedCents" || metric === "arrearsCents") {
      return (
        line.classification === "rent_due" ||
        (line.classification === "operating_receipt" &&
          line.incomeItemId !== null &&
          rentIds.has(line.incomeItemId))
      );
    }
    if (metric === "managementFeesEarnedCents") {
      return line.classification === "management_fee_earned";
    }
    if (metric === "managementFeesOutstandingCents") {
      return (
        line.classification === "management_fee_earned" ||
        (line.classification === "management_fee_received" &&
          line.incomeItemId !== null &&
          feeIds.has(line.incomeItemId))
      );
    }
    return line.classification === "security_deposit";
  });
  return uniqueIdentities(
    sourceLineIdentities(lines, {
      includeObligation: true,
      input,
      requireFlowScope: false,
    }),
    identityLimit,
  );
}

function incomeItemIdsForClassification(
  facts: PropertyCashPropertyFacts,
  classification: PropertyCashPropertyFacts["sourceLines"][number]["classification"],
) {
  const ids = new Set<string>();
  for (const line of facts.sourceLines) {
    if (line.classification === classification && line.incomeItemId) {
      ids.add(line.incomeItemId);
    }
  }
  return ids;
}

function currentPropertyCashIdentities(
  facts: PropertyCashPropertyFacts,
  metric: PropertyCashMetric,
  input: PropertyCashShadowParityInput,
  identityLimit: number,
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
    sourceLineIdentities(
      facts.sourceLines.filter((line) =>
        classifications.has(line.classification),
      ),
      { includeObligation: false, input, requireFlowScope: true },
    ),
    identityLimit,
  );
}

function* sourceLineIdentities(
  lines: Iterable<PropertyCashPropertyFacts["sourceLines"][number]>,
  {
    includeObligation,
    input,
    requireFlowScope,
  }: {
    includeObligation: boolean;
    input: PropertyCashShadowParityInput;
    requireFlowScope: boolean;
  },
): Generator<PropertyCashParityIdentity> {
  for (const line of lines) {
    if (
      requireFlowScope &&
      (line.eventDate < input.scope.periodStart ||
        line.eventDate > input.scope.periodEnd)
    ) {
      continue;
    }
    if (includeObligation && line.incomeItemId) {
      yield {
        id: line.incomeItemId,
        kind: "obligation",
        obligationType: "income",
      };
    }
    if (includeObligation && line.expenseItemId) {
      yield {
        id: line.expenseItemId,
        kind: "obligation",
        obligationType: "expense",
      };
    }
    if (line.allocationId) {
      yield {
        id: line.allocationId,
        kind: "current_cash_source",
        sourceType: line.paymentId
          ? "payment_allocation"
          : "receipt_allocation",
      };
    }
    if (line.depositEventId) {
      yield {
        id: line.depositEventId,
        kind: "current_cash_source",
        sourceType: "deposit_event",
      };
    }
  }
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

type PropertyCashParityRecordDraft = Omit<
  PropertyCashParityRecord,
  "referenceCents" | "referenceDeltaCents"
> &
  Partial<
    Pick<PropertyCashParityRecord, "referenceCents" | "referenceDeltaCents">
  >;

function boundedRecord(
  record: PropertyCashParityRecordDraft,
  identityLimit: number,
): PropertyCashParityRecord {
  const partitions = collectIdentityPartitions(
    {
      excluded: [record.excluded],
      included: [record.included],
      unresolved: [record.unresolved],
    },
    identityLimit,
    `${record.surface}.${record.metric}`,
  );
  const normalized = {
    ...record,
    ...partitions,
    referenceCents: record.referenceCents ?? null,
    referenceDeltaCents: record.referenceDeltaCents ?? null,
  };
  return normalized;
}

function uniqueIdentities(
  identities: Iterable<PropertyCashParityIdentity>,
  limit: number,
) {
  return collectIdentityPartitions(
    { included: [identities] },
    limit,
    "identity collection",
  ).included;
}

function mergeIdentities(
  limit: number,
  context: string,
  ...chunks: Array<Iterable<PropertyCashParityIdentity>>
) {
  return collectIdentityPartitions(
    { included: chunks },
    limit,
    context,
  ).included;
}

type IdentityPartitionName = "excluded" | "included" | "unresolved";
type IdentityPartitionChunks = Partial<
  Record<
    IdentityPartitionName,
    Iterable<Iterable<PropertyCashParityIdentity>>
  >
>;

function collectIdentityPartitions(
  chunks: IdentityPartitionChunks,
  limit: number,
  context: string,
) {
  const partitions: Record<
    IdentityPartitionName,
    Map<string, PropertyCashParityIdentity>
  > = {
    excluded: new Map(),
    included: new Map(),
    unresolved: new Map(),
  };
  const assigned = new Map<string, IdentityPartitionName>();
  let size = 0;

  for (const partition of [
    "included",
    "excluded",
    "unresolved",
  ] as const) {
    for (const chunk of chunks[partition] ?? []) {
      for (const identity of chunk) {
        const key = identityKey(identity);
        const existingPartition = assigned.get(key);
        if (existingPartition && existingPartition !== partition) {
          throw new Error(
            `Property cash parity identity ${key} appears in both ${existingPartition} and ${partition} for ${context}.`,
          );
        }
        if (!existingPartition) {
          if (size >= limit) {
            throw new Error(
              `Property cash parity identity limit exceeded for ${context}: more than ${limit}.`,
            );
          }
          assigned.set(key, partition);
          partitions[partition].set(key, identity);
          size += 1;
        }
      }
    }
  }

  return Object.fromEntries(
    (["excluded", "included", "unresolved"] as const).map((partition) => [
      partition,
      [...partitions[partition].entries()]
        .toSorted(([first], [second]) => first.localeCompare(second))
        .map(([, identity]) => identity),
    ]),
  ) as Pick<
    PropertyCashParityRecord,
    "excluded" | "included" | "unresolved"
  >;
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
  if (identity.kind === "ledger_source") {
    return `${identity.kind}:${identity.id}`;
  }
  if (identity.kind === "current_cash_source") {
    return `${identity.kind}:${identity.sourceType}:${identity.id}`;
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
  const trustedRows = input.trustedReportInput;
  const summaryRows = input.propertySummaryInput;
  const rawSources = [
    ["canonicalEvents", input.canonicalEvents.length],
    [
      "financeInventorySourceRows",
      input.financeInventorySourceRows.length,
    ],
    [
      "financeInventoryDiagnosticRows",
      input.financeInventoryDiagnosticRows.length,
    ],
    ["ownerStatementRows.contactRows", ownerRows.contactRows.length],
    [
      "ownerStatementRows.currentReceiptRows",
      ownerRows.currentReceiptRows.length,
    ],
    ["ownerStatementRows.depositRows", ownerRows.depositRows.length],
    ["ownerStatementRows.dueIncomeItems", ownerRows.dueIncomeItems.length],
    [
      "ownerStatementRows.historicalReceiptRows",
      ownerRows.historicalReceiptRows.length,
    ],
    ["ownerStatementRows.ownerRows", ownerRows.ownerRows.length],
    ["ownerStatementRows.paymentRows", ownerRows.paymentRows.length],
    ["ownerStatementRows.personRows", ownerRows.personRows.length],
    ["ownerStatementRows.propertyIds", ownerRows.propertyIds.length],
    ["trustedReportInput.documents", trustedRows.documents.length],
    ["trustedReportInput.ledgerEntries", trustedRows.ledgerEntries.length],
    ["trustedReportInput.leases", trustedRows.leases.length],
    [
      "trustedReportInput.maintenanceTasks",
      trustedRows.maintenanceTasks.length,
    ],
    ["trustedReportInput.owners", trustedRows.owners.length],
    ["trustedReportInput.people", trustedRows.people.length],
    ["trustedReportInput.properties", trustedRows.properties.length],
    ["trustedReportInput.timelineEvents", trustedRows.timelineEvents.length],
    ["trustedReportInput.units", trustedRows.units.length],
    [
      "propertySummaryInput.ledgerEntries",
      summaryRows.ledgerEntries.length,
    ],
    ["propertySummaryInput.units", summaryRows.units.length],
  ] as const;
  const rawExceeded = rawSources.find(([, count]) => count > identityLimit);
  if (rawExceeded) {
    throw new Error(
      `Property cash parity identity limit exceeded for ${rawExceeded[0]}: ${rawExceeded[1]} identities exceeds ${identityLimit}.`,
    );
  }

  assertPropertySummaryLedgerIds(summaryRows.ledgerEntries);

  const ownerCashContributorCount =
    ownerRows.currentReceiptRows.length +
    ownerRows.historicalReceiptRows.length +
    ownerRows.paymentRows.length +
    ownerRows.depositRows.length +
    ownerRows.dueIncomeItems.length;
  if (ownerCashContributorCount > identityLimit) {
    throw new Error(
      `Property cash parity identity limit exceeded for ownerStatementRows.cashContributors: ${ownerCashContributorCount} identities exceeds ${identityLimit}.`,
    );
  }

  const currentPropertyIdentities = collectIdentityPartitions(
    { included: [rawPropertyCashIdentities(input)] },
    identityLimit,
    "combinedPropertyCashContributorIdentities",
  ).included;
  mergeIdentities(
    identityLimit,
    "combinedPropertyCashContributorIdentities",
    input.canonicalEvents.map(canonicalIdentity),
    currentPropertyIdentities,
  );
  assertOwnerAllocationFanout(input, identityLimit);

  const ledgerDirections = new Map<string, "expense" | "income">();
  for (const entry of trustedRows.ledgerEntries) {
    ledgerDirections.set(
      entry.id,
      entry.direction === "expense" ? "expense" : "income",
    );
  }
  mergeIdentities(
    identityLimit,
    "combinedReportContributors",
    input.canonicalEvents.map(canonicalIdentity),
    trustedReportLedgerIdentities(trustedRows.ledgerEntries),
    matchingPlan01LedgerIdentities(
      input.financeInventorySourceRows,
      ledgerDirections,
    ),
  );
}

function assertPropertySummaryLedgerIds(
  rows: PropertyCashShadowParityInput["propertySummaryInput"]["ledgerEntries"],
) {
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (typeof row.id !== "string" || row.id.trim() === "") {
      throw new Error(
        `propertySummaryInput.ledgerEntries[${index}].id must be a nonempty exact Ledger identity.`,
      );
    }
    if (ids.has(row.id)) {
      throw new Error(`Duplicate PropertySummary Ledger id: ${row.id}.`);
    }
    ids.add(row.id);
  }
}

function* rawPropertyCashIdentities(
  input: PropertyCashShadowParityInput,
): Generator<PropertyCashParityIdentity> {
  const rows = input.ownerStatementRows;
  for (const item of rows.dueIncomeItems) {
    yield { id: item.id, kind: "obligation", obligationType: "income" };
  }
  for (const receipt of [
    rows.currentReceiptRows,
    rows.historicalReceiptRows,
  ]) {
    for (const row of receipt) {
      yield {
        id: row.income_item_id,
        kind: "obligation",
        obligationType: "income",
      };
      if (row.finance_receipts) {
        yield {
          id: row.id,
          kind: "current_cash_source",
          sourceType: "receipt_allocation",
        };
      }
    }
  }
  for (const row of rows.paymentRows) {
    yield {
      id: row.expense_item_id,
      kind: "obligation",
      obligationType: "expense",
    };
    if (row.finance_payments) {
      yield {
        id: row.id,
        kind: "current_cash_source",
        sourceType: "payment_allocation",
      };
    }
  }
  for (const row of rows.depositRows) {
    yield {
      id: row.id,
      kind: "current_cash_source",
      sourceType: "deposit_event",
    };
  }
}

function assertOwnerAllocationFanout(
  input: PropertyCashShadowParityInput,
  identityLimit: number,
) {
  const rows = input.ownerStatementRows;
  const ownerCount = rows.ownerRows.length;
  // A current receipt can add both its embedded obligation and allocation.
  const rawSourceOccurrenceCount =
    rows.dueIncomeItems.length +
    rows.currentReceiptRows.length * 2 +
    rows.historicalReceiptRows.length +
    rows.paymentRows.length +
    rows.depositRows.length;
  const remainingLimit = identityLimit - ownerCount;
  if (
    ownerCount > 0 &&
    (remainingLimit < 0 ||
      rawSourceOccurrenceCount > Math.floor(remainingLimit / ownerCount))
  ) {
    throw new Error(
      `Property cash parity identity limit exceeded for ownerStatementRows.allocationFanout: more than ${identityLimit}.`,
    );
  }
}

function* trustedReportLedgerIdentities(
  rows: Parameters<typeof buildTrustedReport>[0]["ledgerEntries"],
): Generator<PropertyCashParityIdentity> {
  for (const row of rows) {
    yield { id: row.id, kind: "ledger_source" };
  }
}

function assertCanonicalEventScope(input: PropertyCashShadowParityInput) {
  for (const event of input.canonicalEvents) {
    const nullDateIsUnresolved =
      event.eventDate === null &&
      event.requiresResolution &&
      (event.classificationStatus === "unresolved_source_scope" ||
        event.classificationStatus === "unresolved_reversal_header" ||
        event.classificationStatus === "unresolved_evidence") &&
      event.depositLiabilityEffectCents === null &&
      event.managementFeeEffectCents === null &&
      event.operatingCashEffectCents === null &&
      event.ownerCashEffectCents === null;
    if (event.eventDate === null && !nullDateIsUnresolved) {
      throw new Error(
        `Null-dated canonical event ${event.eventKey} must be explicitly unresolved and non-counting.`,
      );
    }
    const inPeriod =
      nullDateIsUnresolved ||
      (event.eventDate !== null &&
        event.eventDate >= input.scope.periodStart &&
        event.eventDate <= input.scope.periodEnd);
    if (
      event.organizationId !== input.scope.organizationId ||
      event.propertyId !== input.scope.propertyId ||
      event.currency !== input.scope.currency ||
      !inPeriod
    ) {
      throw new Error(
        `Canonical event ${event.eventKey} is outside the requested scope.`,
      );
    }
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

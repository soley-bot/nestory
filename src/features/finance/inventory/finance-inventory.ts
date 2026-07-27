export const financeInventoryContractVersion = "finance_inventory_v2";

export type FinanceInventorySection =
  | "access"
  | "diagnostics"
  | "sources"
  | "watermark";

export type FinanceInventoryPageRow = {
  contract_version: string;
  payload: Record<string, unknown>;
  section: FinanceInventorySection;
  stable_key: string;
};

export type NormalizedFinanceInventoryRow = {
  contractVersion: string;
  payload: Record<string, unknown>;
  section: FinanceInventorySection;
  stableKey: string;
};

export type FinanceInventoryScope = {
  currency: string;
  organizationId: string;
  periodEnd: string;
  periodStart: string;
  propertyId: string;
};

export type FinanceInventoryWatermark = {
  hash: string;
  migrationIdentity?: string;
  rowCount: number;
  schemaIdentity?: string;
};

const isolatedSupabaseValues: Record<string, Record<string, string>> = {
  "": {
    project_id: '"nestory-finance-inventory"',
  },
  analytics: {
    port: "55327",
  },
  api: {
    port: "55321",
  },
  db: {
    port: "55322",
    shadow_port: "55320",
  },
  "db.pooler": {
    port: "55329",
  },
  "db.seed": {
    enabled: "false",
  },
  edge_runtime: {
    inspector_port: "8183",
  },
  inbucket: {
    port: "55324",
  },
  local_smtp: {
    port: "55324",
  },
  studio: {
    port: "55323",
  },
};

const sectionOrder: Record<FinanceInventorySection, number> = {
  sources: 0,
  diagnostics: 1,
  access: 2,
  watermark: 3,
};

const proposalClasses = new Set([
  "exact_existing_link",
  "candidate_controlled_adjustment",
  "candidate_explicit_exclusion",
  "ambiguous_requires_resolution",
  "inferred_date_requires_evidence",
  "unsupported_current_source",
]);

export const financeInventoryIssueCodes = [
  "ARCHIVED_HISTORICAL_PARTY_OMITTED",
  "ARCHIVED_SOURCE_REMAINS_EFFECTIVE",
  "BACKFILL_INFERRED_DATE",
  "DEPOSIT_EVENT_WITHOUT_CASH_EVIDENCE",
  "DEPOSIT_INCOME_WITHOUT_DEPOSIT_EVENT",
  "DUPLICATE_EXACT_SOURCE_IDENTITY",
  "GENERIC_NAMESPACE_IMPERSONATION_CAPABILITY",
  "JOURNAL_WITHOUT_OPERATIONAL_SOURCE",
  "LEDGER_JOURNAL_AMOUNT_MISMATCH",
  "LEDGER_JOURNAL_DATE_MISMATCH",
  "LEDGER_JOURNAL_PROPERTY_UNIT_MISMATCH",
  "LEDGER_JOURNAL_SOURCE_REVERSAL_MISMATCH",
  "LOCK_STATE_DISAGREEMENT",
  "MAINTENANCE_BILL_DUPLICATE_EXACT_TASK",
  "MAINTENANCE_TASK_LEDGER_LINK_ONLY",
  "MANAGEMENT_FEE_WITHOUT_AGREEMENT",
  "MANUAL_LEDGER_ROW",
  "MISSING_STABLE_RECONCILIATION_IDENTITY",
  "OBLIGATION_COMPATIBILITY_MISMATCH",
  "OBLIGATION_LEVEL_POSTING_MULTI_SETTLEMENT",
  "OWNER_CONTRIBUTION_DUAL_AUTHORITY",
  "OWNER_PAYOUT_WITHOUT_DISTRIBUTION_AUTHORITY",
  "OWNERSHIP_INVALID_ON_RELEVANT_DATE",
  "PAYMENT_ALLOCATION_MISSING_JOURNAL",
  "PAYMENT_ALLOCATION_MISSING_LEDGER",
  "PETTY_CASH_BILL_DUPLICATE_EXACT_LEDGER",
  "PETTY_CASH_INFERRED_DISBURSEMENT_DATE",
  "PETTY_CASH_PROJECTION_MISSING",
  "RECEIPT_ALLOCATION_MISSING_JOURNAL",
  "RECEIPT_ALLOCATION_MISSING_LEDGER",
  "REPORT_TOTAL_CONTRADICTION",
  "RESERVED_NAMESPACE_IMPERSONATION_CAPABILITY",
  "SOURCE_LINKED_LEDGER_WITHOUT_SETTLEMENT_IDENTITY",
  "SOURCE_LOAD_LIMIT_EXCEEDED",
  "WRONG_LINKED_RECORD_SCOPE",
] as const;

const financeInventoryIssueCodeSet = new Set<string>(
  financeInventoryIssueCodes,
);

export function assertKnownFinanceInventoryIssueCodes(
  issueCodes: string[] | undefined,
): void {
  const unknown = issueCodes?.find(
    (issueCode) => !financeInventoryIssueCodeSet.has(issueCode),
  );
  if (unknown) {
    throw new Error(`Unknown finance inventory issue code: ${unknown}.`);
  }
}

export function parseMoneyToMinor(value: string): bigint {
  const input = value.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(input);
  if (!match) {
    throw new Error(`Expected exact decimal money with at most two places: ${value}`);
  }

  const [, sign, whole, fraction = ""] = match;
  const minor = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return sign === "-" ? -minor : minor;
}

export function formatMoneyFromMinor(value: bigint): string {
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  return `${sign}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}

export async function collectInventoryPages({
  fetchPage,
  pageSize,
}: {
  fetchPage: (input: {
    afterKey: string | null;
    limit: number;
  }) => Promise<FinanceInventoryPageRow[]>;
  pageSize: number;
}): Promise<FinanceInventoryPageRow[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    throw new Error("Finance inventory page size must be between 1 and 1,000.");
  }

  const rows: FinanceInventoryPageRow[] = [];
  const seenKeys = new Set<string>();
  let afterKey: string | null = null;

  for (;;) {
    const page = await fetchPage({ afterKey, limit: pageSize });
    if (page.length === 0) break;
    assertInventoryContractVersions(page);

    for (const candidate of page) {
      if (seenKeys.has(candidate.stable_key)) {
        throw new Error(`Duplicate finance inventory key: ${candidate.stable_key}`);
      }
      seenKeys.add(candidate.stable_key);
      rows.push(candidate);
      afterKey = candidate.stable_key;
    }

    if (page.length < pageSize) break;
  }

  return rows;
}

export function normalizeInventoryRows(
  rows: FinanceInventoryPageRow[],
): NormalizedFinanceInventoryRow[] {
  assertInventoryContractVersions(rows);
  return rows
    .map((candidate) => ({
      contractVersion: candidate.contract_version,
      payload: sortJsonValue(candidate.payload) as Record<string, unknown>,
      section: candidate.section,
      stableKey: candidate.stable_key,
    }))
    .toSorted(
      (first, second) =>
        sectionOrder[first.section] - sectionOrder[second.section] ||
        first.stableKey.localeCompare(second.stableKey),
    );
}

export function assertInventoryContractVersions(
  rows: FinanceInventoryPageRow[],
): void {
  const invalid = rows.find(
    (row) => row.contract_version !== financeInventoryContractVersion,
  );
  if (invalid) {
    throw new Error(
      `Finance inventory contract version mismatch: expected ${financeInventoryContractVersion}, received ${invalid.contract_version}.`,
    );
  }
}

export function isPathInside(root: string, target: string): boolean {
  const normalize = (value: string) =>
    value.replaceAll("\\", "/").replace(/\/+$/, "").toLocaleLowerCase("en-US");
  const normalizedRoot = normalize(root);
  const normalizedTarget = normalize(target);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}/`)
  );
}

export function assertDisposableStackIdentity({
  config,
  repositoryRoot,
  stackStatus,
  stackWorkdir,
}: {
  config: string;
  repositoryRoot: string;
  stackStatus: { API_URL?: string };
  stackWorkdir: string;
}): void {
  const expectedRoot = `${repositoryRoot.replace(/[\\/]+$/, "")}/artifacts`;
  const expectedWorkdir = `${expectedRoot}/finance-inventory-stack`;
  const configHasProject =
    /^\s*project_id\s*=\s*"nestory-finance-inventory"\s*$/m.test(config);
  const configHasApiPort = /^\s*port\s*=\s*55321\s*$/m.test(
    sectionText(config, "api"),
  );

  let statusUrl: URL | null = null;
  try {
    statusUrl = stackStatus.API_URL ? new URL(stackStatus.API_URL) : null;
  } catch {
    statusUrl = null;
  }

  if (
    !isPathInside(expectedRoot, stackWorkdir) ||
    normalizePortablePath(stackWorkdir) !== normalizePortablePath(expectedWorkdir) ||
    !configHasProject ||
    !configHasApiPort ||
    statusUrl?.protocol !== "http:" ||
    !isLoopbackHostname(statusUrl.hostname) ||
    statusUrl.port !== "55321"
  ) {
    throw new Error(
      "Finance inventory disposable stack identity could not be proven.",
    );
  }
}

export function assertRepositoryState({
  allowDirty,
  porcelainStatus,
}: {
  allowDirty: boolean;
  porcelainStatus: string;
}) {
  const dirty = porcelainStatus.trim().length > 0;
  if (dirty && !allowDirty) {
    throw new Error(
      "Finance inventory repository is dirty; commit/stash changes or pass the explicit dirty-state recording option.",
    );
  }
  return { dirty };
}

function normalizePortablePath(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "").toLocaleLowerCase("en-US");
}

function sectionText(config: string, sectionName: string) {
  const lines = config.split(/\r?\n/);
  const expectedHeader = `[${sectionName}]`;
  const start = lines.findIndex((line) => line.trim() === expectedHeader);
  if (start < 0) return "";

  const sectionLines: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[.+]\s*$/.test(line)) break;
    sectionLines.push(line);
  }
  return sectionLines.join("\n");
}

function isLoopbackHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

export function assertLocalInventoryEnvironment({
  environmentId,
  expectedEnvironmentId,
  expectedProjectId,
  projectId,
  supabaseUrl,
}: {
  environmentId: string;
  expectedEnvironmentId: string;
  expectedProjectId: string;
  projectId: string;
  supabaseUrl: string;
}): void {
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw localEnvironmentError();
  }

  const isLoopback =
    url.protocol === "http:" && isLoopbackHostname(url.hostname);
  const hasUserInfo = url.username.length > 0 || url.password.length > 0;
  const isDisposableApiPort = url.port === "55321";

  if (
    !isLoopback ||
    !isDisposableApiPort ||
    hasUserInfo ||
    projectId !== expectedProjectId ||
    environmentId !== expectedEnvironmentId
  ) {
    throw localEnvironmentError();
  }
}

export function buildIsolatedSupabaseConfig(config: string): string {
  let section = "";

  return config.split(/\r?\n/).flatMap((line) => {
      const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (sectionMatch) {
        section = sectionMatch[1];
        return [line];
      }

      const settingMatch = /^(\s*)([a-z_]+)(\s*=\s*)(.*)$/.exec(line);
      if (!settingMatch) return [line];

      const [, indentation, key, separator] = settingMatch;
      if (section === "db.seed" && key === "sql_paths") return [];

      const replacement = isolatedSupabaseValues[section]?.[key];
      if (replacement === undefined) return [line];

      return [`${indentation}${key}${separator}${replacement}`];
    })
    .join("\n");
}

function localEnvironmentError() {
  return new Error(
    "Finance inventory requires the explicit disposable local finance inventory environment.",
  );
}

export function buildFinanceInventoryArtifact({
  accessRows,
  diagnosticRows,
  migrationIdentity,
  repositoryDirty = false,
  repositorySha,
  schemaIdentity = migrationIdentity,
  scope,
  sourceRows,
  watermark,
}: {
  accessRows: FinanceInventoryPageRow[];
  diagnosticRows: FinanceInventoryPageRow[];
  migrationIdentity: string;
  repositoryDirty?: boolean;
  repositorySha: string;
  schemaIdentity?: string;
  scope: FinanceInventoryScope;
  sourceRows: FinanceInventoryPageRow[];
  watermark: FinanceInventoryWatermark;
}) {
  const normalizedSources = normalizeInventoryRows(sourceRows);
  const normalizedDiagnostics = normalizeInventoryRows(diagnosticRows);
  const normalizedAccess = normalizeInventoryRows(accessRows);

  const currentDiagnostics = normalizedDiagnostics.map((candidate) => ({
    diagnosticKey: candidate.stableKey,
    ...withoutProposal(candidate.payload),
  }));
  const proposedRows = normalizedDiagnostics.map((candidate) => ({
    diagnosticKey: candidate.stableKey,
    proposal: proposalFromPayload(candidate.payload),
  }));

  return {
    contractVersion: financeInventoryContractVersion,
    currentState: {
      accessEvidence: normalizedAccess.map((candidate) => ({
        evidenceKey: candidate.stableKey,
        ...candidate.payload,
      })),
      diagnostics: currentDiagnostics,
      sourceRows: normalizedSources.map((candidate) => ({
        sourceKey: candidate.stableKey,
        ...candidate.payload,
      })),
    },
    parameters: sortJsonValue(scope),
    parity: buildParitySummary({
      diagnosticRows,
      scope,
      sourceRows,
    }),
    readPathParity: buildReadPathParity(sourceRows),
    unitContextCoverage: buildUnitContextCoverage(sourceRows),
    businessRequirementGaps: buildBusinessGapEvidence(),
    proposedClassification: {
      disclaimer:
        "Diagnostic recommendation only. This does not establish current financial authority or authorize a write, repair, backfill, exclusion, or cutover.",
      rows: proposedRows,
    },
    provenance: {
      migrationIdentity,
      repositoryDirty,
      repositorySha,
      schemaIdentity,
    },
    sourceWatermark: watermark,
  };
}

export function buildReadPathParity(sourceRows: FinanceInventoryPageRow[]) {
  let operatingIncome = BigInt(0);
  let propertyExpenses = BigInt(0);
  let depositCustody = BigInt(0);
  let managementFees = BigInt(0);
  let managementFeesEarned = BigInt(0);
  let managementFeesOutstanding = BigInt(0);
  let ownerContributions = BigInt(0);
  let ownerDistributions = BigInt(0);
  let ledgerIncome = BigInt(0);
  let ledgerExpense = BigInt(0);
  let unitLedgerIncome = BigInt(0);
  let unitLedgerExpense = BigInt(0);
  let journalDebit = BigInt(0);
  let journalCredit = BigInt(0);
  let rowsWithUnitId = 0;
  let legitimatePropertyLevelRows = 0;
  const unexpectedlyMissingUnitId = 0;
  let financeCloseIncomeReady = 0;
  let financeCloseBillsReady = 0;
  let financeClosePettyCashReady = 0;

  for (const row of sourceRows) {
    const sourceType = stringValue(row.payload.sourceType);
    const amount = moneyValue(row.payload.amount);
    const signedAmount =
      moneyValue(row.payload.signedAmount) ??
      (amount === null ? null : legacySignedAmount(row.payload, amount));
    const economicClass =
      stringValue(row.payload.economicClass) ??
      (sourceType ? legacyEconomicClass(row.payload, sourceType) : null);

    if (
      sourceType === "receipt_allocation" &&
      economicClass === "operating_income" &&
      signedAmount !== null
    ) {
      operatingIncome += signedAmount;
    } else if (
      sourceType === "receipt_allocation" &&
      economicClass === "management_fee" &&
      signedAmount !== null
    ) {
      managementFees += signedAmount;
    } else if (
      sourceType === "income_obligation" &&
      economicClass === "management_fee"
    ) {
      managementFeesEarned += amount ?? BigInt(0);
      managementFeesOutstanding +=
        moneyValue(row.payload.outstandingAmount) ?? BigInt(0);
    } else if (
      sourceType === "receipt_allocation" &&
      economicClass === "owner_contribution" &&
      signedAmount !== null
    ) {
      ownerContributions += signedAmount;
    } else if (
      sourceType === "payment_allocation" &&
      economicClass === "property_expense" &&
      signedAmount !== null
    ) {
      propertyExpenses += signedAmount;
    } else if (
      sourceType === "payment_allocation" &&
      economicClass === "owner_distribution" &&
      signedAmount !== null
    ) {
      ownerDistributions += signedAmount;
    } else if (sourceType === "deposit_event" && signedAmount !== null) {
      depositCustody += signedAmount;
    } else if (
      sourceType === "ledger_entry" &&
      amount !== null &&
      row.payload.archived !== true
    ) {
      const isExpense = row.payload.direction === "expense";
      if (isExpense) ledgerExpense += amount;
      else ledgerIncome += amount;

      if (typeof row.payload.unitId === "string") {
        rowsWithUnitId += 1;
        if (isExpense) unitLedgerExpense += amount;
        else unitLedgerIncome += amount;
      } else {
        legitimatePropertyLevelRows += 1;
      }
    } else if (sourceType === "journal_line") {
      journalDebit += moneyValue(row.payload.debitAmount) ?? BigInt(0);
      journalCredit += moneyValue(row.payload.creditAmount) ?? BigInt(0);
    }

    if (
      sourceType === "income_obligation" &&
      ["partially_received", "received"].includes(
        stringValue(row.payload.status) ?? "",
      ) &&
      row.payload.archived !== true
    ) {
      financeCloseIncomeReady += 1;
    } else if (
      sourceType === "expense_obligation" &&
      row.payload.status === "approved" &&
      row.payload.archived !== true
    ) {
      financeCloseBillsReady += 1;
    } else if (
      sourceType === "petty_cash_entry" &&
      row.payload.status === "cleared" &&
      !row.payload.ledgerEntryId &&
      row.payload.archived !== true
    ) {
      financeClosePettyCashReady += 1;
    }
  }

  const ledgerTotals = {
    expense: formatMoneyFromMinor(ledgerExpense),
    income: formatMoneyFromMinor(ledgerIncome),
    net: formatMoneyFromMinor(ledgerIncome - ledgerExpense),
  };

  return {
    ownerStatementPropertyCash: {
      formula:
        "src/features/finance/property-cash.ts: signed receipt allocations by obligation classification, signed paid property-expense allocations, and cumulative typed deposit custody events",
      totals: {
        depositCustody: formatMoneyFromMinor(depositCustody),
        operatingIncomeReceived: formatMoneyFromMinor(operatingIncome),
        operatingNetMovement: formatMoneyFromMinor(
          operatingIncome - propertyExpenses,
        ),
        managementFeesReceived: formatMoneyFromMinor(managementFees),
        managementFeesEarned: formatMoneyFromMinor(managementFeesEarned),
        managementFeesOutstanding: formatMoneyFromMinor(
          managementFeesOutstanding,
        ),
        ownerContributions: formatMoneyFromMinor(ownerContributions),
        ownerDistributions: formatMoneyFromMinor(ownerDistributions),
        ownerDueMovement: formatMoneyFromMinor(
          operatingIncome -
            propertyExpenses -
            managementFees +
            ownerContributions -
            ownerDistributions,
        ),
        propertyExpensesPaid: formatMoneyFromMinor(propertyExpenses),
      },
    },
    ledger: {
      formula:
        "active ledger_entries in selected property/currency/date scope; income minus expense",
      totals: ledgerTotals,
    },
    propertyPerformance: {
      formula:
        "src/features/reports/data/trusted-report.ts buildPropertyPerformanceReport over active ledger_entries",
      sharesCalculationWith: "ledger",
      totals: ledgerTotals,
    },
    unitPerformance: {
      formula:
        "src/features/reports/data/trusted-report.ts buildUnitPerformanceReport over active unit-linked ledger_entries",
      sharesCalculationWith: "ledger",
      totals: {
        expense: formatMoneyFromMinor(unitLedgerExpense),
        income: formatMoneyFromMinor(unitLedgerIncome),
        net: formatMoneyFromMinor(unitLedgerIncome - unitLedgerExpense),
      },
      unitContext: {
        legitimatePropertyLevelRows,
        rowsWithUnitId,
        unexpectedlyMissingUnitId,
      },
    },
    incomeAndExpense: {
      formula:
        "src/features/reports/data/trusted-report.ts buildIncomeExpenseReport over active ledger_entries",
      sharesCalculationWith: "ledger",
      totals: ledgerTotals,
    },
    propertyRecordFinanceSummary: {
      formula:
        "src/features/properties/data/properties.ts property cards sum all active ledger_entries with no date filter; property detail reads all active ledger_entries, both through current PostgREST loaders",
      sharesCalculationWith: "ledger",
      currentTotalState:
        "formula_only_not_recomputed: the bounded CLI period does not silently substitute for the production all-time property-card total",
      selectedPeriodComparison: ledgerTotals,
    },
    financeCloseQueues: {
      formula:
        "src/features/finance/data/finance-close.ts counts received/partially-received obligations by due date, approved expenses by invoice date, and cleared petty cash missing Ledger",
      counts: {
        billsReadyToPost: financeCloseBillsReady,
        incomeReadyToPost: financeCloseIncomeReady,
        pettyCashReadyToPost: financeClosePettyCashReady,
      },
    },
    journalAccountingControl: {
      formula:
        "accounting_journal_lines in selected property/currency/journal-entry date scope",
      totals: {
        credit: formatMoneyFromMinor(journalCredit),
        debit: formatMoneyFromMinor(journalDebit),
      },
    },
  };
}

export function buildUnitContextCoverage(
  sourceRows: FinanceInventoryPageRow[],
) {
  const coverage = new Map<
    string,
    {
      legitimatePropertyLevelRows: number;
      rowsWithUnitId: number;
      unexpectedMissingSourceIdentities: string[];
      unexpectedlyMissingUnitId: number;
    }
  >();

  for (const row of sourceRows.toSorted((first, second) =>
    first.stable_key.localeCompare(second.stable_key),
  )) {
    const sourceType = stringValue(row.payload.sourceType);
    if (!sourceType) continue;
    const current = coverage.get(sourceType) ?? {
      legitimatePropertyLevelRows: 0,
      rowsWithUnitId: 0,
      unexpectedMissingSourceIdentities: [],
      unexpectedlyMissingUnitId: 0,
    };

    if (typeof row.payload.unitId === "string") {
      current.rowsWithUnitId += 1;
    } else if (sourceRequiresUnitContext(row.payload, sourceType)) {
      current.unexpectedlyMissingUnitId += 1;
      current.unexpectedMissingSourceIdentities.push(row.stable_key);
    } else {
      current.legitimatePropertyLevelRows += 1;
    }
    coverage.set(sourceType, current);
  }

  return Object.fromEntries(
    [...coverage.entries()]
      .toSorted(([first], [second]) => first.localeCompare(second))
      .map(([sourceType, counts]) => [sourceType, counts]),
  );
}

function sourceRequiresUnitContext(
  payload: Record<string, unknown>,
  sourceType: string,
) {
  const hasLeaseIdentity = typeof payload.leaseId === "string";
  const incomeType = stringValue(payload.incomeType);
  return (
    sourceType === "deposit_event" ||
    (hasLeaseIdentity &&
      (sourceType === "income_obligation" ||
        sourceType === "receipt_allocation" ||
        sourceType === "journal_line")) ||
    (incomeType === "rent" &&
      (sourceType === "income_obligation" ||
        sourceType === "receipt_allocation"))
  );
}

export function buildBusinessGapEvidence() {
  const incomeCategories = [
    "Cleaning",
    "General Maintenance",
    "General Repairs",
    "Laundry Service",
    "Access Card Fees",
    "Pet Fees",
  ].map((category) => ({
    ambiguity:
      category === "General Maintenance" ||
      category === "General Repairs" ||
      category === "Laundry Service"
        ? "income_recharge_vs_property_expense"
        : null,
    category,
    currentStableType: false,
    freeTextCategoryAvailable: false,
    state: "missing_stable_type" as const,
  }));
  const expenseCategories = [
    "Association Fees",
    "Bank Fees",
    "Car Parking",
    "Air Conditioner Cleaning",
    "Unit Refresh",
    "Furnishing",
    "General Supplies",
    "Insurance",
    "Laundry Services",
    "Legal and Professional Fees",
    "Property Management Services Fee",
    "Renovation",
    "Property Taxes",
    "Cable and Internet",
    "Electricity",
    "Water",
    "Gas",
    "Labor Fee",
    "Other Expense",
  ].map((category) => {
    const mappedExpenseType =
      category === "General Supplies"
        ? "supplies"
        : category === "Other Expense"
          ? "other"
          : null;
    const broadCurrentType = [
      "Cable and Internet",
      "Electricity",
      "Gas",
      "Water",
    ].includes(category)
      ? "utilities"
      : null;

    return {
      ambiguity:
        category === "Air Conditioner Cleaning" ||
        category === "Laundry Services" ||
        category === "Labor Fee"
          ? "property_expense_vs_tenant_recharge"
          : null,
      broadCurrentType,
      category,
      currentStableType: mappedExpenseType !== null,
      freeTextCategoryAvailable: true,
      mappedExpenseType,
      state: mappedExpenseType
        ? ("broad_current_type" as const)
        : broadCurrentType
          ? ("broad_type_not_specific" as const)
          : ("free_text_category_only" as const),
    };
  });

  return {
    incomeCategories,
    expenseCategories,
    confirmedGaps: [
      "no_durable_owner_balance_chain",
      "no_controlled_owner_distribution_workflow",
      "no_opening_or_closing_carried_balance",
      "owner_statement_not_grouped_by_unit",
      "source_contracts_do_not_uniformly_preserve_unit_id",
      "deposits_excluded_from_operating_and_carried_balance_totals",
    ],
    disclaimer:
      "Business-requirement inventory only. No category, Owner Balance, distribution, or statement schema is created by Plan 01.",
  };
}

export function inventoryArtifactJson(artifact: unknown): string {
  return `${JSON.stringify(sortJsonValue(artifact), null, 2)}\n`;
}

export function buildParitySummary({
  diagnosticRows,
  scope,
  sourceRows,
}: {
  diagnosticRows: FinanceInventoryPageRow[];
  scope: FinanceInventoryScope;
  sourceRows: FinanceInventoryPageRow[];
}) {
  const totals = new Map<string, bigint>();
  const manifests = new Map<
    string,
    {
      excludedSources: Set<string>;
      includedSources: Set<string>;
      unresolvedSources: Set<string>;
    }
  >();

  for (const candidate of sourceRows.toSorted((first, second) =>
    first.stable_key.localeCompare(second.stable_key),
  )) {
    const sourceType = stringValue(candidate.payload.sourceType);
    const amount = moneyValue(candidate.payload.amount);
    if (!sourceType || amount === null) continue;

    const direction = stringValue(candidate.payload.direction);
    const economicClass =
      stringValue(candidate.payload.economicClass) ??
      legacyEconomicClass(candidate.payload, sourceType);
    const signedAmount =
      moneyValue(candidate.payload.signedAmount) ??
      legacySignedAmount(candidate.payload, amount);

    if (sourceType === "receipt_allocation") {
      if (economicClass === "operating_income") {
        addTotal(totals, "operatingIncomeReceived", signedAmount);
        include(manifests, "operatingIncomeReceived", candidate.stable_key);
      } else if (economicClass === "management_fee") {
        addTotal(totals, "managementFeeEffects", signedAmount);
        include(manifests, "managementFeeEffects", candidate.stable_key);
      } else if (economicClass === "owner_contribution") {
        addTotal(totals, "ownerContributions", signedAmount);
        include(manifests, "ownerContributions", candidate.stable_key);
      } else if (economicClass === "deposit_custody") {
        unresolved(manifests, "depositCustodyMovement", candidate.stable_key);
      } else {
        unresolved(manifests, "operatingIncomeReceived", candidate.stable_key);
      }
    } else if (
      sourceType === "income_obligation" &&
      economicClass === "operating_income"
    ) {
      addTotal(totals, "operatingObligations", amount);
      const outstanding = moneyValue(candidate.payload.outstandingAmount);
      if (outstanding !== null) {
        addTotal(totals, "operatingOutstandingBalance", outstanding);
      }
    } else if (sourceType === "payment_allocation") {
      if (economicClass === "property_expense") {
        addTotal(totals, "propertyExpensesPaid", signedAmount);
        include(manifests, "propertyExpensesPaid", candidate.stable_key);
      } else if (economicClass === "owner_distribution") {
        addTotal(totals, "ownerDistributions", signedAmount);
        include(manifests, "ownerDistributions", candidate.stable_key);
      } else if (
        economicClass === "company_advance" ||
        economicClass === "company_cost" ||
        economicClass === "refund"
      ) {
        exclude(manifests, "propertyExpensesPaid", candidate.stable_key);
      } else {
        unresolved(manifests, "propertyExpensesPaid", candidate.stable_key);
      }
    } else if (sourceType === "maintenance_task") {
      addTotal(totals, "maintenanceEffects", amount);
    } else if (sourceType === "petty_cash_entry") {
      addTotal(totals, "pettyCashEffects", amount);
    } else if (sourceType === "deposit_event") {
      const eventDate = stringValue(candidate.payload.eventDate);
      if (
        eventDate &&
        eventDate >= scope.periodStart &&
        eventDate <= scope.periodEnd
      ) {
        addTotal(totals, "depositCustodyMovement", signedAmount);
        include(manifests, "depositCustodyMovement", candidate.stable_key);
      } else {
        exclude(manifests, "depositCustodyMovement", candidate.stable_key);
      }
    } else if (sourceType === "ledger_entry") {
      addTotal(
        totals,
        direction === "expense" ? "ledgerExpenseControl" : "ledgerIncomeControl",
        amount,
      );
      exclude(manifests, "operatingIncomeReceived", candidate.stable_key);
      exclude(manifests, "propertyExpensesPaid", candidate.stable_key);
    } else if (sourceType === "journal_line") {
      const debit = moneyValue(candidate.payload.debitAmount);
      const credit = moneyValue(candidate.payload.creditAmount);
      if (debit !== null) addTotal(totals, "journalDebitControl", debit);
      if (credit !== null) addTotal(totals, "journalCreditControl", credit);
      exclude(manifests, "operatingIncomeReceived", candidate.stable_key);
      exclude(manifests, "propertyExpensesPaid", candidate.stable_key);
    }
  }

  const issueCounts = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };
  for (const diagnostic of diagnosticRows) {
    const severity = stringValue(diagnostic.payload.severity);
    if (severity && severity in issueCounts) {
      issueCounts[severity as keyof typeof issueCounts] += 1;
    }
  }

  const operatingIncome =
    totals.get("operatingIncomeReceived") ?? BigInt(0);
  const propertyExpenses =
    totals.get("propertyExpensesPaid") ?? BigInt(0);
  const managementFees =
    totals.get("managementFeeEffects") ?? BigInt(0);
  const ownerContributions =
    totals.get("ownerContributions") ?? BigInt(0);
  const ownerDistributions =
    totals.get("ownerDistributions") ?? BigInt(0);
  const operatingNet = operatingIncome - propertyExpenses;
  const ownerLiabilityMovement =
    operatingNet - managementFees + ownerContributions - ownerDistributions;

  const grossEntries = [
    "operatingIncomeReceived",
    "operatingObligations",
    "operatingOutstandingBalance",
    "propertyExpensesPaid",
    "maintenanceEffects",
    "pettyCashEffects",
    "depositCustodyMovement",
    "managementFeeEffects",
    "ownerContributions",
    "ownerDistributions",
    "ledgerIncomeControl",
    "ledgerExpenseControl",
    "journalDebitControl",
    "journalCreditControl",
  ].map((key) => [
    key,
    formatMoneyFromMinor(totals.get(key) ?? BigInt(0)),
  ]);

  const bucketAmounts = {
    depositCustodyMovement:
      totals.get("depositCustodyMovement") ?? BigInt(0),
    journalCreditControl:
      totals.get("journalCreditControl") ?? BigInt(0),
    journalDebitControl:
      totals.get("journalDebitControl") ?? BigInt(0),
    ledgerExpenseControl:
      totals.get("ledgerExpenseControl") ?? BigInt(0),
    ledgerIncomeControl:
      totals.get("ledgerIncomeControl") ?? BigInt(0),
    managementFeeEffects: managementFees,
    operatingIncomeReceived: operatingIncome,
    operatingNetMovement: operatingNet,
    ownerContributions,
    ownerDistributions,
    ownerLiabilityMovement,
    propertyExpensesPaid: propertyExpenses,
  };

  const proposedBuckets = Object.fromEntries(
    Object.entries(bucketAmounts).map(([key, value]) => [
      key,
      bucketManifest(key, value, manifests),
    ]),
  );
  combineBucketManifests(proposedBuckets, "operatingNetMovement", [
    "operatingIncomeReceived",
    "propertyExpensesPaid",
  ]);
  combineBucketManifests(proposedBuckets, "ownerLiabilityMovement", [
    "operatingIncomeReceived",
    "propertyExpensesPaid",
    "managementFeeEffects",
    "ownerContributions",
    "ownerDistributions",
  ]);

  return {
    currentGrossTotals: Object.fromEntries(grossEntries),
    currency: scope.currency,
    proposedBuckets,
    unresolvedIssueCounts: issueCounts,
  };
}

type BucketManifest = {
  amount: string;
  confidence: "bounded" | "unresolved";
  excludedSources: string[];
  includedSources: string[];
  unresolvedSources: string[];
};

function bucketManifest(
  key: string,
  amount: bigint,
  manifests: Map<
    string,
    {
      excludedSources: Set<string>;
      includedSources: Set<string>;
      unresolvedSources: Set<string>;
    }
  >,
): BucketManifest {
  const manifest = manifests.get(key) ?? newManifest();
  return {
    amount: formatMoneyFromMinor(amount),
    confidence: manifest.unresolvedSources.size > 0 ? "unresolved" : "bounded",
    excludedSources: [...manifest.excludedSources].toSorted(),
    includedSources: [...manifest.includedSources].toSorted(),
    unresolvedSources: [...manifest.unresolvedSources].toSorted(),
  };
}

function combineBucketManifests(
  buckets: Record<string, BucketManifest>,
  target: string,
  components: string[],
) {
  const combined = {
    excludedSources: new Set<string>(),
    includedSources: new Set<string>(),
    unresolvedSources: new Set<string>(),
  };
  for (const component of components) {
    const bucket = buckets[component];
    if (!bucket) continue;
    bucket.excludedSources.forEach((source) => combined.excludedSources.add(source));
    bucket.includedSources.forEach((source) => combined.includedSources.add(source));
    bucket.unresolvedSources.forEach((source) => combined.unresolvedSources.add(source));
  }
  const current = buckets[target]!;
  buckets[target] = {
    ...current,
    confidence: combined.unresolvedSources.size > 0 ? "unresolved" : "bounded",
    excludedSources: [...combined.excludedSources].toSorted(),
    includedSources: [...combined.includedSources].toSorted(),
    unresolvedSources: [...combined.unresolvedSources].toSorted(),
  };
}

function manifestFor(
  manifests: Map<
    string,
    {
      excludedSources: Set<string>;
      includedSources: Set<string>;
      unresolvedSources: Set<string>;
    }
  >,
  key: string,
) {
  const existing = manifests.get(key);
  if (existing) return existing;
  const created = newManifest();
  manifests.set(key, created);
  return created;
}

function newManifest() {
  return {
    excludedSources: new Set<string>(),
    includedSources: new Set<string>(),
    unresolvedSources: new Set<string>(),
  };
}

function include(
  manifests: Parameters<typeof manifestFor>[0],
  key: string,
  source: string,
) {
  manifestFor(manifests, key).includedSources.add(source);
}

function exclude(
  manifests: Parameters<typeof manifestFor>[0],
  key: string,
  source: string,
) {
  manifestFor(manifests, key).excludedSources.add(source);
}

function unresolved(
  manifests: Parameters<typeof manifestFor>[0],
  key: string,
  source: string,
) {
  manifestFor(manifests, key).unresolvedSources.add(source);
}

function legacySignedAmount(
  payload: Record<string, unknown>,
  amount: bigint,
) {
  const direction = stringValue(payload.direction);
  const eventType = stringValue(payload.eventType);
  return direction === "expense" ||
    eventType === "refunded" ||
    eventType === "applied" ||
    eventType === "retained"
    ? -amount
    : amount;
}

function legacyEconomicClass(
  payload: Record<string, unknown>,
  sourceType: string,
) {
  const economicArea = stringValue(payload.economicArea);
  if (economicArea === "owner_contribution") return "owner_contribution";
  if (economicArea === "owner_payout") return "owner_distribution";
  if (economicArea === "management_fee") return "management_fee";
  if (economicArea === "security_deposit") return "deposit_custody";
  if (sourceType === "receipt_allocation") return "operating_income";
  if (sourceType === "payment_allocation") return "property_expense";
  return economicArea;
}

export function compareWatermarks(
  before: FinanceInventoryWatermark,
  after: FinanceInventoryWatermark,
) {
  if (before.hash !== after.hash || before.rowCount !== after.rowCount) {
    return {
      stale: true,
      reason: "Finance inventory sources changed during analysis.",
    };
  }

  return { stale: false, reason: null };
}

function withoutProposal(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(
        ([key]) =>
          key !== "proposedClassification" &&
          key !== "proposedResolutionClass",
      )
      .toSorted(([first], [second]) => first.localeCompare(second)),
  );
}

function proposalFromPayload(payload: Record<string, unknown>) {
  const nested = recordValue(payload.proposedClassification);
  const proposalClass =
    stringValue(nested?.class) ??
    stringValue(payload.proposedResolutionClass) ??
    "ambiguous_requires_resolution";

  if (!proposalClasses.has(proposalClass)) {
    throw new Error(`Unsupported finance inventory proposal class: ${proposalClass}`);
  }

  return {
    class: proposalClass,
    nonAuthoritative: true,
  };
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .toSorted(([first], [second]) => first.localeCompare(second))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }
  return value;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function moneyValue(value: unknown): bigint | null {
  return typeof value === "string" ? parseMoneyToMinor(value) : null;
}

function addTotal(totals: Map<string, bigint>, key: string, amount: bigint) {
  totals.set(key, (totals.get(key) ?? BigInt(0)) + amount);
}

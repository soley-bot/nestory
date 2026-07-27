export const financeInventoryContractVersion = "finance_inventory_v1";

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
  rowCount: number;
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

export function parseMoneyToMinor(value: string): bigint {
  const input = value.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(input);
  if (!match) {
    throw new Error(`Expected exact decimal money with at most two places: ${value}`);
  }

  const [, sign, whole, fraction = ""] = match;
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return sign === "-" ? -minor : minor;
}

export function formatMoneyFromMinor(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
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
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1");
  const hasUserInfo = url.username.length > 0 || url.password.length > 0;

  if (
    !isLoopback ||
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
  repositorySha,
  scope,
  sourceRows,
  watermark,
}: {
  accessRows: FinanceInventoryPageRow[];
  diagnosticRows: FinanceInventoryPageRow[];
  migrationIdentity: string;
  repositorySha: string;
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
    proposedClassification: {
      disclaimer:
        "Diagnostic recommendation only. This does not establish current financial authority or authorize a write, repair, backfill, exclusion, or cutover.",
      rows: proposedRows,
    },
    provenance: {
      migrationIdentity,
      repositorySha,
    },
    sourceWatermark: watermark,
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
  const includedSources: string[] = [];
  const excludedSources: string[] = [];
  let proposedAmount = 0n;

  for (const candidate of sourceRows.toSorted((first, second) =>
    first.stable_key.localeCompare(second.stable_key),
  )) {
    const sourceType = stringValue(candidate.payload.sourceType);
    const amount = moneyValue(candidate.payload.amount);
    if (!sourceType || amount === null) continue;

    const direction = stringValue(candidate.payload.direction);
    const economicArea = stringValue(candidate.payload.economicArea);
    const eventType = stringValue(candidate.payload.eventType);
    const signedAmount =
      direction === "expense" ||
      eventType === "refunded" ||
      eventType === "applied" ||
      eventType === "retained"
        ? -amount
        : amount;

    if (sourceType === "receipt_allocation") {
      addTotal(totals, "operatingCashFromReceiptAllocations", signedAmount);
    } else if (sourceType === "income_obligation") {
      addTotal(totals, "tenantCharges", amount);
      const outstanding = moneyValue(candidate.payload.outstandingAmount);
      if (outstanding !== null) addTotal(totals, "tenantOutstandingBalance", outstanding);
    } else if (sourceType === "payment_allocation") {
      addTotal(totals, "propertyExpensesFromPaymentAllocations", -signedAmount);
    } else if (sourceType === "maintenance_task") {
      addTotal(totals, "maintenanceEffects", amount);
    } else if (sourceType === "petty_cash_entry") {
      addTotal(totals, "pettyCashEffects", amount);
    } else if (sourceType === "deposit_event") {
      addTotal(totals, "securityDepositCustody", signedAmount);
    } else if (sourceType === "ledger_entry") {
      addTotal(
        totals,
        direction === "expense" ? "ledgerExpense" : "ledgerIncome",
        amount,
      );
    } else if (sourceType === "journal_line") {
      const debit = moneyValue(candidate.payload.debitAmount);
      const credit = moneyValue(candidate.payload.creditAmount);
      if (debit !== null) addTotal(totals, "journalDebitControl", debit);
      if (credit !== null) addTotal(totals, "journalCreditControl", credit);
    }

    if (economicArea === "management_fee") {
      addTotal(totals, "managementFeeEffects", signedAmount);
    } else if (economicArea === "owner_contribution") {
      addTotal(totals, "ownerContributions", amount);
    } else if (economicArea === "owner_payout") {
      addTotal(totals, "ownerPayouts", amount);
    }

    if (
      sourceType === "receipt_allocation" ||
      sourceType === "payment_allocation" ||
      sourceType === "deposit_event"
    ) {
      includedSources.push(candidate.stable_key);
      proposedAmount += signedAmount;
    } else if (sourceType === "ledger_entry" || sourceType === "journal_line") {
      excludedSources.push(candidate.stable_key);
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

  const grossEntries = [
    "operatingCashFromReceiptAllocations",
    "tenantCharges",
    "tenantOutstandingBalance",
    "propertyExpensesFromPaymentAllocations",
    "maintenanceEffects",
    "pettyCashEffects",
    "securityDepositCustody",
    "managementFeeEffects",
    "ownerContributions",
    "ownerPayouts",
    "ledgerIncome",
    "ledgerExpense",
    "journalDebitControl",
    "journalCreditControl",
  ].map((key) => [key, formatMoneyFromMinor(totals.get(key) ?? 0n)]);

  return {
    currentGrossTotals: Object.fromEntries(grossEntries),
    currency: scope.currency,
    proposedDeduplicated: {
      amount: formatMoneyFromMinor(proposedAmount),
      confidence:
        issueCounts.Critical > 0 || issueCounts.High > 0 ? "unresolved" : "bounded",
      excludedSources: excludedSources.toSorted(),
      includedSources: includedSources.toSorted(),
      label: "non_authoritative_proposed_deduplicated_total",
    },
    unresolvedIssueCounts: issueCounts,
  };
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
  totals.set(key, (totals.get(key) ?? 0n) + amount);
}

import type { TimelineEventType } from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import {
  convertMoney,
  formatMoney,
  formatMoneyDisplay,
  normalizeCurrencyDisplaySettings,
  type CurrencyCode,
  type CurrencyDisplaySettings,
} from "@/lib/money/format";
import { formatMoneyTotals, formatMoneyTotalsDisplay } from "@/lib/money/totals";
import type {
  UnitBadgeTone,
  UnitDetailHrefs,
  UnitDocumentContext,
  UnitDetail,
  UnitFinancialSummary,
  UnitHealthIndicator,
  UnitLedgerContext,
  UnitLeaseSummary,
  UnitPersonLink,
  UnitRepairAction,
  UnitRecordCounts,
  UnitStatusValue,
  UnitSummary,
  UnitTimelineContext,
} from "@/features/units/unit.types";

export type UnitRecord = {
  archived_at: string | null;
  current_rent_amount: number | null;
  current_rent_currency: CurrencyCode | null;
  floor: string | null;
  id: string;
  property_id: string;
  size_sqm: number | null;
  status: string;
  unit_number: string;
};

export type UnitPropertyRecord = {
  code: string;
  id: string;
  name: string;
};

export type UnitLeaseRecord = {
  id: string;
  lease_end_date: string;
  lease_start_date: string;
  monthly_rent_amount: number;
  monthly_rent_currency: CurrencyCode;
  primary_tenant_person_id?: string | null;
  status: string;
  tenant_name: string;
  unit_id: string | null;
};

export type UnitLedgerRecord = {
  amount: number | null;
  category?: string | null;
  currency: CurrencyCode | null;
  direction: string | null;
  id?: string;
  transaction_date?: string;
  unit_id: string | null;
};

export type RecentUnitLedgerRecord = UnitLedgerRecord & {
  category: string;
  description: string | null;
  id: string;
  transaction_date: string;
};

export type UnitTimelineRecord = {
  cost_amount?: number | null;
  cost_currency?: CurrencyCode | null;
  description?: string | null;
  event_date: string;
  event_type: TimelineEventType;
  id: string;
  ledger_entry_id?: string | null;
  lease_id?: string | null;
  title: string;
  unit_id: string | null;
};

export type UnitPersonRecord = {
  display_name: string;
  id: string;
  primary_email: string | null;
  primary_phone: string | null;
};

export type UnitDocumentRecord = {
  category: string;
  file_name: string;
  id: string;
  lease_id: string | null;
  ledger_entry_id: string | null;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  timeline_event_id: string | null;
  uploaded_at: string;
  url?: string;
};

export const ACTIVE_UNIT_LEASE_STATUSES = ["active", "notice_given"] as const;

const activeLeaseStatuses = new Set<string>(ACTIVE_UNIT_LEASE_STATUSES);

export function buildUnitSummary({
  activeLease,
  currencySettings,
  latestTimelineEvent,
  ledgerEntries,
  property,
  unit,
}: {
  activeLease?: UnitLeaseRecord;
  currencySettings?: Partial<CurrencyDisplaySettings> | null;
  latestTimelineEvent?: UnitTimelineRecord;
  ledgerEntries: UnitLedgerRecord[];
  property?: UnitPropertyRecord;
  unit: UnitRecord;
}): UnitSummary {
  const statusValue = normalizeUnitStatus(unit.status);

  return {
    formValues: {
      currentRentAmount: unit.current_rent_amount,
      currentRentCurrency: unit.current_rent_currency,
      floor: unit.floor,
      propertyId: unit.property_id,
      sizeSqm: unit.size_sqm,
      status: normalizeFormValue(unit.status),
      unitNumber: unit.unit_number,
    },
    floorLabel: unit.floor ?? "Not set",
    hasActiveLease: Boolean(activeLease),
    id: unit.id,
    isArchived: Boolean(unit.archived_at),
    ledgerNetUsd: calculateLedgerNetUsd(ledgerEntries, currencySettings),
    ledgerNetDisplay: formatMoneyTotalsDisplay(ledgerEntries, currencySettings),
    ledgerNetLabel: formatMoneyTotals(ledgerEntries),
    latestTimelineEvent: latestTimelineEvent
      ? toTimelineContext(latestTimelineEvent)
      : undefined,
    leaseLabel: activeLease
      ? `${activeLease.tenant_name} / ${formatLeaseStatus(activeLease.status)}`
      : "No active lease",
    propertyCode: property?.code ?? "Unknown",
    propertyId: unit.property_id,
    propertyName: property?.name ?? "Unknown property",
    rentUsd: calculateRentUsd(unit, activeLease, currencySettings),
    rentDisplay: formatUnitRentDisplay(unit, activeLease, currencySettings),
    rentLabel: formatUnitRent(unit, activeLease),
    statusValue,
    statusLabel: formatUnitStatus(unit.status),
    statusTone: getUnitStatusTone(unit.status),
    unitNumber: unit.unit_number,
  };
}

export function buildUnitDetail({
  activeLease,
  counts,
  currencySettings,
  currentDate,
  documents,
  ledgerEntries,
  people,
  property,
  recentLedgerEntries,
  recentTimelineEvents,
  unit,
}: {
  activeLease?: UnitLeaseRecord;
  counts: UnitRecordCounts;
  currencySettings?: Partial<CurrencyDisplaySettings> | null;
  currentDate?: Date;
  documents: UnitDocumentRecord[];
  ledgerEntries: UnitLedgerRecord[];
  people: UnitPersonRecord[];
  property?: UnitPropertyRecord;
  recentLedgerEntries: RecentUnitLedgerRecord[];
  recentTimelineEvents: UnitTimelineRecord[];
  unit: UnitRecord;
}): UnitDetail {
  const summary = buildUnitSummary({
    activeLease,
    currencySettings,
    latestTimelineEvent: recentTimelineEvents[0],
    ledgerEntries,
    property,
    unit,
  });
  const tenantLinks = people.map(toPersonLink);
  const hrefs = buildUnitDetailHrefs({
    activeLease,
    tenantLinks,
    unit,
  });
  const financialSummary = buildUnitFinancialSummary({
    currencySettings,
    currentDate,
    ledgerEntries,
  });
  const repairAction = buildUnitRepairAction({
    hrefs,
    recentTimelineEvents,
    statusValue: summary.statusValue,
    unitId: unit.id,
    unitNumber: unit.unit_number,
  });

  return {
    ...summary,
    activeLease: activeLease
      ? toLeaseSummary(activeLease, currencySettings)
      : undefined,
    counts,
    documents: documents.map(toDocumentContext),
    financialSummary,
    healthIndicators: buildUnitHealthIndicators({
      activeLease,
      counts,
      financialSummary,
      rentUsd: summary.rentUsd,
      statusValue: summary.statusValue,
      tenantLinks,
    }),
    hrefs,
    repairAction,
    recentLedgerEntries: recentLedgerEntries.map((entry) =>
      toLedgerContext(entry, currencySettings),
    ),
    recentTimelineEvents: recentTimelineEvents.map((event) =>
      toTimelineContext(event, currencySettings),
    ),
    sizeLabel:
      unit.size_sqm === null
        ? "No size recorded"
        : `${formatNumber(unit.size_sqm)} sqm`,
    tenantLinks,
  };
}

export function selectCurrentLease(rows: UnitLeaseRecord[]) {
  return rows
    .filter((lease) => isActiveUnitLeaseStatus(lease.status))
    .toSorted((first, second) =>
      second.lease_start_date.localeCompare(first.lease_start_date),
    )[0];
}

export function isActiveUnitLeaseStatus(status: string) {
  return activeLeaseStatuses.has(normalizeFormValue(status));
}

export function formatUnitStatus(status: string) {
  return formatStoredLabel(status);
}

export function formatLeaseStatus(status: string) {
  return formatStoredLabel(status);
}

export function getUnitStatusTone(status: string): UnitBadgeTone {
  const normalized = normalizeStoredValue(status);

  if (normalized === "occupied") {
    return "success";
  }

  if (normalized === "reserved" || normalized === "maintenance") {
    return "warning";
  }

  if (normalized === "archived" || normalized === "inactive") {
    return "danger";
  }

  if (normalized === "vacant") {
    return "neutral";
  }

  return "accent";
}

function toLeaseSummary(
  lease: UnitLeaseRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
): UnitLeaseSummary {
  return {
    endDate: lease.lease_end_date,
    id: lease.id,
    monthlyRentDisplay: formatMoneyDisplay(
      lease.monthly_rent_amount,
      lease.monthly_rent_currency,
      currencySettings,
    ),
    monthlyRentLabel: formatMoney(
      lease.monthly_rent_amount,
      lease.monthly_rent_currency,
    ),
    personId: lease.primary_tenant_person_id ?? undefined,
    startDate: lease.lease_start_date,
    statusLabel: formatLeaseStatus(lease.status),
    tenantName: lease.tenant_name,
  };
}

function toTimelineContext(
  event: UnitTimelineRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
): UnitTimelineContext {
  const hasCost = event.cost_amount !== null && event.cost_amount !== undefined;
  const currency = event.cost_currency ?? undefined;

  return {
    costDisplay:
      hasCost && currency
        ? formatMoneyDisplay(event.cost_amount ?? 0, currency, currencySettings)
        : undefined,
    costLabel:
      hasCost && currency
        ? formatMoney(event.cost_amount ?? 0, currency)
        : undefined,
    description: event.description ?? "",
    eventDate: event.event_date,
    eventType: event.event_type,
    id: event.id,
    ledgerEntryId: event.ledger_entry_id ?? undefined,
    leaseId: event.lease_id ?? undefined,
    title: event.title,
    unitId: event.unit_id ?? undefined,
  };
}

function toLedgerContext(
  entry: RecentUnitLedgerRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
): UnitLedgerContext {
  const direction = entry.direction === "expense" ? "expense" : "income";
  const amount = entry.amount ?? 0;
  const signedAmount = direction === "expense" ? -amount : amount;
  const currency = entry.currency ?? "USD";

  return {
    amount,
    amountDisplay: formatMoneyDisplay(signedAmount, currency, currencySettings),
    amountLabel: `${direction === "expense" ? "-" : ""}${formatMoney(amount, currency)}`,
    category: entry.category,
    currency,
    description: entry.description ?? "",
    direction,
    id: entry.id,
    transactionDate: entry.transaction_date,
  };
}

function toPersonLink(person: UnitPersonRecord): UnitPersonLink {
  return {
    contactLabel: [person.primary_email, person.primary_phone]
      .filter(Boolean)
      .join(" / ") || "No contact recorded",
    displayName: person.display_name,
    href: buildHref("/people", {
      archiveState: "all",
      personId: person.id,
    }),
    id: person.id,
    roleLabel: "Tenant",
  };
}

function toDocumentContext(document: UnitDocumentRecord): UnitDocumentContext {
  return {
    category: document.category,
    fileName: document.file_name,
    id: document.id,
    linkedRecordHref: getDocumentLinkedRecordHref(document),
    linkedRecordLabel: getDocumentLinkedRecordLabel(document),
    mimeType: document.mime_type,
    sizeBytes: document.size_bytes,
    uploadedAt: document.uploaded_at,
    url: document.url,
  };
}

function getDocumentLinkedRecordLabel(document: UnitDocumentRecord) {
  if (document.ledger_entry_id) {
    return "Ledger entry";
  }

  if (document.timeline_event_id) {
    return "Timeline event";
  }

  if (document.lease_id) {
    return "Lease";
  }

  return "Unit evidence";
}

function getDocumentLinkedRecordHref(document: UnitDocumentRecord) {
  if (document.ledger_entry_id) {
    return buildHref("/ledger", {
      archiveState: "all",
      entryId: document.ledger_entry_id,
    });
  }

  if (document.timeline_event_id) {
    return buildHref("/timeline", {
      archiveState: "all",
      eventId: document.timeline_event_id,
    });
  }

  if (document.lease_id) {
    return buildHref("/leases", {
      archiveState: "all",
      leaseId: document.lease_id,
    });
  }

  return undefined;
}

export function buildUnitFinancialSummary({
  currencySettings,
  currentDate = new Date(),
  ledgerEntries,
}: {
  currencySettings?: Partial<CurrencyDisplaySettings> | null;
  currentDate?: Date;
  ledgerEntries: UnitLedgerRecord[];
}): UnitFinancialSummary {
  const periodStart = getTrailingTwelveMonthStart(currentDate);
  const periodEntries = ledgerEntries.filter(
    (entry) => !entry.transaction_date || entry.transaction_date >= periodStart,
  );
  const incomeEntries = periodEntries.filter((entry) => entry.direction !== "expense");
  const expenseEntries = periodEntries.filter(
    (entry) => entry.direction === "expense",
  );
  const rentRevenueEntries = incomeEntries.filter((entry) =>
    isRentRevenueCategory(entry.category ?? ""),
  );
  const maintenanceExpenseEntries = expenseEntries.filter((entry) =>
    isMaintenanceExpenseCategory(entry.category ?? ""),
  );
  const incomeUsd = sumLedgerUsd(incomeEntries, currencySettings);
  const expenseUsd = sumLedgerUsd(expenseEntries, currencySettings);
  const rentRevenueUsd = sumLedgerUsd(rentRevenueEntries, currencySettings);
  const maintenanceExpenseUsd = sumLedgerUsd(
    maintenanceExpenseEntries,
    currencySettings,
  );
  const noiUsd = incomeUsd - expenseUsd;

  return {
    expenseDisplay: formatPositiveLedgerDisplay(expenseEntries, currencySettings),
    expenseUsd,
    incomeDisplay: formatPositiveLedgerDisplay(incomeEntries, currencySettings),
    incomeUsd,
    maintenanceExpenseDisplay: formatPositiveLedgerDisplay(
      maintenanceExpenseEntries,
      currencySettings,
    ),
    maintenanceExpenseUsd,
    maintenanceRatioLabel:
      expenseUsd > 0
        ? `${formatPercent(maintenanceExpenseUsd / expenseUsd)} of expenses`
        : "No expenses",
    marginLabel:
      incomeUsd > 0 ? `${formatPercent(noiUsd / incomeUsd)} NOI margin` : "No income",
    noiDisplay: formatMoneyDisplay(noiUsd, "USD", currencySettings),
    noiUsd,
    periodLabel: "Trailing 12 months",
    rentRevenueDisplay: formatPositiveLedgerDisplay(
      rentRevenueEntries,
      currencySettings,
    ),
    rentRevenueUsd,
  };
}

function buildUnitHealthIndicators({
  activeLease,
  counts,
  financialSummary,
  rentUsd,
  statusValue,
  tenantLinks,
}: {
  activeLease?: UnitLeaseRecord;
  counts: UnitRecordCounts;
  financialSummary: UnitFinancialSummary;
  rentUsd: number;
  statusValue: UnitStatusValue;
  tenantLinks: UnitPersonLink[];
}): UnitHealthIndicator[] {
  const indicators: UnitHealthIndicator[] = [];

  if (activeLease && statusValue === "occupied") {
    indicators.push({
      description: "The unit is marked occupied and has a current lease.",
      id: "occupancy",
      label: "Occupancy aligned",
      tone: "success",
    });
  } else if (activeLease) {
    indicators.push({
      description: "A current lease exists, but the unit status is not occupied.",
      id: "occupancy",
      label: "Status needs review",
      tone: "warning",
    });
  } else if (statusValue === "occupied") {
    indicators.push({
      description: "The unit is marked occupied, but no active lease is linked.",
      id: "occupancy",
      label: "Lease missing",
      tone: "danger",
    });
  } else {
    indicators.push({
      description: "No active lease is linked to this unit.",
      id: "occupancy",
      label: "Vacancy or setup needed",
      tone: "warning",
    });
  }

  if (activeLease && tenantLinks.length > 0) {
    indicators.push({
      description: "The lease tenant is backed by a People record.",
      id: "tenant",
      label: "Tenant linked",
      tone: "success",
    });
  } else if (activeLease) {
    indicators.push({
      description: "The active lease still needs a durable tenant/person link.",
      id: "tenant",
      label: "Tenant link missing",
      tone: "warning",
    });
  }

  if (rentUsd <= 0) {
    indicators.push({
      description: "No current rent amount is available for unit performance.",
      id: "rent",
      label: "Rent missing",
      tone: "danger",
    });
  } else {
    indicators.push({
      description: "Current rent is available for lease and revenue review.",
      id: "rent",
      label: "Rent recorded",
      tone: "success",
    });
  }

  if (financialSummary.incomeUsd <= 0) {
    indicators.push({
      description: "No unit-scoped income appears in the trailing 12-month ledger.",
      id: "noi",
      label: "No recent income",
      tone: "warning",
    });
  } else if (financialSummary.noiUsd < 0) {
    indicators.push({
      description: "Unit-scoped expenses exceed income in the trailing 12-month ledger.",
      id: "noi",
      label: "Negative NOI",
      tone: "danger",
    });
  } else {
    indicators.push({
      description: "Unit-scoped income covers recorded expenses in the trailing 12 months.",
      id: "noi",
      label: "NOI positive",
      tone: "success",
    });
  }

  indicators.push({
    description:
      counts.documents > 0
        ? "Documents or receipts are attached to this unit record."
        : "No unit-scoped documents or receipts are attached yet.",
    id: "evidence",
    label: counts.documents > 0 ? "Evidence attached" : "Evidence missing",
    tone: counts.documents > 0 ? "success" : "warning",
  });

  return indicators;
}

function buildUnitRepairAction({
  hrefs,
  recentTimelineEvents,
  statusValue,
  unitId,
  unitNumber,
}: {
  hrefs: UnitDetailHrefs;
  recentTimelineEvents: UnitTimelineRecord[];
  statusValue: UnitStatusValue;
  unitId: string;
  unitNumber: string;
}): UnitRepairAction {
  const latestRepairEvent = recentTimelineEvents.find((event) =>
    isRepairEventType(event.event_type),
  );

  if (statusValue === "maintenance") {
    return {
      description: `Unit ${unitNumber} is marked maintenance. Log the next repair, inspection, or completion note.`,
      href: hrefs.addTimelineEvent,
      label: "Log repair follow-up",
      tone: "warning",
    };
  }

  if (latestRepairEvent) {
    return {
      description: `${formatDate(latestRepairEvent.event_date)} - ${latestRepairEvent.title}`,
      href: buildHref("/timeline", {
        eventId: latestRepairEvent.id,
        unitId,
      }),
      label: "Review latest repair",
      tone: "neutral",
    };
  }

  return {
    description: "No repair or maintenance event is visible for this unit yet.",
    href: hrefs.addTimelineEvent,
    label: "Log repair event",
    tone: "accent",
  };
}

export function buildUnitDetailHrefs({
  activeLease,
  tenantLinks,
  unit,
}: {
  activeLease?: Pick<UnitLeaseRecord, "id">;
  tenantLinks?: UnitPersonLink[];
  unit: Pick<UnitRecord, "id" | "property_id" | "unit_number">;
}): UnitDetailHrefs {
  return {
    addLease: buildHref("/leases", {
      action: "create",
      propertyId: unit.property_id,
      source: "vacancy",
      unitId: unit.id,
    }),
    addLedgerEntry: buildHref("/ledger", {
      action: "create",
      propertyId: unit.property_id,
      query: unit.unit_number,
    }),
    addTimelineEvent: buildHref("/timeline", {
      action: "create",
      propertyId: unit.property_id,
      unitId: unit.id,
    }),
    documents: "/documents",
    ledger: buildHref("/ledger", {
      propertyId: unit.property_id,
      query: unit.unit_number,
    }),
    lease: activeLease
      ? buildHref("/leases", {
          archiveState: "all",
          leaseId: activeLease.id,
        })
      : undefined,
    leases: buildHref("/leases", {
      propertyId: unit.property_id,
      query: unit.unit_number,
    }),
    property: `/properties/${unit.property_id}`,
    repairAction: buildHref("/timeline", {
      action: "create",
      propertyId: unit.property_id,
      unitId: unit.id,
    }),
    tenantPerson: tenantLinks?.[0]?.href,
    timeline: buildHref("/timeline", {
      propertyId: unit.property_id,
      unitId: unit.id,
    }),
  };
}

function formatUnitRent(unit: UnitRecord, activeLease?: UnitLeaseRecord) {
  if (unit.current_rent_amount !== null && unit.current_rent_currency) {
    return formatMoney(unit.current_rent_amount, unit.current_rent_currency);
  }

  if (activeLease) {
    return formatMoney(
      activeLease.monthly_rent_amount,
      activeLease.monthly_rent_currency,
    );
  }

  return "No rent recorded";
}

function formatUnitRentDisplay(
  unit: UnitRecord,
  activeLease?: UnitLeaseRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  if (unit.current_rent_amount !== null && unit.current_rent_currency) {
    return formatMoneyDisplay(
      unit.current_rent_amount,
      unit.current_rent_currency,
      currencySettings,
    );
  }

  if (activeLease) {
    return formatMoneyDisplay(
      activeLease.monthly_rent_amount,
      activeLease.monthly_rent_currency,
      currencySettings,
    );
  }

  return undefined;
}

function calculateRentUsd(
  unit: UnitRecord,
  activeLease?: UnitLeaseRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  if (unit.current_rent_amount !== null && unit.current_rent_currency) {
    return toUsd(unit.current_rent_amount, unit.current_rent_currency, currencySettings);
  }

  if (activeLease) {
    return toUsd(
      activeLease.monthly_rent_amount,
      activeLease.monthly_rent_currency,
      currencySettings,
    );
  }

  return 0;
}

function calculateLedgerNetUsd(
  entries: UnitLedgerRecord[],
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  return entries.reduce((total, entry) => {
    if (entry.amount === null || !entry.currency) {
      return total;
    }

    const amount = toUsd(entry.amount, entry.currency, currencySettings);
    return total + (entry.direction === "expense" ? -amount : amount);
  }, 0);
}

function sumLedgerUsd(
  entries: UnitLedgerRecord[],
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  return entries.reduce((total, entry) => {
    if (entry.amount === null || !entry.currency) {
      return total;
    }

    return total + toUsd(entry.amount, entry.currency, currencySettings);
  }, 0);
}

function formatPositiveLedgerDisplay(
  entries: UnitLedgerRecord[],
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  return formatMoneyTotalsDisplay(
    entries.map((entry) => ({
      amount: entry.amount,
      currency: entry.currency,
      direction: "income",
    })),
    currencySettings,
  );
}

function isRentRevenueCategory(category: string) {
  const normalized = category.toLowerCase();

  return normalized.includes("rent") || normalized.includes("lease");
}

function isMaintenanceExpenseCategory(category: string) {
  const normalized = category.toLowerCase();

  return (
    normalized.includes("maintenance") ||
    normalized.includes("repair") ||
    normalized.includes("renovation") ||
    normalized.includes("service")
  );
}

function isRepairEventType(eventType: TimelineEventType) {
  return (
    eventType === "Maintenance" ||
    eventType === "Repair" ||
    eventType === "Renovation"
  );
}

function getTrailingTwelveMonthStart(currentDate: Date) {
  const start = new Date(
    Date.UTC(
      currentDate.getUTCFullYear() - 1,
      currentDate.getUTCMonth(),
      currentDate.getUTCDate(),
    ),
  );

  return start.toISOString().slice(0, 10);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${Math.round(value * 100)}%`;
}

function buildHref(
  pathname: string,
  params: Record<string, string | undefined>,
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

function toUsd(
  amount: number,
  currency: CurrencyCode,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  return convertMoney(
    amount,
    currency,
    "USD",
    normalizeCurrencyDisplaySettings(currencySettings).khrPerUsd,
  );
}

function normalizeUnitStatus(status: string): UnitStatusValue {
  const normalized = normalizeFormValue(status);

  if (
    normalized === "occupied" ||
    normalized === "reserved" ||
    normalized === "maintenance" ||
    normalized === "inactive"
  ) {
    return normalized;
  }

  return "vacant";
}

function formatStoredLabel(value: string) {
  const normalized = normalizeStoredValue(value);

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeStoredValue(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function normalizeFormValue(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatUnitTimelineContext(event: UnitTimelineContext) {
  return `${formatDate(event.eventDate)} - ${event.eventType}`;
}

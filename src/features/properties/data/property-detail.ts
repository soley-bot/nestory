import type { RecentChange } from "@/features/activity/activity.types";
import type { LinkedDocument } from "@/features/documents/document.types";
import {
  buildPropertySummary,
  type PropertyLedgerRecord,
  type PropertyRecord,
} from "@/features/properties/data/property-summary";
import type { PropertyBadgeTone } from "@/features/properties/property.types";
import type { TimelineEventType } from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import {
  convertMoney,
  formatMoney,
  formatMoneyDisplay,
  normalizeCurrencyDisplaySettings,
  type CurrencyCode,
  type CurrencyDisplaySettings,
  type MoneyDisplayValue,
} from "@/lib/money/format";
import { formatMoneyTotalsDisplay } from "@/lib/money/totals";

export type PropertyDetailUnitRecord = {
  archived_at: string | null;
  current_rent_amount: number | null;
  current_rent_currency: CurrencyCode | null;
  floor: string | null;
  id: string;
  status: string;
  unit_number: string;
};

export type PropertyDetailLeaseRecord = {
  archived_at?: string | null;
  id: string;
  lease_end_date: string;
  lease_start_date: string;
  monthly_rent_amount: number;
  monthly_rent_currency: CurrencyCode;
  status: string;
  tenant_name: string;
  unit_id: string | null;
};

export type PropertyDetailLedgerRecord = PropertyLedgerRecord & {
  category: string;
  description: string | null;
  id: string;
  transaction_date: string;
  unit_id: string | null;
};

export type PropertyDetailTimelineRecord = {
  cost_amount: number | null;
  cost_currency: CurrencyCode | null;
  description: string | null;
  event_date: string;
  event_type: TimelineEventType;
  id: string;
  lease_id: string | null;
  ledger_entry_id: string | null;
  title: string;
  unit_id: string | null;
};

export type PropertyDetailDocumentRecord = {
  category: string;
  file_name: string;
  id: string;
  lease_id: string | null;
  ledger_entry_id: string | null;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  timeline_event_id: string | null;
  unit_id: string | null;
  uploaded_at: string;
  url?: string;
};

export type PropertyOwnerHistoryRecord = {
  archived_at: string | null;
  ended_on: string | null;
  id: string;
  is_primary: boolean;
  ownership_label: string | null;
  person_id: string;
  person_name: string;
  started_on: string | null;
};

export type PropertyDetailUnit = {
  archivedAt: string | null;
  currentRent: string;
  currentRentDisplay?: MoneyDisplayValue;
  floor: string;
  id: string;
  isArchived: boolean;
  status: string;
  unitNumber: string;
};

export type PropertyDetailLease = {
  href: string;
  id: string;
  rentDisplay: MoneyDisplayValue;
  rentLabel: string;
  statusLabel: string;
  tenantName: string;
  termLabel: string;
  unitHref?: string;
  unitLabel: string;
};

export type PropertyLedgerContext = {
  amountDisplay: MoneyDisplayValue;
  amountLabel: string;
  category: string;
  description: string;
  direction: "income" | "expense";
  href: string;
  id: string;
  transactionDate: string;
  unitHref?: string;
  unitLabel: string;
};

export type PropertyTimelineContext = {
  costDisplay?: MoneyDisplayValue;
  description: string;
  eventDate: string;
  eventType: TimelineEventType;
  href: string;
  id: string;
  title: string;
  unitHref?: string;
  unitLabel: string;
};

export type PropertyDocumentContext = LinkedDocument & {
  linkedRecordHref?: string;
  linkedRecordLabel: string;
};

export type PropertyOwnerHistory = {
  href: string;
  id: string;
  isActive: boolean;
  isArchived: boolean;
  label: string;
  ownershipLabel: string;
  periodLabel: string;
};

export type PropertyDetailCounts = {
  activeLeases: number;
  documents: number;
  ledgerEntries: number;
  timelineEvents: number;
};

export type PropertyDetailHrefs = {
  addLedgerEntry: string;
  addLease: string;
  addTimelineEvent: string;
  addUnit: string;
  documents: string;
  ledger: string;
  leases: string;
  ownerPerson?: string;
  propertiesList: string;
  reports: string;
  timeline: string;
  units: string;
};

export type PropertyFinancialSummary = {
  expenseDisplay: MoneyDisplayValue;
  expenseUsd: number;
  incomeDisplay: MoneyDisplayValue;
  incomeUsd: number;
  maintenanceExpenseDisplay: MoneyDisplayValue;
  maintenanceExpenseUsd: number;
  marginLabel: string;
  noiDisplay: MoneyDisplayValue;
  noiUsd: number;
  periodLabel: string;
};

export type PropertyHealthIndicator = {
  description: string;
  id: string;
  label: string;
  tone: PropertyBadgeTone;
};

export type PropertyNextAction = {
  description: string;
  href: string;
  label: string;
  tone: PropertyBadgeTone;
};

export type PropertyDetail = ReturnType<typeof buildPropertySummary> & {
  activeLeases: PropertyDetailLease[];
  activeUnitCount: number;
  activity: RecentChange[];
  archivedUnitCount: number;
  counts: PropertyDetailCounts;
  documents: PropertyDocumentContext[];
  financialSummary: PropertyFinancialSummary;
  healthIndicators: PropertyHealthIndicator[];
  hrefs: PropertyDetailHrefs;
  nextAction: PropertyNextAction;
  notesLabel: string;
  ownerHistory: PropertyOwnerHistory[];
  recentLedgerEntries: PropertyLedgerContext[];
  recentTimelineEvents: PropertyTimelineContext[];
  totalUnitCount: number;
  unitSummary: string;
  unitsList: PropertyDetailUnit[];
};

export function buildPropertyDetail({
  activeLeases = [],
  activeOwner,
  activity = [],
  currencySettings,
  documents = [],
  ledgerEntries,
  ownerHistory = [],
  property,
  recentLedgerEntries = [],
  recentTimelineEvents = [],
  recordCounts = {},
  units,
}: {
  activeLeases?: PropertyDetailLeaseRecord[];
  activeOwner?: { label: string; personId: string } | null;
  activity?: RecentChange[];
  currencySettings?: Partial<CurrencyDisplaySettings> | null;
  documents?: PropertyDetailDocumentRecord[];
  ledgerEntries: PropertyDetailLedgerRecord[];
  ownerHistory?: PropertyOwnerHistoryRecord[];
  property: PropertyRecord;
  recentLedgerEntries?: PropertyDetailLedgerRecord[];
  recentTimelineEvents?: PropertyDetailTimelineRecord[];
  recordCounts?: Partial<PropertyDetailCounts>;
  units: PropertyDetailUnitRecord[];
}): PropertyDetail {
  const activeUnits = units.filter((unit) => !unit.archived_at);
  const unitsById = indexById(units);
  const summary = buildPropertySummary({
    activeOwner,
    currencySettings,
    hasActiveOwnerLink: Boolean(activeOwner),
    ledgerEntries,
    property,
    units: activeUnits,
  });
  const hrefs = buildPropertyDetailHrefs({
    activeOwner,
    propertyId: property.id,
  });
  const financialSummary = buildPropertyFinancialSummary({
    currencySettings,
    ledgerEntries,
  });
  const counts = {
    activeLeases: recordCounts.activeLeases ?? activeLeases.length,
    documents: recordCounts.documents ?? documents.length,
    ledgerEntries: recordCounts.ledgerEntries ?? ledgerEntries.length,
    timelineEvents: recordCounts.timelineEvents ?? recentTimelineEvents.length,
  };

  return {
    ...summary,
    activeLeases: activeLeases.map((lease) =>
      toLeaseContext(lease, unitsById, currencySettings),
    ),
    activeUnitCount: activeUnits.length,
    activity,
    archivedUnitCount: units.length - activeUnits.length,
    counts,
    documents: documents.map(toDocumentContext),
    financialSummary,
    healthIndicators: buildPropertyHealthIndicators({
      activeLeases,
      activeUnitCount: activeUnits.length,
      counts,
      financialSummary,
      hasActiveOwnerLink: Boolean(activeOwner),
      occupiedUnitCount: summary.occupiedUnits,
    }),
    hrefs,
    nextAction: buildPropertyNextAction({
      activeLeases,
      activeUnitCount: activeUnits.length,
      counts,
      financialSummary,
      hasActiveOwnerLink: Boolean(activeOwner),
      hrefs,
    }),
    notesLabel: property.notes?.trim() || "No operating notes recorded",
    ownerHistory: ownerHistory.map(toOwnerHistory),
    recentLedgerEntries: recentLedgerEntries.map((entry) =>
      toLedgerContext(entry, unitsById, currencySettings),
    ),
    recentTimelineEvents: recentTimelineEvents.map((event) =>
      toTimelineContext(event, unitsById, currencySettings),
    ),
    totalUnitCount: units.length,
    unitSummary: formatUnitSummary({
      activeUnitCount: activeUnits.length,
      archivedUnitCount: units.length - activeUnits.length,
      occupiedUnitCount: summary.occupiedUnits,
    }),
    unitsList: units.map((unit) => formatUnit(unit, currencySettings)),
  };
}

export function buildPropertyDetailHrefs({
  activeOwner,
  propertyId,
}: {
  activeOwner?: { personId: string } | null;
  propertyId: string;
}): PropertyDetailHrefs {
  return {
    addLedgerEntry: buildHref("/ledger", {
      action: "create",
      propertyId,
    }),
    addLease: buildHref("/leases", {
      action: "create",
      propertyId,
    }),
    addTimelineEvent: buildHref("/timeline", {
      action: "create",
      propertyId,
    }),
    addUnit: buildHref("/units", {
      action: "create",
      propertyId,
    }),
    documents: "/documents",
    ledger: buildHref("/ledger", {
      archiveState: "all",
      propertyId,
    }),
    leases: buildHref("/leases", {
      archiveState: "all",
      propertyId,
    }),
    ownerPerson: activeOwner?.personId
      ? buildHref("/people", {
          archiveState: "all",
          personId: activeOwner.personId,
        })
      : undefined,
    propertiesList: buildHref("/properties", {
      archiveState: "all",
      propertyId,
    }),
    reports: buildHref("/reports", {
      propertyId,
    }),
    timeline: buildHref("/timeline", {
      archiveState: "all",
      propertyId,
    }),
    units: buildHref("/units", {
      archiveState: "all",
      propertyId,
    }),
  };
}

function formatUnit(
  unit: PropertyDetailUnitRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
): PropertyDetailUnit {
  return {
    archivedAt: unit.archived_at,
    currentRent: formatCurrentRent(unit),
    currentRentDisplay: formatCurrentRentDisplay(unit, currencySettings),
    floor: unit.floor?.trim() || "Not set",
    id: unit.id,
    isArchived: Boolean(unit.archived_at),
    status: formatStatusLabel(unit.status),
    unitNumber: unit.unit_number,
  };
}

function formatCurrentRent(unit: PropertyDetailUnitRecord) {
  if (unit.current_rent_amount === null || !unit.current_rent_currency) {
    return "No rent set";
  }

  return formatMoney(Number(unit.current_rent_amount), unit.current_rent_currency);
}

function formatCurrentRentDisplay(
  unit: PropertyDetailUnitRecord,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  if (unit.current_rent_amount === null || !unit.current_rent_currency) {
    return undefined;
  }

  return formatMoneyDisplay(
    Number(unit.current_rent_amount),
    unit.current_rent_currency,
    currencySettings,
  );
}

function buildPropertyFinancialSummary({
  currencySettings,
  currentDate = new Date(),
  ledgerEntries,
}: {
  currencySettings?: Partial<CurrencyDisplaySettings> | null;
  currentDate?: Date;
  ledgerEntries: PropertyDetailLedgerRecord[];
}): PropertyFinancialSummary {
  const periodStart = getTrailingTwelveMonthStart(currentDate);
  const periodEntries = ledgerEntries.filter(
    (entry) => entry.transaction_date >= periodStart,
  );
  const incomeEntries = periodEntries.filter((entry) => entry.direction !== "expense");
  const expenseEntries = periodEntries.filter(
    (entry) => entry.direction === "expense",
  );
  const maintenanceExpenseEntries = expenseEntries.filter((entry) =>
    isMaintenanceExpenseCategory(entry.category),
  );
  const incomeUsd = sumLedgerUsd(incomeEntries, currencySettings);
  const expenseUsd = sumLedgerUsd(expenseEntries, currencySettings);
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
    marginLabel:
      incomeUsd > 0 ? `${formatPercent(noiUsd / incomeUsd)} NOI margin` : "No income",
    noiDisplay: formatMoneyDisplay(noiUsd, "USD", currencySettings),
    noiUsd,
    periodLabel: "Trailing 12 months",
  };
}

function toLeaseContext(
  lease: PropertyDetailLeaseRecord,
  unitsById: Map<string, PropertyDetailUnitRecord>,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
): PropertyDetailLease {
  const unit = lease.unit_id ? unitsById.get(lease.unit_id) : undefined;

  return {
    href: buildHref("/leases", {
      archiveState: "all",
      leaseId: lease.id,
      query: lease.tenant_name,
    }),
    id: lease.id,
    rentDisplay: formatMoneyDisplay(
      lease.monthly_rent_amount,
      lease.monthly_rent_currency,
      currencySettings,
    ),
    rentLabel: formatMoney(lease.monthly_rent_amount, lease.monthly_rent_currency),
    statusLabel: formatStatusLabel(lease.status),
    tenantName: lease.tenant_name,
    termLabel: `${formatDate(lease.lease_start_date)} - ${formatDate(
      lease.lease_end_date,
    )}`,
    unitHref: lease.unit_id ? `/units/${lease.unit_id}` : undefined,
    unitLabel: unit ? `Unit ${unit.unit_number}` : "Property-level lease",
  };
}

function toLedgerContext(
  entry: PropertyDetailLedgerRecord,
  unitsById: Map<string, PropertyDetailUnitRecord>,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
): PropertyLedgerContext {
  const direction = entry.direction === "expense" ? "expense" : "income";
  const amount = entry.amount ?? 0;
  const currency = entry.currency ?? "USD";
  const signedAmount = direction === "expense" ? -amount : amount;
  const unit = entry.unit_id ? unitsById.get(entry.unit_id) : undefined;

  return {
    amountDisplay: formatMoneyDisplay(signedAmount, currency, currencySettings),
    amountLabel: `${direction === "expense" ? "-" : ""}${formatMoney(
      amount,
      currency,
    )}`,
    category: entry.category,
    description: entry.description ?? "",
    direction,
    href: buildHref("/ledger", {
      archiveState: "all",
      entryId: entry.id,
    }),
    id: entry.id,
    transactionDate: entry.transaction_date,
    unitHref: entry.unit_id ? `/units/${entry.unit_id}` : undefined,
    unitLabel: unit ? `Unit ${unit.unit_number}` : "Property level",
  };
}

function toTimelineContext(
  event: PropertyDetailTimelineRecord,
  unitsById: Map<string, PropertyDetailUnitRecord>,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
): PropertyTimelineContext {
  const unit = event.unit_id ? unitsById.get(event.unit_id) : undefined;
  const hasCost = event.cost_amount !== null && event.cost_currency !== null;

  return {
    costDisplay: hasCost
      ? formatMoneyDisplay(
          event.cost_amount ?? 0,
          event.cost_currency ?? "USD",
          currencySettings,
        )
      : undefined,
    description: event.description ?? "",
    eventDate: event.event_date,
    eventType: event.event_type,
    href: buildHref("/timeline", {
      archiveState: "all",
      eventId: event.id,
    }),
    id: event.id,
    title: event.title,
    unitHref: event.unit_id ? `/units/${event.unit_id}` : undefined,
    unitLabel: unit ? `Unit ${unit.unit_number}` : "Property level",
  };
}

function toDocumentContext(
  document: PropertyDetailDocumentRecord,
): PropertyDocumentContext {
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

function toOwnerHistory(owner: PropertyOwnerHistoryRecord): PropertyOwnerHistory {
  const isActive = !owner.archived_at && !owner.ended_on;

  return {
    href: buildHref("/people", {
      archiveState: "all",
      personId: owner.person_id,
    }),
    id: owner.id,
    isActive,
    isArchived: Boolean(owner.archived_at),
    label: owner.person_name,
    ownershipLabel:
      owner.ownership_label ?? (owner.is_primary ? "Primary" : "Owner"),
    periodLabel: formatOwnerPeriod(owner),
  };
}

function buildPropertyHealthIndicators({
  activeLeases,
  activeUnitCount,
  counts,
  financialSummary,
  hasActiveOwnerLink,
  occupiedUnitCount,
}: {
  activeLeases: PropertyDetailLeaseRecord[];
  activeUnitCount: number;
  counts: PropertyDetailCounts;
  financialSummary: PropertyFinancialSummary;
  hasActiveOwnerLink: boolean;
  occupiedUnitCount: number;
}): PropertyHealthIndicator[] {
  const indicators: PropertyHealthIndicator[] = [];

  indicators.push({
    description: hasActiveOwnerLink
      ? "A current owner/person link is available for reports and follow-up."
      : "No active owner/person link is set for this property.",
    id: "owner",
    label: hasActiveOwnerLink ? "Owner linked" : "Owner missing",
    tone: hasActiveOwnerLink ? "success" : "danger",
  });

  if (activeUnitCount === 0) {
    indicators.push({
      description: "No active units are attached to this property yet.",
      id: "units",
      label: "No active units",
      tone: "warning",
    });
  } else if (occupiedUnitCount < activeUnitCount) {
    indicators.push({
      description: `${occupiedUnitCount} of ${activeUnitCount} active units are occupied.`,
      id: "occupancy",
      label: "Vacancy review",
      tone: "warning",
    });
  } else {
    indicators.push({
      description: "All active units are marked occupied.",
      id: "occupancy",
      label: "Occupancy aligned",
      tone: "success",
    });
  }

  if (activeUnitCount > 0 && activeLeases.length === 0) {
    indicators.push({
      description: "No current active lease is linked under this property.",
      id: "leases",
      label: "Lease coverage missing",
      tone: "warning",
    });
  } else if (activeLeases.length > 0) {
    indicators.push({
      description: `${activeLeases.length} active lease ${
        activeLeases.length === 1 ? "record is" : "records are"
      } connected.`,
      id: "leases",
      label: "Lease coverage",
      tone: "success",
    });
  }

  if (financialSummary.incomeUsd <= 0) {
    indicators.push({
      description: "No property-level income appears in the trailing 12-month ledger.",
      id: "noi",
      label: "No recent income",
      tone: "warning",
    });
  } else if (financialSummary.noiUsd < 0) {
    indicators.push({
      description: "Property expenses exceed income in the trailing 12-month ledger.",
      id: "noi",
      label: "Negative NOI",
      tone: "danger",
    });
  } else {
    indicators.push({
      description: "Property income covers recorded expenses in the trailing 12 months.",
      id: "noi",
      label: "NOI positive",
      tone: "success",
    });
  }

  indicators.push({
    description:
      counts.documents > 0
        ? "Evidence or supporting documents are attached."
        : "No property evidence or supporting documents are attached yet.",
    id: "evidence",
    label: counts.documents > 0 ? "Evidence attached" : "Evidence missing",
    tone: counts.documents > 0 ? "success" : "warning",
  });

  return indicators;
}

function buildPropertyNextAction({
  activeLeases,
  activeUnitCount,
  counts,
  financialSummary,
  hasActiveOwnerLink,
  hrefs,
}: {
  activeLeases: PropertyDetailLeaseRecord[];
  activeUnitCount: number;
  counts: PropertyDetailCounts;
  financialSummary: PropertyFinancialSummary;
  hasActiveOwnerLink: boolean;
  hrefs: PropertyDetailHrefs;
}): PropertyNextAction {
  if (!hasActiveOwnerLink) {
    return {
      description: "Assign a current owner/person link before relying on owner reports.",
      href: hrefs.propertiesList,
      label: "Assign owner",
      tone: "danger",
    };
  }

  if (activeUnitCount === 0) {
    return {
      description: "Create the first unit so leases, ledger rows, and evidence can drill down.",
      href: hrefs.addUnit,
      label: "Add first unit",
      tone: "warning",
    };
  }

  if (activeLeases.length === 0) {
    return {
      description: "Create or review leases so occupancy and rent roll are connected.",
      href: hrefs.addLease,
      label: "Add lease",
      tone: "warning",
    };
  }

  if (financialSummary.noiUsd < 0) {
    return {
      description: "Review income and expense rows because trailing NOI is negative.",
      href: hrefs.ledger,
      label: "Review ledger",
      tone: "danger",
    };
  }

  if (counts.documents === 0) {
    return {
      description: "Attach ownership, lease, receipt, or inspection evidence to the record.",
      href: hrefs.documents,
      label: "Attach evidence",
      tone: "warning",
    };
  }

  return {
    description: "The core record is connected. Review timeline history or add the next event.",
    href: hrefs.addTimelineEvent,
    label: "Log next event",
    tone: "accent",
  };
}

function formatPositiveLedgerDisplay(
  entries: PropertyDetailLedgerRecord[],
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

function sumLedgerUsd(
  entries: PropertyDetailLedgerRecord[],
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  const settings = normalizeCurrencyDisplaySettings(currencySettings);

  return entries.reduce((total, entry) => {
    if (entry.amount === null || !entry.currency) {
      return total;
    }

    return total + convertMoney(entry.amount, entry.currency, "USD", settings.khrPerUsd);
  }, 0);
}

function getDocumentLinkedRecordLabel(document: PropertyDetailDocumentRecord) {
  if (document.ledger_entry_id) {
    return "Ledger entry";
  }

  if (document.timeline_event_id) {
    return "Timeline event";
  }

  if (document.lease_id) {
    return "Lease";
  }

  if (document.unit_id) {
    return "Unit evidence";
  }

  return "Property evidence";
}

function getDocumentLinkedRecordHref(document: PropertyDetailDocumentRecord) {
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

  if (document.unit_id) {
    return `/units/${document.unit_id}`;
  }

  return undefined;
}

function formatOwnerPeriod(owner: PropertyOwnerHistoryRecord) {
  const start = owner.started_on ? formatDate(owner.started_on) : "Start not set";
  const end = owner.ended_on ? formatDate(owner.ended_on) : "Current";

  return `${start} - ${end}`;
}

function formatUnitSummary({
  activeUnitCount,
  archivedUnitCount,
  occupiedUnitCount,
}: {
  activeUnitCount: number;
  archivedUnitCount: number;
  occupiedUnitCount: number;
}) {
  if (activeUnitCount === 0 && archivedUnitCount === 0) {
    return "Property-only";
  }

  const activeSummary =
    activeUnitCount === 0
      ? "No active units"
      : `${occupiedUnitCount}/${activeUnitCount} occupied`;

  if (archivedUnitCount === 0) {
    return activeSummary;
  }

  return `${activeSummary}, ${archivedUnitCount} archived`;
}

function formatStatusLabel(status: string) {
  return status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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

function isMaintenanceExpenseCategory(category: string) {
  const normalized = category.toLowerCase();

  return (
    normalized.includes("maintenance") ||
    normalized.includes("repair") ||
    normalized.includes("renovation") ||
    normalized.includes("service")
  );
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${Math.round(value * 100)}%`;
}

function buildHref(pathname: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

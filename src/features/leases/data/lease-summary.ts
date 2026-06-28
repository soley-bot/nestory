import { formatDate } from "@/lib/dates/format";
import {
  convertMoney,
  formatMoney,
  formatMoneyDisplay,
  normalizeCurrencyDisplaySettings,
  type CurrencyDisplaySettings,
} from "@/lib/money/format";
import type { Database } from "@/types/database";
import type {
  LeaseBadgeTone,
  LeaseDepositContext,
  LeaseDetailHrefs,
  LeaseDocumentContext,
  LeaseFormValues,
  LeaseLinkedPerson,
  LeaseNextAction,
  LeaseOccupancyContext,
  LeaseRecordCounts,
  LeaseRiskIndicator,
  LeaseStatusValue,
  LeaseSummary,
  LeaseTermContext,
  LeaseTimelineContext,
} from "@/features/leases/lease.types";
import type { RecentChange } from "@/features/activity/activity.types";

export type LeaseRow = Pick<
  Database["public"]["Tables"]["leases"]["Row"],
  | "archived_at"
  | "deposit_amount"
  | "deposit_currency"
  | "id"
  | "lease_end_date"
  | "lease_start_date"
  | "monthly_rent_amount"
  | "monthly_rent_currency"
  | "property_id"
  | "status"
  | "tenant_name"
  | "unit_id"
>;

export type LeasePropertyRow = Pick<
  Database["public"]["Tables"]["properties"]["Row"],
  "code" | "id" | "name"
>;

export type LeaseUnitRow = Pick<
  Database["public"]["Tables"]["units"]["Row"],
  "floor" | "id" | "property_id" | "status" | "unit_number"
>;

export type LeasePartyRow = {
  archived_at: string | null;
  ended_on: string | null;
  id: string;
  is_primary: boolean;
  lease_id: string;
  party_role: string;
  person_id: string;
  person_name?: string;
  primary_email?: string | null;
  primary_phone?: string | null;
};

export type LeaseTermRow = {
  archived_at: string | null;
  end_date: string;
  id: string;
  lease_id: string;
  rent_amount: number;
  rent_currency: LeaseRow["monthly_rent_currency"];
  status: string;
  term_sequence: number;
  start_date: string;
};

export type LeaseOccupancyRow = {
  actual_move_in_date: string | null;
  actual_move_out_date: string | null;
  archived_at: string | null;
  id: string;
  lease_id: string;
  scheduled_move_in_date: string | null;
  scheduled_move_out_date: string | null;
  status: string;
  unit_id: string | null;
};

export type LeaseDepositRow = {
  amount: number;
  archived_at: string | null;
  currency: LeaseRow["monthly_rent_currency"];
  deposit_type: string;
  id: string;
  lease_id: string;
  status: string;
};

export type LeaseDocumentRow = {
  category: string;
  file_name: string;
  id: string;
  lease_id: string | null;
  mime_type: string;
  size_bytes: number;
  storage_path?: string;
  uploaded_at: string;
  url?: string;
};

export type LeaseTimelineRow = {
  event_date: string;
  event_type: string;
  id: string;
  lease_id: string | null;
  title: string;
};

type BuildLeaseSummaryInput = {
  activity?: RecentChange[];
  currencySettings?: Partial<CurrencyDisplaySettings> | null;
  documents?: LeaseDocumentRow[];
  ledgerEntryCount?: number;
  lease: LeaseRow;
  occupancies?: LeaseOccupancyRow[];
  parties?: LeasePartyRow[];
  property?: LeasePropertyRow;
  terms?: LeaseTermRow[];
  deposits?: LeaseDepositRow[];
  timelineEvents?: LeaseTimelineRow[];
  unit?: LeaseUnitRow;
};

export function buildLeaseSummary({
  activity = [],
  currencySettings,
  documents = [],
  ledgerEntryCount = 0,
  lease,
  occupancies = [],
  parties = [],
  property,
  terms = [],
  deposits = [],
  timelineEvents = [],
  unit,
}: BuildLeaseSummaryInput): LeaseSummary {
  const settings = normalizeCurrencyDisplaySettings(currencySettings);
  const statusValue = normalizeLeaseStatus(lease.status);
  const statusLabel = formatLeaseStatus(statusValue);
  const propertyCode = property?.code ?? "No code";
  const propertyName = property?.name ?? "Property not found";
  const unitLabel = unit
    ? `Unit ${unit.unit_number}${unit.floor ? ` / Floor ${unit.floor}` : ""}`
    : "No unit assigned";
  const rentAmount = Number(lease.monthly_rent_amount);
  const rentCurrency = lease.monthly_rent_currency;
  const rentUsd = convertMoney(
    rentAmount,
    rentCurrency,
    "USD",
    settings.khrPerUsd,
  );
  const depositAmount =
    lease.deposit_amount === null ? null : Number(lease.deposit_amount);
  const depositCurrency = lease.deposit_currency ?? rentCurrency;
  const hasDeposit = depositAmount !== null;
  const formValues: LeaseFormValues = {
    depositAmount,
    depositCurrency: lease.deposit_currency,
    leaseEndDate: lease.lease_end_date,
    leaseStartDate: lease.lease_start_date,
    monthlyRentAmount: rentAmount,
    monthlyRentCurrency: rentCurrency,
    propertyId: lease.property_id,
    status: statusValue,
    tenantName: lease.tenant_name,
    unitId: lease.unit_id,
  };
  const hrefs = buildLeaseDetailHrefs(lease);
  const activeParties = parties.filter(
    (party) => !party.archived_at && !party.ended_on,
  );
  const activeDocuments = documents;
  const activeTimelineEvents = timelineEvents;
  const recordCounts = {
    documents: activeDocuments.length,
    ledgerEntries: ledgerEntryCount,
    parties: activeParties.length,
    timelineEvents: activeTimelineEvents.length,
  };
  const endRisk = getLeaseEndRisk(lease.lease_end_date);

  return {
    activity,
    depositDisplay: hasDeposit
      ? formatMoneyDisplay(depositAmount, depositCurrency, settings)
      : undefined,
    depositLabel: hasDeposit
      ? formatMoney(depositAmount, depositCurrency)
      : "No deposit recorded",
    deposits: deposits.filter((deposit) => !deposit.archived_at).map((deposit) =>
      toDepositContext(deposit, settings),
    ),
    documents: activeDocuments.map(toDocumentContext),
    endDateLabel: formatDate(lease.lease_end_date),
    formValues,
    hrefs,
    id: lease.id,
    isArchived: Boolean(lease.archived_at),
    leaseLabel: `${lease.tenant_name} / ${statusLabel}`,
    nextAction: buildLeaseNextAction({
      endRisk,
      hasUnit: Boolean(lease.unit_id),
      hrefs,
      recordCounts,
      statusValue,
    }),
    occupancies: occupancies
      .filter((occupancy) => !occupancy.archived_at)
      .map((occupancy) => toOccupancyContext(occupancy, unit)),
    occupancyLabel: getOccupancyLabel(statusValue, unit),
    parties: activeParties.map(toPartyContext),
    partySummary: formatPartySummary(activeParties, lease.tenant_name),
    propertyCode,
    propertyId: lease.property_id,
    propertyName,
    recordCounts,
    rentDisplay: formatMoneyDisplay(rentAmount, rentCurrency, settings),
    rentLabel: formatMoney(rentAmount, rentCurrency),
    rentUsd,
    riskIndicators: buildLeaseRiskIndicators({
      endRisk,
      hasDeposit,
      hasDocuments: recordCounts.documents > 0,
      hasParties: activeParties.length > 0,
      hasUnit: Boolean(lease.unit_id),
      statusValue,
    }),
    startDateLabel: formatDate(lease.lease_start_date),
    statusLabel,
    statusTone: getLeaseStatusTone(statusValue),
    statusValue,
    tenantName: lease.tenant_name,
    termLabel: `${formatDate(lease.lease_start_date)} - ${formatDate(
      lease.lease_end_date,
    )}`,
    terms: terms.filter((term) => !term.archived_at).map((term) =>
      toTermContext(term, settings),
    ),
    timeline: activeTimelineEvents.map(toTimelineContext),
    unitId: lease.unit_id,
    unitLabel,
  };
}

export function buildLeaseDetailHrefs(
  lease: Pick<LeaseRow, "id" | "property_id" | "tenant_name" | "unit_id">,
): LeaseDetailHrefs {
  return {
    addLedgerEntry: buildHref("/ledger", {
      action: "create",
      propertyId: lease.property_id,
      unitId: lease.unit_id ?? undefined,
    }),
    addTimelineEvent: buildHref("/timeline", {
      action: "create",
      propertyId: lease.property_id,
      unitId: lease.unit_id ?? undefined,
    }),
    documents: buildHref("/documents", {
      query: lease.tenant_name,
    }),
    ledger: buildHref("/ledger", {
      propertyId: lease.property_id,
      query: lease.tenant_name,
      unitId: lease.unit_id ?? undefined,
    }),
    people: buildHref("/people", {
      archiveState: "all",
      query: lease.tenant_name,
    }),
    property: `/properties/${lease.property_id}`,
    timeline: buildHref("/timeline", {
      archiveState: "all",
      propertyId: lease.property_id,
      query: lease.tenant_name,
      unitId: lease.unit_id ?? undefined,
    }),
    unit: lease.unit_id ? `/units/${lease.unit_id}` : undefined,
  };
}

export function normalizeLeaseStatus(value: string): LeaseStatusValue {
  const normalized = value.trim().toLowerCase().replace(/[_\s-]+/g, "_");

  if (normalized === "current" || normalized === "occupied") {
    return "active";
  }

  if (normalized === "expired" || normalized === "inactive") {
    return "ended";
  }

  if (normalized === "notice") {
    return "notice_given";
  }

  if (normalized === "pending") {
    return "draft";
  }

  if (
    normalized === "active" ||
    normalized === "cancelled" ||
    normalized === "draft" ||
    normalized === "ended" ||
    normalized === "notice_given" ||
    normalized === "terminated"
  ) {
    return normalized;
  }

  return "active";
}

export function formatLeaseStatus(status: LeaseStatusValue) {
  if (status === "notice_given") {
    return "Notice";
  }

  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getLeaseStatusTone(status: LeaseStatusValue): LeaseBadgeTone {
  if (status === "active") {
    return "success";
  }

  if (status === "draft" || status === "notice_given") {
    return "warning";
  }

  if (status === "cancelled" || status === "terminated") {
    return "danger";
  }

  return "neutral";
}

function toPartyContext(party: LeasePartyRow): LeaseLinkedPerson {
  return {
    contactLabel: [party.primary_email, party.primary_phone].filter(Boolean).join(" / ") ||
      "No contact recorded",
    href: buildHref("/people", {
      archiveState: "all",
      personId: party.person_id,
    }),
    id: party.id,
    isPrimary: party.is_primary,
    label: party.person_name ?? "Linked person",
    roleLabel: formatStoredLabel(party.party_role),
  };
}

function toTermContext(
  term: LeaseTermRow,
  currencySettings: Partial<CurrencyDisplaySettings>,
): LeaseTermContext {
  return {
    datesLabel: `${formatDate(term.start_date)} - ${formatDate(term.end_date)}`,
    id: term.id,
    rentDisplay: formatMoneyDisplay(term.rent_amount, term.rent_currency, currencySettings),
    rentLabel: formatMoney(term.rent_amount, term.rent_currency),
    statusLabel: formatStoredLabel(term.status),
  };
}

function toOccupancyContext(
  occupancy: LeaseOccupancyRow,
  unit?: LeaseUnitRow,
): LeaseOccupancyContext {
  const start =
    occupancy.actual_move_in_date ??
    occupancy.scheduled_move_in_date ??
    "Move-in not set";
  const end = occupancy.actual_move_out_date ?? occupancy.scheduled_move_out_date;

  return {
    datesLabel: `${formatMaybeDate(start)} - ${end ? formatDate(end) : "Current"}`,
    id: occupancy.id,
    statusLabel: formatStoredLabel(occupancy.status),
    unitHref: occupancy.unit_id ? `/units/${occupancy.unit_id}` : undefined,
    unitLabel: unit ? `Unit ${unit.unit_number}` : "No unit assigned",
  };
}

function toDepositContext(
  deposit: LeaseDepositRow,
  currencySettings: Partial<CurrencyDisplaySettings>,
): LeaseDepositContext {
  return {
    amountDisplay: formatMoneyDisplay(deposit.amount, deposit.currency, currencySettings),
    amountLabel: formatMoney(deposit.amount, deposit.currency),
    id: deposit.id,
    statusLabel: formatStoredLabel(deposit.status),
    typeLabel: formatStoredLabel(deposit.deposit_type),
  };
}

function toDocumentContext(document: LeaseDocumentRow): LeaseDocumentContext {
  return {
    category: document.category,
    fileName: document.file_name,
    id: document.id,
    linkedRecordLabel: "Lease evidence",
    mimeType: document.mime_type,
    sizeBytes: document.size_bytes,
    uploadedAt: document.uploaded_at,
    url: document.url,
  };
}

function toTimelineContext(event: LeaseTimelineRow): LeaseTimelineContext {
  return {
    eventDateLabel: formatDate(event.event_date),
    href: buildHref("/timeline", {
      archiveState: "all",
      eventId: event.id,
    }),
    id: event.id,
    title: event.title,
    typeLabel: formatStoredLabel(event.event_type),
  };
}

function buildLeaseRiskIndicators({
  endRisk,
  hasDeposit,
  hasDocuments,
  hasParties,
  hasUnit,
  statusValue,
}: {
  endRisk: ReturnType<typeof getLeaseEndRisk>;
  hasDeposit: boolean;
  hasDocuments: boolean;
  hasParties: boolean;
  hasUnit: boolean;
  statusValue: LeaseStatusValue;
}): LeaseRiskIndicator[] {
  return [
    {
      description: hasParties
        ? "A durable People link is attached to this lease."
        : "This lease still relies on the tenant name without a People link.",
      id: "party",
      label: hasParties ? "Tenant linked" : "Tenant link missing",
      tone: hasParties ? "success" : "warning",
    },
    {
      description: hasUnit
        ? "The lease is attached to a unit operating record."
        : "No unit is assigned, so occupancy and unit reports are incomplete.",
      id: "unit",
      label: hasUnit ? "Unit linked" : "Unit missing",
      tone: hasUnit ? "success" : "danger",
    },
    {
      description: getEndRiskDescription(endRisk, statusValue),
      id: "end",
      label: endRisk.label,
      tone: endRisk.tone,
    },
    {
      description: hasDeposit
        ? "A deposit amount is available for this lease."
        : "No deposit amount is recorded.",
      id: "deposit",
      label: hasDeposit ? "Deposit recorded" : "Deposit missing",
      tone: hasDeposit ? "success" : "warning",
    },
    {
      description: hasDocuments
        ? "Lease evidence or supporting documents are attached."
        : "No lease evidence or supporting documents are attached yet.",
      id: "documents",
      label: hasDocuments ? "Evidence attached" : "Evidence missing",
      tone: hasDocuments ? "success" : "warning",
    },
  ];
}

function buildLeaseNextAction({
  endRisk,
  hasUnit,
  hrefs,
  recordCounts,
  statusValue,
}: {
  endRisk: ReturnType<typeof getLeaseEndRisk>;
  hasUnit: boolean;
  hrefs: LeaseDetailHrefs;
  recordCounts: LeaseRecordCounts;
  statusValue: LeaseStatusValue;
}): LeaseNextAction {
  if (!hasUnit) {
    return {
      description: "Assign this lease to a unit before relying on occupancy reports.",
      href: hrefs.unit ?? hrefs.property,
      label: "Assign unit",
      tone: "danger",
    };
  }

  if (statusValue === "notice_given" || endRisk.state === "soon") {
    return {
      description: "Review renewal, move-out, or notice follow-up before the term ends.",
      href: hrefs.timeline,
      label: "Review expiry",
      tone: "warning",
    };
  }

  if (recordCounts.documents === 0) {
    return {
      description: "Attach lease agreement, ID, deposit, or move-in evidence.",
      href: hrefs.documents,
      label: "Attach evidence",
      tone: "warning",
    };
  }

  if (recordCounts.timelineEvents === 0) {
    return {
      description: "Log move-in, renewal, rent-change, or follow-up history.",
      href: hrefs.addTimelineEvent,
      label: "Log event",
      tone: "accent",
    };
  }

  return {
    description: "Lease context is connected. Review ledger activity or add the next rent entry.",
    href: hrefs.ledger,
    label: "Review ledger",
    tone: "neutral",
  };
}

function getLeaseEndRisk(endDate: string) {
  const today = new Date().toISOString().slice(0, 10);
  const daysUntilEnd = Math.ceil(
    (new Date(`${endDate}T00:00:00.000Z`).getTime() -
      new Date(`${today}T00:00:00.000Z`).getTime()) /
      86_400_000,
  );

  if (daysUntilEnd < 0) {
    return {
      label: "Past end date",
      state: "past" as const,
      tone: "danger" as const,
    };
  }

  if (daysUntilEnd <= 60) {
    return {
      label: "Ends soon",
      state: "soon" as const,
      tone: "warning" as const,
    };
  }

  return {
    label: "Term runway",
    state: "healthy" as const,
    tone: "success" as const,
  };
}

function getEndRiskDescription(
  endRisk: ReturnType<typeof getLeaseEndRisk>,
  statusValue: LeaseStatusValue,
) {
  if (statusValue === "ended" || statusValue === "terminated" || statusValue === "cancelled") {
    return "This lease is historical and should stay available for audit/reporting.";
  }

  if (endRisk.state === "past") {
    return "The lease end date has passed while the record is not historical.";
  }

  if (endRisk.state === "soon") {
    return "The lease is inside the 60-day renewal or move-out window.";
  }

  return "The lease has more than 60 days before its end date.";
}

function formatPartySummary(parties: LeasePartyRow[], fallbackTenantName: string) {
  const primary = parties.find((party) => party.is_primary) ?? parties[0];

  return primary?.person_name ?? fallbackTenantName;
}

function formatMaybeDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value;
}

function formatStoredLabel(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildHref(pathname: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

function getOccupancyLabel(status: LeaseStatusValue, unit?: LeaseUnitRow) {
  if (!unit) {
    return "No unit assigned";
  }

  if (status === "active") {
    return "Occupying unit";
  }

  if (status === "notice_given") {
    return "Notice period";
  }

  if (status === "draft") {
    return "Scheduled";
  }

  return "Historical occupancy";
}

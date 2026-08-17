import { formatDate } from "@/lib/dates/format";
import {
  formatMoney,
  formatMoneyDisplay,
} from "@/lib/money/format";
import { buildHref } from "@/lib/url/href";
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
  LeaseRentReadiness,
  LeaseRiskIndicator,
  LeaseStatusValue,
  LeaseSummary,
  LeaseTermContext,
  LeaseTimelineContext,
} from "@/features/leases/lease.types";
import type { RecentChange } from "@/features/activity/activity.types";

type CurrentLeaseRow = Database["public"]["Views"]["current_leases"]["Row"];

export type LeaseRow = {
  archived_at: CurrentLeaseRow["archived_at"];
  deposit_amount: CurrentLeaseRow["deposit_amount"];
  deposit_currency: CurrentLeaseRow["deposit_currency"];
  id: string;
  lease_end_date: string;
  lease_start_date: string;
  monthly_rent_amount: number;
  monthly_rent_currency: NonNullable<
    CurrentLeaseRow["monthly_rent_currency"]
  >;
  primary_tenant_person_id: string;
  property_id: string;
  status: string;
  tenant_name: string;
  unit_id: string | null;
};

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
  rent_due_day?: number | null;
  payment_frequency?: string;
  status: string;
  term_sequence: number;
  start_date: string;
};

export type LeaseReadinessRow = {
  policy_id: string | null;
  reason_code: string;
  readiness_status: string;
  repair_context: Record<string, unknown> | null;
  term_id: string | null;
};

export type LeaseOccupancyRow = {
  actual_move_in_date: string | null;
  actual_move_in_confidence?: string;
  actual_move_in_kind?: string;
  actual_move_out_date: string | null;
  actual_move_out_confidence?: string;
  actual_move_out_kind?: string;
  archived_at: string | null;
  business_lifecycle?: string;
  evidence_state?: string;
  id: string;
  lease_id: string;
  participants?: Array<{
    business_lifecycle: string;
    evidence_state: string;
    id: string;
  }>;
  scheduled_move_in_date: string | null;
  scheduled_move_in_confidence?: string;
  scheduled_move_in_kind?: string;
  scheduled_move_out_date: string | null;
  scheduled_move_out_confidence?: string;
  scheduled_move_out_kind?: string;
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
  events?: Array<{ id: string; event_type: string; event_date: string; amount: number; currency: LeaseRow["monthly_rent_currency"]; reference: string | null; reversal_of_id: string | null }>;
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
  activationSchedule?: LeaseSummary["activationSchedule"];
  activity?: RecentChange[];
  documents?: LeaseDocumentRow[];
  ledgerEntryCount?: number;
  lease: LeaseRow;
  occupancies?: LeaseOccupancyRow[];
  parties?: LeasePartyRow[];
  property?: LeasePropertyRow;
  readiness?: LeaseReadinessRow | null;
  terms?: LeaseTermRow[];
  deposits?: LeaseDepositRow[];
  timelineEvents?: LeaseTimelineRow[];
  unit?: LeaseUnitRow;
};

export function buildLeaseSummary({
  activationSchedule,
  activity = [],
  documents = [],
  ledgerEntryCount = 0,
  lease,
  occupancies = [],
  parties = [],
  property,
  readiness,
  terms = [],
  deposits = [],
  timelineEvents = [],
  unit,
}: BuildLeaseSummaryInput): LeaseSummary {
  const statusValue = normalizeLeaseStatus(lease.status);
  const statusLabel = formatLeaseStatus(statusValue);
  const propertyCode = property?.code ?? "No code";
  const propertyName = property?.name ?? "Property not found";
  const unitLabel = unit
    ? `Unit ${unit.unit_number}${unit.floor ? ` / Floor ${unit.floor}` : ""}`
    : "No unit assigned";
  const resolvedTerm = readiness?.term_id
    ? (terms.find(
        (term) =>
          term.id === readiness.term_id && !term.archived_at,
      ) ?? null)
    : null;
  const formTerm =
    resolvedTerm ??
    terms.find(
      (term) => !term.archived_at && term.status === "active",
    ) ??
    terms.find(
      (term) => !term.archived_at && term.status === "upcoming",
    ) ??
    terms.find((term) => !term.archived_at && term.status !== "superseded") ??
    null;
  const rentAmount = Number(
    resolvedTerm?.rent_amount ?? lease.monthly_rent_amount,
  );
  const rentCurrency =
    resolvedTerm?.rent_currency ?? lease.monthly_rent_currency;
  const displayStartDate = resolvedTerm?.start_date ?? lease.lease_start_date;
  const displayEndDate = resolvedTerm?.end_date ?? lease.lease_end_date;
  const rentUsd = rentAmount;
  const depositAmount =
    lease.deposit_amount === null ? null : Number(lease.deposit_amount);
  const depositCurrency = lease.deposit_currency ?? rentCurrency;
  const hasDeposit = depositAmount !== null;
  const formValues: LeaseFormValues = {
    depositAmount,
    depositCurrency: lease.deposit_currency,
    leaseEndDate: formTerm?.end_date ?? lease.lease_end_date,
    leaseStartDate: formTerm?.start_date ?? lease.lease_start_date,
    monthlyRentAmount: formTerm
      ? Number(formTerm.rent_amount)
      : rentAmount,
    monthlyRentCurrency: formTerm?.rent_currency ?? rentCurrency,
    paymentFrequency:
      formTerm?.payment_frequency &&
      isLeasePaymentFrequency(formTerm.payment_frequency)
        ? formTerm.payment_frequency
        : null,
    propertyId: lease.property_id,
    rentDueDay: formTerm?.rent_due_day ?? null,
    status: statusValue,
    tenantPersonId: lease.primary_tenant_person_id ?? "",
    tenantName: lease.tenant_name,
    termStatus:
      formTerm && isLeaseTermStatus(formTerm.status)
        ? formTerm.status
        : null,
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
  const endRisk = getLeaseEndRisk(displayEndDate);

  return {
    activationSchedule,
    activity,
    depositDisplay: hasDeposit
      ? formatMoneyDisplay(depositAmount, depositCurrency)
      : undefined,
    depositLabel: hasDeposit
      ? formatMoney(depositAmount, depositCurrency)
      : "No deposit recorded",
    deposits: deposits.filter((deposit) => !deposit.archived_at).map((deposit) =>
      toDepositContext(deposit),
    ),
    documents: activeDocuments.map(toDocumentContext),
    endDateLabel: formatDate(displayEndDate),
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
      .map((occupancy) => toOccupancyContext(occupancy, unit))
      .sort(compareOccupancyEvidence),
    occupancyLabel: getOccupancyLabel(statusValue, unit),
    parties: activeParties.map(toPartyContext),
    partySummary: formatPartySummary(activeParties, lease.tenant_name),
    propertyCode,
    propertyId: lease.property_id,
    propertyName,
    recordCounts,
    rentDisplay: formatMoneyDisplay(rentAmount, rentCurrency),
    rentLabel: formatMoney(rentAmount, rentCurrency),
    rentReadiness: toRentReadiness(readiness),
    rentUsd,
    riskIndicators: buildLeaseRiskIndicators({
      endRisk,
      hasDeposit,
      hasDocuments: recordCounts.documents > 0,
      hasParties: activeParties.length > 0,
      hasUnit: Boolean(lease.unit_id),
      statusValue,
    }),
    startDateLabel: formatDate(displayStartDate),
    statusLabel,
    statusTone: getLeaseStatusTone(statusValue),
    statusValue,
    tenantName: lease.tenant_name,
    termLabel: `${formatDate(displayStartDate)} - ${formatDate(
      displayEndDate,
    )}`,
    terms: terms.filter((term) => !term.archived_at).map((term) =>
      toTermContext(term),
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
    addDocument: buildHref("/documents", {
      action: "create",
      category: "Lease",
      leaseId: lease.id,
      propertyId: lease.property_id,
      unitId: lease.unit_id ?? undefined,
    }),
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
      archiveState: "all",
      leaseId: lease.id,
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

function toTermContext(term: LeaseTermRow): LeaseTermContext {
  return {
    datesLabel: `${formatDate(term.start_date)} - ${formatDate(term.end_date)}`,
    dueLabel: term.rent_due_day
      ? `Day ${term.rent_due_day}`
      : "Due day missing",
    endDate: term.end_date,
    id: term.id,
    paymentFrequency:
      term.payment_frequency &&
      isLeasePaymentFrequency(term.payment_frequency)
        ? term.payment_frequency
        : null,
    paymentFrequencyLabel: term.payment_frequency
      ? formatStoredLabel(term.payment_frequency)
      : "Frequency missing",
    rentAmount: Number(term.rent_amount),
    rentCurrency: term.rent_currency,
    rentDueDay: term.rent_due_day ?? null,
    rentDisplay: formatMoneyDisplay(term.rent_amount, term.rent_currency),
    rentLabel: formatMoney(term.rent_amount, term.rent_currency),
    startDate: term.start_date,
    status: isLeaseTermContextStatus(term.status) ? term.status : "draft",
    statusLabel: formatStoredLabel(term.status),
  };
}

function toRentReadiness(
  readiness?: LeaseReadinessRow | null,
): LeaseRentReadiness {
  const status = readiness?.readiness_status ?? "unknown";
  const reasonCode = readiness?.reason_code ?? "readiness_not_checked";
  const labels: Record<string, string> = {
    blocked: "Rent blocked",
    missing_due_day: "Due day missing",
    policy_unapproved: "Policy unapproved",
    ready: "Rent ready",
    unknown: "Readiness not checked",
    term_conflict: "Term conflict",
    unsupported_frequency: "Frequency unsupported",
    inactive_lease: "Lease inactive",
  };
  const reasonLabels: Record<string, string> = {
    inactive_lease: "Lease inactive",
    missing_due_day: "Due day missing",
    no_authoritative_term: "Authoritative term missing",
    policy_not_effective: "Policy not effective",
    policy_unapproved: "Policy unapproved",
    scope_mismatch: "Lease scope mismatch",
    term_conflict: "Term conflict",
    unsupported_frequency: "Frequency unsupported",
  };
  const repairs: Record<string, string> = {
    missing_due_day: "Replace the term with an explicit due day.",
    no_authoritative_term: "Create an authoritative lease term.",
    policy_not_effective: "Create an effective rent-policy version.",
    policy_unapproved: "Complete and approve the rent policy.",
    ready: "Term and policy identities are resolved.",
    scope_mismatch: "Repair the lease, property, and unit scope.",
    term_conflict: "Resolve overlapping authoritative terms.",
    unsupported_frequency: "Approve the frequency or replace the term.",
    inactive_lease: "Restore the lease or close its active term.",
  };

  return {
    label:
      status === "unknown"
        ? labels.unknown
        : reasonLabels[reasonCode] ?? labels[status] ?? "Rent blocked",
    policyId: readiness?.policy_id ?? undefined,
    reasonCode,
    repairLabel: repairs[reasonCode] ?? "Review rent authority.",
    status,
    termId: readiness?.term_id ?? undefined,
    tone:
      status === "ready"
        ? "success"
        : status === "blocked" || status === "term_conflict"
          ? "danger"
          : status === "unknown"
            ? "neutral"
            : "warning",
  };
}

function isLeaseTermStatus(
  value: string,
): value is LeaseFormValues["termStatus"] & string {
  return (
    value === "active" ||
    value === "draft" ||
    value === "expired" ||
    value === "terminated" ||
    value === "upcoming"
  );
}

function isLeasePaymentFrequency(
  value: string,
): value is NonNullable<LeaseFormValues["paymentFrequency"]> {
  return (
    value === "annual" ||
    value === "monthly" ||
    value === "one_time" ||
    value === "quarterly" ||
    value === "semi_annual"
  );
}

function isLeaseTermContextStatus(
  value: string,
): value is LeaseTermContext["status"] {
  return isLeaseTermStatus(value) || value === "superseded";
}

function toOccupancyContext(
  occupancy: LeaseOccupancyRow,
  unit?: LeaseUnitRow,
): LeaseOccupancyContext {
  const actualLabel = formatOccupancyEvidenceRange({
    endDate: occupancy.actual_move_out_date,
    endKind: occupancy.actual_move_out_kind,
    startDate: occupancy.actual_move_in_date,
    startKind: occupancy.actual_move_in_kind,
  });
  const scheduledLabel = formatOccupancyEvidenceRange({
    endDate: occupancy.scheduled_move_out_date,
    endKind: occupancy.scheduled_move_out_kind,
    startDate: occupancy.scheduled_move_in_date,
    startKind: occupancy.scheduled_move_in_kind,
  });
  const hasConfirmedResident = occupancy.participants?.some(
    (participant) =>
      participant.evidence_state === "accepted" &&
      ["present", "ended"].includes(participant.business_lifecycle),
  );

  return {
    actualLabel,
    datesLabel: actualLabel,
    evidenceLabel: formatStoredLabel(occupancy.evidence_state ?? "unknown"),
    evidenceState: occupancy.evidence_state ?? "unknown",
    id: occupancy.id,
    residentLabel: hasConfirmedResident
      ? "Confirmed resident"
      : "Resident evidence missing",
    scheduledLabel,
    statusLabel: formatStoredLabel(occupancy.status),
    unitHref: occupancy.unit_id ? `/units/${occupancy.unit_id}` : undefined,
    unitLabel: unit ? `Unit ${unit.unit_number}` : "No unit assigned",
  };
}

function compareOccupancyEvidence(
  left: LeaseOccupancyContext,
  right: LeaseOccupancyContext,
) {
  const evidenceRank = (occupancy: LeaseOccupancyContext) =>
    occupancy.evidenceState === "accepted" ? 0 : 1;

  return evidenceRank(left) - evidenceRank(right);
}

function formatOccupancyEvidenceRange({
  endDate,
  endKind,
  startDate,
  startKind,
}: {
  endDate: string | null;
  endKind?: string;
  startDate: string | null;
  startKind?: string;
}) {
  if (startKind === "unknown" || !startDate) {
    return "Not recorded";
  }

  const endLabel =
    endKind === "open_current"
      ? "Current"
      : endDate
        ? formatDate(endDate)
        : "End not recorded";

  return `${formatDate(startDate)} - ${endLabel}`;
}

function toDepositContext(deposit: LeaseDepositRow): LeaseDepositContext {
  const reversedIds = new Set((deposit.events ?? []).filter((event) => event.reversal_of_id).map((event) => event.reversal_of_id!));
  const held = (deposit.events ?? []).filter((event) => !event.reversal_of_id && !reversedIds.has(event.id)).reduce((sum, event) => sum + (event.event_type === "received" ? Number(event.amount) : -Number(event.amount)), 0);
  return {
    amount: Number(deposit.amount),
    amountDisplay: formatMoneyDisplay(deposit.amount, deposit.currency),
    amountLabel: formatMoney(deposit.amount, deposit.currency),
    id: deposit.id,
    currency: deposit.currency,
    heldBalanceDisplay: formatMoneyDisplay(held, deposit.currency),
    events: (deposit.events ?? []).map((event) => ({ id: event.id, eventDate: event.event_date, eventType: event.event_type, amountDisplay: formatMoneyDisplay(event.amount, event.currency), reference: event.reference ?? "", reversible: !event.reversal_of_id && !reversedIds.has(event.id) })),
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
      href: hrefs.addDocument,
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

function formatStoredLabel(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

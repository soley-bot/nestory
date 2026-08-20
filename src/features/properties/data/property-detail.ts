import type { RecentChange } from "@/features/activity/activity.types";
import type { LinkedDocument } from "@/features/documents/document.types";
import type { AssetPhoto } from "@/features/photos/photo.types";
import {
  buildPropertySummary,
  type ActivePropertyOwnerLink,
  type PropertyLedgerRecord,
  type PropertyRecord,
} from "@/features/properties/data/property-summary";
import type { PropertyBadgeTone } from "@/features/properties/property.types";
import type { TimelineEventType } from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import {
  formatMoney,
  formatMoneyDisplay,
  type CurrencyCode,
  type MoneyDisplayValue,
} from "@/lib/money/format";
import { formatMoneyTotalsDisplay } from "@/lib/money/totals";
import { buildHref } from "@/lib/url/href";

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
  task_id?: string | null;
  timeline_event_id: string | null;
  unit_id: string | null;
  uploaded_at: string;
  url?: string;
};

export type PropertyDetailMaintenanceRecord = {
  actual_cost_amount: number | null;
  actual_cost_currency: CurrencyCode | null;
  category: string;
  due_date: string | null;
  due_time: string | null;
  id: string;
  priority: string;
  status: string;
  title: string;
  unit_id: string | null;
};

export type PropertyExpenseEvidenceRecord = {
  currency: CurrencyCode;
  customer_category: string;
  id: string;
  internal_cost_amount: number;
  source_id: string | null;
  source_type: string;
  status: string;
  supporting_document_id: string | null;
  vendor_label: string;
};

export type PropertyOwnerHistoryRecord = {
  archived_at: string | null;
  ended_on: string | null;
  id: string;
  is_primary: boolean;
  ownership_label: string | null;
  ownership_percent: number | null;
  person_id: string;
  person_name: string;
  started_on: string | null;
};

export type PropertyDetailUnit = {
  attention: string;
  archivedAt: string | null;
  currentRent: string;
  currentRentDisplay?: MoneyDisplayValue;
  floor: string;
  id: string;
  isArchived: boolean;
  leaseEndLabel: string;
  monthlyRent: string;
  monthlyRentDisplay?: MoneyDisplayValue;
  occupancy: string;
  status: string;
  tenantName?: string;
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

export type PropertyMaintenanceContext = {
  actualCostLabel: string;
  category: string;
  dueLabel: string;
  href: string;
  id: string;
  statusLabel: string;
  statusTone: PropertyBadgeTone;
  title: string;
  unitHref?: string;
  unitLabel: string;
};

export type PropertyDocumentContext = LinkedDocument & {
  linkedRecordHref?: string;
  linkedRecordLabel: string;
};

export type PropertyWorkflowEvidenceContext = LinkedDocument & {
  amountDisplay?: MoneyDisplayValue;
  amountLabel?: string;
  href?: string;
  sourceLabel: string;
  statusLabel?: string;
  statusTone: PropertyBadgeTone;
  vendorLabel?: string;
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
  maintenanceCases?: number;
  openMaintenanceCases?: number;
  overdueMaintenanceCases?: number;
  photos: number;
  timelineEvents: number;
};

export type PropertyDetailHrefs = {
  account: string;
  addDocument: string;
  addLedgerEntry: string;
  addLease: string;
  addMaintenanceCase: string;
  addTimelineEvent: string;
  addUnit: string;
  documents: string;
  ledger: string;
  leases: string;
  maintenance: string;
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
  intent?: "assign-owner";
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
  propertyDocuments: PropertyDocumentContext[];
  financialSummary: PropertyFinancialSummary;
  healthIndicators: PropertyHealthIndicator[];
  hrefs: PropertyDetailHrefs;
  monthlyRentDisplay: MoneyDisplayValue;
  nextAction: PropertyNextAction;
  notesLabel: string;
  ownerHistory: PropertyOwnerHistory[];
  photos: AssetPhoto[];
  propertyDraftLease?: PropertyDetailLease;
  recentLedgerEntries: PropertyLedgerContext[];
  recentMaintenanceCases: PropertyMaintenanceContext[];
  recentTimelineEvents: PropertyTimelineContext[];
  totalUnitCount: number;
  unitSummary: string;
  unitsList: PropertyDetailUnit[];
  workflowEvidence: PropertyWorkflowEvidenceContext[];
};

export function buildPropertyDetail({
  activeLeases = [],
  activeOwner,
  activity = [],
  documents = [],
  expenseEvidence = [],
  ledgerEntries,
  maintenanceCases = [],
  ownerHistory = [],
  photos = [],
  property,
  recentLedgerEntries = [],
  recentTimelineEvents = [],
  recordCounts = {},
  units,
}: {
  activeLeases?: PropertyDetailLeaseRecord[];
  activeOwner?: ActivePropertyOwnerLink | null;
  activity?: RecentChange[];
  documents?: PropertyDetailDocumentRecord[];
  expenseEvidence?: PropertyExpenseEvidenceRecord[];
  ledgerEntries: PropertyDetailLedgerRecord[];
  maintenanceCases?: PropertyDetailMaintenanceRecord[];
  ownerHistory?: PropertyOwnerHistoryRecord[];
  photos?: AssetPhoto[];
  property: PropertyRecord;
  recentLedgerEntries?: PropertyDetailLedgerRecord[];
  recentTimelineEvents?: PropertyDetailTimelineRecord[];
  recordCounts?: Partial<PropertyDetailCounts>;
  units: PropertyDetailUnitRecord[];
}): PropertyDetail {
  const currentLeases = activeLeases.filter(isCurrentPropertyLease);
  const propertyDraftLease =
    property.rental_structure === "single_space"
      ? activeLeases.find(
          (lease) =>
            !lease.archived_at &&
            !lease.unit_id &&
            lease.status.trim().toLowerCase() === "draft",
        )
      : undefined;
  const activeUnits = units.filter((unit) => !unit.archived_at);
  const unitsById = indexById(units);
  const activeLeaseByUnitId = new Map(
    currentLeases
      .filter((lease) => lease.unit_id)
      .map((lease) => [lease.unit_id as string, lease]),
  );
  const occupiedUnitCount = activeUnits.filter(
    (unit) =>
      activeLeaseByUnitId.has(unit.id) ||
      unit.status.trim().toLowerCase() === "occupied",
  ).length;
  const currentOwnerHistory = ownerHistory.find(
    (owner) => owner.is_primary && !owner.archived_at && !owner.ended_on,
  );
  const activeOwnerWithFacts = activeOwner
    ? {
        ...activeOwner,
        ownershipPercent:
          currentOwnerHistory?.person_id === activeOwner.personId &&
          typeof currentOwnerHistory.ownership_percent === "number"
            ? currentOwnerHistory.ownership_percent.toFixed(3)
            : activeOwner.ownershipPercent,
        startedOn:
          currentOwnerHistory?.person_id === activeOwner.personId
            ? currentOwnerHistory.started_on ?? activeOwner.startedOn
            : activeOwner.startedOn,
      }
    : activeOwner;
  const summary = buildPropertySummary({
    activeOwner: activeOwnerWithFacts,
    currentLeaseCount: currentLeases.length,
    currentLeaseUnitCount: activeLeaseByUnitId.size,
    hasActiveOwnerLink: Boolean(activeOwner),
    ledgerEntries,
    property,
    units: activeUnits,
  });
  const hrefs = buildPropertyDetailHrefs({
    activeOwner,
    propertyId: property.id,
  });
  const financialSummary = buildPropertyFinancialSummary({ ledgerEntries });
  const expenseEvidenceByDocumentId = new Map(
    expenseEvidence.flatMap((evidence) =>
      evidence.supporting_document_id
        ? [[evidence.supporting_document_id, evidence] as const]
        : [],
    ),
  );
  const maintenanceCasesById = indexById(maintenanceCases);
  const documentContexts = documents.map(toDocumentContext);
  const propertyDocuments = documentContexts.filter(
    (_, index) =>
      !isWorkflowDocument(documents[index], expenseEvidenceByDocumentId),
  );
  const workflowEvidence = documents.flatMap((document) => {
    const evidence = expenseEvidenceByDocumentId.get(document.id);

    return isWorkflowDocument(document, expenseEvidenceByDocumentId)
      ? [toWorkflowEvidenceContext(document, evidence, maintenanceCasesById)]
      : [];
  });
  const counts = {
    activeLeases: recordCounts.activeLeases ?? currentLeases.length,
    documents: recordCounts.documents ?? documents.length,
    ledgerEntries: recordCounts.ledgerEntries ?? ledgerEntries.length,
    maintenanceCases:
      recordCounts.maintenanceCases ?? maintenanceCases.length,
    openMaintenanceCases:
      recordCounts.openMaintenanceCases ??
      maintenanceCases.filter(isOpenMaintenanceTask).length,
    overdueMaintenanceCases:
      recordCounts.overdueMaintenanceCases ??
      maintenanceCases.filter(isOverdueMaintenanceTask).length,
    photos: recordCounts.photos ?? photos.length,
    timelineEvents: recordCounts.timelineEvents ?? recentTimelineEvents.length,
  };

  return {
    ...summary,
    activeLeases: currentLeases.map((lease) =>
      toLeaseContext(lease, unitsById),
    ),
    activeUnitCount: activeUnits.length,
    activity,
    archivedUnitCount: units.length - activeUnits.length,
    counts,
    documents: documentContexts,
    financialSummary,
    healthIndicators: buildPropertyHealthIndicators({
      activeLeases: currentLeases,
      activeUnitCount: activeUnits.length,
      counts,
      financialSummary,
      hasActiveOwnerLink: Boolean(activeOwner),
      maintenanceCases,
      occupiedUnitCount,
    }),
    hrefs,
    monthlyRentDisplay: formatMoneyTotalsDisplay(
      currentLeases.map((lease) => ({
        amount: lease.monthly_rent_amount,
        currency: lease.monthly_rent_currency,
        direction: "income",
      })),
    ),
    nextAction: buildPropertyNextAction({
      activeLeases: currentLeases,
      activeUnitCount: activeUnits.length,
      activeUnits,
      financialSummary,
      hasActiveOwnerLink: Boolean(activeOwner),
      hrefs,
      maintenanceCases,
      propertyDraftLease,
    }),
    notesLabel: property.notes?.trim() || "No operating notes recorded",
    ownerHistory: ownerHistory.map(toOwnerHistory),
    photos: photos.map((photo) => ({
      ...photo,
      scopeLabel: photo.unitId
        ? `Unit ${unitsById.get(photo.unitId)?.unit_number ?? "record"}`
        : "Property",
    })),
    propertyDocuments,
    propertyDraftLease: propertyDraftLease
      ? toPropertyDraftLeaseContext(propertyDraftLease, unitsById)
      : undefined,
    recentLedgerEntries: recentLedgerEntries.map((entry) =>
      toLedgerContext(entry, unitsById),
    ),
    recentMaintenanceCases: [...maintenanceCases]
      .sort(compareMaintenanceCases)
      .slice(0, 8)
      .map((maintenanceCase) => toMaintenanceContext(maintenanceCase, unitsById)),
    recentTimelineEvents: recentTimelineEvents.map((event) =>
      toTimelineContext(event, unitsById),
    ),
    totalUnitCount: units.length,
    occupiedUnits: occupiedUnitCount,
    unitSummary: formatUnitSummary({
      activeUnitCount: activeUnits.length,
      archivedUnitCount: units.length - activeUnits.length,
      occupiedUnitCount,
    }),
    unitsList: units.map((unit) =>
      formatUnit(unit, activeLeaseByUnitId.get(unit.id)),
    ),
    workflowEvidence,
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
    account: `/properties/${propertyId}/finance`,
    addDocument: buildHref("/documents", {
      action: "create",
      category: "Property record",
      propertyId,
    }),
    addLedgerEntry: buildHref("/ledger", {
      action: "create",
      propertyId,
    }),
    addLease: buildHref("/leases", {
      action: "create",
      propertyId,
    }),
    addMaintenanceCase: buildHref("/maintenance", {
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
    documents: buildHref("/documents", {
      archiveState: "all",
      propertyId,
    }),
    ledger: buildHref("/ledger", {
      archiveState: "all",
      propertyId,
    }),
    leases: buildHref("/leases", {
      archiveState: "all",
      propertyId,
    }),
    maintenance: buildHref("/maintenance", {
      propertyId,
    }),
    ownerPerson: activeOwner?.personId
      ? `/people/${activeOwner.personId}`
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
  activeLease?: PropertyDetailLeaseRecord,
): PropertyDetailUnit {
  const rawStatus = formatStatusLabel(unit.status);
  const occupancy = activeLease ? "Occupied" : rawStatus;
  const rentAmount = activeLease?.monthly_rent_amount ?? unit.current_rent_amount;
  const rentCurrency = activeLease?.monthly_rent_currency ?? unit.current_rent_currency;
  const monthlyRent =
    rentAmount === null || rentAmount === undefined || !rentCurrency
      ? "—"
      : formatMoney(Number(rentAmount), rentCurrency);
  const monthlyRentDisplay =
    rentAmount === null || rentAmount === undefined || !rentCurrency
      ? undefined
      : formatMoneyDisplay(Number(rentAmount), rentCurrency);

  return {
    attention: getUnitAttention({ activeLease, occupancy, unit }),
    archivedAt: unit.archived_at,
    currentRent: formatCurrentRent(unit),
    currentRentDisplay: formatCurrentRentDisplay(unit),
    floor: unit.floor?.trim() || "Not set",
    id: unit.id,
    isArchived: Boolean(unit.archived_at),
    leaseEndLabel: activeLease ? formatDate(activeLease.lease_end_date) : "—",
    monthlyRent,
    monthlyRentDisplay,
    occupancy,
    status: occupancy,
    tenantName: activeLease?.tenant_name,
    unitNumber: unit.unit_number,
  };
}

function getUnitAttention({
  activeLease,
  occupancy,
  unit,
}: {
  activeLease?: PropertyDetailLeaseRecord;
  occupancy: string;
  unit: PropertyDetailUnitRecord;
}) {
  if (unit.archived_at) return "Archived";
  if (activeLease) return "—";
  if (occupancy.toLowerCase() === "occupied") return "Lease missing";
  if (unit.current_rent_amount === null) return "Needs rent / Ready to lease";
  return "Ready to lease";
}

function formatCurrentRent(unit: PropertyDetailUnitRecord) {
  if (unit.current_rent_amount === null || !unit.current_rent_currency) {
    return "No rent set";
  }

  return formatMoney(Number(unit.current_rent_amount), unit.current_rent_currency);
}

function formatCurrentRentDisplay(unit: PropertyDetailUnitRecord) {
  if (unit.current_rent_amount === null || !unit.current_rent_currency) {
    return undefined;
  }

  return formatMoneyDisplay(Number(unit.current_rent_amount), unit.current_rent_currency);
}

function buildPropertyFinancialSummary({
  currentDate = new Date(),
  ledgerEntries,
}: {
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
  const incomeUsd = sumLedgerUsd(incomeEntries);
  const expenseUsd = sumLedgerUsd(expenseEntries);
  const maintenanceExpenseUsd = sumLedgerUsd(maintenanceExpenseEntries);
  const noiUsd = incomeUsd - expenseUsd;

  return {
    expenseDisplay: formatPositiveLedgerDisplay(expenseEntries),
    expenseUsd,
    incomeDisplay: formatPositiveLedgerDisplay(incomeEntries),
    incomeUsd,
    maintenanceExpenseDisplay: formatPositiveLedgerDisplay(maintenanceExpenseEntries),
    maintenanceExpenseUsd,
    marginLabel:
      incomeUsd > 0 ? `${formatPercent(noiUsd / incomeUsd)} NOI margin` : "No income",
    noiDisplay: formatMoneyDisplay(noiUsd),
    noiUsd,
    periodLabel: "Trailing 12 months",
  };
}

function toLeaseContext(
  lease: PropertyDetailLeaseRecord,
  unitsById: Map<string, PropertyDetailUnitRecord>,
): PropertyDetailLease {
  const unit = lease.unit_id ? unitsById.get(lease.unit_id) : undefined;

  return {
    href: buildHref("/leases", {
      archiveState: "all",
      leaseId: lease.id,
      query: lease.tenant_name,
    }),
    id: lease.id,
    rentDisplay: formatMoneyDisplay(lease.monthly_rent_amount, lease.monthly_rent_currency),
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

function toPropertyDraftLeaseContext(
  lease: PropertyDetailLeaseRecord,
  unitsById: Map<string, PropertyDetailUnitRecord>,
): PropertyDetailLease {
  return {
    ...toLeaseContext(lease, unitsById),
    href: `/leases/${lease.id}`,
  };
}

function isCurrentPropertyLease(lease: PropertyDetailLeaseRecord) {
  const status = lease.status.trim().toLowerCase();
  return !lease.archived_at && (status === "active" || status === "notice_given");
}

function toLedgerContext(
  entry: PropertyDetailLedgerRecord,
  unitsById: Map<string, PropertyDetailUnitRecord>,
): PropertyLedgerContext {
  const direction = entry.direction === "expense" ? "expense" : "income";
  const amount = entry.amount ?? 0;
  const currency = entry.currency ?? "USD";
  const signedAmount = direction === "expense" ? -amount : amount;
  const unit = entry.unit_id ? unitsById.get(entry.unit_id) : undefined;

  return {
    amountDisplay: formatMoneyDisplay(signedAmount, currency),
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
): PropertyTimelineContext {
  const unit = event.unit_id ? unitsById.get(event.unit_id) : undefined;
  const hasCost = event.cost_amount !== null && event.cost_currency !== null;

  return {
    costDisplay: hasCost
      ? formatMoneyDisplay(event.cost_amount ?? 0, event.cost_currency ?? "USD")
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

function toMaintenanceContext(
  maintenanceCase: PropertyDetailMaintenanceRecord,
  unitsById: Map<string, PropertyDetailUnitRecord>,
): PropertyMaintenanceContext {
  const unit = maintenanceCase.unit_id
    ? unitsById.get(maintenanceCase.unit_id)
    : undefined;
  const status = normalizeStatusValue(maintenanceCase.status);

  return {
    actualCostLabel:
      maintenanceCase.actual_cost_amount !== null &&
      maintenanceCase.actual_cost_currency
        ? formatMoney(
            maintenanceCase.actual_cost_amount,
            maintenanceCase.actual_cost_currency,
          )
        : "No actual cost",
    category: maintenanceCase.category,
    dueLabel: formatDateTimeLabel(
      maintenanceCase.due_date,
      maintenanceCase.due_time,
      "No due date",
    ),
    href: buildHref("/maintenance", {
      archiveState: "all",
      taskId: maintenanceCase.id,
    }),
    id: maintenanceCase.id,
    statusLabel:
      status === "ready_for_review"
        ? "Ready for review"
        : formatStatusLabel(maintenanceCase.status),
    statusTone:
      status === "completed"
        ? "success"
        : status === "blocked" || status === "cancelled" || status === "ready_for_review"
          ? "warning"
          : status === "in_progress"
            ? "accent"
            : "neutral",
    title: maintenanceCase.title,
    unitHref: maintenanceCase.unit_id ? `/units/${maintenanceCase.unit_id}` : undefined,
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

function isWorkflowDocument(
  document: PropertyDetailDocumentRecord,
  expenseEvidenceByDocumentId: Map<string, PropertyExpenseEvidenceRecord>,
) {
  return (
    expenseEvidenceByDocumentId.has(document.id) ||
    Boolean(
      document.task_id ||
        document.lease_id ||
        document.ledger_entry_id ||
        document.timeline_event_id,
    )
  );
}

function toWorkflowEvidenceContext(
  document: PropertyDetailDocumentRecord,
  evidence: PropertyExpenseEvidenceRecord | undefined,
  maintenanceCasesById: Map<string, PropertyDetailMaintenanceRecord>,
): PropertyWorkflowEvidenceContext {
  const base = toDocumentContext(document);

  if (evidence) {
    const maintenanceCase = evidence.source_id
      ? maintenanceCasesById.get(evidence.source_id)
      : undefined;
    const statusLabel = formatStatusLabel(evidence.status);

    return {
      ...base,
      amountDisplay: formatMoneyDisplay(
        evidence.internal_cost_amount,
        evidence.currency,
      ),
      amountLabel: formatMoney(
        evidence.internal_cost_amount,
        evidence.currency,
      ),
      href:
        evidence.source_type === "maintenance_task" && evidence.source_id
          ? buildHref("/maintenance", {
              archiveState: "all",
              taskId: evidence.source_id,
            })
          : buildHref("/bills-expenses", { submission: evidence.id }),
      sourceLabel:
        evidence.source_type === "maintenance_task"
          ? maintenanceCase?.title ?? "Maintenance cost"
          : `${formatStatusLabel(evidence.customer_category)} expense`,
      statusLabel,
      statusTone: getWorkflowEvidenceStatusTone(evidence.status),
      vendorLabel: evidence.vendor_label,
    };
  }

  return {
    ...base,
    href: base.linkedRecordHref,
    sourceLabel: base.linkedRecordLabel,
    statusTone: "neutral",
  };
}

function getWorkflowEvidenceStatusTone(status: string): PropertyBadgeTone {
  const normalized = normalizeStatusValue(status);

  if (normalized === "approved") return "success";
  if (normalized === "rejected") return "danger";
  if (normalized === "reversed") return "warning";
  if (normalized === "submitted") return "accent";
  return "neutral";
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
  maintenanceCases,
  occupiedUnitCount,
}: {
  activeLeases: PropertyDetailLeaseRecord[];
  activeUnitCount: number;
  counts: PropertyDetailCounts;
  financialSummary: PropertyFinancialSummary;
  hasActiveOwnerLink: boolean;
  maintenanceCases: PropertyDetailMaintenanceRecord[];
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
      (counts.overdueMaintenanceCases ?? 0) > 0
        ? `${counts.overdueMaintenanceCases} open maintenance case ${
            counts.overdueMaintenanceCases === 1 ? "is" : "are"
          } overdue.`
        : (counts.openMaintenanceCases ?? 0) > 0
          ? `${counts.openMaintenanceCases} open maintenance ${
              counts.openMaintenanceCases === 1 ? "case" : "cases"
            } need follow-up.`
          : maintenanceCases.length > 0
            ? "No open maintenance cases are currently blocking this property."
            : "No maintenance cases are linked to this property yet.",
    id: "open-maintenance",
    label:
      (counts.overdueMaintenanceCases ?? 0) > 0
        ? "Maintenance overdue"
        : (counts.openMaintenanceCases ?? 0) > 0
          ? "Open issues"
          : "No open issues",
    tone:
      (counts.overdueMaintenanceCases ?? 0) > 0
        ? "danger"
        : (counts.openMaintenanceCases ?? 0) > 0
          ? "warning"
          : "success",
  });

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
  activeUnits,
  financialSummary,
  hasActiveOwnerLink,
  hrefs,
  maintenanceCases,
  propertyDraftLease,
}: {
  activeLeases: PropertyDetailLeaseRecord[];
  activeUnitCount: number;
  activeUnits: PropertyDetailUnitRecord[];
  financialSummary: PropertyFinancialSummary;
  hasActiveOwnerLink: boolean;
  hrefs: PropertyDetailHrefs;
  maintenanceCases: PropertyDetailMaintenanceRecord[];
  propertyDraftLease?: PropertyDetailLeaseRecord;
}): PropertyNextAction {
  if (propertyDraftLease) {
    return {
      description: `Continue the draft Lease for ${propertyDraftLease.tenant_name} instead of creating a duplicate.`,
      href: `/leases/${propertyDraftLease.id}`,
      label: "Continue draft lease",
      tone: "warning",
    };
  }

  if (!hasActiveOwnerLink) {
    return {
      description: "Assign a current owner/person link before relying on owner reports.",
      href: hrefs.propertiesList,
      intent: "assign-owner",
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
    const onlyUnit = activeUnits.length === 1 ? activeUnits[0] : null;

    return {
      description: onlyUnit
        ? "Continue lease setup inside this unit."
        : "Choose the unit that needs a lease.",
      href: onlyUnit ? `/units/${onlyUnit.id}` : hrefs.units,
      label: onlyUnit ? `Open Unit ${onlyUnit.unit_number}` : "Review units",
      tone: "warning",
    };
  }

  if (financialSummary.incomeUsd <= 0) {
    return {
      description: "Review the rent account because the active lease has no recent income.",
      href: hrefs.account,
      label: "Review rent",
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

  const overdueCase = maintenanceCases.find(isOverdueMaintenanceTask);

  if (overdueCase) {
    return {
      description: `${overdueCase.title} is overdue under this property.`,
      href: buildHref("/maintenance", {
        archiveState: "all",
        taskId: overdueCase.id,
      }),
      label: "Review overdue issue",
      tone: "danger",
    };
  }

  const openCase = maintenanceCases.find(isOpenMaintenanceTask);

  if (openCase) {
    return {
      description: `${openCase.title} is still ${formatStatusLabel(openCase.status)}.`,
      href: buildHref("/maintenance", {
        archiveState: "all",
        taskId: openCase.id,
      }),
      label: "Review open issue",
      tone: "warning",
    };
  }

  return {
    description: "The core record is connected. Review maintenance or add the next case.",
    href: hrefs.addMaintenanceCase,
    label: "Log maintenance case",
    tone: "accent",
  };
}

function formatPositiveLedgerDisplay(entries: PropertyDetailLedgerRecord[]) {
  return formatMoneyTotalsDisplay(
    entries.map((entry) => ({
      amount: entry.amount,
      currency: entry.currency,
      direction: "income",
    })),
  );
}

function sumLedgerUsd(entries: PropertyDetailLedgerRecord[]) {
  return entries.reduce((total, entry) => {
    if (entry.amount === null) {
      return total;
    }

    return total + entry.amount;
  }, 0);
}

function getDocumentLinkedRecordLabel(document: PropertyDetailDocumentRecord) {
  if (document.task_id) {
    return "Maintenance case";
  }

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
  if (document.task_id) {
    return buildHref("/maintenance", {
      archiveState: "all",
      taskId: document.task_id,
    });
  }

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
  return normalizeStatusValue(status)
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeStatusValue(status: string) {
  return status.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isOpenMaintenanceTask(task: PropertyDetailMaintenanceRecord) {
  const status = normalizeStatusValue(task.status);

  return status !== "completed" && status !== "cancelled";
}

function compareMaintenanceCases(
  left: PropertyDetailMaintenanceRecord,
  right: PropertyDetailMaintenanceRecord,
) {
  const openPriority =
    Number(isOpenMaintenanceTask(right)) - Number(isOpenMaintenanceTask(left));

  if (openPriority !== 0) {
    return openPriority;
  }

  return (left.due_date ?? "9999-12-31").localeCompare(
    right.due_date ?? "9999-12-31",
  );
}

function isOverdueMaintenanceTask(task: PropertyDetailMaintenanceRecord) {
  return (
    isOpenMaintenanceTask(task) &&
    Boolean(task.due_date) &&
    task.due_date! < new Date().toISOString().slice(0, 10)
  );
}

function formatDateTimeLabel(date: string | null, time: string | null, fallback: string) {
  if (!date) {
    return fallback;
  }

  return `${formatDate(date)}${time ? ` at ${time.slice(0, 5)}` : ""}`;
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

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

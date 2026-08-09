import { buildHref } from "@/lib/url/href";
import {
  activityEntityTypes,
  type ActivityEntityType,
} from "@/features/activity/entity-types";

export { activityEntityTypes } from "@/features/activity/entity-types";
export type { ActivityEntityType } from "@/features/activity/entity-types";

export type ActivityEntityReference = {
  entityId: string;
  entityType: string;
  periodStart?: string;
  recordLabel?: string;
};

export type ActivityEntityTarget = {
  actionLabel: string;
  entityLabel: string;
  focusMode: "exact" | "module" | "unavailable";
  href?: string;
  recordLabel: string;
};

type EntityTargetDefinition = {
  actionLabel: string;
  entityLabel: string;
  fallbackRecordLabel: string;
  getHref?: (reference: ActivityEntityReference) => string | undefined;
  mode: "exact" | "module" | "unavailable";
};

const entityTargets: Record<ActivityEntityType, EntityTargetDefinition> = {
  timeline_event: {
    actionLabel: "Open Timeline event",
    entityLabel: "Timeline",
    fallbackRecordLabel: "Timeline event",
    getHref: ({ entityId }) =>
      buildHref("/timeline", { archiveState: "all", eventId: entityId }),
    mode: "exact",
  },
  ledger_entry: {
    actionLabel: "Open Ledger entry",
    entityLabel: "Ledger",
    fallbackRecordLabel: "Ledger entry",
    getHref: ({ entityId }) =>
      buildHref("/ledger", { archiveState: "all", entryId: entityId }),
    mode: "exact",
  },
  financial_month: {
    actionLabel: "Open locked month",
    entityLabel: "Month lock",
    fallbackRecordLabel: "Month lock",
    getHref: ({ periodStart }) =>
      periodStart ? getFinancialMonthHref(periodStart) : "/ledger",
    mode: "module",
  },
  finance_income_item: {
    actionLabel: "Open Rent & Income record",
    entityLabel: "Rent & Income",
    fallbackRecordLabel: "Income item",
    getHref: ({ entityId }) =>
      buildHref("/rent-income", {
        archiveState: "all",
        incomeItemId: entityId,
      }),
    mode: "exact",
  },
  finance_expense_item: {
    actionLabel: "Open Bills & Expenses record",
    entityLabel: "Bills & Expenses",
    fallbackRecordLabel: "Expense item",
    getHref: ({ entityId }) =>
      buildHref("/bills-expenses", {
        archiveState: "all",
        expenseItemId: entityId,
      }),
    mode: "exact",
  },
  finance_receipt_allocation: {
    actionLabel: "Open Rent & Income",
    entityLabel: "Receipt allocation",
    fallbackRecordLabel: "Receipt allocation",
    getHref: () => "/rent-income",
    mode: "module",
  },
  expense_submission: {
    actionLabel: "Open expense review queue",
    entityLabel: "Bills & Expenses",
    fallbackRecordLabel: "Expense submission",
    getHref: () => "/bills-expenses",
    mode: "module",
  },
  tenant_invoice: {
    actionLabel: "Open Rent invoices",
    entityLabel: "Rent & Income",
    fallbackRecordLabel: "Tenant invoice",
    getHref: () => "/rent-income",
    mode: "module",
  },
  tenant_invoice_payment: {
    actionLabel: "Open Rent & Income",
    entityLabel: "Tenant invoice payment",
    fallbackRecordLabel: "Tenant invoice payment",
    getHref: () => "/rent-income",
    mode: "module",
  },
  owner_collection_confirmation: {
    actionLabel: "Open Rent & Income",
    entityLabel: "Owner collection confirmation",
    fallbackRecordLabel: "Owner collection confirmation",
    getHref: () => "/rent-income",
    mode: "module",
  },
  owner_payment: {
    actionLabel: "Open Balances",
    entityLabel: "Owner payment",
    fallbackRecordLabel: "Owner payment",
    getHref: () => "/balances",
    mode: "module",
  },
  petty_cash_entry: {
    actionLabel: "Open Petty Cash row",
    entityLabel: "Petty Cash",
    fallbackRecordLabel: "Petty cash row",
    getHref: ({ entityId }) => buildHref("/petty-cash", { entryId: entityId }),
    mode: "exact",
  },
  petty_cash_account: {
    actionLabel: "Open Petty Cash",
    entityLabel: "Petty Cash",
    fallbackRecordLabel: "Petty cash account",
    getHref: () => "/petty-cash",
    mode: "module",
  },
  petty_cash_period: {
    actionLabel: "Open Petty Cash",
    entityLabel: "Petty Cash",
    fallbackRecordLabel: "Petty cash period",
    getHref: () => "/petty-cash",
    mode: "module",
  },
  task: {
    actionLabel: "Open maintenance case",
    entityLabel: "Maintenance",
    fallbackRecordLabel: "Maintenance case",
    getHref: ({ entityId }) =>
      buildHref("/maintenance", { archiveState: "all", taskId: entityId }),
    mode: "exact",
  },
  tenant_request: {
    actionLabel: "Open Maintenance",
    entityLabel: "Maintenance",
    fallbackRecordLabel: "Maintenance request",
    getHref: () => buildHref("/maintenance", { archiveState: "all" }),
    mode: "module",
  },
  document: {
    actionLabel: "Open document",
    entityLabel: "Document",
    fallbackRecordLabel: "Document",
    getHref: ({ entityId }) =>
      buildHref("/documents", { archiveState: "all", documentId: entityId }),
    mode: "exact",
  },
  lease: {
    actionLabel: "Open lease",
    entityLabel: "Lease",
    fallbackRecordLabel: "Lease",
    getHref: ({ entityId }) =>
      buildHref("/leases", { archiveState: "all", leaseId: entityId }),
    mode: "exact",
  },
  lease_billing_term: {
    actionLabel: "Open Leases",
    entityLabel: "Lease billing term",
    fallbackRecordLabel: "Lease billing term",
    getHref: () => "/leases",
    mode: "module",
  },
  lease_occupancy: {
    actionLabel: "Open Leases",
    entityLabel: "Lease occupancy",
    fallbackRecordLabel: "Lease occupancy",
    getHref: () => "/leases",
    mode: "module",
  },
  lease_occupancy_participant: {
    actionLabel: "Open Leases",
    entityLabel: "Lease occupancy participant",
    fallbackRecordLabel: "Lease occupancy participant",
    getHref: () => "/leases",
    mode: "module",
  },
  lease_party: {
    actionLabel: "Open Leases",
    entityLabel: "Lease party",
    fallbackRecordLabel: "Lease party",
    getHref: () => "/leases",
    mode: "module",
  },
  lease_term: {
    actionLabel: "Open Leases",
    entityLabel: "Lease term",
    fallbackRecordLabel: "Lease term",
    getHref: () => "/leases",
    mode: "module",
  },
  property: {
    actionLabel: "Open property",
    entityLabel: "Property",
    fallbackRecordLabel: "Property",
    getHref: ({ entityId }) => `/properties/${encodeURIComponent(entityId)}`,
    mode: "exact",
  },
  unit: {
    actionLabel: "Open unit",
    entityLabel: "Unit",
    fallbackRecordLabel: "Unit",
    getHref: ({ entityId }) => `/units/${encodeURIComponent(entityId)}`,
    mode: "exact",
  },
  person: {
    actionLabel: "Open person",
    entityLabel: "Person",
    fallbackRecordLabel: "Person",
    getHref: ({ entityId }) => `/people/${encodeURIComponent(entityId)}`,
    mode: "exact",
  },
  import: {
    actionLabel: "Open Import",
    entityLabel: "Import",
    fallbackRecordLabel: "Import batch",
    getHref: () => "/import",
    mode: "module",
  },
  organization: {
    actionLabel: "Open organization settings",
    entityLabel: "Organization",
    fallbackRecordLabel: "Organization",
    getHref: () => buildHref("/settings", { section: "organization" }),
    mode: "module",
  },
  organization_branch: {
    actionLabel: "Open branch settings",
    entityLabel: "Organization branch",
    fallbackRecordLabel: "Organization branch",
    getHref: () => buildHref("/settings", { section: "branches" }),
    mode: "module",
  },
  organization_invitation: {
    actionLabel: "Open access settings",
    entityLabel: "Organization access",
    fallbackRecordLabel: "Organization invitation",
    getHref: ({ entityId }) =>
      buildHref("/users-roles", { invitationId: entityId }),
    mode: "module",
  },
  organization_membership: {
    actionLabel: "Open access settings",
    entityLabel: "Organization access",
    fallbackRecordLabel: "Organization membership",
    getHref: ({ entityId }) => buildHref("/users-roles", { memberId: entityId }),
    mode: "module",
  },
};

export function resolveActivityEntityTarget(
  reference: ActivityEntityReference,
): ActivityEntityTarget {
  const definition = isActivityEntityType(reference.entityType)
    ? entityTargets[reference.entityType]
    : undefined;

  if (!definition || !isUuid(reference.entityId)) {
    return {
      actionLabel: "Source unavailable",
      entityLabel: definition?.entityLabel ?? toReadableLabel(reference.entityType),
      focusMode: "unavailable",
      recordLabel:
        reference.recordLabel ?? definition?.fallbackRecordLabel ?? "Activity record",
    };
  }

  const href = definition.getHref?.(reference);
  if (!href) {
    return {
      actionLabel: "Source unavailable",
      entityLabel: definition.entityLabel,
      focusMode: "unavailable",
      recordLabel: reference.recordLabel ?? definition.fallbackRecordLabel,
    };
  }

  return {
    actionLabel: definition.actionLabel,
    entityLabel: definition.entityLabel,
    focusMode: definition.mode,
    href,
    recordLabel: reference.recordLabel ?? definition.fallbackRecordLabel,
  };
}

export function isActivityEntityType(value: string): value is ActivityEntityType {
  return (activityEntityTypes as readonly string[]).includes(value);
}

function getFinancialMonthHref(periodStart: string) {
  const monthStart = periodStart.slice(0, 10);
  const match = monthStart.match(/^(\d{4})-(\d{2})-01$/);

  if (!match) {
    return "/ledger";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return buildHref("/ledger", {
    dateFrom: monthStart,
    dateTo: `${monthStart.slice(0, 8)}${String(lastDay).padStart(2, "0")}`,
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function toReadableLabel(value: string) {
  const label = value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return label || "Activity";
}

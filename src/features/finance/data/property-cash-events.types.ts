import type { Database } from "@/types/database";

type GeneratedPropertyCashEventRow =
  Database["public"]["Functions"]["get_property_cash_events_v1_page"]["Returns"][number];

type NullablePropertyCashEventColumns = {
  archived_at: string | null;
  created_by: string | null;
  deposit_liability_effect: number | string | null;
  event_date: string | null;
  journal_entry_id: string | null;
  lease_id: string | null;
  ledger_entry_id: string | null;
  management_fee_effect: number | string | null;
  obligation_id: string | null;
  obligation_type: string | null;
  operating_cash_effect: number | string | null;
  owner_cash_effect: number | string | null;
  owner_person_id: string | null;
  period_start: string | null;
  projection_status: string | null;
  reversal_source_id: string | null;
  reversal_source_type: string | null;
  source_parent_id: string | null;
  source_parent_type: string | null;
  task_id: string | null;
  tenant_person_id: string | null;
  unit_id: string | null;
  updated_at: string | null;
  updated_by: string | null;
  vendor_person_id: string | null;
};

export type PropertyCashEventDatabaseRow = Omit<
  GeneratedPropertyCashEventRow,
  "amount" | keyof NullablePropertyCashEventColumns
> &
  NullablePropertyCashEventColumns & {
    amount: number | string;
  };

export const propertyCashEconomicClasses = [
  "operating_income",
  "operating_expense",
  "management_fee",
  "owner_contribution",
  "owner_distribution",
  "owner_reserve",
  "security_deposit",
  "adjustment",
  "legacy_unclassified",
] as const;

export type PropertyCashEconomicClass =
  (typeof propertyCashEconomicClasses)[number];

export const propertyCashClassificationStatuses = [
  "source_stable",
  "provisional_current_obligation",
  "unresolved_source_scope",
  "unresolved_reversal_header",
  "unresolved_evidence",
] as const;

export type PropertyCashClassificationStatus =
  (typeof propertyCashClassificationStatuses)[number];

export const propertyCashSourceTypes = [
  "receipt_allocation",
  "payment_allocation",
  "deposit_event",
  "petty_cash_entry",
  "maintenance_task",
  "ledger_entry",
] as const;

export type PropertyCashSourceType = (typeof propertyCashSourceTypes)[number];

export type PropertyCashEvent = {
  amountCents: bigint;
  archivedAt: string | null;
  categoryCode: string;
  classificationStatus: PropertyCashClassificationStatus;
  contractVersion: "property_cash_events_v1";
  createdAt: string;
  createdBy: string | null;
  currency: "USD";
  depositLiabilityEffectCents: bigint | null;
  economicClass: PropertyCashEconomicClass;
  eventDate: string | null;
  eventKey: string;
  isLegacy: boolean;
  isReversal: boolean;
  journalEntryId: string | null;
  leaseId: string | null;
  ledgerEntryId: string | null;
  managementFeeEffectCents: bigint | null;
  obligationId: string | null;
  obligationType: string | null;
  operatingCashEffectCents: bigint | null;
  organizationId: string;
  ownerCashEffectCents: bigint | null;
  ownerPersonId: string | null;
  periodStart: string | null;
  projectionStatus: string | null;
  propertyId: string;
  requiresResolution: boolean;
  reversalSourceId: string | null;
  reversalSourceType: string | null;
  sourceId: string;
  sourceParentId: string | null;
  sourceParentType: string | null;
  sourceType: PropertyCashSourceType;
  statementSection: string;
  taskId: string | null;
  tenantPersonId: string | null;
  unitId: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  vendorPersonId: string | null;
};

export type PropertyCashEventCursor = {
  eventDate: string | null;
  sourceId: string;
  sourceType: string;
};

export type PropertyCashEventScope = {
  currency: "USD";
  organizationId: string;
  ownerPersonId?: string;
  pageSize?: number;
  periodEnd: string;
  periodStart: string;
  propertyId: string;
  unitId?: string;
};

export type PropertyCashEventsRpcArgs = {
  p_after_event_date: string | null;
  p_after_source_id: string | null;
  p_after_source_type: string | null;
  p_currency: "USD";
  p_organization_id: string;
  p_page_size: number;
  p_period_end: string;
  p_period_start: string;
  p_property_id: string;
};

export type PropertyCashEventsRpcClient = {
  rpc(
    name: "get_property_cash_events_v1_page",
    args: PropertyCashEventsRpcArgs,
  ): PromiseLike<{
    data: PropertyCashEventDatabaseRow[] | null;
    error: { message: string } | null;
  }>;
};

export type PropertyCashEventSourceIdentity = {
  eventKey: string;
  sourceId: string;
  sourceType: PropertyCashSourceType;
};

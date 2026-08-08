export type PropertyCashEventDatabaseRow = {
  amount: number | string;
  category_code: string;
  contract_version: string;
  currency: string;
  cursor_event_date: string;
  cursor_source_id: string;
  cursor_source_type: string;
  deposit_liability_effect: number | string | null;
  description: string;
  economic_class: string;
  event_date: string;
  event_key: string;
  is_reversal: boolean;
  lease_id: string | null;
  ledger_entry_id: string | null;
  management_fee_effect: number | string | null;
  obligation_id: string | null;
  obligation_type: string | null;
  operating_cash_effect: number | string | null;
  organization_id: string;
  owner_cash_effect: number | string | null;
  owner_person_id: string | null;
  period_start: string;
  property_id: string;
  reconciliation_source_id: string | null;
  reference: string | null;
  resolution_reason: string | null;
  resolution_state: string;
  reversal_source_id: string | null;
  reversal_source_type: string | null;
  source_id: string;
  source_parent_id: string | null;
  source_parent_type: string | null;
  source_type: string;
  task_id: string | null;
  tenant_person_id: string | null;
  unit_id: string | null;
  vendor_person_id: string | null;
};

export const propertyCashEconomicClasses = [
  "operating_income",
  "operating_expense",
  "management_fee",
  "owner_contribution",
  "owner_distribution",
  "security_deposit",
  "adjustment",
] as const;

export type PropertyCashEconomicClass =
  (typeof propertyCashEconomicClasses)[number];

export const propertyCashSourceTypes = [
  "receipt_allocation",
  "owner_collection_allocation",
  "payment_allocation",
  "deposit_event",
  "petty_cash_entry",
  "owner_payment",
  "property_withdrawal",
] as const;

export type PropertyCashSourceType = (typeof propertyCashSourceTypes)[number];

export const propertyCashResolutionStates = ["resolved", "unresolved"] as const;

export type PropertyCashResolutionState =
  (typeof propertyCashResolutionStates)[number];

export type PropertyCashEvent = {
  amountCents: bigint;
  categoryCode: string;
  contractVersion: "property_cash_events.v1";
  currency: "USD";
  depositLiabilityEffectCents: bigint | null;
  description: string;
  economicClass: PropertyCashEconomicClass;
  eventDate: string;
  eventKey: string;
  isReversal: boolean;
  leaseId: string | null;
  ledgerEntryId: string | null;
  managementFeeEffectCents: bigint | null;
  obligationId: string | null;
  obligationType: string | null;
  operatingCashEffectCents: bigint | null;
  organizationId: string;
  ownerCashEffectCents: bigint | null;
  ownerPersonId: string | null;
  periodStart: string;
  propertyId: string;
  reconciliationSourceId: string | null;
  reference: string | null;
  resolutionReason: string | null;
  resolutionState: PropertyCashResolutionState;
  reversalSourceId: string | null;
  reversalSourceType: string | null;
  sourceId: string;
  sourceParentId: string | null;
  sourceParentType: string | null;
  sourceType: PropertyCashSourceType;
  taskId: string | null;
  tenantPersonId: string | null;
  unitId: string | null;
  vendorPersonId: string | null;
};

export type PropertyCashEventCursor = {
  eventDate: string;
  sourceId: string;
  sourceType: PropertyCashSourceType;
};

export type PropertyCashEventScope = {
  currency: "USD";
  organizationId: string;
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
    name: "get_property_cash_events_page",
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

export const ownerProfitLossEconomicClasses = [
  "owner_income",
  "owner_expense",
] as const;

export type OwnerProfitLossEconomicClass =
  (typeof ownerProfitLossEconomicClasses)[number];

export const ownerProfitLossSourceTypes = [
  "tenant_invoice_line",
  "management_fee_occurrence",
  "owner_invoice_line",
  "expense_customer_adjustment",
] as const;

export type OwnerProfitLossSourceType =
  (typeof ownerProfitLossSourceTypes)[number];

export type OwnerProfitLossEventDatabaseRow = {
  category_code: string;
  category_id: string | null;
  category_label: string;
  category_reporting_group: string;
  contract_version: string;
  currency: string;
  cursor_recognized_on: string;
  cursor_source_id: string;
  cursor_source_type: string;
  description: string;
  economic_class: string;
  event_key: string;
  is_reversal: boolean;
  lease_id: string | null;
  organization_id: string;
  period_start: string;
  property_id: string;
  recognition_basis: string;
  recognized_on: string;
  reversal_of_id: string | null;
  reversal_source_type: string | null;
  signed_amount: number | string;
  source_id: string;
  source_parent_id: string | null;
  source_parent_type: string | null;
  source_type: string;
  unit_id: string | null;
};

export type OwnerProfitLossEvent = {
  categoryCode: string;
  categoryId: string | null;
  categoryLabel: string;
  categoryReportingGroup: string;
  contractVersion: "owner_profit_loss_events.v2";
  currency: "USD";
  description: string;
  economicClass: OwnerProfitLossEconomicClass;
  eventKey: string;
  isReversal: boolean;
  leaseId: string | null;
  organizationId: string;
  periodStart: string;
  propertyId: string;
  recognitionBasis: string;
  recognizedOn: string;
  reversalOfId: string | null;
  reversalSourceType: OwnerProfitLossSourceType | null;
  signedAmountCents: bigint;
  sourceId: string;
  sourceParentId: string | null;
  sourceParentType: string | null;
  sourceType: OwnerProfitLossSourceType;
  unitId: string | null;
};

export type OwnerProfitLossEventCursor = {
  recognizedOn: string;
  sourceId: string;
  sourceType: OwnerProfitLossSourceType;
};

export type OwnerProfitLossEventScope = {
  currency: "USD";
  organizationId: string;
  pageSize?: number;
  periodEnd: string;
  periodStart: string;
  propertyId: string;
  unitId?: string;
};

export type OwnerProfitLossEventsRpcArgs = {
  p_after_recognized_on: string | null;
  p_after_source_id: string | null;
  p_after_source_type: string | null;
  p_currency: "USD";
  p_organization_id: string;
  p_page_size: number;
  p_period_end: string;
  p_period_start: string;
  p_property_id: string;
};

export type OwnerProfitLossEventsRpcClient = {
  rpc(
    name: "get_owner_profit_loss_events_page",
    args: OwnerProfitLossEventsRpcArgs,
  ): PromiseLike<{
    data: OwnerProfitLossEventDatabaseRow[] | null;
    error: { message: string } | null;
  }>;
};

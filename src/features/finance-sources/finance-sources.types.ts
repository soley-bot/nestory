export const FINANCE_SOURCE_KINDS = [
  "bank",
  "cash",
  "petty_cash",
  "clearing",
  "other",
] as const;

export const FINANCE_SOURCE_SCOPE_KINDS = [
  "organization_pooled",
  "property_dedicated",
] as const;

export type FinanceSourceKind = (typeof FINANCE_SOURCE_KINDS)[number];
export type FinanceSourceScopeKind =
  (typeof FINANCE_SOURCE_SCOPE_KINDS)[number];

export type FinanceSourceSummary = {
  archivedAt: string | null;
  code: string;
  currency: "USD";
  displayName: string;
  id: string;
  maskedReference: string | null;
  propertyId: string | null;
  propertyLabel: string | null;
  scopeKind: FinanceSourceScopeKind;
  sourceKind: FinanceSourceKind;
};

export type FinanceSourcePropertyOption = {
  id: string;
  label: string;
};

export type FinanceSourcesData = {
  properties: FinanceSourcePropertyOption[];
  sources: FinanceSourceSummary[];
};

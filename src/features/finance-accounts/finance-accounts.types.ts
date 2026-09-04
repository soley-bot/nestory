export type FinanceAccountClass =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense";

export type FinanceAccountSummary = {
  accountClass: FinanceAccountClass;
  accountNumber: string | null;
  accountSubtype: string;
  archivedAt: string | null;
  defaultFor: string[];
  depth: 0 | 1;
  description: string | null;
  displayName: string;
  id: string;
  parentAccountId: string | null;
  propertyId: string | null;
  propertyLabel: string | null;
  systemRole: string | null;
  useForLeaseCharges: boolean;
  useForLeaseCredits: boolean;
  useForLeaseDeposits: boolean;
};

export type FinanceAccountOption = Pick<
  FinanceAccountSummary,
  "accountClass" | "accountSubtype" | "displayName" | "id" | "propertyId"
>;

export type FinanceAccountGroup = {
  accountClass: FinanceAccountClass;
  accounts: FinanceAccountSummary[];
};

export type FinanceAccountPropertyOption = {
  id: string;
  label: string;
};

export type FinanceAccountsData = {
  groups: FinanceAccountGroup[];
  properties: FinanceAccountPropertyOption[];
};

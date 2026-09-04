import type { FinanceAccountOption } from "@/features/finance-accounts/finance-accounts.types";

export function findConfiguredAccountId(
  accounts: readonly FinanceAccountOption[],
  roleCode: string,
  propertyId?: string | null,
): string | undefined {
  const configured = accounts.filter((account) =>
    account.defaultRoleCodes?.includes(roleCode),
  );
  const system = accounts.filter((account) => account.systemRoleCode === roleCode);
  return pickScopedAccount(configured, propertyId)?.id
    ?? pickScopedAccount(system, propertyId)?.id;
}

export function isTenantPaymentReceivingAccount(
  account: FinanceAccountOption,
  propertyId?: string | null,
): boolean {
  return account.accountClass === "asset"
    && ["bank", "cash", "petty_cash"].includes(account.accountSubtype)
    && (!propertyId || !account.propertyId || account.propertyId === propertyId);
}

function pickScopedAccount(
  accounts: readonly FinanceAccountOption[],
  propertyId?: string | null,
): FinanceAccountOption | undefined {
  if (propertyId) {
    return accounts.find((account) => account.propertyId === propertyId)
      ?? accounts.find((account) => !account.propertyId);
  }
  return accounts.find((account) => !account.propertyId) ?? accounts[0];
}

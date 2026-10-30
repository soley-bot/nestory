"use server";

import { requirePermission } from "@/lib/auth/context";
import { getLeaseRegisterFilterOptions, getLeaseBillingFormConfig } from "./data/leases";
import { createSupabaseServerClient } from "@/lib/db/server";
import { loadLeaseRegisterContext } from "./data/scoped-lease-context";
import { getFinanceAccountsData, getLeaseDepositAccountOptions } from "@/features/finance-accounts/data/finance-accounts";
import { z } from "zod";

export async function getLeaseFilterOptionsAction() {
  const context = await requirePermission("leases.view");
  return getLeaseRegisterFilterOptions(context.organizationId);
}

export async function getLeaseDetailFormOptionsAction(leaseId: string, mode: "billing" | "edit" | "deposit") {
  if (!z.uuid().safeParse(leaseId).success || !["billing","edit","deposit"].includes(mode)) throw new Error("Lease form unavailable.");
  const context = await requirePermission(mode === "edit" ? "leases.prepare" : mode === "billing" ? "leases.change_terms" : "leases.view");
  const scoped = await loadLeaseRegisterContext(await createSupabaseServerClient(), context.organizationId, [leaseId]);
  const propertyId = scoped.properties[0]?.id;
  if (!propertyId) throw new Error("Lease form unavailable.");
  if (mode === "deposit") {
    if (!context.permissionKeys.has("finance.view")) return { leaseDepositAccounts: [] };
    const data = await getFinanceAccountsData(context.organizationId);
    return { leaseDepositAccounts: getLeaseDepositAccountOptions(data.groups.flatMap(group => group.accounts)).filter(account => account.propertyId === null || account.propertyId === propertyId) };
  }
  return { billingFormConfig: await getLeaseBillingFormConfig(context.organizationId) };
}

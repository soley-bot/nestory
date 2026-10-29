"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PaginationControls } from "@/components/data/pagination-controls";
import { getFinanceAccountFormDataAction } from "../actions";
import type { FinanceAccountQuery } from "../finance-account-query";
import type { FinanceAccountRegisterData } from "../finance-accounts.types";
import { FinanceAccountsScreen } from "./finance-accounts-screen";

export function FinanceAccountRegister({ query, canManageAccounts, ...data }: FinanceAccountRegisterData & { query: FinanceAccountQuery; canManageAccounts: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return <FinanceAccountsScreen {...data} canManageAccounts={canManageAccounts} key={JSON.stringify(query)}
    loadFormOptions={getFinanceAccountFormDataAction}
    register={{ query, pagination: <PaginationControls pagination={data.pagination} />, onChange: (name,value) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(name,value); else next.delete(name);
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    } }} />;
}

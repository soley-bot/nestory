import { createSupabaseServerClient } from "@/lib/db/server";
import type { FinanceCloseSummary } from "@/features/finance/finance.types";

export async function getFinanceCloseSummary({
  month,
  organizationId,
}: {
  month: string;
  organizationId: string;
}): Promise<FinanceCloseSummary> {
  const supabase = await createSupabaseServerClient();
  const scope = getMonthScope(month);
  const [incomeResult, expenseResult, pettyCashResult] = await Promise.all([
    supabase
      .from("finance_income_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .in("status", ["partially_received", "received"])
      .gte("due_date", scope.from)
      .lt("due_date", scope.before),
    supabase
      .from("finance_expense_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .eq("status", "approved")
      .gte("invoice_date", scope.from)
      .lt("invoice_date", scope.before),
    supabase
      .from("petty_cash_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .eq("status", "cleared")
      .is("ledger_entry_id", null)
      .gte("invoice_date", scope.from)
      .lt("invoice_date", scope.before),
  ]);

  if (incomeResult.error) {
    throw new Error(
      `Could not load income close summary: ${incomeResult.error.message}`,
    );
  }

  if (expenseResult.error) {
    throw new Error(
      `Could not load expense close summary: ${expenseResult.error.message}`,
    );
  }

  if (pettyCashResult.error) {
    throw new Error(
      `Could not load petty cash close summary: ${pettyCashResult.error.message}`,
    );
  }

  return {
    billsReadyHref: `/bills-expenses?month=${month}&status=approved`,
    billsReadyToPost: String(expenseResult.count ?? 0),
    incomeReadyHref: `/rent-income?month=${month}&status=received`,
    incomeReadyToPost: String(incomeResult.count ?? 0),
    month,
    monthLabel: formatMonthLabel(month),
    pettyCashReadyHref: "/petty-cash",
    pettyCashReadyToPost: String(pettyCashResult.count ?? 0),
  };
}

export function getFinanceCloseMonth(currentDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
  }).formatToParts(currentDate);

  return `${parts.find((part) => part.type === "year")?.value ?? "2026"}-${
    parts.find((part) => part.type === "month")?.value ?? "01"
  }`;
}

function getMonthScope(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYear = monthNumber === 12 ? year + 1 : year;

  return {
    before: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
    from: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
  };
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

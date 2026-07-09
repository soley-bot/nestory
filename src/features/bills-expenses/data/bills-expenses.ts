import { createSupabaseServerClient } from "@/lib/db/server";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatMoneyDisplay } from "@/lib/money/format";
import {
  buildBillsExpensesPagination,
  getBillsExpensesMonthScope,
} from "@/features/bills-expenses/bills-expenses.filters";
import { buildPostgrestIlikeOrFilters } from "@/lib/query/screen-query";
import {
  expenseTypeOptions,
  economicScopeOptions,
  ownerBillStatusOptions,
  type BillsExpenseItem,
  type BillsExpenseOption,
  type BillsExpensesSummary,
  type BillsExpenseStatus,
  type BillsExpenseUnitOption,
  type BillsExpensesViewQuery,
} from "@/features/bills-expenses/bills-expenses.types";
import type { Database } from "@/types/database";

type ExpenseRow =
  Database["public"]["Tables"]["finance_expense_items"]["Row"];
type ExpenseSummaryRow =
  Database["public"]["Functions"]["get_finance_expense_workflow_summary"]["Returns"][number];
type PropertyRow = Pick<
  Database["public"]["Tables"]["properties"]["Row"],
  "code" | "id" | "name"
>;
type UnitRow = Pick<
  Database["public"]["Tables"]["units"]["Row"],
  "id" | "property_id" | "unit_number"
>;
type PersonRow = Pick<
  Database["public"]["Tables"]["people"]["Row"],
  "display_name" | "id"
>;

export async function getBillsExpensesScreenData(
  organizationId: string,
  viewQuery: BillsExpensesViewQuery,
) {
  const supabase = await createSupabaseServerClient();
  const monthScope = getBillsExpensesMonthScope(viewQuery.month);
  const [propertiesResult, unitsResult, vendorsResult] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, code")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("code", { ascending: true }),
    supabase
      .from("units")
      .select("id, property_id, unit_number")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("unit_number", { ascending: true }),
    supabase
      .from("people")
      .select("id, display_name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("display_name", { ascending: true }),
  ]);

  if (propertiesResult.error) {
    throw new Error(
      `Could not load expense properties: ${propertiesResult.error.message}`,
    );
  }

  if (unitsResult.error) {
    throw new Error(`Could not load expense units: ${unitsResult.error.message}`);
  }

  if (vendorsResult.error) {
    throw new Error(
      `Could not load expense vendors: ${vendorsResult.error.message}`,
    );
  }

  const properties = propertiesResult.data ?? [];
  const units = unitsResult.data ?? [];
  const vendors = vendorsResult.data ?? [];
  const propertiesById = indexById(properties);
  const unitsById = indexById(units);
  const expenseSearchColumns = [
    "vendor_label",
    "category",
    "description",
    "reference",
  ];
  const baseQuery = () => {
    let query = supabase
      .from("finance_expense_items")
      .select("*", { count: "exact" })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .gte("invoice_date", monthScope.from)
      .lt("invoice_date", monthScope.before);

    if (viewQuery.status !== "all") {
      query = query.eq("status", viewQuery.status);
    }

    if (viewQuery.propertyId !== "all") {
      query = query.eq("property_id", viewQuery.propertyId);
    }

    if (viewQuery.unitId !== "all") {
      query = query.eq("unit_id", viewQuery.unitId);
    }

    for (const searchGroup of buildPostgrestIlikeOrFilters(
      expenseSearchColumns,
      viewQuery.query,
    )) {
      query = query.or(searchGroup);
    }

    return query;
  };
  const today = getBusinessDateValue();
  const [countResult, summaryResult] = await Promise.all([
    baseQuery().limit(0),
    supabase.rpc("get_finance_expense_workflow_summary", {
      p_invoice_before: monthScope.before,
      p_invoice_from: monthScope.from,
      p_organization_id: organizationId,
      p_property_id:
        viewQuery.propertyId === "all" ? null : viewQuery.propertyId,
      p_query: viewQuery.query,
      p_status: viewQuery.status === "all" ? null : viewQuery.status,
      p_today: today,
      p_unit_id: viewQuery.unitId === "all" ? null : viewQuery.unitId,
    }),
  ]);

  if (countResult.error) {
    throw new Error(
      `Could not load expense count: ${countResult.error.message}`,
    );
  }

  if (summaryResult.error) {
    throw new Error(
      `Could not load expense summary: ${summaryResult.error.message}`,
    );
  }

  const pagination = buildBillsExpensesPagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: countResult.count ?? 0,
  });
  const rangeFrom = pagination.totalCount === 0 ? 0 : pagination.from - 1;
  const rangeTo = pagination.totalCount === 0 ? 0 : pagination.to - 1;
  const itemsResult = await baseQuery()
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (itemsResult.error) {
    throw new Error(
      `Could not load expense items: ${itemsResult.error.message}`,
    );
  }

  const rows = (itemsResult.data ?? []) as ExpenseRow[];
  const summaryRow = summaryResult.data?.[0] ?? null;

  return {
    expenseItems: rows.map((row) =>
      toBillsExpenseItem({
        propertiesById,
        row,
        today,
        unitsById,
      }),
    ),
    pagination,
    propertyOptions: toPropertyOptions(properties),
    summary: buildBillsExpensesSummary(summaryRow),
    unitOptions: toUnitOptions(units, propertiesById),
    vendorOptions: toVendorOptions(vendors),
    viewQuery,
  };
}

function toBillsExpenseItem({
  propertiesById,
  row,
  today,
  unitsById,
}: {
  propertiesById: Map<string, PropertyRow>;
  row: ExpenseRow;
  today: string;
  unitsById: Map<string, UnitRow>;
}): BillsExpenseItem {
  const property = propertiesById.get(row.property_id);
  const unit = row.unit_id ? unitsById.get(row.unit_id) : undefined;
  const isOverdue =
    Boolean(row.due_date) &&
    row.due_date! < today &&
    (row.status === "draft" || row.status === "approved");
  const ownerReceivable = Math.max(
    0,
    Number(row.owner_reimbursable_amount ?? 0) -
      Number(row.owner_reimbursed_amount ?? 0),
  );

  return {
    amount: row.amount,
    amountDisplay: formatMoneyDisplay(row.amount, row.currency),
    category: row.category,
    currency: row.currency,
    description: row.description ?? "",
    dueDate: row.due_date,
    economicScope: row.economic_scope as BillsExpenseItem["economicScope"],
    economicScopeLabel: getEconomicScopeLabel(row.economic_scope),
    expenseType: row.expense_type as BillsExpenseItem["expenseType"],
    expenseTypeLabel: getExpenseTypeLabel(row.expense_type),
    hrefs: {
      ledger: row.ledger_entry_id ? `/ledger?entryId=${row.ledger_entry_id}` : undefined,
      property: `/properties/${row.property_id}`,
      unit: row.unit_id ? `/units/${row.unit_id}` : undefined,
    },
    id: row.id,
    invoiceDate: row.invoice_date,
    isOverdue,
    ledgerEntryId: row.ledger_entry_id,
    nextAction: getNextAction(row.status as BillsExpenseStatus, isOverdue),
    ownerBillStatus: row.owner_bill_status as BillsExpenseItem["ownerBillStatus"],
    ownerBillStatusLabel: getOwnerBillStatusLabel(row.owner_bill_status),
    ownerReceivableDisplay: formatMoneyDisplay(ownerReceivable, row.currency),
    ownerReimbursableAmount: row.owner_reimbursable_amount,
    ownerReimbursedAmount: row.owner_reimbursed_amount,
    paidDate: row.paid_date,
    propertyCode: property?.code ?? "Property",
    propertyId: row.property_id,
    propertyName: property?.name ?? "Unknown property",
    reference: row.reference ?? "",
    status: row.status as BillsExpenseStatus,
    statusLabel: getStatusLabel(row.status),
    companyLossAmount: row.company_loss_amount,
    companyLossDisplay: formatMoneyDisplay(row.company_loss_amount, row.currency),
    unitId: row.unit_id,
    unitNumber: unit?.unit_number ?? "No unit",
    vendorLabel: row.vendor_label,
    vendorPersonId: row.vendor_person_id,
  };
}

function buildBillsExpensesSummary(
  row: ExpenseSummaryRow | null,
): BillsExpensesSummary {
  return {
    approvedCount: String(row?.approved_count ?? 0),
    draftCount: String(row?.draft_count ?? 0),
    overdueCount: String(row?.overdue_count ?? 0),
    postedTotal: formatMoneyDisplay(row?.posted_total ?? 0),
    unpostedTotal: formatMoneyDisplay(row?.unposted_total ?? 0),
  };
}

function toPropertyOptions(properties: PropertyRow[]): BillsExpenseOption[] {
  return properties.map((property) => ({
    id: property.id,
    label: `${property.code} / ${property.name}`,
  }));
}

function toUnitOptions(
  units: UnitRow[],
  propertiesById: Map<string, PropertyRow>,
): BillsExpenseUnitOption[] {
  return units.map((unit) => ({
    id: unit.id,
    label: `${propertiesById.get(unit.property_id)?.code ?? "Property"} / ${unit.unit_number}`,
    propertyId: unit.property_id,
  }));
}

function toVendorOptions(vendors: PersonRow[]): BillsExpenseOption[] {
  return vendors.map((vendor) => ({
    id: vendor.id,
    label: vendor.display_name,
  }));
}

function getExpenseTypeLabel(value: string) {
  return (
    expenseTypeOptions.find((option) => option.value === value)?.label ??
    "Other expense"
  );
}

function getEconomicScopeLabel(value: string) {
  return (
    economicScopeOptions.find((option) => option.value === value)?.label ??
    "Property expense"
  );
}

function getOwnerBillStatusLabel(value: string) {
  return (
    ownerBillStatusOptions.find((option) => option.value === value)?.label ??
    "Not billable"
  );
}

function getStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getNextAction(status: BillsExpenseStatus, isOverdue: boolean) {
  if (status === "draft") {
    return isOverdue ? "Review overdue bill" : "Approve";
  }

  if (status === "approved") {
    return "Post to ledger";
  }

  if (status === "posted") {
    return "Mark paid";
  }

  if (status === "paid") {
    return "Closed";
  }

  return "No action";
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

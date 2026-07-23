import { createSupabaseServerClient } from "@/lib/db/server";
import { getPersonSelectOptions } from "@/features/people/data/person-options";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import {
  formatPropertyOptionLabel,
  formatUnitOptionLabel,
} from "@/lib/entity-option-labels";
import { formatMoneyDisplay } from "@/lib/money/format";
import {
  buildRentIncomePagination,
  getRentIncomeMonthScope,
} from "@/features/rent-income/rent-income.filters";
import {
  validateRentIncomeCreateDefaults,
  type RentIncomeCreateRequest,
} from "@/features/rent-income/rent-income-create";
import { getRentIncomeWorkflow } from "@/features/rent-income/rent-income-workflow";
import { buildPostgrestIlikeOrFilters } from "@/lib/query/screen-query";
import {
  incomeTypeOptions,
  type RentIncomeItem,
  type RentIncomeLeaseOption,
  type RentIncomeOption,
  type RentIncomeStatus,
  type RentIncomeReceipt,
  type RentIncomeScreenData,
  type RentIncomeSummary,
  type RentIncomeUnitOption,
  type RentIncomeViewQuery,
} from "@/features/rent-income/rent-income.types";
import type { Database } from "@/types/database";

type IncomeRow = Database["public"]["Tables"]["finance_income_items"]["Row"];
type IncomeSummaryRow =
  Database["public"]["Functions"]["get_finance_income_workflow_summary"]["Returns"][number];
type PropertyRow = Pick<
  Database["public"]["Tables"]["properties"]["Row"],
  "code" | "id" | "name"
>;
type UnitRow = Pick<
  Database["public"]["Tables"]["units"]["Row"],
  "id" | "property_id" | "unit_number"
>;
type LeaseRow = Pick<
  Database["public"]["Tables"]["leases"]["Row"],
  | "id"
  | "monthly_rent_amount"
  | "monthly_rent_currency"
  | "primary_tenant_person_id"
  | "property_id"
  | "tenant_name"
  | "unit_id"
>;
type ReceiptAllocationRow = Pick<
  Database["public"]["Tables"]["finance_receipt_allocations"]["Row"],
  "amount" | "income_item_id" | "receipt_id"
>;
type ReceiptRow = Pick<
  Database["public"]["Tables"]["finance_receipts"]["Row"],
  "id" | "received_date" | "reference" | "reversal_of_id"
>;

export async function getRentIncomeScreenData(
  organizationId: string,
  viewQuery: RentIncomeViewQuery,
  createRequest?: RentIncomeCreateRequest,
): Promise<RentIncomeScreenData> {
  const supabase = await createSupabaseServerClient();
  const monthScope = getRentIncomeMonthScope(viewQuery.month);
  const [propertiesResult, unitsResult, leasesResult, payerOptions] = await Promise.all([
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
      .from("leases")
      .select(
        "id, property_id, unit_id, primary_tenant_person_id, tenant_name, monthly_rent_amount, monthly_rent_currency",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .in("status", ["active", "notice_given"])
      .order("tenant_name", { ascending: true }),
    getPersonSelectOptions({
      organizationId,
      roles: ["tenant", "owner", "vendor", "staff"],
    }),
  ]);

  if (propertiesResult.error) {
    throw new Error(
      `Could not load income properties: ${propertiesResult.error.message}`,
    );
  }

  if (unitsResult.error) {
    throw new Error(`Could not load income units: ${unitsResult.error.message}`);
  }

  if (leasesResult.error) {
    throw new Error(
      `Could not load income leases: ${leasesResult.error.message}`,
    );
  }

  const properties = propertiesResult.data ?? [];
  const units = unitsResult.data ?? [];
  const leases = leasesResult.data ?? [];
  const propertiesById = indexById(properties);
  const unitsById = indexById(units);
  const incomeSearchColumns = ["payer_label", "description", "reference"];
  const focusedIncomeItemId =
    viewQuery.incomeItemId && viewQuery.incomeItemId !== "all"
      ? viewQuery.incomeItemId
      : undefined;
  const baseQuery = () => {
    let query = supabase
      .from("finance_income_items")
      .select("*", { count: "exact" })
      .eq("organization_id", organizationId);

    if (focusedIncomeItemId) {
      if (viewQuery.archiveState !== "all") {
        query = query.is("archived_at", null);
      }

      return query.eq("id", focusedIncomeItemId);
    }

    query = query
      .is("archived_at", null)
      .gte("due_date", monthScope.from)
      .lt("due_date", monthScope.before);

    if (viewQuery.status !== "all") {
      query = query.eq("status", viewQuery.status);
    }

    if (viewQuery.incomeGroup === "management-company") {
      query = query.in("income_type", [
        "management_fee",
        "leasing_commission",
        "service_fee",
        "maintenance_markup",
      ]);
    }

    if (viewQuery.incomeType !== "all") {
      query = query.eq("income_type", viewQuery.incomeType);
    }

    if (viewQuery.propertyId !== "all") {
      query = query.eq("property_id", viewQuery.propertyId);
    }

    if (viewQuery.unitId !== "all") {
      query = query.eq("unit_id", viewQuery.unitId);
    }

    for (const searchGroup of buildPostgrestIlikeOrFilters(
      incomeSearchColumns,
      viewQuery.query,
    )) {
      query = query.or(searchGroup);
    }

    return query;
  };
  const today = getBusinessDateValue();
  const [countResult, summaryResult] = await Promise.all([
    baseQuery().limit(0),
    supabase.rpc("get_finance_income_workflow_summary", {
      p_due_before: monthScope.before,
      p_due_from: monthScope.from,
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
      `Could not load income count: ${countResult.error.message}`,
    );
  }

  if (summaryResult.error) {
    throw new Error(
      `Could not load income summary: ${summaryResult.error.message}`,
    );
  }

  const pagination = buildRentIncomePagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: countResult.count ?? 0,
  });
  const rangeFrom = pagination.totalCount === 0 ? 0 : pagination.from - 1;
  const rangeTo = pagination.totalCount === 0 ? 0 : pagination.to - 1;
  const itemsResult = await baseQuery()
    .order("due_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (itemsResult.error) {
    throw new Error(
      `Could not load income items: ${itemsResult.error.message}`,
    );
  }

  const rows = (itemsResult.data ?? []) as IncomeRow[];
  const summaryRow = summaryResult.data?.[0] ?? null;
  const receiptsByIncomeId = await getReceiptsByIncomeId({
    incomeItemIds: rows.map((row) => row.id),
    organizationId,
    supabase,
  });
  const propertyOptions = toPropertyOptions(properties);
  const unitOptions = toUnitOptions(units, propertiesById);
  const leaseOptions = toLeaseOptions(leases);

  return {
    createDefaults: validateRentIncomeCreateDefaults({
      leaseOptions,
      payerOptions,
      propertyOptions,
      request: createRequest,
      unitOptions,
    }),
    incomeItems: rows.map((row) =>
      toRentIncomeItem({
        propertiesById,
        receipts: receiptsByIncomeId.get(row.id) ?? [],
        row,
        today,
        unitsById,
      }),
    ),
    leaseOptions,
    pagination,
    payerOptions,
    propertyOptions,
    summary: buildRentIncomeSummary(summaryRow),
    unitOptions,
    viewQuery,
  };
}

function toRentIncomeItem({
  propertiesById,
  receipts,
  row,
  today,
  unitsById,
}: {
  propertiesById: Map<string, PropertyRow>;
  receipts: RentIncomeReceipt[];
  row: IncomeRow;
  today: string;
  unitsById: Map<string, UnitRow>;
}): RentIncomeItem {
  const property = propertiesById.get(row.property_id);
  const unit = row.unit_id ? unitsById.get(row.unit_id) : undefined;
  const workflow = getRentIncomeWorkflow({
    amountDue: row.amount_due,
    amountReceived: row.amount_received,
    ledgerEntryId: row.ledger_entry_id,
    status: row.status as RentIncomeStatus,
  });
  const balance = workflow.remainingAmount;
  const isOverdue =
    row.due_date < today &&
    (row.status === "open" || row.status === "partially_received");

  return {
    amountDue: row.amount_due,
    amountDueDisplay: formatMoneyDisplay(row.amount_due, row.currency),
    amountReceived: row.amount_received,
    amountReceivedDisplay: formatMoneyDisplay(row.amount_received, row.currency),
    archivedAt: row.archived_at ?? undefined,
    balanceDisplay: formatMoneyDisplay(balance, row.currency),
    currency: row.currency,
    description: row.description ?? "",
    dueDate: row.due_date,
    hrefs: {
      ledger: row.ledger_entry_id ? `/ledger?entryId=${row.ledger_entry_id}` : undefined,
      lease: row.lease_id ? `/leases?leaseId=${row.lease_id}` : undefined,
      property: `/properties/${row.property_id}`,
      unit: row.unit_id ? `/units/${row.unit_id}` : undefined,
    },
    id: row.id,
    incomeType: row.income_type as RentIncomeItem["incomeType"],
    incomeTypeLabel: getIncomeTypeLabel(row.income_type),
    isOverdue,
    leaseId: row.lease_id,
    ledgerEntryId: row.ledger_entry_id,
    nextAction:
      isOverdue && workflow.nextAction === "Record receipt"
        ? "Follow up and record receipt"
        : workflow.nextAction,
    payerLabel: row.payer_label,
    payerPersonId: row.payer_person_id,
    propertyCode: property?.code ?? "Property",
    propertyId: row.property_id,
    propertyName: property?.name ?? "Unknown property",
    receivedDate: row.received_date,
    reference: row.reference ?? "",
    receipts,
    status: row.status as RentIncomeStatus,
    statusLabel: getStatusLabel(row.status),
    unitId: row.unit_id,
    unitNumber: unit?.unit_number ?? "No unit",
  };
}

function buildRentIncomeSummary(
  row: IncomeSummaryRow | null,
): RentIncomeSummary {
  return {
    openCount: String(row?.open_count ?? 0),
    overdueCount: String(row?.overdue_count ?? 0),
    receivedTotal: formatMoneyDisplay(row?.received_total ?? 0),
    receivableTotal: formatMoneyDisplay(row?.receivable_total ?? 0),
    unpostedCount: String(row?.unposted_count ?? 0),
  };
}

function toPropertyOptions(properties: PropertyRow[]): RentIncomeOption[] {
  return properties.map((property) => ({
    id: property.id,
    label: formatPropertyOptionLabel(property),
  }));
}

function toUnitOptions(
  units: UnitRow[],
  propertiesById: Map<string, PropertyRow>,
): RentIncomeUnitOption[] {
  return units.map((unit) => ({
    id: unit.id,
    label: formatUnitOptionLabel({
      propertyCode: propertiesById.get(unit.property_id)?.code,
      unitNumber: unit.unit_number,
    }),
    propertyId: unit.property_id,
  }));
}

function toLeaseOptions(leases: LeaseRow[]): RentIncomeLeaseOption[] {
  return leases.flatMap((lease) =>
    lease.primary_tenant_person_id
      ? [
          {
            currency: lease.monthly_rent_currency,
            id: lease.id,
            label: lease.tenant_name,
            monthlyRentAmount: lease.monthly_rent_amount,
            propertyId: lease.property_id,
            tenantPersonId: lease.primary_tenant_person_id,
            tenantName: lease.tenant_name,
            unitId: lease.unit_id,
          },
        ]
      : [],
  );
}

function getIncomeTypeLabel(value: string) {
  return (
    incomeTypeOptions.find((option) => option.value === value)?.label ??
    "Other income"
  );
}

function getStatusLabel(status: string) {
  if (status === "partially_received") {
    return "Partial";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function getReceiptsByIncomeId({
  incomeItemIds,
  organizationId,
  supabase,
}: {
  incomeItemIds: string[];
  organizationId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}) {
  const receiptsByIncomeId = new Map<string, RentIncomeReceipt[]>();
  if (incomeItemIds.length === 0) return receiptsByIncomeId;

  const allocationsResult = await supabase
    .from("finance_receipt_allocations")
    .select("income_item_id, receipt_id, amount")
    .eq("organization_id", organizationId)
    .in("income_item_id", incomeItemIds);

  if (allocationsResult.error) {
    throw new Error(
      `Could not load income receipt allocations: ${allocationsResult.error.message}`,
    );
  }

  const allocations = (allocationsResult.data ?? []) as ReceiptAllocationRow[];
  const receiptIds = [...new Set(allocations.map((row) => row.receipt_id))];
  if (receiptIds.length === 0) return receiptsByIncomeId;

  const receiptsResult = await supabase
    .from("finance_receipts")
    .select("id, received_date, reference, reversal_of_id")
    .eq("organization_id", organizationId)
    .in("id", receiptIds);

  if (receiptsResult.error) {
    throw new Error(`Could not load income receipts: ${receiptsResult.error.message}`);
  }

  const receiptById = new Map(
    ((receiptsResult.data ?? []) as ReceiptRow[]).map((row) => [row.id, row]),
  );

  for (const allocation of allocations) {
    const receipt = receiptById.get(allocation.receipt_id);
    if (!receipt) continue;
    const reversed = receipt.reversal_of_id !== null;
    const amount = reversed ? -allocation.amount : allocation.amount;
    const next: RentIncomeReceipt = {
      amount,
      amountDisplay: formatMoneyDisplay(amount),
      id: receipt.id,
      receivedDate: receipt.received_date,
      reference: receipt.reference ?? "",
      reversed,
    };
    const current = receiptsByIncomeId.get(allocation.income_item_id) ?? [];
    current.push(next);
    receiptsByIncomeId.set(allocation.income_item_id, current);
  }

  for (const receipts of receiptsByIncomeId.values()) {
    receipts.sort((left, right) =>
      right.receivedDate.localeCompare(left.receivedDate),
    );
  }

  return receiptsByIncomeId;
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

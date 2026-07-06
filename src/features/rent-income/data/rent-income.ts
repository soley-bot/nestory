import { createSupabaseServerClient } from "@/lib/db/server";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatMoneyDisplay } from "@/lib/money/format";
import {
  buildRentIncomePagination,
  getRentIncomeMonthScope,
} from "@/features/rent-income/rent-income.filters";
import {
  incomeTypeOptions,
  type RentIncomeItem,
  type RentIncomeLeaseOption,
  type RentIncomeOption,
  type RentIncomeStatus,
  type RentIncomeSummary,
  type RentIncomeUnitOption,
  type RentIncomeViewQuery,
} from "@/features/rent-income/rent-income.types";
import type { Database } from "@/types/database";

type IncomeRow =
  Database["public"]["Tables"]["finance_income_items"]["Row"];
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
  "id" | "property_id" | "tenant_name" | "unit_id"
>;

export async function getRentIncomeScreenData(
  organizationId: string,
  viewQuery: RentIncomeViewQuery,
) {
  const supabase = await createSupabaseServerClient();
  const monthScope = getRentIncomeMonthScope(viewQuery.month);
  const [propertiesResult, unitsResult, leasesResult] = await Promise.all([
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
      .select("id, property_id, unit_id, tenant_name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .in("status", ["active", "notice_given"])
      .order("tenant_name", { ascending: true }),
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
  const baseQuery = () => {
    let query = supabase
      .from("finance_income_items")
      .select("*", { count: "exact" })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .gte("due_date", monthScope.from)
      .lt("due_date", monthScope.before);

    if (viewQuery.status !== "all") {
      query = query.eq("status", viewQuery.status);
    }

    if (viewQuery.propertyId !== "all") {
      query = query.eq("property_id", viewQuery.propertyId);
    }

    if (viewQuery.unitId !== "all") {
      query = query.eq("unit_id", viewQuery.unitId);
    }

    const cleanedQuery = viewQuery.query.trim();

    if (cleanedQuery) {
      const token = cleanedQuery.replaceAll("%", "\\%");
      query = query.or(
        `payer_label.ilike.%${token}%,description.ilike.%${token}%,reference.ilike.%${token}%`,
      );
    }

    return query;
  };
  const summaryResult = await baseQuery();

  if (summaryResult.error) {
    throw new Error(
      `Could not load income summary: ${summaryResult.error.message}`,
    );
  }

  const pagination = buildRentIncomePagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: summaryResult.count ?? 0,
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

  const today = getBusinessDateValue();
  const rows = (itemsResult.data ?? []) as IncomeRow[];
  const summaryRows = (summaryResult.data ?? []) as IncomeRow[];

  return {
    incomeItems: rows.map((row) =>
      toRentIncomeItem({
        propertiesById,
        row,
        today,
        unitsById,
      }),
    ),
    leaseOptions: toLeaseOptions(leases),
    pagination,
    propertyOptions: toPropertyOptions(properties),
    summary: buildRentIncomeSummary(summaryRows, today),
    unitOptions: toUnitOptions(units, propertiesById),
    viewQuery,
  };
}

function toRentIncomeItem({
  propertiesById,
  row,
  today,
  unitsById,
}: {
  propertiesById: Map<string, PropertyRow>;
  row: IncomeRow;
  today: string;
  unitsById: Map<string, UnitRow>;
}): RentIncomeItem {
  const property = propertiesById.get(row.property_id);
  const unit = row.unit_id ? unitsById.get(row.unit_id) : undefined;
  const balance = Math.max(0, row.amount_due - row.amount_received);
  const isOverdue =
    row.due_date < today &&
    (row.status === "open" || row.status === "partially_received");

  return {
    amountDue: row.amount_due,
    amountDueDisplay: formatMoneyDisplay(row.amount_due, row.currency),
    amountReceived: row.amount_received,
    amountReceivedDisplay: formatMoneyDisplay(row.amount_received, row.currency),
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
    nextAction: getNextAction(row.status as RentIncomeStatus, isOverdue),
    payerLabel: row.payer_label,
    propertyCode: property?.code ?? "Property",
    propertyId: row.property_id,
    propertyName: property?.name ?? "Unknown property",
    receivedDate: row.received_date,
    reference: row.reference ?? "",
    status: row.status as RentIncomeStatus,
    statusLabel: getStatusLabel(row.status),
    unitId: row.unit_id,
    unitNumber: unit?.unit_number ?? "No unit",
  };
}

function buildRentIncomeSummary(
  rows: IncomeRow[],
  today: string,
): RentIncomeSummary {
  const receivable = rows.reduce((sum, row) => sum + row.amount_due, 0);
  const received = rows.reduce((sum, row) => sum + row.amount_received, 0);
  const openRows = rows.filter((row) =>
    ["open", "partially_received", "received"].includes(row.status),
  );
  const overdueRows = rows.filter(
    (row) =>
      row.due_date < today &&
      (row.status === "open" || row.status === "partially_received"),
  );
  const unpostedRows = rows.filter((row) =>
    ["partially_received", "received"].includes(row.status),
  );

  return {
    openCount: String(openRows.length),
    overdueCount: String(overdueRows.length),
    receivedTotal: formatMoneyDisplay(received),
    receivableTotal: formatMoneyDisplay(receivable),
    unpostedCount: String(unpostedRows.length),
  };
}

function toPropertyOptions(properties: PropertyRow[]): RentIncomeOption[] {
  return properties.map((property) => ({
    id: property.id,
    label: `${property.code} / ${property.name}`,
  }));
}

function toUnitOptions(
  units: UnitRow[],
  propertiesById: Map<string, PropertyRow>,
): RentIncomeUnitOption[] {
  return units.map((unit) => ({
    id: unit.id,
    label: `${propertiesById.get(unit.property_id)?.code ?? "Property"} / ${unit.unit_number}`,
    propertyId: unit.property_id,
  }));
}

function toLeaseOptions(leases: LeaseRow[]): RentIncomeLeaseOption[] {
  return leases.map((lease) => ({
    id: lease.id,
    label: lease.tenant_name,
    propertyId: lease.property_id,
    tenantName: lease.tenant_name,
    unitId: lease.unit_id,
  }));
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

function getNextAction(status: RentIncomeStatus, isOverdue: boolean) {
  if (status === "posted") {
    return "Posted to ledger";
  }

  if (status === "received" || status === "partially_received") {
    return "Post to ledger";
  }

  if (isOverdue) {
    return "Follow up";
  }

  return "Record payment";
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

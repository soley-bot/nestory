import { createSupabaseServerClient } from "@/lib/db/server";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import { parseExactMoneyToCents } from "@/features/finance/data/property-cash-events.money";
import { getReportMonthRange } from "@/features/reports/reports.filters";
import {
  assertCompleteReportSource,
  reportSourceRangeEnd,
} from "@/features/reports/data/report-source-completeness";
import type {
  ReportsViewQuery,
  TrustedReport,
  TrustedReportRow,
} from "@/features/reports/reports.types";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type ManagementFeeProperty = {
  code: string;
  id: string;
  name: string;
};

export type ManagementFeeReceiptAllocation = {
  allocationId: string;
  amount: number | string;
  incomeItemId: string;
  incomeType: string;
  propertyId: string;
  receiptId: string;
  receivedDate: string;
  reversalOfId: string | null;
};

type ManagementFeeReceiptRow = {
  amount: number | string;
  finance_income_items: {
    id: string;
    income_type: string;
    property_id: string;
  } | null;
  finance_receipts: {
    id: string;
    received_date: string;
    reversal_of_id: string | null;
  } | null;
  id: string;
  income_item_id: string;
};

const managementFeeTypes = new Set([
  "leasing_commission",
  "maintenance_markup",
  "management_fee",
  "service_fee",
]);

export async function getManagementFeeReport({
  organizationId,
  viewQuery,
}: {
  organizationId: string;
  viewQuery: ReportsViewQuery;
}) {
  const supabase = await createSupabaseServerClient();
  const period = getReportMonthRange(viewQuery.month);
  const properties = await loadProperties(supabase, organizationId, viewQuery);
  const propertyIds = properties.map(({ id }) => id);

  if (propertyIds.length === 0) {
    return buildManagementFeeReport({
      properties,
      receiptAllocations: [],
      viewQuery,
    });
  }

  const receiptRows = await loadReceiptAllocations(
    supabase,
    organizationId,
    propertyIds,
    period,
  );

  return buildManagementFeeReport({
    properties,
    receiptAllocations: receiptRows.flatMap(normalizeReceiptAllocation),
    viewQuery,
  });
}

export function buildManagementFeeReport({
  generatedAt = new Date().toISOString(),
  properties,
  receiptAllocations,
  viewQuery,
}: {
  generatedAt?: string;
  properties: ManagementFeeProperty[];
  receiptAllocations: ManagementFeeReceiptAllocation[];
  viewQuery: ReportsViewQuery;
}): TrustedReport {
  const period = getReportMonthRange(viewQuery.month);
  const allocationsByProperty = new Map<
    string,
    ManagementFeeReceiptAllocation[]
  >();

  for (const allocation of receiptAllocations) {
    if (!managementFeeTypes.has(allocation.incomeType)) {
      continue;
    }

    const group = allocationsByProperty.get(allocation.propertyId) ?? [];
    group.push(allocation);
    allocationsByProperty.set(allocation.propertyId, group);
  }

  const rows = properties.flatMap((property): TrustedReportRow[] => {
    const allocations = allocationsByProperty.get(property.id) ?? [];
    if (allocations.length === 0) {
      return [];
    }

    const collectedCents = allocations.reduce(
      (total, allocation) =>
        total +
        signedAmountCents(allocation.amount, allocation.reversalOfId),
      BigInt(0),
    );
    const href = managementFeeReviewHref(viewQuery.month, property.id);

    return [
      {
        cells: {
          collected: cents(collectedCents),
          property: `${property.code} - ${property.name}`,
        },
        href,
        id: `management-fees:${property.id}`,
        propertyId: property.id,
        sourceCount: allocations.length,
        sourceLinks: allocations.map((allocation) => ({
          href,
          id: allocation.receiptId,
          label: `Receipt ${allocation.receiptId}`,
          recordType: "receipt" as const,
        })),
        sourceSummary:
          allocations.length === 1
            ? "1 receipt allocation"
            : `${allocations.length} receipt allocations`,
        title: `${property.code} - ${property.name}`,
        tone: collectedCents < BigInt(0) ? "danger" : "success",
      },
    ];
  });
  const totalCents = rows.reduce(
    (total, row) =>
      total +
      (allocationsByProperty.get(row.propertyId ?? "") ?? []).reduce(
        (propertyTotal, allocation) =>
          propertyTotal +
          signedAmountCents(allocation.amount, allocation.reversalOfId),
        BigInt(0),
      ),
    BigInt(0),
  );
  const sourceCount = rows.reduce((total, row) => total + row.sourceCount, 0);

  return {
    columns: [
      { key: "property", label: "Property" },
      { align: "right", key: "collected", label: "Fees collected" },
    ],
    description:
      "Management fee cash collected across managed properties in the selected month.",
    emptyDescription:
      "No receipt allocations classified as collected management fees were recorded in this scope.",
    emptyTitle: "No management fees collected",
    exportFilenameBase: "management-fees",
    generatedAt,
    kind: "management-fees",
    periodLabel: `${formatDate(period.start)} - ${formatDate(period.end)}`,
    rows,
    scopeLabel: getScopeLabel(viewQuery, properties),
    summary: [
      {
        detail: "Receipt-date cash classified as management-company fees",
        label: "Fees collected",
        sourceCount,
        value: cents(totalCents),
      },
      {
        detail: "Managed properties with collected fee cash",
        label: "Properties",
        sourceCount,
        value: String(rows.length),
      },
    ],
    title: "Management Fee Statement",
    totalsTraceLabel: `Total collected traces to ${sourceCount} management-fee receipt allocation${sourceCount === 1 ? "" : "s"}.`,
  };
}

async function loadProperties(
  supabase: SupabaseServerClient,
  organizationId: string,
  viewQuery: ReportsViewQuery,
) {
  let query = supabase
    .from("properties")
    .select("id, code, name", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("archived_at", null);

  if (viewQuery.propertyId !== "all") {
    query = query.eq("id", viewQuery.propertyId);
  }

  const result = await query
    .order("code", { ascending: true })
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(
      `Could not load management fee properties: ${result.error.message}`,
    );
  }

  assertCompleteReportSource("management fee properties", result);
  return (result.data ?? []) as ManagementFeeProperty[];
}

async function loadReceiptAllocations(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
  period: { end: string; start: string },
) {
  const result = await supabase
    .from("finance_receipt_allocations")
    .select(
      "id, amount, income_item_id, finance_receipts!finance_receipt_allocations_receipt_id_fkey!inner(id, received_date, reversal_of_id, property_id), finance_income_items!finance_receipt_allocations_income_item_id_fkey!inner(id, property_id, income_type)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .in("finance_receipts.property_id", propertyIds)
    .in("finance_income_items.property_id", propertyIds)
    .in("finance_income_items.income_type", [...managementFeeTypes])
    .is("finance_income_items.archived_at", null)
    .neq("finance_income_items.status", "void")
    .gte("finance_receipts.received_date", period.start)
    .lte("finance_receipts.received_date", period.end)
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(
      `Could not load management fee receipts: ${result.error.message}`,
    );
  }

  assertCompleteReportSource("management fee receipt allocations", result);
  return (result.data ?? []) as unknown as ManagementFeeReceiptRow[];
}

function normalizeReceiptAllocation(
  row: ManagementFeeReceiptRow,
): ManagementFeeReceiptAllocation[] {
  if (!row.finance_income_items || !row.finance_receipts) {
    return [];
  }

  return [
    {
      allocationId: row.id,
      amount: row.amount,
      incomeItemId: row.income_item_id,
      incomeType: row.finance_income_items.income_type,
      propertyId: row.finance_income_items.property_id,
      receiptId: row.finance_receipts.id,
      receivedDate: row.finance_receipts.received_date,
      reversalOfId: row.finance_receipts.reversal_of_id,
    },
  ];
}

function managementFeeReviewHref(month: string, propertyId: string) {
  const params = new URLSearchParams({
    month,
    propertyId,
    incomeScope: "management-fees",
  });
  return `/rent-income?${params.toString()}`;
}

function getScopeLabel(
  viewQuery: ReportsViewQuery,
  properties: ManagementFeeProperty[],
) {
  if (viewQuery.propertyId === "all") {
    return "All properties";
  }

  const property = properties.find(({ id }) => id === viewQuery.propertyId);
  return property
    ? `${property.code} - ${property.name}`
    : "Selected property";
}

function signedAmountCents(
  amount: number | string,
  reversalOfId: string | null,
) {
  const amountCents = parseExactMoneyToCents(amount);
  return reversalOfId ? -amountCents : amountCents;
}

function cents(value: bigint) {
  return formatMoneyDisplay(Number(value) / 100, "USD").primary;
}

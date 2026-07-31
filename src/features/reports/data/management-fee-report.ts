import { formatDate } from "@/lib/dates/format";
import { getReportMonthRange } from "@/features/reports/reports.filters";
import type {
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";

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

export const MANAGEMENT_FEE_REPORT_UNAVAILABLE_MESSAGE =
  "Management Fee Statement is unavailable until management-fee owner-recognition authority is resolved. Legacy receipt allocations are not publishable report evidence.";

export async function getManagementFeeReport({
  viewQuery,
}: {
  organizationId: string;
  viewQuery: ReportsViewQuery;
}) {
  return buildManagementFeeReport({
    properties: [],
    receiptAllocations: [],
    viewQuery,
  });
}

export function buildManagementFeeReport({
  generatedAt = new Date().toISOString(),
  properties,
  viewQuery,
}: {
  generatedAt?: string;
  properties: ManagementFeeProperty[];
  receiptAllocations: ManagementFeeReceiptAllocation[];
  viewQuery: ReportsViewQuery;
}): TrustedReport {
  const period = getReportMonthRange(viewQuery.month);
  const validation = {
    code: "management_fee_owner_recognition_unresolved",
    message: MANAGEMENT_FEE_REPORT_UNAVAILABLE_MESSAGE,
  };

  return {
    columns: [
      { key: "property", label: "Property" },
      { align: "right", key: "collected", label: "Fees collected" },
    ],
    description:
      "Management-fee reporting remains defined but cannot be published from unresolved legacy cash classifications.",
    emptyDescription: MANAGEMENT_FEE_REPORT_UNAVAILABLE_MESSAGE,
    emptyTitle: "Management Fee Statement unavailable",
    exportFilenameBase: "management-fees",
    exportValidation: {
      ...validation,
      status: 409,
    },
    generatedAt,
    kind: "management-fees",
    periodLabel: `${formatDate(period.start)} - ${formatDate(period.end)}`,
    rows: [],
    scopeLabel: getScopeLabel(viewQuery, properties),
    scopeValidation: validation,
    summary: [],
    title: "Management Fee Statement",
    totalsTraceLabel:
      "No management-fee totals are published while owner-recognition authority is unresolved.",
  };
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

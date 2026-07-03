import type {
  UnitBadgeTone,
  UnitStatusValue,
} from "@/features/units/unit.types";
import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export type ReportKind =
  | "rent-roll"
  | "unit-performance"
  | "property-performance"
  | "owner-statement"
  | "income-expense"
  | "lease-expiry"
  | "vacancy-risk"
  | "maintenance-cost"
  | "missing-data";

export type ReportStatusFilter = UnitStatusValue | "all";

export type ReportPropertyOption = {
  id: string;
  label: string;
};

export type ReportsViewQuery = {
  month: string;
  propertyId: string;
  report: ReportKind;
  status: ReportStatusFilter;
  unitId: string;
};

export type ReportSourceRecordType =
  | "document"
  | "lease"
  | "ledger"
  | "maintenance"
  | "owner"
  | "property"
  | "timeline"
  | "unit";

export type ReportSourceLink = {
  href?: string;
  id: string;
  label: string;
  recordType: ReportSourceRecordType;
};

export type TraceableReportMetric = {
  detail: string;
  label: string;
  sourceCount: number;
  value: string;
};

export type TrustedReportColumn = {
  align?: "left" | "right";
  key: string;
  label: string;
};

export type TrustedReportRow = {
  cells: Record<string, string>;
  href?: string;
  id: string;
  sourceCount: number;
  sourceLinks: ReportSourceLink[];
  sourceSummary: string;
  tone?: "danger" | "neutral" | "success" | "warning";
  title: string;
};

export type TrustedReport = {
  columns: TrustedReportColumn[];
  description: string;
  emptyDescription: string;
  emptyTitle: string;
  exportFilenameBase: string;
  generatedAt: string;
  kind: ReportKind;
  periodLabel: string;
  rows: TrustedReportRow[];
  scopeLabel: string;
  summary: TraceableReportMetric[];
  title: string;
  totalsTraceLabel: string;
  totalRowCount?: number;
};

export type OccupancyReportRow = {
  floorLabel: string;
  id: string;
  inclusionLabel: string;
  propertyCode: string;
  propertyId: string;
  propertyName: string;
  remark: string;
  rentAmount?: number;
  rentCurrency?: CurrencyCode;
  rentDisplay?: MoneyDisplayValue;
  rentLabel: string;
  sizeLabel: string;
  statusLabel: string;
  statusTone: UnitBadgeTone;
  statusValue: UnitStatusValue;
  typeLabel: string;
  unitNumber: string;
};

export type OccupancyReport = {
  generatedAt: string;
  rows: OccupancyReportRow[];
  totals: {
    occupied: number;
    other: number;
    total: number;
    vacant: number;
    visible: number;
  };
};

export type ReportsScreenData = {
  occupancyReport?: OccupancyReport;
  propertyOptions: ReportPropertyOption[];
  trustedReport: TrustedReport;
  viewQuery: ReportsViewQuery;
};

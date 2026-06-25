import type { UnitBadgeTone, UnitStatusValue } from "@/features/units/unit.types";
import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export type ReportKind = "occupancy" | "profit-loss";

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

export type ProfitLossReportEntry = {
  amount: number;
  amountDisplay: MoneyDisplayValue;
  category: string;
  currency: CurrencyCode;
  date: string;
  description: string;
  direction: "income" | "expense";
  id: string;
  name: string;
  propertyLabel: string;
  typeLabel: string;
};

export type ProfitLossCategoryGroup = {
  category: string;
  entries: ProfitLossReportEntry[];
  totalDisplay: MoneyDisplayValue;
};

export type ProfitLossDirectionGroup = {
  entryCount: number;
  groups: ProfitLossCategoryGroup[];
  label: "Income" | "Expenses";
  totalDisplay: MoneyDisplayValue;
};

export type ProfitLossReport = {
  entryCount: number;
  expenses: ProfitLossDirectionGroup;
  generatedAt: string;
  income: ProfitLossDirectionGroup;
  netIncomeDisplay: MoneyDisplayValue;
  netOtherIncomeDisplay: MoneyDisplayValue;
  netOperatingIncomeDisplay: MoneyDisplayValue;
  otherExpensesDisplay: MoneyDisplayValue;
  otherIncomeDisplay: MoneyDisplayValue;
  periodEnd: string;
  periodLabel: string;
  periodStart: string;
  propertyLabel: string;
  totalExpensesDisplay: MoneyDisplayValue;
  totalIncomeDisplay: MoneyDisplayValue;
};

export type ReportsScreenData = {
  currencySettings: {
    khrPerUsd: number;
    preferredCurrency: CurrencyCode;
  };
  occupancyReport?: OccupancyReport;
  profitLossReport?: ProfitLossReport;
  propertyOptions: ReportPropertyOption[];
  viewQuery: ReportsViewQuery;
};

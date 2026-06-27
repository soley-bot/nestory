import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export type LeaseBadgeTone =
  | "accent"
  | "danger"
  | "neutral"
  | "success"
  | "warning";

export type LeaseArchiveState = "active" | "archived" | "all";

export type LeaseSortKey =
  | "end_asc"
  | "rent_desc"
  | "start_desc"
  | "tenant_asc";

export type LeaseStatusValue =
  | "active"
  | "cancelled"
  | "draft"
  | "ended"
  | "notice_given"
  | "terminated";

export type LeaseStatusFilter = LeaseStatusValue | "all" | "current";

export type LeasePropertyOption = {
  id: string;
  label: string;
};

export type LeaseUnitOption = {
  id: string;
  label: string;
  propertyId: string;
};

export type LeaseFormValues = {
  depositAmount?: number | null;
  depositCurrency?: CurrencyCode | null;
  leaseEndDate: string;
  leaseStartDate: string;
  monthlyRentAmount: number;
  monthlyRentCurrency: CurrencyCode;
  propertyId: string;
  status: LeaseStatusValue;
  tenantName: string;
  unitId?: string | null;
};

export type LeasePagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};

export type LeaseViewQuery = {
  archiveState: LeaseArchiveState;
  endMonth: string;
  endsWithinDays: number | null;
  page: number;
  pageSize: number;
  propertyId: string;
  query: string;
  sort: LeaseSortKey;
  status: LeaseStatusFilter;
};

export type LeaseSummary = {
  depositDisplay?: MoneyDisplayValue;
  depositLabel: string;
  endDateLabel: string;
  formValues: LeaseFormValues;
  id: string;
  isArchived: boolean;
  leaseLabel: string;
  occupancyLabel: string;
  partySummary: string;
  propertyCode: string;
  propertyId: string;
  propertyName: string;
  rentDisplay: MoneyDisplayValue;
  rentLabel: string;
  rentUsd: number;
  startDateLabel: string;
  statusLabel: string;
  statusTone: LeaseBadgeTone;
  statusValue: LeaseStatusValue;
  tenantName: string;
  termLabel: string;
  unitId: string | null;
  unitLabel: string;
};

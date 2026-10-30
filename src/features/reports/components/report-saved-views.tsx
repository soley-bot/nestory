"use client";
import { SavedViewsControl } from "@/features/saved-views/saved-views-control";
import { buildReportQueryParams } from "@/features/reports/reports.filters";
import type { ReportsViewQuery } from "@/features/reports/reports.types";

export function ReportSavedViews({ storageKey, viewQuery }: { storageKey: string; viewQuery: ReportsViewQuery }) {
  return <SavedViewsControl resource={`/reports/${viewQuery.report}`} scope={storageKey} query={buildReportQueryParams(viewQuery).toString()} legacyStorageKey={`nestory:report-views:v1:${storageKey}:${viewQuery.report}`} />;
}

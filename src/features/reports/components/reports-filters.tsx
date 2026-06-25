import Link from "next/link";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { SelectControl } from "@/components/ui/select-control";
import {
  DEFAULT_REPORT_KIND,
  DEFAULT_REPORT_STATUS,
} from "@/features/reports/reports.filters";
import type {
  ReportKind,
  ReportPropertyOption,
  ReportsViewQuery,
} from "@/features/reports/reports.types";
import { cn } from "@/lib/utils";

type ReportsFiltersProps = {
  propertyOptions: ReportPropertyOption[];
  viewQuery: ReportsViewQuery;
};

export function ReportsFilters({
  propertyOptions,
  viewQuery,
}: ReportsFiltersProps) {
  return (
    <div className="border-b border-border bg-surface px-4 py-3 print:hidden sm:px-6 lg:px-8">
      <div className="space-y-2.5">
        <div
          aria-label="Report view"
          className="inline-flex h-8 rounded-md border border-border bg-surface-muted p-0.5 text-xs"
          role="group"
        >
          <ReportTab
            active={viewQuery.report === "occupancy"}
            href={buildReportHref("occupancy", viewQuery)}
          >
            Vacant units
          </ReportTab>
          <ReportTab
            active={viewQuery.report === "profit-loss"}
            href={buildReportHref("profit-loss", viewQuery)}
          >
            P&L details
          </ReportTab>
        </div>

        <form
          action="/reports"
          className="grid gap-2 rounded-md border border-border bg-surface-muted p-2 text-[13px] lg:grid-cols-[minmax(180px,240px)_minmax(150px,180px)_minmax(150px,180px)_auto_auto]"
          method="get"
        >
          <input name="report" type="hidden" value={viewQuery.report} />

          <SelectControl
            ariaLabel="Filter report by property"
            className="h-8 px-2 text-[13px]"
            defaultValue={viewQuery.propertyId}
            name="propertyId"
            options={[
              { label: "All properties", value: "all" },
              ...propertyOptions.map((property) => ({
                label: property.label,
                value: property.id,
              })),
            ]}
          />

          {viewQuery.report === "occupancy" ? (
            <SelectControl
              ariaLabel="Filter units by status"
              className="h-8 px-2 text-[13px]"
              defaultValue={viewQuery.status}
              name="status"
              options={[
                { label: "All statuses", value: "all" },
                { label: "Vacant", value: "vacant" },
                { label: "Occupied", value: "occupied" },
                { label: "Reserved", value: "reserved" },
                { label: "Maintenance", value: "maintenance" },
                { label: "Inactive", value: "inactive" },
              ]}
            />
          ) : (
            <MonthPickerField
              ariaLabel="Profit and loss month"
              className="h-8 px-2 text-[13px]"
              defaultValue={viewQuery.month}
              name="month"
            />
          )}

          <Button
            className="h-8 justify-start gap-1.5 px-2.5 text-[13px] lg:justify-center"
            type="submit"
          >
            <SlidersHorizontal size={14} />
            Apply filters
          </Button>

          <Link
            aria-label="Reset report filters"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={buildResetHref(viewQuery.report)}
            title="Reset filters"
          >
            <RotateCcw size={14} />
            Reset
          </Link>
        </form>
      </div>
    </div>
  );
}

function ReportTab({
  active,
  children,
  href,
}: {
  active: boolean;
  children: string;
  href: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-7 items-center rounded px-3 text-xs font-medium transition-colors",
        active
          ? "bg-accent text-white shadow-sm"
          : "text-muted hover:bg-surface hover:text-foreground",
      )}
      href={href}
      scroll={false}
    >
      {children}
    </Link>
  );
}

function buildReportHref(report: ReportKind, query: ReportsViewQuery) {
  const params = new URLSearchParams();

  if (report !== DEFAULT_REPORT_KIND) {
    params.set("report", report);
  }

  if (query.propertyId !== "all") {
    params.set("propertyId", query.propertyId);
  }

  if (report === "occupancy" && query.status !== DEFAULT_REPORT_STATUS) {
    params.set("status", query.status);
  }

  if (report === "profit-loss") {
    params.set("month", query.month);
  }

  const queryString = params.toString();

  return queryString ? `/reports?${queryString}` : "/reports";
}

function buildResetHref(report: ReportKind) {
  return report === DEFAULT_REPORT_KIND ? "/reports" : `/reports?report=${report}`;
}

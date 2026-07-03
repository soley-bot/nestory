import Link from "next/link";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { SelectControl } from "@/components/ui/select-control";
import { REPORT_OPTIONS } from "@/features/reports/data/trusted-report";
import type {
  ReportPropertyOption,
  ReportsViewQuery,
} from "@/features/reports/reports.types";

type ReportsFiltersProps = {
  action?: string;
  propertyOptions: ReportPropertyOption[];
  showReportSelect?: boolean;
  viewQuery: ReportsViewQuery;
};

export function ReportsFilters({
  action = "/reports",
  propertyOptions,
  showReportSelect = true,
  viewQuery,
}: ReportsFiltersProps) {
  const showStatusFilter =
    viewQuery.report === "rent-roll" || viewQuery.report === "vacancy-risk";

  return (
    <section className="rounded-md border border-border bg-surface print:hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Run scope</h2>
        <p className="mt-1 text-xs text-muted">
          Set the portfolio, period, and status scope for this report.
        </p>
      </div>
      <form
        action={action}
        className="grid gap-2 p-3 text-[13px]"
        method="get"
      >
        {viewQuery.unitId !== "all" ? (
          <input name="unitId" type="hidden" value={viewQuery.unitId} />
        ) : null}

        {showReportSelect ? (
          <SelectControl
            ariaLabel="Choose report"
            className="h-8 px-2 text-[13px]"
            defaultValue={viewQuery.report}
            name="report"
            options={REPORT_OPTIONS}
          />
        ) : null}

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

        <MonthPickerField
          ariaLabel="Report month"
          className="h-8 px-2 text-[13px]"
          defaultValue={viewQuery.month}
          name="month"
        />

        {showStatusFilter ? (
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
          <input name="status" type="hidden" value="all" />
        )}

        <Button
          className="h-8 justify-start gap-1.5 px-2.5 text-[13px] md:justify-center"
          type="submit"
        >
          <SlidersHorizontal size={14} />
          <span className="hidden sm:inline">Apply filters</span>
          <span className="sm:hidden">Apply</span>
        </Button>

        <Link
          aria-label="Reset report filters"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          href="/reports"
          title="Reset filters"
        >
          <RotateCcw size={14} />
          <span className="hidden sm:inline">Reset</span>
        </Link>
      </form>
    </section>
  );
}

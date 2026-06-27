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
  propertyOptions: ReportPropertyOption[];
  viewQuery: ReportsViewQuery;
};

export function ReportsFilters({
  propertyOptions,
  viewQuery,
}: ReportsFiltersProps) {
  const showStatusFilter =
    viewQuery.report === "rent-roll" || viewQuery.report === "vacancy-risk";

  return (
    <div className="border-b border-border bg-surface px-4 py-2.5 print:hidden sm:px-6 lg:px-6">
      <form
        action="/reports"
        className="grid gap-2 rounded-md border border-border bg-surface-muted p-2 text-[13px] md:grid-cols-[minmax(180px,220px)_minmax(180px,240px)_minmax(140px,170px)_minmax(140px,170px)_auto_auto]"
        method="get"
      >
        <SelectControl
          ariaLabel="Choose report"
          className="h-8 px-2 text-[13px]"
          defaultValue={viewQuery.report}
          name="report"
          options={REPORT_OPTIONS}
        />

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
    </div>
  );
}

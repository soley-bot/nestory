import type { ReactNode } from "react";
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
    <section
      className="rounded-md border border-border bg-surface print:hidden"
      data-report-stage="generate"
    >
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">Report scope</h2>
      </div>
      <form
        action={action}
        className="grid gap-2 p-3 text-[13px]"
        method="get"
      >
        {viewQuery.unitId !== "all" &&
        viewQuery.report !== "owner-statement" ? (
          <input name="unitId" type="hidden" value={viewQuery.unitId} />
        ) : null}

        {showReportSelect ? (
          <ScopeField label="Report">
            <SelectControl
              ariaLabel="Choose report"
              className="h-8 px-2 text-[13px]"
              defaultValue={viewQuery.report}
              name="report"
              options={REPORT_OPTIONS}
            />
          </ScopeField>
        ) : null}

        <ScopeField label="Property">
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
        </ScopeField>

        <ScopeField label="Month">
          <MonthPickerField
            ariaLabel="Report month"
            className="h-8 px-2 text-[13px]"
            defaultValue={viewQuery.month}
            name="month"
          />
        </ScopeField>

        {showStatusFilter ? (
          <ScopeField label="Status">
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
          </ScopeField>
        ) : (
          <input name="status" type="hidden" value="all" />
        )}

        <Button
          className="h-8 justify-start gap-1.5 px-2.5 text-[13px] md:justify-center"
          type="submit"
        >
          <SlidersHorizontal size={14} />
          Generate preview
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

function ScopeField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

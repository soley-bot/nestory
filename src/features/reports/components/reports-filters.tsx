import type { ReactNode } from "react";
import Link from "next/link";
import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { SelectControl } from "@/components/ui/select-control";
import type {
  ReportPropertyOption,
  ReportsViewQuery,
  ReportUnitOption,
} from "@/features/reports/reports.types";

type ReportsFiltersProps = {
  action: string;
  propertyOptions: ReportPropertyOption[];
  unitOptions: ReportUnitOption[];
  viewQuery: ReportsViewQuery;
};

export function ReportsFilters({
  action,
  propertyOptions,
  unitOptions,
  viewQuery,
}: ReportsFiltersProps) {
  const showUnit = viewQuery.report === "unit-profit-loss";
  const visibleUnits =
    viewQuery.propertyId === "all"
      ? unitOptions
      : unitOptions.filter(
          ({ propertyId }) => propertyId === viewQuery.propertyId,
        );

  return (
    <section
      aria-label="Report filters"
      className="border-b border-border bg-surface px-4 py-3 sm:px-6"
      role="region"
    >
      <form
        action={action}
        className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_180px_minmax(180px,1fr)_auto_auto]"
        method="get"
      >
        <ScopeField label="Property">
          <SelectControl
            ariaLabel="Filter report by property"
            className="h-9 px-2.5 text-[13px]"
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
            className="h-9 px-2.5 text-[13px]"
            defaultValue={viewQuery.month}
            name="month"
          />
        </ScopeField>

        {showUnit ? (
          <ScopeField label="Unit">
            <SelectControl
              ariaLabel="Filter report by unit"
              className="h-9 px-2.5 text-[13px]"
              defaultValue={viewQuery.unitId}
              name="unitId"
              options={[
                { label: "All units", value: "all" },
                ...visibleUnits.map((unit) => ({
                  label: unit.label,
                  value: unit.id,
                })),
              ]}
            />
          </ScopeField>
        ) : (
          <div className="hidden lg:block" />
        )}

        <Button
          aria-label="Apply filters"
          className="h-9 gap-1.5 px-3 text-[13px]"
          type="submit"
        >
          <SlidersHorizontal size={14} />
          Apply
        </Button>

        <Link
          aria-label="Reset report filters"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          href={`/reports/${viewQuery.report}`}
        >
          <RotateCcw size={14} />
          Reset
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
    <label className="min-w-0">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

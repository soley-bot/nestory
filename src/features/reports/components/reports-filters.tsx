import type { ReactNode } from "react";
import Link from "next/link";
import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { SelectControl } from "@/components/ui/select-control";
import type {
  ReportOwnerOption,
  ReportPropertyOption,
  ReportsViewQuery,
  ReportUnitOption,
} from "@/features/reports/reports.types";

type ReportsFiltersProps = {
  action: string;
  ownerOptions: ReportOwnerOption[];
  propertyOptions: ReportPropertyOption[];
  unitOptions: ReportUnitOption[];
  viewQuery: ReportsViewQuery;
};

export function ReportsFilters({
  action,
  ownerOptions,
  propertyOptions,
  unitOptions,
  viewQuery,
}: ReportsFiltersProps) {
  const showUnit = viewQuery.report === "unit-profit-loss";
  const showOwner = viewQuery.report === "monthly-owner-activity";
  const visibleUnits =
    viewQuery.propertyId === "all"
      ? unitOptions
      : unitOptions.filter(
          ({ propertyId }) => propertyId === viewQuery.propertyId,
        );
  const showReset =
    (showOwner && viewQuery.ownerPersonId !== "all") ||
    viewQuery.propertyId !== "all" ||
    (showUnit && viewQuery.unitId !== "all");

  return (
    <section
      aria-label="Report filters"
      className="border-b border-border/70 bg-background px-4 py-2 sm:px-6"
      role="region"
    >
      <div className="flex flex-wrap items-end gap-2">
        <form
          action={action}
          className="flex min-w-0 flex-1 flex-wrap items-end gap-2"
          method="get"
        >
          {showOwner ? (
            <ScopeField label="Owner">
              <SelectControl
                ariaLabel="Filter report by owner"
                className="h-8 w-[190px] px-2.5 text-sm"
                defaultValue={viewQuery.ownerPersonId}
                name="ownerPersonId"
                options={[
                  { label: "All owners", value: "all" },
                  ...ownerOptions.map((owner) => ({
                    label: owner.label,
                    value: owner.id,
                  })),
                ]}
              />
            </ScopeField>
          ) : null}

          <ScopeField label="Property">
            <SelectControl
              ariaLabel="Filter report by property"
              className="h-8 w-[190px] px-2.5 text-sm"
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
              className="h-8 w-[150px] px-2.5 text-sm"
              defaultValue={viewQuery.month}
              name="month"
            />
          </ScopeField>

          {showUnit ? (
            <ScopeField label="Unit">
              <SelectControl
                ariaLabel="Filter report by unit"
                className="h-8 w-[190px] px-2.5 text-sm"
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
          ) : null}

          <Button
            aria-label="Apply filters"
            className="h-8 gap-1.5 px-3 text-sm"
            type="submit"
          >
            <SlidersHorizontal size={14} />
            Apply
          </Button>

          {showReset ? (
            <Button asChild className="h-8" variant="ghost">
              <Link
                aria-label="Reset report filters"
                href={`/reports/${viewQuery.report}`}
              >
                <RotateCcw size={14} />
                Reset
              </Link>
            </Button>
          ) : null}
        </form>
      </div>
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
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

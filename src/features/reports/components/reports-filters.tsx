"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { getReportMonthRange } from "@/features/reports/reports.filters";
import { SelectControl } from "@/components/ui/select-control";
import type { ReportOwnerOption, ReportPropertyOption, ReportsViewQuery, ReportUnitOption, TrustedReport } from "@/features/reports/reports.types";

type ReportsFiltersProps = {
  action: string;
  ownerOptions: ReportOwnerOption[];
  propertyOptions: ReportPropertyOption[];
  unitOptions: ReportUnitOption[];
  viewQuery: ReportsViewQuery;
  filterOptions?: TrustedReport["filterOptions"];
  availableColumns?: TrustedReport["columns"];
};

export function ReportsFilters({ action, ownerOptions, propertyOptions, unitOptions, viewQuery, filterOptions, availableColumns = [] }: ReportsFiltersProps) {
  const modern = ["transactions", "management-fees", "rent-roll", "rent-collections"].includes(viewQuery.report);
  const showUnit = modern || viewQuery.report === "unit-profit-loss";
  const showOwner = viewQuery.report === "monthly-owner-activity";
  const [propertyId, setPropertyId] = useState(viewQuery.propertyId);
  const [unitId, setUnitId] = useState(viewQuery.unitId);
  const visibleUnits = propertyId === "all" ? unitOptions : unitOptions.filter((unit) => unit.propertyId === propertyId);
  const monthRange = getReportMonthRange(viewQuery.month);
  const moreActive = [viewQuery.transactionType, viewQuery.transactionStatus, viewQuery.payeeId].some((value) => Boolean(value && value !== "all")) || Boolean(viewQuery.groupBy && viewQuery.groupBy !== "none");
  const showReset = (modern && viewQuery.status !== "all") || (showOwner && viewQuery.ownerPersonId !== "all") || viewQuery.propertyId !== "all" || (showUnit && viewQuery.unitId !== "all") || Boolean(viewQuery.query || viewQuery.dateFrom || viewQuery.dateTo || viewQuery.columns) || moreActive;
  const groupOptions = [{ label: "No grouping", value: "none" }, ...availableColumns.filter((column) => ["property", "unit", "type", "payee", "status"].includes(column.key)).map((column) => ({ label: column.label, value: column.key }))];

  return <section aria-label="Report filters" className="workspace-gutter-x relative border-b border-border/70 bg-background py-3" role="region">
    <form action={action} method="get" className="flex min-w-0 flex-wrap items-end gap-2">
      {viewQuery.columns ? <input name="columns" type="hidden" value={viewQuery.columns} /> : null}
      {modern && viewQuery.status !== "all" ? <><input name="status" type="hidden" value={viewQuery.status} /><span className="text-xs text-muted-foreground">Current lease: {viewQuery.status}</span></> : null}
      {showOwner ? <ScopeField label="Owner"><FilterSelect label="owner" name="ownerPersonId" value={viewQuery.ownerPersonId} options={ownerOptions} /></ScopeField> : null}
      <ScopeField label="Property"><SelectControl ariaLabel="Filter report by property" className="h-8 w-[180px] px-2.5 text-sm" name="propertyId" value={propertyId} onValueChange={(value) => { setPropertyId(value); setUnitId("all"); }} options={[{ label: "All properties", value: "all" }, ...propertyOptions.map((property) => ({ label: property.label, value: property.id }))]} /></ScopeField>
      {!modern ? <ScopeField label="Month"><MonthPickerField ariaLabel="Report month" className="h-8 w-[150px] px-2.5 text-sm" defaultValue={viewQuery.month} name="month" /></ScopeField> : viewQuery.report !== "rent-roll" ? <>
        <ScopeField label="From"><DatePickerField ariaLabel="Report start date" className="h-8 w-[150px] px-2.5 text-sm" defaultValue={viewQuery.dateFrom || monthRange.start} name="dateFrom" /></ScopeField>
        <ScopeField label="To"><DatePickerField ariaLabel="Report end date" className="h-8 w-[150px] px-2.5 text-sm" defaultValue={viewQuery.dateTo || monthRange.end} name="dateTo" /></ScopeField>
      </> : null}
      {showUnit ? <ScopeField label="Unit"><SelectControl ariaLabel="Filter report by unit" className="h-8 w-[180px] px-2.5 text-sm" name="unitId" value={unitId} onValueChange={setUnitId} options={[{ label: "All units", value: "all" }, ...visibleUnits.map((unit) => ({ label: unit.label, value: unit.id }))]} /></ScopeField> : null}
      {modern ? <ScopeField label="Search"><Input aria-label="Search report" className="h-8 w-[190px] text-sm" name="query" type="search" placeholder="Search this report" defaultValue={viewQuery.query} /></ScopeField> : null}
      {modern ? <details className="group static sm:relative">
        <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border px-3 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><SlidersHorizontal size={14} aria-hidden="true" />More filters{moreActive ? <span aria-label="Active filters" className="size-1.5 rounded-full bg-primary" /> : null}</summary>
        <div className="absolute right-4 left-4 z-20 mt-2 flex flex-col gap-3 rounded-md border border-border bg-popover p-3 shadow-md sm:right-0 sm:left-auto sm:w-64">
          {filterOptions?.types?.length ? <ScopeField label="Type"><FilterSelect label="type" name="transactionType" value={viewQuery.transactionType ?? "all"} options={filterOptions.types} /></ScopeField> : null}
          {filterOptions?.statuses?.length ? <ScopeField label="Status"><FilterSelect label="status" name="transactionStatus" value={viewQuery.transactionStatus ?? "all"} options={filterOptions.statuses} /></ScopeField> : null}
          {filterOptions?.payees?.length ? <ScopeField label="Payee"><FilterSelect label="payee" name="payeeId" value={viewQuery.payeeId ?? "all"} options={filterOptions.payees} /></ScopeField> : null}
          {groupOptions.length > 1 ? <ScopeField label="Group by"><SelectControl ariaLabel="Group report by" className="h-8 w-[180px] px-2.5 text-sm" name="groupBy" defaultValue={viewQuery.groupBy ?? "none"} options={groupOptions} /></ScopeField> : null}
          {!filterOptions?.types?.length && !filterOptions?.statuses?.length && !filterOptions?.payees?.length && groupOptions.length <= 1 ? <p className="text-xs text-muted-foreground">No additional filters for this report.</p> : null}
          <Button className="h-8" type="submit">Apply filters</Button>
        </div>
      </details> : null}
      <Button aria-label="Apply filters" className="h-8 gap-1.5 px-3 text-sm" type="submit">Apply</Button>
      {showReset ? <Button asChild className="h-8" variant="ghost"><Link aria-label="Reset report filters" href={`/reports/${viewQuery.report}`}><RotateCcw size={14} />Reset</Link></Button> : null}
    </form>
  </section>;
}

function FilterSelect({ label, name, value, options, allValue = "all" }: { label: string; name: string; value: string; options: ReportPropertyOption[]; allValue?: string }) {
  return <SelectControl ariaLabel={`Filter report by ${label}`} className="h-8 w-[180px] px-2.5 text-sm" defaultValue={value} name={name} options={[{ label: `All ${label === "status" ? "statuses" : `${label}s`}`, value: allValue }, ...options.map((option) => ({ label: option.label, value: option.id }))]} />;
}

function ScopeField({ children, label }: { children: ReactNode; label: string }) {
  return <label className="min-w-0"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}

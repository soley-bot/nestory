"use client";

import { useState } from "react";
import Link from "next/link";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildReportQueryParams } from "@/features/reports/reports.filters";
import type { ReportsViewQuery, TrustedReportColumn } from "@/features/reports/reports.types";

export function ReportColumns({ columns, selectedColumns, viewQuery }: { columns: TrustedReportColumn[]; selectedColumns: TrustedReportColumn[]; viewQuery: ReportsViewQuery }) {
  const [selected, setSelected] = useState(selectedColumns.map((column) => column.key));
  const params = buildReportQueryParams({ ...viewQuery, columns: columns.filter((column) => selected.includes(column.key)).map((column) => column.key).join(",") });
  params.delete("report");
  return <details className="relative">
    <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><Columns3 size={14} aria-hidden="true" />Columns</summary>
    <div className="absolute right-0 z-30 mt-2 w-60 rounded-md border border-border bg-popover p-3 shadow-md">
      <p className="mb-2 text-xs text-muted-foreground">Columns apply to the table and exports.</p>
      <fieldset className="max-h-72 space-y-1 overflow-y-auto">
        <legend className="sr-only">Visible report columns</legend>
        {columns.map((column) => <label key={column.key} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
          <input type="checkbox" checked={selected.includes(column.key)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, column.key] : current.filter((key) => key !== column.key))} className="size-4 accent-primary" />{column.label}
        </label>)}
      </fieldset>
      <div className="mt-3 flex items-center gap-2">
        {selected.length ? <Button asChild size="sm"><Link href={`/reports/${viewQuery.report}?${params}`}>Apply columns</Link></Button> : <Button size="sm" disabled>Apply columns</Button>}
        <Button size="sm" variant="ghost" onClick={() => setSelected(columns.map((column) => column.key))}>Select all</Button>
      </div>
      {!selected.length ? <p className="mt-2 text-xs text-muted-foreground" role="status">Select at least one column.</p> : null}
    </div>
  </details>;
}

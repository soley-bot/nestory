"use client";

import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FinancialReportLink } from "@/lib/finance/financial-write-provider";
import { buildReportQueryParams } from "../reports.filters";
import { maxUnitProfitLossBatchSize } from "../unit-profit-loss-export";
import type { ReportsViewQuery, ReportUnitOption } from "../reports.types";

const pageSize = 20;

export function UnitProfitLossSelector({ unitOptions, viewQuery }: {
  unitOptions: ReportUnitOption[];
  viewQuery: ReportsViewQuery;
}) {
  const units = unitOptions.filter(unit => viewQuery.propertyId === "all" || unit.propertyId === viewQuery.propertyId);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(units.length <= maxUnitProfitLossBatchSize ? units.map(unit => unit.id) : []));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const filtered = units.filter(unit => unit.label.toLowerCase().includes(search.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const shown = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selectedIds = units.filter(unit => selected.has(unit.id)).map(unit => unit.id);
  const allShownSelected = shown.length > 0 && shown.every(unit => selected.has(unit.id));
  const wouldExceedLimit = selectedIds.length + shown.filter(unit => !selected.has(unit.id)).length > maxUnitProfitLossBatchSize;
  const canExport = selectedIds.length > 0 && selectedIds.length <= maxUnitProfitLossBatchSize;
  const exportHref = (format: "pdf" | "xlsx") => {
    const params = new URLSearchParams({ month: viewQuery.month, propertyId: viewQuery.propertyId, format });
    selectedIds.forEach(id => params.append("unitIds", id));
    return `/api/reports/unit-profit-loss?${params}`;
  };

  return <section aria-label="Separate unit reports" className="py-5">
    <h2 className="text-base font-semibold">One P&amp;L for each unit</h2>
    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Select units to download a ZIP containing a separate report for each unit. Shared property transactions without a unit assignment are excluded and noted in each report.</p>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
      <label className="grid gap-1 text-xs font-medium">Find units
        <Input type="search" className="w-72 max-w-full" placeholder="Search by property or unit" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {([['pdf', 'Download PDFs'], ['xlsx', 'Download Excel files']] as const).map(([format, label]) => canExport
          ? <Button asChild key={format} size="sm" variant={format === "pdf" ? "default" : "outline"}><FinancialReportLink href={exportHref(format)}><Download aria-hidden="true" />{label}</FinancialReportLink></Button>
          : <Button disabled key={format} size="sm" variant={format === "pdf" ? "default" : "outline"}><Download aria-hidden="true" />{label}</Button>)}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3 border-y border-border bg-muted/20 px-3 py-2 text-xs">
      <span aria-live="polite">{selectedIds.length} selected · Up to {maxUnitProfitLossBatchSize} reports per download</span>
      <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={shown.length === 0 || (!allShownSelected && wouldExceedLimit)} onClick={() => setSelected(current => {
        const next = new Set(current);
        shown.forEach(unit => allShownSelected ? next.delete(unit.id) : next.add(unit.id));
        return next;
      })}>{allShownSelected ? "Deselect shown" : "Select shown"}</Button>
      {selectedIds.length > 0 ? <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Clear selection</Button> : null}
    </div>
    <ul className="divide-y divide-border border-b border-border">
      {shown.map(unit => <li key={unit.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 hover:bg-muted/20">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="size-4 shrink-0 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring" checked={selected.has(unit.id)} disabled={!selected.has(unit.id) && selectedIds.length >= maxUnitProfitLossBatchSize} onChange={event => setSelected(current => {
            const next = new Set(current);
            if (event.target.checked) next.add(unit.id); else next.delete(unit.id);
            return next;
          })} />
          <span className="[overflow-wrap:anywhere]">{unit.label}</span>
        </label>
        <Button asChild size="sm" variant="outline"><Link aria-label={`View P&L for ${unit.label}`} href={`/reports/unit-profit-loss?${buildReportQueryParams({ ...viewQuery, propertyId: unit.propertyId, unitId: unit.id })}`}>View P&amp;L</Link></Button>
      </li>)}
    </ul>
    {filtered.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{units.length === 0 ? "No units are available for this property." : "No units match your search."}</p> : null}
    {filtered.length > pageSize ? <nav aria-label="Unit report pages" className="mt-3 flex flex-wrap items-center justify-end gap-3 text-xs">
      <span>{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, filtered.length)} of {filtered.length} units</span>
      <Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous units</Button>
      <Button size="sm" variant="outline" disabled={(currentPage + 1) * pageSize >= filtered.length} onClick={() => setPage(currentPage + 1)}>Next units</Button>
    </nav> : null}
  </section>;
}

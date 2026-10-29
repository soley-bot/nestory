import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildReportQueryParams } from "../reports.filters";
import type { ReportPagination, ReportsViewQuery } from "../reports.types";

export function reportScreenHref(query: ReportsViewQuery, changes: Partial<ReportsViewQuery>) {
  return `/reports/${query.report}?${buildReportQueryParams({ ...query, ...changes }).toString()}`;
}

export function ReportPageNavigation({ pagination, viewQuery, parameter = "page", label = "Report pages" }: {
  pagination: ReportPagination;
  viewQuery: ReportsViewQuery;
  parameter?: "page" | "detailPage";
  label?: string;
}) {
  if (pagination.totalPages <= 1) return null;
  const { page, pageSize, totalPages, totalRecords } = pagination;
  return <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2 text-xs text-muted-foreground">
    <p>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalRecords)} of {totalRecords} {parameter === "detailPage" ? "transactions" : "records"}. Totals and exports include all matching rows.</p>
    <div className="flex items-center gap-2">
      {page === 1 ? <Button size="sm" variant="outline" disabled>Previous</Button> : <Button size="sm" variant="outline" asChild><Link prefetch={false} scroll={false} href={reportScreenHref(viewQuery, { [parameter]: page - 1 })}>Previous</Link></Button>}
      <span>Page {page} of {totalPages}</span>
      {page === totalPages ? <Button size="sm" variant="outline" disabled>Next</Button> : <Button size="sm" variant="outline" asChild><Link prefetch={false} scroll={false} href={reportScreenHref(viewQuery, { [parameter]: page + 1 })}>Next</Link></Button>}
    </div>
  </nav>;
}

export function ReportScopeSearch({ viewQuery }: { viewQuery: ReportsViewQuery }) {
  const params = buildReportQueryParams({ ...viewQuery, page: 1, detailPage: 1 });
  params.delete("scopeQuery");
  return <form action={`/reports/${viewQuery.report}`} method="get" className="flex flex-wrap items-center gap-3 py-2">
    {[...params].map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <Input name="scopeQuery" aria-label="Find property or unit" placeholder="Find property or unit" className="max-w-xs" defaultValue={viewQuery.scopeQuery ?? ""} maxLength={200} />
    <Button type="submit" size="sm" variant="outline">Search</Button>
    <p className="text-xs text-muted-foreground">Search filters this list. Totals and exports cover the full report.</p>
  </form>;
}

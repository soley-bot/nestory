import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SearchCombo } from "../src/components/ui/search-combo";
import { FilterPopover } from "../src/components/ui/filter-popover";
import { Button } from "../src/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../src/components/ui/table";
import { PaginationControls } from "../src/components/data/pagination-controls";
import { RecordLink } from "../src/components/data/interactive-table";
import { PageBreadcrumb } from "../src/components/layout/page-breadcrumb";
import { Menu, Search, Moon } from "lucide-react";

declare const __HEADER_CLASS__: string;
declare const __HEADER_INNER_CLASS__: string;

const stress = document.documentElement.dataset.fixtureMode === "stress";
const name = stress ? "North Riverside Residential Property Management and Maintenance Partnership" : "Riverside House";
const records = [
  { name, reference: stress ? "FIN-2026-1004-001" : "INV-104", status: "Needs review", amount: stress ? "£1,234,567.89" : "£1,250.00" },
  { name: "West Street Apartments", reference: "INV-105", status: "Open", amount: "£395.00" },
  { name: "North Riverside Court", reference: "INV-106", status: "Paid", amount: "£0.00" },
];
function Actions() { return <div className="flex justify-end gap-2"><Button variant="outline">View</Button><Button variant="ghost">More actions</Button></div>; }
function MobileRecords() {
  return <ul className="divide-y px-3" aria-label="Property account summaries">{records.map(record => <li className="space-y-2 py-3 text-sm" key={record.reference}>
    <div className="flex items-start justify-between gap-3"><h2 className="min-w-0 font-medium"><RecordLink href="#record">{record.name}</RecordLink></h2><p className="shrink-0 text-right font-medium tabular-nums"><span className="block text-muted-foreground">Outstanding</span>{record.amount}</p></div>
    <p>{record.status} <span className="text-muted-foreground">· {record.reference}</span></p>
    <Actions />
  </li>)}</ul>;
}
function Preview() {
  const [query, setQuery] = useState("Riverside");
  const [state, setState] = useState("ready");
  return <div className="min-h-screen bg-background text-foreground">
    <header className={__HEADER_CLASS__} style={{ "--header-height": "48px" } as React.CSSProperties} data-fixture="workspace-header">
      <div className={__HEADER_INNER_CLASS__}>
        <Button aria-label="Toggle sidebar" size="icon-sm" variant="ghost"><Menu /></Button>
        <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
        <div className="flex min-w-0 flex-1 items-center"><PageBreadcrumb current={stress ? name : "Property accounts"} items={[{ href: "#workspace", label: "Workspace" }, { href: "#properties", label: "Properties" }]} /></div>
        <Button aria-label="Find a page" size="icon" variant="ghost"><Search /></Button>
        <Button aria-label="Change theme" size="icon" variant="ghost"><Moon /></Button>
      </div>
    </header>
    <main className="workspace-gutter-x bg-background py-5 text-foreground">
    <h1 className="mb-4 text-xl font-semibold">{stress ? "Property accounts — stress fixture" : "Property accounts"}</h1>
    <div className="mb-4 flex flex-wrap items-start gap-2" data-fixture="toolbar">
      <SearchCombo ariaLabel="Search records" placeholder="Search property, reference or contact" query={query} onQueryChange={setQuery} submitLabel="Search records" disabled={state === "loading"} scopeOptions={[{ value: "all", label: "All records" }, { value: "property", label: "Property records" }]} onSubmit={e => e.preventDefault()} onSuggestionSelect={s => setQuery(s.label)} suggestions={[{ id: "1", label: name, description: stress ? "Assigned to the regional maintenance and finance coordination team" : "Property account · INV-104", meta: "Property" }, { id: "2", label: "North Riverside Court", description: "Property account · INV-106", meta: "Property" }]} />
      <FilterPopover activeCount={3} label="Property and finance filters" title="Filter property and finance records" description="Select the records to review without changing saved data."><label className="grid gap-2 text-sm">Assigned team<select className="h-8 rounded-md border bg-background px-2"><option>All teams</option><option>Regional maintenance team</option></select></label></FilterPopover>
    </div>
    <div className="mb-3 flex flex-wrap gap-2" aria-label="Synthetic states">{["ready", "loading", "empty", "error"].map(s => <Button key={s} variant="outline" onClick={() => setState(s)}>{s}</Button>)}</div>
    <section className="min-w-0 overflow-hidden rounded-xl border" aria-label="Register panel">
      {state === "error" ? <p role="alert" className="m-3 rounded-md border border-destructive bg-danger-soft p-3">Unable to load records. Retry the request; saved records have not changed.</p> : state !== "ready" ? <p className="p-3 py-6 text-sm" aria-busy={state === "loading"}>{state === "loading" ? "Loading property and finance records…" : "No matching records. Change your search or filters."}</p> : <Table scrollRegionLabel="Property and finance records" mobileContent={document.documentElement.dataset.fixtureBase === "before" ? undefined : <MobileRecords />} className={stress ? "min-w-[1600px]" : "min-w-[700px]"}>
        <TableHeader><TableRow><TableHead className="w-[240px]">Property</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{records.map(record => <TableRow key={record.reference}><TableCell className="w-[240px] max-w-[240px]"><RecordLink href="#record">{record.name}</RecordLink></TableCell><TableCell>{record.reference}</TableCell><TableCell>{record.status}</TableCell><TableCell className="text-right tabular-nums">{record.amount}</TableCell><TableCell><Actions /></TableCell></TableRow>)}</TableBody>
      </Table>}
      <PaginationControls pagination={stress ? { from: 26, to: 50, page: 2, pageSize: 25, totalCount: 123456789, totalPages: 4938272 } : { from: 1, to: 3, page: 1, pageSize: 3, totalCount: 18, totalPages: 6 }} />
    </section>
    </main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Preview />);

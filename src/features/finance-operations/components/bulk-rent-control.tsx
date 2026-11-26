"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { getPreviousBusinessMonthValue } from "@/lib/dates/business-date";
import { useBusinessDate } from "@/lib/dates/business-date-provider";
import { formatDate, formatLeaseMonth } from "@/lib/dates/format";
import { useFinancialFormData, useFinancialWriteContext } from "@/lib/finance/financial-write-provider";
import { formatMoney } from "@/lib/money/format";
import { postBulkRentAction, previewBulkRentAction } from "../actions";
import { bulkRentChunkSize, type BulkRentOutcome, type BulkRentRow, type ReadyRent } from "../bulk-rent";

export function BulkRentControl({ property }: { property: string | null }) {
  const { getBusinessMonthValue } = useBusinessDate();
  const latest = getPreviousBusinessMonthValue(getBusinessMonthValue());
  const session = useFinancialWriteContext();
  const makeIntent = useFinancialFormData();
  const available = !!session && !session.invalid && session.context.status === "open";
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(latest);
  const [phase, setPhase] = useState<"select" | "confirm" | "posting" | "results">("select");
  const [rows, setRows] = useState<BulkRentRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<BulkRentOutcome[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadId = useRef(0);
  const posting = useRef(false);
  const label = formatLeaseMonth(month + "-01", "long");
  const ready = rows.filter((row): row is ReadyRent => row.status === "ready");
  const picked = ready.filter(row => selected.has(row.leaseId));
  const existing = rows.filter(row => row.status === "existing");
  const blocked = rows.filter(row => row.status === "blocked");
  const query = search.trim().toLowerCase();
  const visible = ready.filter(row => [row.property, row.unit, row.tenant, row.recipient].some(value => value?.toLowerCase().includes(query)));
  const fullMonth = visible.filter(row => !row.prorated);
  const allFullSelected = fullMonth.length > 0 && fullMonth.every(row => selected.has(row.leaseId));
  const sameIssueDate = picked.every(row => row.issueDate === picked[0]?.issueDate);
  const fees = picked.reduce((sum, row) => sum + row.fee, 0);

  async function review(value: string) {
    const request = ++loadId.current;
    setMonth(value);
    setPhase("select");
    setLoading(true);
    setError("");
    setSearch("");
    setResults([]);
    setRows([]);
    setSelected(new Set());
    try {
      const response = await previewBulkRentAction(value, property);
      if (request !== loadId.current) return;
      if (response.data) {
        setRows([...response.data].sort((a,b) => a.property.localeCompare(b.property) ||
          (a.unit ?? "").localeCompare(b.unit ?? "", undefined, { numeric: true }) || a.tenant.localeCompare(b.tenant)));
      } else setError(response.error);
    } catch {
      if (request === loadId.current) setError("Could not load the rent review. Try again.");
    } finally {
      if (request === loadId.current) setLoading(false);
    }
  }

  function select(items: ReadyRent[], checked: boolean) {
    setSelected(current => {
      const next = new Set(current);
      for (const row of items) {
        if (checked) next.add(row.leaseId);
        else next.delete(row.leaseId);
      }
      return next;
    });
  }

  async function generate() {
    if (!available || !picked.length || posting.current || phase !== "confirm") return;
    posting.current = true;
    setPhase("posting");
    setError("");
    const intent = makeIntent();
    try {
      for (let start = 0; start < picked.length; start += bulkRentChunkSize) {
        const batch = picked.slice(start, start + bulkRentChunkSize).map(row => ({ id: row.leaseId, token: row.token }));
        const response = await postBulkRentAction(month, property, batch, intent);
        if (!response.data) {
          setError(response.error);
          break;
        }
        setResults(previous => [...previous, ...response.data]);
      }
    } catch {
      setError("The connection was interrupted. Review the month again to see which invoices were issued.");
    } finally {
      posting.current = false;
      setPhase("results");
    }
  }

  return <>
    <Button type="button" variant="outline" disabled={!available} onClick={() => { setOpen(true); void review(latest); }}>Generate past rent</Button>
    <Modal open={open} title={phase === "confirm" ? "Confirm past rent invoices" : phase === "results" ? "Rent generation results" : "Generate past rent"}
      onClose={() => { if (!posting.current) { ++loadId.current; setOpen(false); } }}>
      <div className="space-y-4 p-4 text-sm">
        {phase === "select" ? <>
          <label className="block max-w-56 space-y-1 font-medium">Rental month
            <MonthPickerField key={open ? "open" : "closed"} name="bulkRentMonth" ariaLabel="Rental month" defaultValue={month} maxMonth={latest} onValueChange={value => void review(value)} />
          </label>
          {loading ? <p role="status">Checking leases and existing invoices…</p> : !error && <>
            <p role="status">{ready.length} ready to invoice · {existing.length} already invoiced · {blocked.length} to review</p>
            {ready.length > 0 && <>
              <Input aria-label="Find a lease" placeholder="Find property, unit or tenant" value={search} onChange={event => setSearch(event.target.value)} />
              {fullMonth.length > 0 && <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={allFullSelected}
                onChange={event => select(fullMonth,event.target.checked)} />
                {fullMonth.length === 1 ? "Select 1 full-month lease" : `Select all ${fullMonth.length} full-month leases`}{query && " in search results"}</label>}
              <div className="max-h-64 divide-y overflow-y-auto rounded-md border" aria-label="Leases available to invoice">
                {visible.map(row => <label key={row.leaseId} className="flex cursor-pointer items-start gap-3 p-3">
                  <input type="checkbox" className="mt-1" checked={selected.has(row.leaseId)} onChange={event => select([row],event.target.checked)}
                    aria-label={`Select ${row.property} ${row.unit ?? ""} ${row.tenant}`} />
                  <LeaseDetails row={row} />
                </label>)}
                {!visible.length && <p className="p-3">No matching leases.</p>}
              </div>
            </>}
            {existing.length > 0 && <details><summary className="cursor-pointer font-medium">Already invoiced ({existing.length})</summary>
              <ul className="max-h-40 space-y-2 overflow-auto pt-2">{existing.map(row => <li key={row.leaseId}>{row.property} · {row.unit} · {row.tenant} · <Link className="underline" href={`/rent-income?invoiceId=${row.invoiceId}`}>{row.note}</Link></li>)}</ul>
            </details>}
            {blocked.length > 0 && <details><summary className="cursor-pointer font-medium">Needs review ({blocked.length})</summary>
              <ul className="max-h-40 space-y-2 overflow-auto pt-2">{blocked.map(row => <li key={row.leaseId}><Link className="underline" href={`/leases/${row.leaseId}`}>{row.property} · {row.unit} · {row.tenant}</Link> · {row.note}</li>)}</ul>
            </details>}
            {!rows.length && <p>No leases or invoices were found for {label}{property ? " at this property" : ""}.</p>}
          </>}
          {error && <Button type="button" variant="outline" onClick={() => void review(month)}>Retry review</Button>}
        </> : <p className="font-semibold">{label} · {picked.length} {picked.length === 1 ? "lease" : "leases"}</p>}
        {phase === "confirm" && <>
          <p>Check these leases against any rent already billed outside Nestory. Rent will appear in {label}.{fees > 0 && ` Linked management fees are dated ${formatDate(month + "-01")}.`}</p>
          {picked[0] && sameIssueDate &&
            <p>Invoices issued and due <strong>{formatDate(picked[0].issueDate)}</strong></p>}
          <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">{picked.map(row => <li className="p-3" key={row.leaseId}><LeaseDetails row={row} />
            {!sameIssueDate && <p>Issued and due {formatDate(row.issueDate)}</p>}</li>)}</ul>
        </>}
        {(phase === "select" || phase === "confirm") && picked.length > 0 &&
          <div className="rounded-md bg-muted p-3"><strong>{picked.length} selected · Rent {formatMoney(picked.reduce((sum,row) => sum + row.rent,0))}</strong>
            <div>Owner management fees {formatMoney(fees)}</div></div>}
        {phase === "select" && ready.length > 0 && <Button type="button" disabled={!available || !picked.length || loading}
          onClick={() => setPhase("confirm")}>Review selected invoices</Button>}
        {phase === "confirm" && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setPhase("select")}>Back to selection</Button>
          <Button type="button" disabled={!available} onClick={() => void generate()}>Generate {picked.length} {picked.length === 1 ? "invoice" : "invoices"}</Button></div>}
        {phase === "posting" && <p role="status">Generating invoices… {results.length} of {picked.length} checked.</p>}
        {phase === "results" && <>
          <p role="status">{results.filter(r => r.status === "generated").length} generated · {results.filter(r => r.status === "existing").length} already invoiced · {results.filter(r => r.status === "review").length} to review{results.length < picked.length && ` · ${picked.length - results.length} unconfirmed`}</p>
          <ul className="max-h-64 divide-y overflow-y-auto">{results.map(result => { const row = picked.find(r => r.leaseId === result.leaseId);
            return <li className="py-2" key={result.leaseId}><strong>{row?.property} · {row?.unit} · {row?.tenant}</strong><br />
              {result.invoiceId ? <Link className="underline" href={`/rent-income?invoiceId=${result.invoiceId}`}>{result.message}</Link> : result.message}</li>;
          })}</ul>
          <div className="flex gap-2"><Button type="button" variant="outline" disabled={!available} onClick={() => void review(month)}>Review month again</Button>
            <Button type="button" onClick={() => setOpen(false)}>Done</Button></div>
        </>}
        {error && <p role="alert">{error}</p>}
      </div>
    </Modal>
  </>;
}

function LeaseDetails({ row }: { row: ReadyRent }) {
  return <div className="grid min-w-0 flex-1 gap-x-3 sm:grid-cols-[1fr_auto]">
    <div><strong>{row.property}{row.unit && ` · ${row.unit}`}</strong>
      <p>{row.tenant}{row.recipient !== row.tenant && ` · Bill to ${row.recipient}`}</p>
      {row.prorated && <p className="font-medium">Prorated · {formatDate(row.from)} – {formatDate(row.through)}</p>}
      {row.note && <p className="text-muted-foreground">{row.note}</p>}
    </div>
    <div className="sm:text-right"><strong>Rent {formatMoney(row.rent)}</strong><p>Fee {formatMoney(row.fee)}</p>
      <p className="text-xs text-muted-foreground">Collected by {row.route === "through_ips" ? "Pilot" : "owner"}</p></div>
  </div>;
}

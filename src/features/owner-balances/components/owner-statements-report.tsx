"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { SearchableSelectControl } from "@/components/ui/searchable-select-control";
import { SelectControl } from "@/components/ui/select-control";

import { formatCalendarDate } from "@/lib/dates/format";
import type { OwnerBalanceData } from "../owner-balance.types";
import { readStatementReport } from "../statement-report-action";

type Statement = Awaited<ReturnType<typeof readStatementReport>>;
type Account = { ownerPersonId: string; propertyId: string; ownerLabel: string; propertyLabel: string };
const keyOf = (account: Account) => `${account.ownerPersonId}:${account.propertyId}`;
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function OwnerStatementsReport({ data, month, selectedOwnerPersonId, selectedPropertyId, initialStatements = {} }: { initialStatements?: Record<string, Statement>; data: OwnerBalanceData; month: string; selectedOwnerPersonId?: string; selectedPropertyId?: string }) {
  const [propertyId, setPropertyId] = useState(selectedPropertyId ?? "");
  const [ownerId, setOwnerId] = useState(selectedOwnerPersonId ?? "");
  const [view, setView] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statements, setStatements] = useState<Record<string, Statement>>(initialStatements);
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const owners = data.ownerOptions.filter(owner => !propertyId || !owner.propertyIds || owner.propertyIds.includes(propertyId));
  const accounts: Account[] = selectedOwnerPersonId && selectedPropertyId ? [{ ownerPersonId: selectedOwnerPersonId, propertyId: selectedPropertyId, ownerLabel: data.ownerOptions.find(item => item.id === selectedOwnerPersonId)?.label ?? "Owner", propertyLabel: data.propertyOptions.find(item => item.id === selectedPropertyId)?.label ?? "Property" }] : data.accounts;
  async function load(account: Account) {
    const key = keyOf(account);
    if (key in statements || loading.has(key)) return;
    setLoading(current => new Set(current).add(key));
    setErrors(current => { const next = new Set(current); next.delete(key); return next; });
    try {
      const statement = await readStatementReport({ month, ownerPersonId: account.ownerPersonId, propertyId: account.propertyId });
      setStatements(current => ({ ...current, [key]: statement }));
    } catch { setErrors(current => new Set(current).add(key)); }
    finally { setLoading(current => { const next = new Set(current); next.delete(key); return next; }); }
  }
  function toggle(account: Account) {
    const key = keyOf(account);
    setExpanded(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    void load(account);
  }
  const pageHref = (page: number) => `/balances?${new URLSearchParams({ view: "statements", month, propertyId: selectedPropertyId ?? "", ownerPersonId: selectedOwnerPersonId ?? "", page: String(page) })}`;
  return <section className="w-full pb-6" aria-label="Owner statements report">
    <header className="workspace-gutter-x flex min-h-12 items-center gap-3 border-b py-2">
      <Link href="/reports" className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft className="size-4" />All reports</Link>
      <h1 className="text-sm font-semibold">Owner statement</h1><div className="ml-auto flex items-center gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="outline"><Download className="size-4" />Export</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="max-w-[440px]">{accounts.some(account=>expanded.has(keyOf(account)) && statements[keyOf(account)]?.artifacts.length) ? accounts.filter(account=>expanded.has(keyOf(account))).flatMap(account=>(statements[keyOf(account)]?.artifacts??[]).map(artifact=><DropdownMenuItem asChild key={artifact.id}><a href={`/api/reports/${artifact.format==="pdf"?"pdf":"excel"}?artifactId=${artifact.id}`}>{account.ownerLabel} · {account.propertyLabel} · {artifact.format==="pdf"?"PDF":"Excel"}</a></DropdownMenuItem>)) : <DropdownMenuItem disabled>Expand a published statement to export its saved files</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu><Button size="sm" variant="outline" onClick={()=>window.location.reload()}>Refresh</Button></div>
    </header>
    <form method="get" className="workspace-gutter-x flex flex-wrap items-center gap-2 border-b bg-blue-50/20 py-2">
      <input type="hidden" name="view" value="statements" />
      <MonthPickerField ariaLabel="Statement month" name="month" defaultValue={month} className="h-8 w-[180px] rounded-full text-sm" />
      <SearchableSelectControl ariaLabel="Statement property" name="propertyId" value={propertyId} onValueChange={value => { setPropertyId(value); setOwnerId(""); }} options={[{value:"",label:"All properties"}, ...data.propertyOptions.map(item=>({value:item.id,label:item.label}))]} contentClassName="w-[440px]" wrapOptions className="h-8 min-h-8 w-[240px] max-w-full rounded-full" />
      <SearchableSelectControl ariaLabel="Statement owner" name="ownerPersonId" value={ownerId} onValueChange={setOwnerId} options={[{value:"",label:"All owners"}, ...owners.map(item=>({value:item.id,label:item.label}))]} contentClassName="w-[440px]" wrapOptions className="h-8 min-h-8 w-[220px] max-w-full rounded-full" />
      <SelectControl ariaLabel="Report type" value={view} onValueChange={setView} options={[{value:"all",label:"All"},{value:"summary",label:"Summary"},{value:"detail",label:"Detailed"}]} className="h-8 w-28 rounded-full" />
      <Button type="submit" size="sm" className="h-8 rounded-full">Apply</Button><span className="ml-auto rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700">Cash</span>
    </form>
    <div className="workspace-gutter-x">
      <div className="flex items-center gap-3 py-3 text-xs text-muted-foreground"><span>{data.accountTotal} owner accounts</span><div className="ml-auto flex gap-2"><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={async()=>{setExpanded(new Set(accounts.map(keyOf))); for (const account of accounts) await load(account);}}>Expand all</Button><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={()=>setExpanded(new Set())}>Collapse all</Button></div></div>
      <div className="space-y-3">{accounts.map(account=>{
        const key=keyOf(account); const statement=statements[key]; const open=expanded.has(key);
        const manageHref=`/balances?${new URLSearchParams({view:"statements",manage:"1",month,ownerPersonId:account.ownerPersonId,propertyId:account.propertyId})}`;
        return <section key={key} className="overflow-hidden rounded-md border border-border" aria-label={`${account.ownerLabel} statement`}>
          <button type="button" aria-expanded={open} aria-controls={`statement-${key}`} onClick={()=>toggle(account)} className="flex w-full items-center gap-2 bg-muted/40 px-3 py-3 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">{open?<ChevronDown className="size-3"/>:<ChevronRight className="size-3"/>}<span>{account.propertyLabel} | {account.ownerLabel}</span><span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{month}</span></button>
          <div id={`statement-${key}`} hidden={!open} className="space-y-3 p-3">
            {(loading.has(key) || (!(key in statements) && !errors.has(key)))?<p role="status" className="text-sm text-muted-foreground">Loading statement…</p>:errors.has(key)?<div role="alert" className="text-sm">Unable to load this statement. <Button variant="link" onClick={()=>void load(account)}>Retry</Button></div>:statement?<>
              <div className="flex flex-wrap items-center gap-3 text-xs"><span className="text-muted-foreground">{statement.published ? "Published" : "Draft preview"} · {statement.statementNumber}{statement.stale?" · Account has newer activity":""}</span><div className="ml-auto flex gap-3">{statement.artifacts.map(artifact=><a className="font-medium underline underline-offset-4" key={artifact.id} href={`/api/reports/${artifact.format==="pdf"?"pdf":"excel"}?artifactId=${artifact.id}`}>{artifact.format==="pdf"?"PDF":"Excel"}</a>)}</div></div>
              <StatementTables statement={statement} property={account.propertyLabel} view={view} month={month}/>
            </>:<p className="py-3 text-sm text-muted-foreground">No statement is ready for this month. Open Manage statement to review the required checks.</p>}
            <div className="flex justify-end"><Link href={manageHref} className="text-xs text-muted-foreground underline underline-offset-4">Manage statement</Link></div>
          </div>
        </section>;
      })}</div>
      {!accounts.length?<p className="py-8 text-sm text-muted-foreground">No owner accounts match these filters.</p>:null}
      {data.accountPageCount>1?<nav aria-label="Statement pages" className="flex justify-end gap-4 py-4 text-sm">{data.accountPage>1?<Link href={pageHref(data.accountPage-1)}>Previous</Link>:null}<span>Page {data.accountPage} of {data.accountPageCount}</span>{data.accountPage<data.accountPageCount?<Link href={pageHref(data.accountPage+1)}>Next</Link>:null}</nav>:null}
    </div>
  </section>;
}

export function StatementTables({statement,property,view,month}:{statement:NonNullable<Statement>;property:string;view:string;month:string}) {
  const cash=statement.cash;
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const groups = [{label:"Cash received", total:cash.cashInCents, field:"cashInCents" as const, sign:1}, {label:"Cash paid", total:-cash.cashOutCents, field:"cashOutCents" as const, sign:-1}].map(group=>{
    const categories=new Map<string,number>();
    for(const row of cash.transactions) if(row[group.field]) categories.set(row.type,(categories.get(row.type)??0)+row[group.field]*group.sign);
    return {...group,categories};
  });
  const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  const amount=(value:number)=> <span className={value<0?"text-danger":""}>{money(value)}</span>;
  return <>
    {view!=="detail"?<section className="overflow-hidden rounded-md border" aria-label="Statement summary"><h2 className="bg-muted/30 px-3 py-2 text-xs font-semibold">Statement summary</h2><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs [&_td]:px-3 [&_td]:py-2"><thead className="bg-[var(--table-header-bg)]"><tr><th className="px-3 py-2 text-left font-medium">Account</th><th className="px-3 text-right font-medium">{property}</th><th className="px-3 text-right font-medium">Total</th></tr></thead><tbody><tr className="border-b"><td>Cash at beginning of period</td><td className="text-right">{amount(cash.openingCents)}</td><td className="text-right">{amount(cash.openingCents)}</td></tr>{groups.map(group=><Fragment key={group.label}><tr className="border-b bg-muted/30 font-semibold"><td><button type="button" aria-expanded={!closed.has(group.label)} className="flex items-center gap-1" onClick={()=>setClosed(current=>{const next=new Set(current);if(next.has(group.label))next.delete(group.label);else next.add(group.label);return next;})}>{closed.has(group.label)?<ChevronRight className="size-3"/>:<ChevronDown className="size-3"/>}{group.label}</button></td><td className="text-right">{amount(group.total)}</td><td className="text-right">{amount(group.total)}</td></tr>{!closed.has(group.label)?[...group.categories].map(([name,value])=><tr className="border-b border-border/50" key={name}><td className="!pl-8">{name}</td><td className="text-right tabular-nums">{amount(value)}</td><td className="text-right tabular-nums">{amount(value)}</td></tr>):null}</Fragment>)}<tr className="border-t font-semibold"><td>Net cash movement</td><td className="text-right">{amount(cash.cashInCents-cash.cashOutCents)}</td><td className="text-right">{amount(cash.cashInCents-cash.cashOutCents)}</td></tr><tr className="border-t border-blue-400 bg-blue-50 font-semibold dark:bg-blue-950/30"><td>Cash at end of period</td><td className="text-right">{amount(cash.closingCents)}</td><td className="text-right">{amount(cash.closingCents)}</td></tr></tbody></table></div></section>:null}
    {view!=="summary"?<section className="overflow-hidden rounded-md border" aria-label="Transaction detail"><h2 className="bg-muted/30 px-3 py-2 text-xs font-semibold">Transaction detail</h2><div className="flex justify-between border-y border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold dark:bg-blue-950/30"><span>Beginning balance as of {formatCalendarDate(`${month}-01`)}</span>{amount(cash.openingCents)}</div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-xs [&_td]:px-3 [&_td]:py-2"><thead className="bg-[var(--table-header-bg)]"><tr>{["Date","Property","Unit","Category","Description","Cash in","Cash out","Balance"].map((name,i)=><th key={name} className={`px-3 py-2 font-medium ${i>4?"text-right":"text-left"}`}>{name}</th>)}</tr></thead><tbody>{cash.transactions.map(row=><tr key={row.lineNumber} className="border-b border-border/50"><td className="whitespace-nowrap">{formatCalendarDate(row.date)}</td><td>{property}</td><td>—</td><td>{row.type}</td><td className="min-w-48">{row.details}</td><td className="text-right tabular-nums">{money(row.cashInCents)}</td><td className="text-right tabular-nums">{money(row.cashOutCents)}</td><td className="text-right tabular-nums">{amount(row.balanceCents)}</td></tr>)}</tbody></table></div><div className="flex justify-between border-t border-blue-400 bg-blue-50 px-3 py-2 text-xs font-semibold dark:bg-blue-950/30"><span>Ending balance as of {formatCalendarDate(end)}</span>{amount(cash.closingCents)}</div></section>:null}
  </>;
}

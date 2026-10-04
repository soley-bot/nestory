"use client";

import Link from "next/link";
import { withReportReturn } from "../report-return";
import { Fragment, useId, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDate } from "@/lib/dates/format";
import { cn } from "@/lib/utils";
import { formatProfitLossAmount, profitLossSummaryRows, profitLossFundingHeading, type ProfitLossFunding } from "../data/profit-loss-funding";
import type { UnitProfitLossLine } from "../reports.types";

const pageSize = 25;
type AccountGroup = { key: string; label: string; direction: "income" | "expense"; lines: UnitProfitLossLine[]; total: bigint };

export function ProfitLossDetail({ lines, funding, returnTo }: { lines: UnitProfitLossLine[]; funding?: ProfitLossFunding; returnTo?: string }) {
  const id = useId();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [closedSections, setClosedSections] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const grouped = new Map<string, AccountGroup>();
    for (const line of lines) {
      const key = JSON.stringify([line.direction, line.categoryId ?? line.categoryCode, line.currency]);
      const group = grouped.get(key) ?? { key, label: line.category, direction: line.direction, lines: [], total: BigInt(0) };
      group.lines.push(line);
      group.total += line.amountCents;
      grouped.set(key, group);
    }
    return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [lines]);
  const totals = profitLossSummaryRows(lines, funding);
  const toggle = (key: string, setter: typeof setExpanded) => setter(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <section aria-label="Profit and loss detail">
      <div className="flex items-center justify-end gap-1 py-1.5">
        <Button className="h-7 gap-1 rounded-md text-xs font-normal" size="sm" variant="outline" onClick={() => { setClosedSections(new Set()); setExpanded(new Set(groups.map(group => group.key))); }}><ChevronsUpDown className="size-3" />Expand all</Button>
        <Button className="h-7 gap-1 rounded-md text-xs font-normal" size="sm" variant="outline" onClick={() => { setExpanded(new Set()); setClosedSections(new Set(["income", "expense"])); }}><ChevronsDownUp className="size-3" />Collapse all</Button>
      </div>
      <Table aria-label="Profit & loss detail" scrollRegionLabel="Profit and loss report" className="min-w-[850px] table-fixed text-xs [&_td]:px-3 [&_td]:py-1.5">
        <colgroup><col className="w-[23%]" /><col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[13%]" /><col className="w-[15%]" /><col className="w-[18%]" /><col className="w-[12%]" /></colgroup>
        <TableHeader><TableRow className="hover:bg-muted/30">
          {["Account", "Date", "Type", "Name", "Property", "Memo", "Amount"].map(label => <TableHead key={label} className={cn("h-9 border-y border-border/70 px-3 text-[11px] font-medium text-muted-foreground", label === "Account" && "border-r border-r-border/50", label === "Amount" && "text-right")}>{label}</TableHead>)}
        </TableRow></TableHeader>
        {(["income", "expense"] as const).map((direction, sectionIndex) => {
          const sectionLabel = direction === "income" ? "Income" : "Operating expenses";
          const sectionGroups = groups.filter(group => group.direction === direction);
          const open = !closedSections.has(direction);
          return <Fragment key={direction}>
            <TableBody>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell className="border-r border-border/40"><button type="button" aria-expanded={open} aria-controls={`${id}-${direction}`} onClick={() => toggle(direction, setClosedSections)} className="flex min-h-6 w-full items-center gap-1.5 text-left font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {open ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}{sectionLabel}
                </button></TableCell><TableCell colSpan={5} />
                <TableCell className="text-right font-semibold tabular-nums">{formatProfitLossAmount(totals[sectionIndex].amountCents)}</TableCell>
              </TableRow>
            </TableBody>
            <TableBody id={`${id}-${direction}`} hidden={!open}>
              {sectionGroups.map((group, index) => {
                const accountOpen = expanded.has(group.key);
                return <Fragment key={group.key}>
                  <TableRow className="border-border/50">
                    <TableCell className="border-r border-border/40"><button type="button" aria-label={`${sectionLabel}: ${group.label}`} aria-expanded={accountOpen} aria-controls={`${id}-${direction}-${index}`} onClick={() => toggle(group.key, setExpanded)} className="flex min-h-6 w-full items-center gap-1.5 pl-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {accountOpen ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}{group.label}
                    </button></TableCell><TableCell colSpan={5} />
                    <TableCell className="text-right tabular-nums">{formatProfitLossAmount(group.total)}</TableCell>
                  </TableRow>
                  <TableRow id={`${id}-${direction}-${index}`} hidden={!accountOpen} className="border-0"><TableCell colSpan={7} className="!p-0">
                    {accountOpen ? <table aria-label={`${group.label} transactions`} className="w-full table-fixed text-xs"><colgroup><col className="w-[23%]" /><col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[13%]" /><col className="w-[15%]" /><col className="w-[18%]" /><col className="w-[12%]" /></colgroup><thead className="sr-only bg-[var(--table-header-bg)]"><tr>{["Account", "Date", "Type", "Name", "Property", "Memo", "Amount"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{group.lines.map(line => <tr key={line.id} className="border-b border-border/40 text-muted-foreground hover:bg-muted/25">
                      <td className="!pl-11"><span className="sr-only">{group.label}</span></td>
                      <td className="whitespace-nowrap">{formatCalendarDate(line.date)}</td>
                      <td>{line.type ?? (line.direction === "income" ? "Invoice" : "Expense")}</td>
                      <td className="align-top whitespace-normal [overflow-wrap:anywhere]" title={line.name}>{line.name || "—"}</td>
                      <td className="align-top whitespace-normal [overflow-wrap:anywhere]" title={`${line.property} / ${line.unit}`}>{line.property}<span className="block whitespace-normal text-[11px] [overflow-wrap:anywhere]">{line.unit}</span></td>
                      <td className="align-top whitespace-normal [overflow-wrap:anywhere]" title={line.description}>{line.sourceHref ? <Link className="text-foreground underline underline-offset-2" href={withReportReturn(line.sourceHref, returnTo)} aria-label={`Open transaction: ${line.description}`}>{line.description}</Link> : line.description}</td>
                      <td className={cn("text-right tabular-nums", line.amountCents < BigInt(0) && "text-danger")}>{formatProfitLossAmount(line.amountCents)}</td>
                    </tr>)}</tbody></table> : null}
                  </TableCell></TableRow>
                </Fragment>;
              })}
              {sectionGroups.length === 0 ? <TableRow><TableCell colSpan={7} className="!pl-8 text-muted-foreground">No {direction === "income" ? "income" : "operating expenses"} in this period.</TableCell></TableRow> : null}
            </TableBody>
          </Fragment>;
        })}
        <TableBody aria-label="Profit and loss totals">
          {totals.slice(2, 3).map(row => <TableRow key={row.label} className="border-t-2 border-t-blue-400 bg-blue-50 font-semibold hover:bg-blue-50 dark:bg-blue-950/30">
            <TableCell colSpan={6} className="!pl-5">{row.label}</TableCell>
            <TableCell className={cn("text-right tabular-nums", row.amountCents !== null && row.amountCents < BigInt(0) && "text-danger")}>{formatProfitLossAmount(row.amountCents)}</TableCell>
          </TableRow>)}
        </TableBody>
        {funding ? <TableBody aria-label={profitLossFundingHeading}>
          <TableRow><TableCell colSpan={7} className="pt-3 text-muted-foreground">{profitLossFundingHeading}</TableCell></TableRow>
          {totals.slice(3).map(row => <TableRow key={row.label}>
            <TableCell colSpan={6} className="!pl-5">{row.label}</TableCell>
            <TableCell className="text-right tabular-nums">{formatProfitLossAmount(row.amountCents)}</TableCell>
          </TableRow>)}
        </TableBody> : null}
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">Pending expenses are excluded. Profit is not cash available for withdrawal.</p>
      {funding?.unavailableReason ? <p role="status" className="mt-2 text-xs text-warning">{funding.unavailableReason}</p> : null}
    </section>
  );
}

export function ProfitLossUnitTransactions({ lines, returnTo }: { lines: UnitProfitLossLine[]; returnTo?: string }) {
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(lines.length / pageSize) - 1));
  return (
    <section aria-label="Unit transactions">
      <h3 className="text-sm font-semibold">Transactions <span className="font-normal text-muted-foreground">({lines.length})</span></h3>
      <TransactionPagination page={currentPage} count={lines.length} onPageChange={setPage} label="Unit" />
      <ul className="mt-2 divide-y divide-border">
        {lines.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(line => <li key={line.id} className="py-3 text-sm">
          <div className="flex items-start justify-between gap-4"><span className="min-w-0 font-medium [overflow-wrap:anywhere]">{line.category}</span><span className="whitespace-nowrap tabular-nums">{formatProfitLossAmount(line.amountCents)}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{formatCalendarDate(line.date)} · {line.type ?? (line.direction === "income" ? "Invoice" : "Expense")}{line.name ? ` · ${line.name}` : ""}</p>
          <p className="mt-1 [overflow-wrap:anywhere]">{line.sourceHref ? <Link className="underline underline-offset-2" href={withReportReturn(line.sourceHref, returnTo)}>{line.description}</Link> : line.description}</p>
        </li>)}
      </ul>
      {lines.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No recognized income or expenses in this period.</p> : null}
    </section>
  );
}

function TransactionPagination({ page, count, onPageChange, label }: { page: number; count: number; onPageChange: (page: number) => void; label: string }) {
  if (count <= pageSize) return null;
  return <nav aria-label={`${label} transaction pages`} className="flex flex-wrap items-center justify-end gap-3 py-2 text-xs">
    <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, count)} of {count}</span>
    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPageChange(page - 1)}>Previous transactions</Button>
    <Button size="sm" variant="outline" disabled={(page + 1) * pageSize >= count} onClick={() => onPageChange(page + 1)}>Next transactions</Button>
  </nav>;
}

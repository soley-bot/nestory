"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDate } from "@/lib/dates/format";
import { formatProfitLossAmount } from "../data/profit-loss-funding";
import type { UnitProfitLossLine } from "../reports.types";

const pageSize = 25;
type AccountGroup = { key: string; label: string; direction: "income" | "expense"; lines: UnitProfitLossLine[]; total: bigint };

export function ProfitLossDetail({ lines }: { lines: UnitProfitLossLine[] }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const grouped = new Map<string, AccountGroup>();
    const search = query.trim().toLocaleLowerCase();
    for (const line of lines) {
      if (search && ![line.category, line.property, line.unit, line.name, line.description, line.date].join(" ").toLocaleLowerCase().includes(search)) continue;
      const key = JSON.stringify([line.direction, line.categoryId ?? line.categoryCode, line.currency]);
      const group = grouped.get(key) ?? { key, label: line.category, direction: line.direction, lines: [], total: BigInt(0) };
      group.lines.push(line);
      group.total += line.amountCents;
      grouped.set(key, group);
    }
    return [...grouped.values()].sort((a, b) => (a.direction === b.direction ? a.label.localeCompare(b.label) : a.direction === "income" ? -1 : 1));
  }, [lines, query]);

  return (
    <section aria-label="Profit and loss transaction detail" className="border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div>
          <h2 className="text-sm font-semibold">Transaction detail</h2>
          <p className="mt-1 text-xs text-muted-foreground">{lines.length} transactions · Recognized by invoice or owner-cost obligation date.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Search transactions" placeholder="Find a transaction" className="h-8 w-56" value={query} onChange={event => setQuery(event.target.value)} />
          <Button size="sm" variant="outline" onClick={() => setExpanded(new Set(groups.map(group => group.key)))}>Expand all</Button>
          <Button size="sm" variant="outline" onClick={() => setExpanded(new Set())}>Collapse all</Button>
        </div>
      </div>
      <p className="pb-3 text-xs text-muted-foreground">Property-level costs remain separate from unit costs. {query ? "Account subtotals reflect this search. Report totals and exports include the full selected scope." : "Expand an account to review its transactions."}</p>
      <div className="divide-y divide-border border-y border-border">
        {groups.map(group => <AccountTransactions key={group.key + query} group={group} expanded={expanded.has(group.key)} onToggle={() => setExpanded(current => {
          const next = new Set(current);
          if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
          return next;
        })} />)}
      </div>
      {groups.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{query ? "No transactions match this search." : "No recognized income or expenses in this period."}</p> : null}
    </section>
  );
}

function AccountTransactions({ group, expanded, onToggle }: { group: AccountGroup; expanded: boolean; onToggle: () => void }) {
  const id = useId();
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(group.lines.length / pageSize) - 1));
  const visible = group.lines.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const label = `${group.direction === "income" ? "Income" : "Expenses"}: ${group.label}`;
  return (
    <div>
      <button aria-expanded={expanded} aria-controls={id} onClick={onToggle} className="flex min-h-11 w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button">
        {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{group.lines.length} transactions</span>
        <span className="ml-auto whitespace-nowrap font-semibold tabular-nums">{formatProfitLossAmount(group.total)}</span>
      </button>
      <div id={id} hidden={!expanded}>
        {expanded ? <>
          <TransactionPagination page={currentPage} count={group.lines.length} onPageChange={setPage} label={label} />
          <div className="[&>[data-slot=table-container]]:max-h-[55vh]">
            <Table aria-label={label} scrollRegionLabel={`${label} transactions`}>
              <TableHeader sticky><TableRow>
                {["Date", "Description", "Name / type", "Property / unit", "Amount"].map(column => <TableHead key={column} className={column === "Amount" ? "text-right" : undefined}>{column}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>{visible.map(line => <TableRow key={line.id}>
                <TableCell className="align-top whitespace-nowrap">{formatCalendarDate(line.date)}</TableCell>
                <TableCell className="min-w-40 max-w-sm whitespace-normal break-words align-top">{line.description}</TableCell>
                <TableCell className="min-w-28 max-w-48 whitespace-normal align-top">{line.name || "—"}<span className="block text-xs text-muted-foreground">{line.type ?? (line.direction === "income" ? "Invoice" : "Expense")}</span></TableCell>
                <TableCell className="min-w-32 max-w-56 whitespace-normal align-top">{line.property}<span className="block text-xs text-muted-foreground">{line.unit}</span></TableCell>
                <TableCell className="text-right align-top tabular-nums">{formatProfitLossAmount(line.amountCents)}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
        </> : null}
      </div>
    </div>
  );
}

export function ProfitLossUnitTransactions({ lines }: { lines: UnitProfitLossLine[] }) {
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(lines.length / pageSize) - 1));
  return (
    <section aria-label="Unit transactions">
      <h3 className="text-sm font-semibold">Transactions <span className="font-normal text-muted-foreground">({lines.length})</span></h3>
      <TransactionPagination page={currentPage} count={lines.length} onPageChange={setPage} label="Unit" />
      <ul className="mt-2 divide-y divide-border">
        {lines.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(line => <li key={line.id} className="py-3 text-sm">
          <div className="flex items-start justify-between gap-4"><span className="font-medium">{line.category}</span><span className="whitespace-nowrap tabular-nums">{formatProfitLossAmount(line.amountCents)}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{formatCalendarDate(line.date)} · {line.type ?? (line.direction === "income" ? "Invoice" : "Expense")}{line.name ? ` · ${line.name}` : ""}</p>
          <p className="mt-1 break-words">{line.description}</p>
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

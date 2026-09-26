"use client";

import { formatCalendarDate } from "@/lib/dates/format";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UnitProfitLossLine } from "@/features/reports/reports.types";
import { Fragment } from "react";
import { formatProfitLossAmount, profitLossSummaryRows, profitLossFundingNote, type ProfitLossFunding } from "../data/profit-loss-funding";

export function ProfitLossDetail({ lines, funding }: { lines: UnitProfitLossLine[]; funding?: ProfitLossFunding }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(lines.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const orderedLines = [...lines.filter(line => line.direction === "income"), ...lines.filter(line => line.direction === "expense")];
  const visibleLines = orderedLines.slice(currentPage * 50, (currentPage + 1) * 50);
  return (
    <section aria-label="Profit and loss transaction detail" className="border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div>
          <h2 className="text-sm font-semibold">Transaction detail</h2>
          <p className="mt-1 text-xs text-muted-foreground">Recognized by invoice or owner-cost obligation date. Property-level costs remain separate from unit costs.</p>
        </div>
        <span className="text-xs text-muted-foreground">{lines.length} transactions</span>
      </div>
      <Table>
        <TableHeader><TableRow>
          { ["Account", "Date", "Type", "Name", "Property / unit", "Description", "Amount"].map((label, index) => <TableHead className={index > 5 ? "text-right" : undefined} key={label}>{label}</TableHead>) }
        </TableRow></TableHeader>
        <TableBody>
          {visibleLines.map((line, index) => <Fragment key={line.id}>
            {index === 0 || visibleLines[index - 1]?.direction !== line.direction ? <TableRow><TableCell colSpan={7} className="bg-muted/40 font-semibold">{line.direction === "income" ? "Income" : "Expenses"}</TableCell></TableRow> : null}
            <TableRow>
            <TableCell>{line.category}</TableCell>
            <TableCell className="whitespace-nowrap">{formatCalendarDate(line.date)}</TableCell>
            <TableCell>{line.type ?? (line.direction === "income" ? "Invoice" : "Expense")}</TableCell>
            <TableCell>{line.name || "—"}</TableCell>
            <TableCell>{line.property}<span className="block text-xs text-muted-foreground">{line.unit}</span></TableCell>
            <TableCell className="min-w-52 max-w-xl whitespace-normal break-words">{line.description}</TableCell>
            <TableCell className="text-right tabular-nums">{formatProfitLossAmount(line.amountCents)}</TableCell>
          </TableRow></Fragment>)}
          {lines.length === 0 ? <TableRow><TableCell colSpan={7} className="py-6 text-muted-foreground">No recognized income or expenses in this period.</TableCell></TableRow> : null}
        </TableBody>
      </Table>
      <dl className="ml-auto grid max-w-lg grid-cols-[1fr_auto] gap-x-6 gap-y-2 border-t border-border py-4 text-sm" aria-label="Profit and loss summary">
        {profitLossSummaryRows(lines, funding).map(row => <Fragment key={row.label}>
          <dt className={row.label.startsWith("Net") ? "font-semibold" : undefined}>{row.label}</dt>
          <dd className="text-right tabular-nums">{formatProfitLossAmount(row.amountCents)}</dd>
        </Fragment>)}
      </dl>
      {funding ? <p className="pb-3 text-xs text-muted-foreground">{profitLossFundingNote} {funding.unavailableReason}</p> : null}
      {pageCount > 1 ? <div className="flex items-center justify-end gap-3 py-3 text-xs">
        <span>Page {currentPage + 1} of {pageCount}</span>
        <Button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} size="sm" variant="outline">Previous transactions</Button>
        <Button disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)} size="sm" variant="outline">Next transactions</Button>
      </div> : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UnitProfitLossLine } from "@/features/reports/reports.types";

export function ProfitLossDetail({ lines }: { lines: UnitProfitLossLine[] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(lines.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
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
          { ["Date", "Property / unit", "Category", "Description", "Income", "Expenses"].map((label, index) => <TableHead className={index > 3 ? "text-right" : undefined} key={label}>{label}</TableHead>) }
        </TableRow></TableHeader>
        <TableBody>
          {lines.slice(currentPage * 50, (currentPage + 1) * 50).map((line) => <TableRow key={line.id}>
            <TableCell className="whitespace-nowrap">{line.date}</TableCell>
            <TableCell>{line.property}<span className="block text-xs text-muted-foreground">{line.unit}</span></TableCell>
            <TableCell>{line.category}</TableCell>
            <TableCell className="min-w-52 max-w-xl whitespace-normal break-words">{line.description}</TableCell>
            <TableCell className="text-right tabular-nums">{line.direction === "income" ? formatAmount(line.amountCents) : "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{line.direction === "expense" ? formatAmount(line.amountCents) : "—"}</TableCell>
          </TableRow>)}
          {lines.length === 0 ? <TableRow><TableCell colSpan={6} className="py-6 text-muted-foreground">No recognized income or expenses in this period.</TableCell></TableRow> : null}
        </TableBody>
      </Table>
      {pageCount > 1 ? <div className="flex items-center justify-end gap-3 py-3 text-xs">
        <span>Page {currentPage + 1} of {pageCount}</span>
        <Button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} size="sm" variant="outline">Previous transactions</Button>
        <Button disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)} size="sm" variant="outline">Next transactions</Button>
      </div> : null}
    </section>
  );
}

function formatAmount(cents: bigint) {
  const magnitude = cents < BigInt(0) ? -cents : cents;
  const dollars = (magnitude / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${cents < BigInt(0) ? "-" : ""}USD ${dollars}.${String(magnitude % BigInt(100)).padStart(2, "0")}`;
}

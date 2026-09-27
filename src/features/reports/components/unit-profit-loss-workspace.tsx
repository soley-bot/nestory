"use client";

import { Fragment } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportResultsTable } from "./report-results-table";
import { ProfitLossDetail } from "./profit-loss-detail";
import { formatProfitLossAmount, profitLossFundingNote, profitLossSummaryRows } from "../data/profit-loss-funding";
import type { ReportsViewQuery, TrustedReport } from "../reports.types";

export function UnitProfitLossWorkspace({ report, viewQuery }: { report: TrustedReport; viewQuery: ReportsViewQuery }) {
  const lines = report.unitProfitLossLines ?? [];
  const funding = report.unitProfitLossFunding;
  return (
    <div className="space-y-4">
      {funding && !report.scopeValidation ? (
        <section aria-label="Owner funding and balance" className="border-b border-border pb-3">
          <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {profitLossSummaryRows(lines, funding).slice(3).map(row => (
              <div key={row.label}>
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="mt-1 font-semibold tabular-nums">{formatProfitLossAmount(row.amountCents)}</dd>
              </div>
            ))}
          </dl>
          {funding.unavailableReason ? <p role="status" className="mt-2 text-xs text-warning">{funding.unavailableReason}</p> : null}
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">How this total is calculated</summary>
            <p className="mt-2 max-w-3xl">{profitLossFundingNote}</p>
            <dl className="mt-2 grid max-w-sm grid-cols-[1fr_auto] gap-1">
              {profitLossSummaryRows(lines, funding).map(row => <Fragment key={row.label}><dt>{row.label}</dt><dd className="text-right tabular-nums">{formatProfitLossAmount(row.amountCents)}</dd></Fragment>)}
            </dl>
          </details>
        </section>
      ) : null}
      <Tabs defaultValue="summary">
        <TabsList aria-label="Profit and loss view">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <ReportResultsTable report={report} reportRowCount={report.totalRowCount ?? report.rows.length} viewQuery={viewQuery} />
        </TabsContent>
        <TabsContent value="transactions">
          {report.scopeValidation ? <p className="py-4 text-sm text-muted-foreground">Resolve the report scope before viewing transactions.</p> : <ProfitLossDetail lines={lines} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

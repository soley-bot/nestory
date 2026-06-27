import Link from "next/link";
import { Fragment } from "react";
import { Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/data/money-display";
import { PageHeader } from "@/components/layout/page-header";
import { ReportsFilters } from "@/features/reports/components/reports-filters";
import { PrintButton } from "@/features/reports/components/print-button";
import type {
  OccupancyReport,
  OccupancyReportRow,
  ProfitLossDirectionGroup,
  ProfitLossReport,
  ReportsScreenData,
  ReportsViewQuery,
} from "@/features/reports/reports.types";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/utils";

type ReportsScreenProps = ReportsScreenData & {
  organizationName: string;
};

export function ReportsScreen({
  occupancyReport,
  organizationName,
  profitLossReport,
  propertyOptions,
  viewQuery,
}: ReportsScreenProps) {
  const isProfitLoss = viewQuery.report === "profit-loss";

  return (
    <div className="min-h-screen bg-background print:bg-white">
      <div className="print:hidden">
        <PageHeader
          actions={
            <>
              <a
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
                href={buildCsvHref(viewQuery)}
              >
                <Download size={14} />
                Export CSV
              </a>
              <PrintButton />
            </>
          }
          description={
            isProfitLoss
              ? "Grouped income and expense detail for the selected accounting month."
              : "Printable available-unit list for the current filters."
          }
          title="Reports"
        />
      </div>

      <ReportsFilters propertyOptions={propertyOptions} viewQuery={viewQuery} />

      <main className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4 print:p-0">
        {isProfitLoss && profitLossReport ? (
          <ProfitLossReportView
            organizationName={organizationName}
            report={profitLossReport}
          />
        ) : (
          <OccupancyReportView
            organizationName={organizationName}
            report={occupancyReport}
          />
        )}
      </main>
    </div>
  );
}

function OccupancyReportView({
  organizationName,
  report,
}: {
  organizationName: string;
  report?: OccupancyReport;
}) {
  const rows = report?.rows ?? [];

  return (
    <>
      <div className="hidden grid-cols-2 gap-2 sm:grid md:grid-cols-4 print:hidden">
        <SummaryTile label="Report rows" value={String(report?.totals.visible ?? 0)} />
        <SummaryTile label="Vacant" value={String(report?.totals.vacant ?? 0)} />
        <SummaryTile label="Occupied" value={String(report?.totals.occupied ?? 0)} />
        <SummaryTile label="Other status" value={String(report?.totals.other ?? 0)} />
      </div>

      <section className="rounded-md border border-border bg-surface print:border-0 print:bg-white">
        <div className="flex flex-col gap-2 border-b border-border px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-4 sm:py-4 print:block print:border-0 print:px-0 print:pb-3 print:pt-0 print:text-center">
          <div>
            <div className="flex items-center gap-2 print:block">
              <FileText className="text-accent print:hidden" size={17} />
              <h2 className="text-base font-semibold text-foreground print:text-[18px] print:text-black">
                Available Units - {organizationName}
              </h2>
            </div>
            <p className="mt-1 text-xs text-foreground-muted sm:text-[13px] print:text-[12px] print:text-black">
              {report ? `(Last Update: ${formatLongReportDate(report.generatedAt)})` : "Not loaded"}
            </p>
          </div>
          <div className="hidden text-[13px] text-foreground-muted sm:block print:hidden">
            Showing{" "}
            <span className="font-medium text-foreground">
              {report?.totals.visible ?? 0}
            </span>{" "}
            rows. Vacant units are sorted first.
          </div>
        </div>

        <div className="max-h-[280px] overflow-auto sm:max-h-[min(460px,calc(100vh-455px))] print:max-h-none print:overflow-visible">
          <table
            aria-label="Vacant units report"
            className="min-w-[920px] w-full border-separate border-spacing-0 text-left text-[13px] print:min-w-0 print:border print:border-black print:text-[10px] print:text-black print:[&_td]:border print:[&_td]:border-black print:[&_td]:px-1.5 print:[&_td]:py-1.5 print:[&_th]:border print:[&_th]:border-black print:[&_th]:px-1.5 print:[&_th]:py-1 print:[&_thead_tr]:bg-white"
          >
            <thead className="sticky top-0 z-10 print:static">
              <tr className="bg-surface-muted text-[11px] font-semibold text-muted">
                <th className="border-b border-border px-3 py-2">No.</th>
                <th className="border-b border-border px-3 py-2">Property Name</th>
                <th className="border-b border-border px-3 py-2">
                  Unit no. / Floor
                </th>
                <th className="border-b border-border px-3 py-2">Type</th>
                <th className="border-b border-border px-3 py-2">Inclusion</th>
                <th className="border-b border-border px-3 py-2 text-right">Price</th>
                <th className="border-b border-border px-3 py-2">Property Code</th>
                <th className="border-b border-border px-3 py-2">Remark</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-muted" colSpan={8}>
                    No units match this report.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <OccupancyReportTableRow
                    index={index}
                    key={row.id}
                    row={row}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-1 border-t border-border px-4 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <strong>Total vacant units: {report?.totals.vacant ?? 0}</strong>
          <span className="text-foreground-muted print:hidden">
            Open a unit to continue into its record room.
          </span>
        </div>
      </section>
    </>
  );
}

function OccupancyReportTableRow({
  index,
  row,
}: {
  index: number;
  row: OccupancyReportRow;
}) {
  return (
    <tr className="align-top hover:bg-surface-muted/70 print:break-inside-avoid print:hover:bg-white">
      <td className="border-b border-border px-3 py-2.5 text-foreground-muted">
        {index + 1}
      </td>
      <td className="border-b border-border px-3 py-2.5 font-medium">
        {row.propertyName}
      </td>
      <td className="border-b border-border px-3 py-2.5">
        <Link
          className="font-medium text-accent hover:text-accent-strong print:text-black"
          href={`/units/${row.id}`}
        >
          {row.unitNumber}
        </Link>
        {row.floorLabel !== "-" ? (
          <span className="ml-2 text-foreground-muted">/ {row.floorLabel}</span>
        ) : null}
      </td>
      <td className="border-b border-border px-3 py-2.5 text-foreground-muted">
        {row.typeLabel}
      </td>
      <td className="border-b border-border px-3 py-2.5 text-foreground-muted">
        {row.inclusionLabel}
      </td>
      <td className="border-b border-border px-3 py-2.5 text-right">
        {row.rentDisplay ? (
          <MoneyDisplay align="right" showSecondary={false} value={row.rentDisplay} />
        ) : (
          <span className="text-foreground-muted">{row.rentLabel}</span>
        )}
      </td>
      <td className="border-b border-border px-3 py-2.5 font-medium">
        {row.propertyCode}
      </td>
      <td className="max-w-[320px] border-b border-border px-3 py-2.5 leading-5 text-foreground-muted">
        <Badge className="mb-1 mr-2 align-middle print:hidden" tone={row.statusTone}>
          {row.statusLabel}
        </Badge>
        {row.remark}
      </td>
    </tr>
  );
}

function ProfitLossReportView({
  organizationName,
  report,
}: {
  organizationName: string;
  report: ProfitLossReport;
}) {
  return (
    <>
      <div className="hidden grid-cols-2 gap-2 sm:grid md:grid-cols-4 print:hidden">
        <SummaryTile
          label="Income"
          value={report.totalIncomeDisplay.primary}
        />
        <SummaryTile
          label="Expenses"
          value={report.totalExpensesDisplay.primary}
        />
        <SummaryTile
          label="Net income"
          value={report.netIncomeDisplay.primary}
        />
        <SummaryTile label="Entries" value={String(report.entryCount)} />
      </div>

      <div className="max-h-[280px] overflow-auto pb-3 sm:max-h-[min(460px,calc(100vh-455px))] print:max-h-none print:overflow-visible print:pb-0">
        <section className="min-w-[980px] rounded-md border border-border bg-surface p-5 print:min-w-0 print:border-0 print:bg-white print:p-0">
          <div className="flex items-start justify-between gap-8 border-b border-border pb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Profit and loss details
              </h2>
              <p className="mt-3 text-sm font-medium text-muted">
                {report.periodLabel}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                Cash basis / generated {formatDate(report.generatedAt)}
              </p>
            </div>
            <div className="min-w-56 text-right">
              <strong className="block text-base font-semibold text-foreground">
                Nestory
              </strong>
              <span className="mt-1 block text-[13px] text-muted">
                {organizationName}
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <ReportChip label="Unit" value="" />
            <ReportChip label="Property" value={report.propertyLabel} />
            <ReportChip label="Beginning balance" value="No" />
            <ReportChip label="Basis" value="Ledger entries" />
          </div>

          <table
            aria-label="Profit and loss details report"
            className="mt-6 w-full border-separate border-spacing-0 text-left text-[13px] text-foreground"
          >
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[18%]" />
              <col className="w-[22%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-muted text-[11px] font-semibold text-muted">
                <th className="border-y border-l border-border px-3 py-2">Date</th>
                <th className="border-y border-border px-3 py-2">Type</th>
                <th className="border-y border-border px-3 py-2">Name</th>
                <th className="border-y border-border px-3 py-2">Property</th>
                <th className="border-y border-border px-3 py-2 text-right">
                  Amount
                </th>
                <th className="border-y border-r border-border px-3 py-2">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              <ProfitLossDirectionRows group={report.income} />
              <ProfitLossTotalRow
                amount={report.totalIncomeDisplay.primary}
                label="Total Income"
              />
              <ProfitLossDirectionRows group={report.expenses} />
              <ProfitLossTotalRow
                amount={report.totalExpensesDisplay.primary}
                label="Total Expenses"
              />
              <ProfitLossTotalRow
                amount={report.netOperatingIncomeDisplay.primary}
                label="Net operating income"
                strong
              />
              <ProfitLossTotalRow
                amount={report.otherIncomeDisplay.primary}
                label="Other income"
              />
              <ProfitLossTotalRow
                amount={report.otherExpensesDisplay.primary}
                label="Other expenses"
              />
              <ProfitLossTotalRow
                amount={report.netOtherIncomeDisplay.primary}
                label="Net other income"
              />
              <ProfitLossTotalRow
                amount={report.netIncomeDisplay.primary}
                label="Net income"
                strong
              />
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function ProfitLossDirectionRows({
  group,
}: {
  group: ProfitLossDirectionGroup;
}) {
  return (
    <>
      <tr className="bg-surface-muted font-semibold">
        <td className="border-b border-l border-r-4 border-border px-4 py-2" colSpan={6}>
          {group.label}
        </td>
      </tr>
      {group.groups.length === 0 ? (
        <tr>
          <td
            className="border-b border-l border-border px-8 py-3 text-muted"
            colSpan={6}
          >
            No {group.label.toLowerCase()} entries for this period.
          </td>
        </tr>
      ) : (
        group.groups.map((categoryGroup) => (
          <Fragment key={categoryGroup.category}>
            <tr className="font-semibold">
              <td
                className="border-b border-l border-border px-8 py-2"
                colSpan={6}
              >
                {categoryGroup.category}
              </td>
            </tr>
            {categoryGroup.entries.map((entry) => (
              <tr className="align-top" key={entry.id}>
                <td className="border-b border-l border-border px-12 py-2 text-muted">
                  {formatDate(entry.date)}
                </td>
                <td className="border-b border-border px-3 py-2">
                  {entry.typeLabel}
                </td>
                <td className="border-b border-border px-3 py-2">{entry.name}</td>
                <td className="border-b border-border px-3 py-2 text-muted">
                  {entry.propertyLabel}
                </td>
                <td className="border-b border-border px-3 py-2 text-right font-medium tabular-nums">
                  <MoneyDisplay
                    align="right"
                    showSecondary={false}
                    value={entry.amountDisplay}
                  />
                </td>
                <td className="border-b border-r border-border px-3 py-2 text-muted">
                  {entry.description || "-"}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td
                className="border-b border-l border-border px-12 py-2"
                colSpan={4}
              >
                Total {categoryGroup.category}
              </td>
              <td className="border-b border-border px-3 py-2 text-right tabular-nums">
                {categoryGroup.totalDisplay.primary}
              </td>
              <td className="border-b border-r border-border" />
            </tr>
          </Fragment>
        ))
      )}
    </>
  );
}

function ProfitLossTotalRow({
  amount,
  label,
  strong = false,
}: {
  amount: string;
  label: string;
  strong?: boolean;
}) {
  return (
    <tr className={cn("bg-surface-muted font-semibold", strong && "font-bold")}>
      <td
        className="border-b border-l border-r-4 border-border px-8 py-2"
        colSpan={4}
      >
        {label}
      </td>
      <td className="border-b border-border px-3 py-2 text-right tabular-nums">
        {amount}
      </td>
      <td className="border-b border-r border-border" />
    </tr>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function ReportChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2.5 text-[13px]">
      <strong>{label}:</strong>
      <span className="text-foreground-muted">{value}</span>
    </div>
  );
}

function formatLongReportDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    weekday: "long",
    year: "numeric",
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((dateParts, part) => {
      dateParts[part.type] = part.value;
      return dateParts;
    }, {});

  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

function buildCsvHref(query: ReportsViewQuery) {
  const params = new URLSearchParams();

  params.set("report", query.report);

  if (query.propertyId !== "all") {
    params.set("propertyId", query.propertyId);
  }

  if (query.report === "occupancy" && query.status !== "all") {
    params.set("status", query.status);
  }

  if (query.report === "profit-loss") {
    params.set("month", query.month);
  }

  return `/api/reports/export?${params.toString()}`;
}

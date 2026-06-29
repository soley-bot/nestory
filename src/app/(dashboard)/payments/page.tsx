import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  FileCheck,
  Plus,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { getLedgerScreenData } from "@/features/ledger/data/ledger";
import { DEFAULT_LEDGER_VIEW_QUERY } from "@/features/ledger/ledger.filters";
import type { LedgerEntry } from "@/features/ledger/ledger.types";
import { requireAdminContext } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates/format";
import { formatMoney, formatMoneyDisplay } from "@/lib/money/format";

export default async function PaymentsPage() {
  const context = await requireAdminContext();
  const data = await getPaymentsData(context.organizationId);

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <>
            <Link
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
              href="/ledger?direction=income"
            >
              <ReceiptText size={15} />
              Income ledger
            </Link>
            <Link
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
              href="/ledger?direction=income&action=create"
            >
              <Plus size={15} />
              Add payment
            </Link>
          </>
        }
        description="Ledger-backed income review for received payments, receipt evidence, and reporting follow-up."
        title="Payments"
      />

      <main className="space-y-3 px-4 py-4 sm:px-6 lg:max-h-[calc(100vh-132px)] lg:overflow-auto lg:px-6 lg:py-4">
        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <PaymentStat
            icon={<Wallet size={15} />}
            label={data.totalReceivedLabel}
            value={data.totalReceived}
          />
          <PaymentStat
            icon={<ReceiptText size={15} />}
            label={data.entryCountLabel}
            value={data.entryCount}
          />
          <PaymentStat
            icon={<AlertTriangle size={15} />}
            label={data.missingReceiptLabel}
            value={String(data.missingReceiptCount)}
          />
          <PaymentStat
            icon={<FileCheck size={15} />}
            label={data.receiptCoverageLabel}
            value={data.receiptCoverage}
          />
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-base font-semibold">Received payments</h2>
              <p className="mt-1 text-sm text-muted">{data.tableSummary}</p>
            </div>
            <Link
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
              href="/documents?query=receipt"
            >
              <FileCheck size={15} />
              Receipt docs
            </Link>
          </div>

          <div className="max-h-[min(620px,calc(100vh-320px))] overflow-auto">
            <table className="w-full min-w-[920px] table-fixed border-collapse text-left text-[13px]">
              <colgroup>
                <col className="w-[120px]" />
                <col />
                <col className="w-[220px]" />
                <col className="w-[160px]" />
                <col className="w-[168px]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Payment</th>
                  <th className="px-3 py-2.5 font-semibold">Property</th>
                  <th className="px-3 py-2.5 font-semibold">Evidence</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-muted"
                      colSpan={5}
                    >
                      No payments found.
                    </td>
                  </tr>
                ) : null}
                {data.rows.map((row) => (
                  <tr
                    className="border-b border-border align-top hover:bg-surface-muted/60"
                    key={row.id}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                      {formatDate(row.transactionDate)}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="line-clamp-1 break-words font-medium">
                        {row.category}
                      </p>
                      <p className="mt-1 line-clamp-1 text-muted">
                        {row.description || "No description recorded."}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p
                        className="truncate font-medium"
                        title={`${row.propertyCode} - ${row.propertyName}`}
                      >
                        {row.propertyCode} - {row.propertyName}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {row.unitNumber
                          ? `Unit ${row.unitNumber}`
                          : "Property level"}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            row.documents.length > 0 ? "success" : "warning"
                          }
                        >
                          {row.documents.length > 0
                            ? "Receipt attached"
                            : "Missing"}
                        </Badge>
                        <Link
                          aria-label="Open ledger entry"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-accent transition-colors hover:bg-surface-muted"
                          href={row.hrefs.ledger}
                          title="Open ledger entry"
                        >
                          <ArrowUpRight size={13} />
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <MoneyDisplay
                        align="right"
                        value={formatMoneyDisplay(row.amount, row.currency)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function PaymentStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span className="text-muted">{icon}</span>
      </div>
      <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

async function getPaymentsData(organizationId: string) {
  const { entries, pagination } = await getLedgerScreenData(organizationId, {
    ...DEFAULT_LEDGER_VIEW_QUERY,
    direction: "income",
    pageSize: 100,
  });
  const rows: LedgerEntry[] = entries;
  const isLimited = pagination.totalCount > rows.length;
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const receiptCount = rows.filter((row) => row.documents.length > 0).length;
  const receiptCoverage =
    rows.length > 0
      ? `${Math.round((receiptCount / rows.length) * 100)}%`
      : "0%";

  return {
    entryCount: isLimited
      ? `${rows.length}/${pagination.totalCount}`
      : String(rows.length),
    entryCountLabel: isLimited ? "Reviewed / total" : "Entries",
    missingReceiptLabel: isLimited
      ? "Latest missing receipts"
      : "Missing receipts",
    missingReceiptCount: rows.length - receiptCount,
    receiptCoverage,
    receiptCoverageLabel: isLimited
      ? "Latest receipt coverage"
      : "Receipt coverage",
    rows,
    tableSummary: getPaymentsTableSummary({
      isLimited,
      latestPaymentDate: rows[0]?.transactionDate,
      reviewedCount: rows.length,
      totalCount: pagination.totalCount,
    }),
    totalReceived: formatMoney(totalAmount, "USD"),
    totalReceivedLabel: isLimited ? "Latest received" : "Received",
  };
}

function getPaymentsTableSummary({
  isLimited,
  latestPaymentDate,
  reviewedCount,
  totalCount,
}: {
  isLimited: boolean;
  latestPaymentDate?: string;
  reviewedCount: number;
  totalCount: number;
}) {
  if (!latestPaymentDate) {
    return "No active income entries recorded yet.";
  }

  const latestLabel = `Latest payment ${formatDate(latestPaymentDate)}`;

  return isLimited
    ? `Showing latest ${reviewedCount} of ${totalCount} income entries. ${latestLabel}.`
    : latestLabel;
}

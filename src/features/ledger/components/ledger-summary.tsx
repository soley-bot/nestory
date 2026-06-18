import type { ReactNode } from "react";
import { ArrowDownCircle, ArrowUpCircle, Landmark } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import type { LedgerSnapshot } from "@/features/ledger/ledger.types";

type LedgerSummaryProps = {
  snapshot: LedgerSnapshot;
};

export function LedgerSummary({ snapshot }: LedgerSummaryProps) {
  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="border-b border-border px-3 py-2.5">
        <h2 className="text-[13px] font-semibold">Ledger snapshot</h2>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        <SummaryItem
          helper="Current view"
          icon={<Landmark size={16} />}
          label="Net income"
          value={<MoneyDisplay value={snapshot.netIncome} />}
        />
        <SummaryItem
          helper="Income"
          icon={<ArrowUpCircle size={16} />}
          label="Income"
          value={<MoneyDisplay value={snapshot.totalIncome} />}
        />
        <SummaryItem
          className="col-span-2 sm:col-span-1"
          helper="Expenses"
          icon={<ArrowDownCircle size={16} />}
          label="Expenses"
          value={<MoneyDisplay value={snapshot.totalExpense} />}
        />
      </div>
    </section>
  );
}

function SummaryItem({
  className = "",
  helper,
  icon,
  label,
  value,
}: {
  className?: string;
  helper: string;
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={`min-w-0 bg-surface px-3 py-3 ${className}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-[11px] font-medium uppercase tracking-[0] text-muted">
          {label}
        </p>
        <span className="shrink-0 text-muted">{icon}</span>
      </div>
      <div className="mt-2 min-w-0 text-sm font-semibold">{value}</div>
      <p className="mt-1 min-w-0 break-words text-xs text-muted">{helper}</p>
    </div>
  );
}

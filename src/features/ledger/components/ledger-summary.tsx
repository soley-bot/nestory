import { ArrowDownCircle, ArrowUpCircle, Landmark } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { MetricTile } from "@/components/data/metric-tile";
import type { LedgerSnapshot } from "@/features/ledger/ledger.types";

type LedgerSummaryProps = {
  snapshot: LedgerSnapshot;
};

export function LedgerSummary({ snapshot }: LedgerSummaryProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <MetricTile
        helper="Across the current ledger view"
        icon={<Landmark size={18} />}
        label="Net income"
        value={<MoneyDisplay value={snapshot.netIncome} size="large" />}
      />
      <MetricTile
        helper="Income in the current ledger view"
        icon={<ArrowUpCircle size={18} />}
        label="Income"
        value={<MoneyDisplay value={snapshot.totalIncome} size="large" />}
      />
      <MetricTile
        helper="Expenses in the current ledger view"
        icon={<ArrowDownCircle size={18} />}
        label="Expenses"
        value={<MoneyDisplay value={snapshot.totalExpense} size="large" />}
      />
    </div>
  );
}

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Landmark,
  Lock,
  ReceiptText,
} from "lucide-react";
import { MetricTile } from "@/components/data/metric-tile";
import type { LedgerSnapshot } from "@/features/ledger/ledger.types";

type LedgerSummaryProps = {
  resultScope?: string;
  snapshot: LedgerSnapshot;
};

export function LedgerSummary({
  resultScope = "Active ledger",
  snapshot,
}: LedgerSummaryProps) {
  const scopedHelper = `${resultScope}, not just the visible page`;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricTile
        helper={scopedHelper}
        icon={<Landmark size={18} />}
        label="Net income"
        value={snapshot.netIncome}
      />
      <MetricTile
        helper={scopedHelper}
        icon={<ArrowUpCircle size={18} />}
        label="Income"
        value={snapshot.totalIncome}
      />
      <MetricTile
        helper={scopedHelper}
        icon={<ArrowDownCircle size={18} />}
        label="Expenses"
        value={snapshot.totalExpense}
      />
      <MetricTile
        helper={resultScope}
        icon={<ReceiptText size={18} />}
        label="Filtered rows"
        value={snapshot.entryCount}
      />
      <MetricTile
        helper="Closed accounting months"
        icon={<Lock size={18} />}
        label="Locked periods"
        value={snapshot.lockedPeriodCount}
      />
    </div>
  );
}

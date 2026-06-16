import {
  ArrowDownCircle,
  ArrowUpCircle,
  Landmark,
  Lock,
  ReceiptText,
} from "lucide-react";
import { MetricTile } from "@/components/data/metric-tile";
import type { LedgerSnapshot } from "@/features/ledger/ledger.types";

export function LedgerSummary({ snapshot }: { snapshot: LedgerSnapshot }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricTile
        helper="Income minus expenses"
        icon={<Landmark size={18} />}
        label="Net income"
        value={snapshot.netIncome}
      />
      <MetricTile
        helper="Recorded income"
        icon={<ArrowUpCircle size={18} />}
        label="Income"
        value={snapshot.totalIncome}
      />
      <MetricTile
        helper="Recorded expenses"
        icon={<ArrowDownCircle size={18} />}
        label="Expenses"
        value={snapshot.totalExpense}
      />
      <MetricTile
        helper="Active ledger rows"
        icon={<ReceiptText size={18} />}
        label="Entries"
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

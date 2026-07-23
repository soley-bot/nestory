import type { CurrencyCode } from "@/lib/money/format";
import type {
  PettyCashEntryKind,
  PettyCashEntryStatus,
} from "@/features/petty-cash/petty-cash.types";

type RegisterEntry = {
  createdAt: string;
  entryKind: PettyCashEntryKind;
  id: string;
  inAmount: number;
  invoiceDate: string;
  outAmount: number;
  receiptReference?: string | null;
  status: PettyCashEntryStatus;
};

type RegisterPeriod = {
  advanceAmount: number;
  openingBalanceAmount: number;
};

export function calculatePettyCashRegister<TEntry extends RegisterEntry>({
  currency,
  entries,
  period,
}: {
  currency: CurrencyCode;
  entries: TEntry[];
  period: RegisterPeriod | null;
}) {
  const orderedEntries = entries.toSorted(compareRegisterEntries);
  const hasLiveAdvance = orderedEntries.some(
    (entry) => entry.entryKind === "advance" && entry.status !== "void",
  );
  const effectiveOpeningAmount =
    (period?.openingBalanceAmount ?? 0) +
    (hasLiveAdvance ? 0 : (period?.advanceAmount ?? 0));
  let runningBalance = effectiveOpeningAmount;
  let cashInAmount = 0;
  let cashOutAmount = 0;

  const entriesWithBalances = orderedEntries.map((entry) => {
    const effectiveInAmount = entry.status === "void" ? 0 : entry.inAmount;
    const effectiveOutAmount = entry.status === "void" ? 0 : entry.outAmount;
    cashInAmount += effectiveInAmount;
    cashOutAmount += effectiveOutAmount;
    runningBalance += effectiveInAmount - effectiveOutAmount;

    return {
      ...entry,
      balanceAfter: runningBalance,
      effectiveInAmount,
      effectiveOutAmount,
    };
  });

  return {
    cashInAmount,
    cashOutAmount,
    closingBalanceAmount: runningBalance,
    currency,
    effectiveOpeningAmount,
    entries: entriesWithBalances,
    postedCount: orderedEntries.filter((entry) => entry.status === "posted").length,
    readyToPostCount: orderedEntries.filter(
      (entry) =>
        entry.entryKind === "expense" &&
        (entry.status === "draft" || entry.status === "cleared"),
    ).length,
    receiptMissingCount: orderedEntries.filter(
      (entry) =>
        entry.entryKind === "expense" &&
        entry.status !== "void" &&
        !entry.receiptReference,
    ).length,
    voidCount: orderedEntries.filter((entry) => entry.status === "void").length,
  };
}

function compareRegisterEntries(first: RegisterEntry, second: RegisterEntry) {
  return (
    first.invoiceDate.localeCompare(second.invoiceDate) ||
    first.createdAt.localeCompare(second.createdAt) ||
    first.id.localeCompare(second.id)
  );
}

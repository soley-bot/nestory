import { createSupabaseServerClient } from "@/lib/db/server";
import { formatMoneyDisplay } from "@/lib/money/format";
import type { CurrencyCode } from "@/lib/money/format";
import type {
  PettyCashAccount,
  PettyCashEntry,
  PettyCashEntryKind,
  PettyCashEntryStatus,
  PettyCashPeriod,
  PettyCashPropertyOption,
  PettyCashSchemaStatus,
  PettyCashSummary,
  PettyCashUnitOption,
} from "@/features/petty-cash/petty-cash.types";

type PropertyRow = {
  code: string;
  id: string;
  name: string;
};

type UnitRow = {
  id: string;
  property_id: string;
  unit_number: string;
};

type PettyCashEntryRow = {
  category: string;
  clear_date: string | null;
  created_at: string;
  currency: CurrencyCode;
  description: string;
  entry_kind: string;
  id: string;
  in_amount: number;
  invoice_date: string;
  ledger_entry_id: string | null;
  out_amount: number;
  property_id: string | null;
  receipt_reference: string | null;
  remark: string | null;
  status: string;
  supplier: string | null;
  unit_id: string | null;
};

export async function getPettyCashScreenData(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const [accountsResult, propertiesResult, unitsResult] = await Promise.all([
    supabase
      .from("petty_cash_accounts")
      .select("id, account_number, name, currency, float_amount, status")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("properties")
      .select("id, code, name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("units")
      .select("id, property_id, unit_number")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("unit_number", { ascending: true }),
  ]);

  if (accountsResult.error) {
    if (isMissingPettyCashSchema(accountsResult.error.message)) {
      return buildUnavailableScreenData();
    }

    throw new Error(
      `Could not load petty cash accounts: ${accountsResult.error.message}`,
    );
  }

  if (propertiesResult.error) {
    throw new Error(
      `Could not load petty cash properties: ${propertiesResult.error.message}`,
    );
  }

  if (unitsResult.error) {
    throw new Error(
      `Could not load petty cash units: ${unitsResult.error.message}`,
    );
  }

  const accounts = (accountsResult.data ?? []).map(
    (account): PettyCashAccount => ({
      accountNumber: account.account_number,
      currency: account.currency,
      floatAmount: account.float_amount,
      id: account.id,
      name: account.name,
      status: account.status,
    }),
  );
  const selectedAccount = accounts[0];
  const properties = propertiesResult.data ?? [];
  const units = unitsResult.data ?? [];
  const propertiesById = indexById(properties);
  const unitsById = indexById(units);
  const selectedPeriod = selectedAccount
    ? await getSelectedPeriod(organizationId, selectedAccount.id)
    : null;
  const entries = selectedPeriod
    ? await getPeriodEntries({
        organizationId,
        period: selectedPeriod,
        propertiesById,
        unitsById,
      })
    : [];

  return {
    accounts,
    entries,
    period: selectedPeriod,
    propertyOptions: properties.map((property): PettyCashPropertyOption => ({
      id: property.id,
      label: `${property.code} - ${property.name}`,
    })),
    selectedAccount,
    summary: buildSummary(selectedPeriod, entries),
    unitOptions: units.map((unit): PettyCashUnitOption => {
      const property = propertiesById.get(unit.property_id);

      return {
        id: unit.id,
        label: `${property?.code ?? "Unknown"} / Unit ${unit.unit_number}`,
        propertyId: unit.property_id,
      };
    }),
    schemaStatus: { isReady: true } satisfies PettyCashSchemaStatus,
  };
}

async function getSelectedPeriod(organizationId: string, accountId: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("petty_cash_periods")
    .select(
      "id, period_start, opening_balance_amount, advance_amount, counted_cash_amount, status",
    )
    .eq("organization_id", organizationId)
    .eq("account_id", accountId)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    if (isMissingPettyCashSchema(result.error.message)) {
      return null;
    }

    throw new Error(
      `Could not load petty cash period: ${result.error.message}`,
    );
  }

  if (!result.data) {
    return null;
  }

  return {
    advanceAmount: result.data.advance_amount,
    countedCashAmount: result.data.counted_cash_amount ?? undefined,
    id: result.data.id,
    openingBalanceAmount: result.data.opening_balance_amount,
    periodStart: result.data.period_start,
    status: result.data.status,
  } satisfies PettyCashPeriod;
}

async function getPeriodEntries({
  organizationId,
  period,
  propertiesById,
  unitsById,
}: {
  organizationId: string;
  period: PettyCashPeriod;
  propertiesById: Map<string, PropertyRow>;
  unitsById: Map<string, UnitRow>;
}) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("petty_cash_entries")
    .select(
      "id, property_id, unit_id, ledger_entry_id, invoice_date, clear_date, entry_kind, status, category, supplier, description, receipt_reference, out_amount, in_amount, currency, remark, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("period_id", period.id)
    .is("archived_at", null)
    .order("invoice_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (result.error) {
    if (isMissingPettyCashSchema(result.error.message)) {
      return [];
    }

    throw new Error(
      `Could not load petty cash entries: ${result.error.message}`,
    );
  }

  const rows = (result.data ?? []) as PettyCashEntryRow[];
  const hasAdvanceRows = rows.some((entry) => entry.entry_kind === "advance");
  let balance =
    period.openingBalanceAmount + (hasAdvanceRows ? 0 : period.advanceAmount);

  return rows.map((entry) => {
    balance += entry.in_amount - entry.out_amount;
    const property = entry.property_id
      ? propertiesById.get(entry.property_id)
      : undefined;
    const unit = entry.unit_id ? unitsById.get(entry.unit_id) : undefined;

    return {
      balanceAfter: balance,
      category: entry.category,
      clearDate: entry.clear_date ?? undefined,
      createdAt: entry.created_at,
      currency: entry.currency,
      description: entry.description,
      entryKind: normalizeEntryKind(entry.entry_kind),
      id: entry.id,
      inAmount: entry.in_amount,
      invoiceDate: entry.invoice_date,
      ledgerEntryId: entry.ledger_entry_id ?? undefined,
      outAmount: entry.out_amount,
      propertyCode: property?.code,
      propertyId: entry.property_id ?? undefined,
      propertyName: property?.name,
      receiptReference: entry.receipt_reference ?? undefined,
      remark: entry.remark ?? undefined,
      status: normalizeStatus(entry.status),
      supplier: entry.supplier ?? undefined,
      unitId: entry.unit_id ?? undefined,
      unitNumber: unit?.unit_number,
    };
  });
}

function buildSummary(
  period: PettyCashPeriod | null,
  entries: PettyCashEntry[],
): PettyCashSummary {
  const hasAdvanceRows = entries.some((entry) => entry.entryKind === "advance");
  const startingAdvance = hasAdvanceRows ? 0 : (period?.advanceAmount ?? 0);
  const cashIn =
    startingAdvance + entries.reduce((total, entry) => total + entry.inAmount, 0);
  const cashOut = entries.reduce((total, entry) => total + entry.outAmount, 0);
  const balance = (period?.openingBalanceAmount ?? 0) + cashIn - cashOut;

  return {
    balance: formatMoneyDisplay(balance, "USD"),
    cashIn: formatMoneyDisplay(cashIn, "USD"),
    cashOut: formatMoneyDisplay(cashOut, "USD"),
    postedCount: entries.filter((entry) => entry.status === "posted").length.toString(),
    readyToPostCount: entries
      .filter(
        (entry) =>
          entry.entryKind === "expense" &&
          entry.status !== "posted" &&
          entry.status !== "void",
      )
      .length.toString(),
    receiptMissingCount: entries
      .filter(
        (entry) =>
          entry.entryKind === "expense" &&
          entry.status !== "void" &&
          !entry.receiptReference,
      )
      .length.toString(),
  };
}

function buildUnavailableScreenData() {
  return {
    accounts: [],
    entries: [],
    period: null,
    propertyOptions: [],
    schemaStatus: {
      isReady: false,
      message:
        "Petty cash is not available yet because the database migration has not been applied in this environment.",
    } satisfies PettyCashSchemaStatus,
    selectedAccount: undefined,
    summary: buildSummary(null, []),
    unitOptions: [],
  };
}

function isMissingPettyCashSchema(message: string) {
  return (
    message.includes("petty_cash_") &&
    (message.includes("schema cache") ||
      message.includes("Could not find the table") ||
      message.includes("does not exist"))
  );
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function normalizeEntryKind(value: string): PettyCashEntryKind {
  if (value === "advance" || value === "cash_in") {
    return value;
  }

  return "expense";
}

function normalizeStatus(value: string): PettyCashEntryStatus {
  if (value === "cleared" || value === "posted" || value === "void") {
    return value;
  }

  return "draft";
}

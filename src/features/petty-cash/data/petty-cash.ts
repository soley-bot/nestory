import { createSupabaseServerClient } from "@/lib/db/server";
import {
  formatPropertyOptionLabel,
  formatUnitOptionLabel,
} from "@/lib/entity-option-labels";
import { formatMoneyDisplay } from "@/lib/money/format";
import type { CurrencyCode } from "@/lib/money/format";
import { getPersonSelectOptions } from "@/features/people/data/person-options";
import { calculatePettyCashRegister } from "@/features/petty-cash/register-facts";
import type {
  PettyCashAccount,
  PettyCashEconomicScope,
  PettyCashEntry,
  PettyCashEntryKind,
  PettyCashEntryStatus,
  PettyCashOwnerBillStatus,
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
  company_loss_amount: number;
  counterparty_person_id: string | null;
  created_at: string;
  currency: CurrencyCode;
  description: string;
  economic_scope: string;
  entry_kind: string;
  id: string;
  in_amount: number;
  invoice_date: string;
  ledger_entry_id: string | null;
  out_amount: number;
  owner_bill_status: string;
  owner_reimbursable_amount: number;
  owner_reimbursed_amount: number;
  property_id: string | null;
  receipt_reference: string | null;
  remark: string | null;
  status: string;
  supplier: string | null;
  unit_id: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
};

export async function getPettyCashScreenData(
  organizationId: string,
  selectedAccountId?: string,
) {
  const supabase = await createSupabaseServerClient();
  const [
    accountsResult,
    propertiesResult,
    unitsResult,
    counterpartyOptions,
    staffOptions,
  ] = await Promise.all([
    supabase
      .from("petty_cash_accounts")
      .select(
        "id, account_number, name, currency, float_amount, status, custodian_person_id",
      )
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
    getPersonSelectOptions({
      organizationId,
      roles: ["tenant", "owner", "vendor", "staff"],
    }),
    getPersonSelectOptions({
      organizationId,
      roles: ["staff"],
    }),
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

  const custodianIds = [
    ...new Set(
      (accountsResult.data ?? [])
        .map((account) => account.custodian_person_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const custodianNames = await getPeopleNames({
    organizationId,
    personIds: custodianIds,
  });
  const accounts = (accountsResult.data ?? []).map(
    (account): PettyCashAccount => ({
      accountNumber: account.account_number,
      currency: account.currency,
      custodianName: account.custodian_person_id
        ? custodianNames.get(account.custodian_person_id)
        : undefined,
      custodianPersonId: account.custodian_person_id ?? undefined,
      floatAmount: account.float_amount,
      id: account.id,
      name: account.name,
      status: account.status,
    }),
  );
  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ??
    accounts.find((account) => account.status === "active") ??
    accounts[0];
  const properties = propertiesResult.data ?? [];
  const units = unitsResult.data ?? [];
  const propertiesById = indexById(properties);
  const unitsById = indexById(units);
  const selectedPeriod = selectedAccount
    ? await getSelectedPeriod(organizationId, selectedAccount.id)
    : null;
  const entries = selectedPeriod
      ? await getPeriodEntries({
        currency: selectedAccount.currency,
        organizationId,
        period: selectedPeriod,
        propertiesById,
        unitsById,
      })
    : [];

  return {
    accounts,
    counterpartyOptions,
    entries,
    period: selectedPeriod,
    propertyOptions: properties.map((property): PettyCashPropertyOption => ({
      id: property.id,
      label: formatPropertyOptionLabel(property),
    })),
    selectedAccount,
    staffOptions,
    summary: buildSummary(selectedPeriod, entries, selectedAccount?.currency),
    unitOptions: units.map((unit): PettyCashUnitOption => {
      const property = propertiesById.get(unit.property_id);

      return {
        id: unit.id,
        label: formatUnitOptionLabel({
          propertyCode: property?.code,
          unitNumber: unit.unit_number,
        }),
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
  currency,
  organizationId,
  period,
  propertiesById,
  unitsById,
}: {
  currency: CurrencyCode;
  organizationId: string;
  period: PettyCashPeriod;
  propertiesById: Map<string, PropertyRow>;
  unitsById: Map<string, UnitRow>;
}) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("petty_cash_entries")
    .select(
      "id, property_id, unit_id, counterparty_person_id, ledger_entry_id, invoice_date, clear_date, entry_kind, status, category, supplier, description, receipt_reference, out_amount, in_amount, currency, economic_scope, owner_bill_status, owner_reimbursable_amount, owner_reimbursed_amount, company_loss_amount, remark, created_at, voided_at, voided_by, void_reason",
    )
    .eq("organization_id", organizationId)
    .eq("period_id", period.id)
    .is("archived_at", null)
    .order("invoice_date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (result.error) {
    if (isMissingPettyCashSchema(result.error.message)) {
      return [];
    }

    throw new Error(
      `Could not load petty cash entries: ${result.error.message}`,
    );
  }

  const rows = (result.data ?? []) as PettyCashEntryRow[];
  const counterpartyNames = await getPeopleNames({
    organizationId,
    personIds: [
      ...new Set(
        rows
          .map((entry) => entry.counterparty_person_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ],
  });
  const mappedEntries = rows.map((entry) => {
    const property = entry.property_id
      ? propertiesById.get(entry.property_id)
      : undefined;
    const unit = entry.unit_id ? unitsById.get(entry.unit_id) : undefined;
    const ownerReceivableAmount =
      entry.economic_scope === "company_advance"
        ? Math.max(
            0,
            Number(entry.owner_reimbursable_amount) -
              Number(entry.owner_reimbursed_amount),
          )
        : 0;

    return {
      balanceAfter: 0,
      category: entry.category,
      clearDate: entry.clear_date ?? undefined,
      companyLossAmount: Number(entry.company_loss_amount),
      counterpartyCurrentName: entry.counterparty_person_id
        ? counterpartyNames.get(entry.counterparty_person_id)
        : undefined,
      counterpartyPersonId: entry.counterparty_person_id ?? undefined,
      createdAt: entry.created_at,
      currency: entry.currency,
      description: entry.description,
      economicScope: normalizeEconomicScope(entry.economic_scope),
      economicScopeLabel: formatStoredLabel(entry.economic_scope),
      entryKind: normalizeEntryKind(entry.entry_kind),
      id: entry.id,
      inAmount: entry.in_amount,
      invoiceDate: entry.invoice_date,
      ledgerEntryId: entry.ledger_entry_id ?? undefined,
      outAmount: entry.out_amount,
      ownerBillStatus: normalizeOwnerBillStatus(entry.owner_bill_status),
      ownerBillStatusLabel: formatStoredLabel(entry.owner_bill_status),
      ownerReceivable: formatMoneyDisplay(ownerReceivableAmount, entry.currency),
      ownerReceivableAmount,
      ownerReimbursableAmount: Number(entry.owner_reimbursable_amount),
      ownerReimbursedAmount: Number(entry.owner_reimbursed_amount),
      propertyCode: property?.code,
      propertyId: entry.property_id ?? undefined,
      propertyName: property?.name,
      receiptReference: entry.receipt_reference ?? undefined,
      remark: entry.remark ?? undefined,
      status: normalizeStatus(entry.status),
      supplier: entry.supplier ?? undefined,
      unitId: entry.unit_id ?? undefined,
      unitNumber: unit?.unit_number,
      voidReason: entry.void_reason ?? undefined,
      voidedAt: entry.voided_at ?? undefined,
      voidedBy: entry.voided_by ?? undefined,
    };
  });

  return calculatePettyCashRegister({
    currency,
    entries: mappedEntries,
    period,
  }).entries;
}

export function buildSummary(
  period: PettyCashPeriod | null,
  entries: PettyCashEntry[],
  currency: CurrencyCode = entries[0]?.currency ?? "USD",
): PettyCashSummary {
  const register = calculatePettyCashRegister({ currency, entries, period });

  return {
    balance: formatMoneyDisplay(register.closingBalanceAmount, currency),
    cashIn: formatMoneyDisplay(register.cashInAmount, currency),
    cashOut: formatMoneyDisplay(register.cashOutAmount, currency),
    openingFloat: formatMoneyDisplay(register.effectiveOpeningAmount, currency),
    postedCount: register.postedCount.toString(),
    readyToPostCount: register.readyToPostCount.toString(),
    receiptMissingCount: register.receiptMissingCount.toString(),
    voidCount: register.voidCount.toString(),
  };
}

function buildUnavailableScreenData() {
  return {
    accounts: [],
    counterpartyOptions: [],
    entries: [],
    period: null,
    propertyOptions: [],
    schemaStatus: {
      isReady: false,
      message:
        "Petty cash is not available yet because the database migration has not been applied in this environment.",
    } satisfies PettyCashSchemaStatus,
    selectedAccount: undefined,
    staffOptions: [],
    summary: buildSummary(null, []),
    unitOptions: [],
  };
}

async function getPeopleNames({
  organizationId,
  personIds,
}: {
  organizationId: string;
  personIds: string[];
}) {
  if (personIds.length === 0) {
    return new Map<string, string>();
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("people")
    .select("id, display_name")
    .eq("organization_id", organizationId)
    .in("id", personIds);

  if (result.error) {
    throw new Error(
      `Could not load petty cash people context: ${result.error.message}`,
    );
  }

  return new Map(
    (result.data ?? []).map((person) => [person.id, person.display_name]),
  );
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

function normalizeEconomicScope(value: string): PettyCashEconomicScope {
  if (value === "company_advance" || value === "company_cost") {
    return value;
  }

  return "property_expense";
}

function normalizeOwnerBillStatus(value: string): PettyCashOwnerBillStatus {
  if (
    value === "billable" ||
    value === "billed" ||
    value === "partially_reimbursed" ||
    value === "reimbursed" ||
    value === "written_off"
  ) {
    return value;
  }

  return "not_billable";
}

function formatStoredLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

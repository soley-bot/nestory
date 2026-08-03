import { createSupabaseServerClient } from "@/lib/db/server";
import {
  formatPropertyOptionLabel,
  formatUnitOptionLabel,
} from "@/lib/entity-option-labels";
import type { Database } from "@/types/database";
import type {
  FinanceExpenseSummary,
  FinanceLease,
  FinanceOperationsData,
  FinanceOption,
  LeaseBillingSummary,
  OwnerInvoiceSummary,
  PropertyAccountEntry,
  PropertyFinancePosition,
  TenantInvoiceLine,
  TenantInvoiceSummary,
} from "@/features/finance-operations/finance-operations.types";

type TenantInvoiceBalanceRow =
  Database["public"]["Views"]["tenant_invoice_balances"]["Row"];
type OwnerInvoiceBalanceRow =
  Database["public"]["Views"]["owner_invoice_balances"]["Row"];
type PositionRow =
  Database["public"]["Views"]["property_finance_positions"]["Row"];
type AccountEntryRow =
  Database["public"]["Views"]["property_account_entries"]["Row"];

export async function getFinanceOperationsData(
  organizationId: string,
  propertyId?: string | null,
): Promise<FinanceOperationsData> {
  const supabase = await createSupabaseServerClient();
  const [
    propertiesResult,
    unitsResult,
    peopleResult,
    ownersResult,
    leasesResult,
    billingResult,
    tenantInvoicesResult,
    tenantLinesResult,
    incomeResult,
    ownerInvoicesResult,
    responsibilitiesResult,
    expensesResult,
    positionsResult,
    entriesResult,
    sourcesResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, code, name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("code"),
    supabase
      .from("units")
      .select("id, property_id, unit_number")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("unit_number"),
    supabase
      .from("people")
      .select("id, display_name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("display_name"),
    supabase
      .from("property_owners")
      .select("property_id, person_id")
      .eq("organization_id", organizationId)
      .eq("is_primary", true)
      .is("ended_on", null)
      .is("archived_at", null),
    supabase
      .from("leases")
      .select(
        "id, property_id, unit_id, primary_tenant_person_id, tenant_name, status, lease_start_date, lease_end_date, monthly_rent_amount",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .in("status", ["active", "notice_given"])
      .order("lease_start_date", { ascending: false }),
    supabase
      .from("lease_billing_terms")
      .select("*")
      .eq("organization_id", organizationId)
      .is("superseded_at", null),
    supabase
      .from("tenant_invoice_balances")
      .select("*")
      .eq("organization_id", organizationId)
      .order("due_date", { ascending: false })
      .limit(250),
    supabase
      .from("tenant_invoice_lines")
      .select(
        "id, invoice_id, income_item_id, line_type, customer_label, amount, sort_order",
      )
      .eq("organization_id", organizationId)
      .order("sort_order"),
    supabase
      .from("finance_income_items")
      .select("id, amount_due, amount_received")
      .eq("organization_id", organizationId),
    supabase
      .from("owner_invoice_balances")
      .select("*")
      .eq("organization_id", organizationId)
      .order("due_date", { ascending: false })
      .limit(250),
    supabase
      .from("ips_expense_responsibilities")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase
      .from("finance_expense_items")
      .select("id, unit_id, invoice_date, vendor_label")
      .eq("organization_id", organizationId),
    supabase
      .from("property_finance_positions")
      .select("*")
      .eq("organization_id", organizationId)
      .order("property_code"),
    buildAccountEntryQuery(supabase, organizationId, propertyId),
    supabase
      .from("financial_reconciliation_sources")
      .select("id, property_id, code, display_name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("code"),
  ]);

  const results = [
    propertiesResult,
    unitsResult,
    peopleResult,
    ownersResult,
    leasesResult,
    billingResult,
    tenantInvoicesResult,
    tenantLinesResult,
    incomeResult,
    ownerInvoicesResult,
    responsibilitiesResult,
    expensesResult,
    positionsResult,
    entriesResult,
    sourcesResult,
  ];
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new Error(
      `Could not load finance operations: ${failed.error.message}`,
    );
  }

  const properties = propertiesResult.data ?? [];
  const units = unitsResult.data ?? [];
  const people = peopleResult.data ?? [];
  const owners = ownersResult.data ?? [];
  const propertyById = new Map(
    properties.map((property) => [property.id, property]),
  );
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const personById = new Map(
    people.map((person) => [person.id, person.display_name]),
  );
  const ownerByPropertyId = new Map(
    owners.map((owner) => [owner.property_id, owner.person_id]),
  );
  const billingByLeaseId = new Map(
    (billingResult.data ?? []).map((billing) => [
      billing.lease_id,
      toBilling(billing),
    ]),
  );
  const incomeById = new Map(
    (incomeResult.data ?? []).map((income) => [income.id, income]),
  );
  const linesByInvoiceId = new Map<string, TenantInvoiceLine[]>();

  for (const line of tenantLinesResult.data ?? []) {
    const income = incomeById.get(line.income_item_id);
    const invoiceLines = linesByInvoiceId.get(line.invoice_id) ?? [];
    invoiceLines.push({
      amount: Number(line.amount),
      balanceDue: Math.max(
        Number(income?.amount_due ?? line.amount) -
          Number(income?.amount_received ?? 0),
        0,
      ),
      id: line.id,
      label: line.customer_label,
      lineType: line.line_type,
    });
    linesByInvoiceId.set(line.invoice_id, invoiceLines);
  }

  const expenseById = new Map(
    (expensesResult.data ?? []).map((expense) => [expense.id, expense]),
  );

  return {
    accountEntries: (entriesResult.data ?? []).flatMap((row) =>
      toAccountEntry(row as AccountEntryRow),
    ),
    expenses: (responsibilitiesResult.data ?? []).flatMap((responsibility) => {
      const expense = expenseById.get(responsibility.finance_expense_item_id);
      const property = propertyById.get(responsibility.property_id);
      if (!expense || !property) return [];
      const unit = expense.unit_id ? unitById.get(expense.unit_id) : null;
      return [
        {
          category: responsibility.customer_category,
          customerLabel: responsibility.customer_label,
          customerTotal: Number(responsibility.customer_total_amount),
          date: expense.invoice_date,
          heldCashAmount: Number(responsibility.held_cash_amount),
          id: responsibility.id,
          internalCost: Number(responsibility.internal_cost_amount),
          internalMarkup: Number(responsibility.internal_markup_amount),
          ipsAdvanceAmount: Number(responsibility.ips_advance_amount),
          propertyId: property.id,
          propertyLabel: propertyLabel(property),
          responsibility: responsibility.responsibility as "owner" | "tenant",
          responsibleLabel:
            personById.get(responsibility.responsible_person_id) ?? "Unknown",
          unitId: expense.unit_id,
          unitLabel: unit ? unitLabel(unit, property) : "All units",
          vendorLabel: expense.vendor_label,
        } satisfies FinanceExpenseSummary,
      ];
    }),
    leases: (leasesResult.data ?? []).flatMap((lease) => {
      const property = propertyById.get(lease.property_id);
      if (!property) return [];
      const unit = lease.unit_id ? unitById.get(lease.unit_id) : null;
      const ownerPersonId = ownerByPropertyId.get(lease.property_id) ?? null;
      return [
        {
          billing: billingByLeaseId.get(lease.id) ?? null,
          endDate: lease.lease_end_date,
          id: lease.id,
          monthlyRent: Number(lease.monthly_rent_amount),
          ownerLabel: ownerPersonId
            ? (personById.get(ownerPersonId) ?? "Unknown owner")
            : "Owner needed",
          ownerPersonId,
          propertyId: lease.property_id,
          propertyLabel: propertyLabel(property),
          startDate: lease.lease_start_date,
          status: lease.status,
          tenantLabel: lease.tenant_name,
          tenantPersonId: lease.primary_tenant_person_id,
          unitId: lease.unit_id,
          unitLabel: unit ? unitLabel(unit, property) : "No unit",
        } satisfies FinanceLease,
      ];
    }),
    ownerInvoices: (ownerInvoicesResult.data ?? []).flatMap((row) =>
      toOwnerInvoice(row as OwnerInvoiceBalanceRow, propertyById, personById),
    ),
    peopleOptions: people.map((person) => ({
      id: person.id,
      label: person.display_name,
    })),
    positions: (positionsResult.data ?? []).flatMap((row) =>
      toPosition(row as PositionRow, personById),
    ),
    propertyOptions: properties.map((property) => ({
      id: property.id,
      label: propertyLabel(property),
    })),
    reconciliationSources: (sourcesResult.data ?? []).map((source) => ({
      id: source.id,
      label: `${source.code} · ${source.display_name}`,
      propertyId: source.property_id,
    })),
    tenantInvoices: (tenantInvoicesResult.data ?? []).flatMap((row) =>
      toTenantInvoice(
        row as TenantInvoiceBalanceRow,
        propertyById,
        unitById,
        linesByInvoiceId,
      ),
    ),
    unitOptions: units.flatMap((unit) => {
      const property = propertyById.get(unit.property_id);
      if (!property) return [];
      return [
        {
          id: unit.id,
          label: unitLabel(unit, property),
          propertyId: unit.property_id,
        } satisfies FinanceOption,
      ];
    }),
  };
}

function buildAccountEntryQuery(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  propertyId?: string | null,
) {
  let query = supabase
    .from("property_account_entries")
    .select("*")
    .eq("organization_id", organizationId);
  if (propertyId) query = query.eq("property_id", propertyId);
  return query.order("event_date", { ascending: false }).limit(300);
}

function toBilling(
  row: Database["public"]["Tables"]["lease_billing_terms"]["Row"],
): LeaseBillingSummary {
  return {
    billingRecipientKind: row.billing_recipient_kind as
      "company" | "individual",
    billingRecipientPersonId: row.billing_recipient_person_id,
    chargeManagementFeeWhenActive: row.charge_management_fee_when_active,
    collectionRoute: row.collection_route as "direct_to_owner" | "through_ips",
    effectiveFrom: row.effective_from,
    finalPeriodProratedAmount:
      row.final_period_prorated_amount === null
        ? null
        : Number(row.final_period_prorated_amount),
    firstPeriodProratedAmount:
      row.first_period_prorated_amount === null
        ? null
        : Number(row.first_period_prorated_amount),
    fullManagementFeeDuringProration: row.full_management_fee_during_proration,
    id: row.id,
    managementFeeMode: row.management_fee_mode as "flat" | "percentage",
    managementFeeValue: Number(row.management_fee_value),
  };
}

function toTenantInvoice(
  row: TenantInvoiceBalanceRow,
  properties: Map<string, { code: string; id: string; name: string }>,
  units: Map<string, { id: string; property_id: string; unit_number: string }>,
  linesByInvoiceId: Map<string, TenantInvoiceLine[]>,
): TenantInvoiceSummary[] {
  if (
    !row.id ||
    !row.property_id ||
    !row.lease_id ||
    !row.invoice_number ||
    !row.issue_date ||
    !row.due_date
  )
    return [];
  const property = properties.get(row.property_id);
  if (!property) return [];
  const unit = row.unit_id ? units.get(row.unit_id) : null;
  return [
    {
      balanceDue: Number(row.balance_due ?? 0),
      collectedByOwner: Number(row.collected_by_owner ?? 0),
      collectionRoute: row.collection_route as
        "direct_to_owner" | "through_ips",
      dueDate: row.due_date,
      id: row.id,
      invoiceNumber: row.invoice_number,
      issueDate: row.issue_date,
      leaseId: row.lease_id,
      lines: linesByInvoiceId.get(row.id) ?? [],
      occupantLabels: row.occupant_labels ?? [],
      paidThroughIps: Number(row.paid_through_ips ?? 0),
      paymentStatus: (row.payment_status ??
        "unpaid") as TenantInvoiceSummary["paymentStatus"],
      propertyId: row.property_id,
      propertyLabel: propertyLabel(property),
      recipientLabel: row.recipient_label ?? "Unknown",
      totalAmount: Number(row.total_amount ?? 0),
      unitId: row.unit_id,
      unitLabel: unit ? unitLabel(unit, property) : "No unit",
    },
  ];
}

function toOwnerInvoice(
  row: OwnerInvoiceBalanceRow,
  properties: Map<string, { code: string; id: string; name: string }>,
  people: Map<string, string>,
): OwnerInvoiceSummary[] {
  if (
    !row.id ||
    !row.property_id ||
    !row.owner_person_id ||
    !row.invoice_number ||
    !row.due_date
  )
    return [];
  const property = properties.get(row.property_id);
  if (!property) return [];
  return [
    {
      balanceDue: Number(row.balance_due ?? 0),
      dueDate: row.due_date,
      id: row.id,
      invoiceNumber: row.invoice_number,
      ownerLabel: people.get(row.owner_person_id) ?? "Unknown owner",
      ownerPersonId: row.owner_person_id,
      paidByOwner: Number(row.paid_by_owner ?? 0),
      paidFromHeldCash: Number(row.paid_from_held_cash ?? 0),
      paymentStatus: (row.payment_status ??
        "unpaid") as OwnerInvoiceSummary["paymentStatus"],
      propertyId: row.property_id,
      propertyLabel: propertyLabel(property),
      totalAmount: Number(row.total_amount ?? 0),
    },
  ];
}

function toPosition(
  row: PositionRow,
  people: Map<string, string>,
): PropertyFinancePosition[] {
  if (!row.property_id || !row.property_code || !row.property_name) return [];
  return [
    {
      availableWithdrawal: Number(row.available_withdrawal ?? 0),
      cashHeldByIps: Number(row.cash_held_by_ips ?? 0),
      managementFeeExpense: Number(row.management_fee_expense ?? 0),
      ownerExpense: Number(row.owner_expense ?? 0),
      ownerLabel: row.owner_person_id
        ? (people.get(row.owner_person_id) ?? "Unknown owner")
        : "Owner needed",
      ownerOwesIps: Number(row.owner_owes_ips ?? 0),
      ownerPersonId: row.owner_person_id,
      propertyId: row.property_id,
      propertyLabel: propertyLabel({
        code: row.property_code,
        name: row.property_name,
      }),
      rentIncome: Number(row.rent_income ?? 0),
      runningBalance: Number(row.running_balance ?? 0),
      withdrawals: Number(row.withdrawals ?? 0),
    },
  ];
}

function toAccountEntry(row: AccountEntryRow): PropertyAccountEntry[] {
  if (
    !row.source_id ||
    !row.property_id ||
    !row.event_date ||
    !row.category ||
    !row.label
  )
    return [];
  return [
    {
      amount: Number(row.amount ?? 0),
      category: row.category,
      date: row.event_date,
      id: row.source_id,
      label: row.label,
      note: row.note,
      propertyId: row.property_id,
      runningBalance: Number(row.running_balance ?? 0),
    },
  ];
}

function propertyLabel(property: { code: string; name: string }) {
  return formatPropertyOptionLabel({
    code: property.code,
    name: property.name,
  });
}

function unitLabel(unit: { unit_number: string }, property: { code: string }) {
  return formatUnitOptionLabel({
    propertyCode: property.code,
    unitNumber: unit.unit_number,
  });
}

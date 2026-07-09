import { toRecentChange } from "@/features/activity/recent-changes";
import type {
  OverviewAttentionItem,
  OverviewCompanyFinanceProperty,
  OverviewLedgerPoint,
  OverviewMetric,
  OverviewOccupancyPoint,
  OverviewScreenData,
} from "@/features/overview/overview.types";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { CurrencyCode } from "@/lib/money/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import { formatMoneyTotalsDisplay } from "@/lib/money/totals";

const activeLeaseStatuses = ["active", "notice_given"] as const;
const openMaintenanceStatuses = [
  "pending",
  "scheduled",
  "in_progress",
  "blocked",
] as const;
const largeExpenseReviewThreshold = 1000;
const largeExpenseReviewHref = `/ledger?direction=expense&sort=amount_desc&period=last_30_days&minAmount=${largeExpenseReviewThreshold}`;
const companyIncomeTypes = new Set([
  "management_fee",
  "leasing_commission",
  "service_fee",
  "maintenance_markup",
]);
const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

type PropertyRow = {
  code: string;
  id: string;
  name: string;
};

type UnitRow = {
  id: string;
  property_id: string;
  status: string;
};

type LeaseRow = {
  lease_end_date: string;
  primary_tenant_person_id: string | null;
  unit_id: string | null;
};

type LedgerWindowRow = {
  amount: number;
  currency: CurrencyCode;
  direction: string;
  transaction_date: string;
};

type LedgerNetRow = {
  amount: number;
  currency: CurrencyCode;
  direction: string;
  property_id: string;
};

type CompanyIncomeRow = {
  amount_received: number;
  currency: CurrencyCode;
  due_date: string;
  income_type: string;
  property_id: string;
  status: string;
};

type CompanyExpenseRow = {
  amount: number;
  category: string;
  company_loss_amount: number;
  currency: CurrencyCode;
  economic_scope: string;
  id: string;
  invoice_date: string;
  owner_bill_status: string;
  owner_reimbursable_amount: number;
  owner_reimbursed_amount: number;
  property_id: string;
  source_type: "bill" | "petty_cash";
  vendor_label: string;
};

type PersonRow = {
  id: string;
  primary_email: string | null;
  primary_phone: string | null;
};

type PersonRoleRow = {
  person_id: string;
  role: "owner" | "tenant" | "vendor";
};

type PersonContactRow = {
  contact_name: string | null;
  email: string | null;
  person_id: string;
  phone: string | null;
};

type PropertyOwnerRow = {
  property_id: string;
};

export async function getOverviewScreenData(
  organizationId: string,
): Promise<OverviewScreenData> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const businessToday = getBusinessDateString(now);
  const currentMonthStart = startOfMonth(businessToday);
  const ledgerStart = addMonths(currentMonthStart, -5);
  const currentMonthEnd = addMonths(currentMonthStart, 1);
  const ledgerStartInput = toDateInput(ledgerStart);
  const currentMonthEndInput = toDateInput(currentMonthEnd);
  const recentExpenseStart = addDaysToDateString(businessToday, -30);

  const [
    propertiesResult,
    unitsResult,
    leasesResult,
    ledgerWindowResult,
    ledgerNetResult,
    peopleResult,
    rolesResult,
    contactsResult,
    propertyOwnersResult,
    companyIncomeResult,
    companyExpenseResult,
    pettyCashCompanyResult,
    openMaintenanceResult,
    recentActivityResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, code, name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("code", { ascending: true }),
    supabase
      .from("units")
      .select("id, property_id, status")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .neq("status", "inactive"),
    supabase
      .from("leases")
      .select("unit_id, lease_end_date, primary_tenant_person_id")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .in("status", [...activeLeaseStatuses]),
    supabase
      .from("ledger_entries")
      .select("transaction_date, direction, amount, currency")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .gte("transaction_date", ledgerStartInput)
      .lt("transaction_date", currentMonthEndInput),
    supabase
      .from("ledger_entries")
      .select("property_id, direction, amount, currency")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("people")
      .select("id, primary_email, primary_phone")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("person_roles")
      .select("person_id, role")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .is("archived_at", null),
    supabase
      .from("person_contacts")
      .select("person_id, contact_name, email, phone")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .or("contact_name.not.is.null,email.not.is.null,phone.not.is.null"),
    supabase
      .from("property_owners")
      .select("property_id")
      .eq("organization_id", organizationId)
      .eq("is_primary", true)
      .is("archived_at", null)
      .is("ended_on", null),
    supabase
      .from("finance_income_items")
      .select("property_id, due_date, income_type, amount_received, currency, status")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .gte("due_date", ledgerStartInput)
      .lt("due_date", currentMonthEndInput),
    supabase
      .from("finance_expense_items")
      .select(
        "id, property_id, invoice_date, vendor_label, category, amount, currency, economic_scope, owner_bill_status, owner_reimbursable_amount, owner_reimbursed_amount, company_loss_amount",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .gte("invoice_date", ledgerStartInput)
      .lt("invoice_date", currentMonthEndInput),
    supabase
      .from("petty_cash_entries")
      .select(
        "id, property_id, invoice_date, supplier, category, description, out_amount, currency, economic_scope, owner_bill_status, owner_reimbursable_amount, owner_reimbursed_amount, company_loss_amount",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .eq("entry_kind", "expense")
      .or("economic_scope.neq.property_expense,company_loss_amount.gt.0")
      .gte("invoice_date", ledgerStartInput)
      .lt("invoice_date", currentMonthEndInput),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .in("status", [...openMaintenanceStatuses]),
    supabase
      .from("activity_logs")
      .select(
        "id, entity_type, entity_id, action, previous_values, new_values, created_at",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  assertNoError(propertiesResult.error, "overview properties");
  assertNoError(unitsResult.error, "overview units");
  assertNoError(leasesResult.error, "overview leases");
  assertNoError(ledgerWindowResult.error, "overview ledger window");
  assertNoError(ledgerNetResult.error, "overview property ledger net");
  assertNoError(peopleResult.error, "overview people");
  assertNoError(rolesResult.error, "overview person roles");
  assertNoError(contactsResult.error, "overview person contacts");
  assertNoError(propertyOwnersResult.error, "overview property owners");
  assertNoError(companyIncomeResult.error, "overview company income");
  assertNoError(companyExpenseResult.error, "overview company expenses");
  assertNoError(pettyCashCompanyResult.error, "overview petty cash company expenses");
  assertNoError(openMaintenanceResult.error, "overview maintenance");
  assertNoError(recentActivityResult.error, "overview activity");

  const properties = (propertiesResult.data ?? []) as PropertyRow[];
  const operationalUnits = (unitsResult.data ?? []) as UnitRow[];
  const currentLeases = (leasesResult.data ?? []) as LeaseRow[];
  const ledgerRows = (ledgerWindowResult.data ?? []) as LedgerWindowRow[];
  const ledgerNetRows = (ledgerNetResult.data ?? []) as LedgerNetRow[];
  const activePeople = (peopleResult.data ?? []) as PersonRow[];
  const roles = (rolesResult.data ?? []) as PersonRoleRow[];
  const contacts = (contactsResult.data ?? []) as PersonContactRow[];
  const propertyOwners = (propertyOwnersResult.data ?? []) as PropertyOwnerRow[];
  const companyIncomeRows = (companyIncomeResult.data ?? []) as CompanyIncomeRow[];
  const companyExpenseRows = [
    ...((companyExpenseResult.data ?? []) as Array<
      Omit<CompanyExpenseRow, "source_type">
    >).map((row) => ({ ...row, source_type: "bill" as const })),
    ...((pettyCashCompanyResult.data ?? []) as Array<{
      category: string;
      company_loss_amount: number;
      currency: CurrencyCode;
      description: string;
      economic_scope: string;
      id: string;
      invoice_date: string;
      out_amount: number;
      owner_bill_status: string;
      owner_reimbursable_amount: number;
      owner_reimbursed_amount: number;
      property_id: string;
      supplier: string | null;
    }>).map((row) => ({
      amount: Number(row.out_amount),
      category: row.category,
      company_loss_amount: Number(row.company_loss_amount),
      currency: row.currency,
      economic_scope: row.economic_scope,
      id: row.id,
      invoice_date: row.invoice_date,
      owner_bill_status: row.owner_bill_status,
      owner_reimbursable_amount: Number(row.owner_reimbursable_amount),
      owner_reimbursed_amount: Number(row.owner_reimbursed_amount),
      property_id: row.property_id,
      source_type: "petty_cash" as const,
      vendor_label: row.supplier ?? row.description ?? "Petty cash",
    })),
  ];
  const openMaintenanceCount = openMaintenanceResult.count ?? 0;
  const activeProperties = properties;
  const currentLeasedUnitIds = new Set(
    currentLeases.flatMap((lease) => (lease.unit_id ? [lease.unit_id] : [])),
  );
  const occupiedUnits = operationalUnits.filter(
    (unit) =>
      currentLeasedUnitIds.has(unit.id) || unit.status.toLowerCase() === "occupied",
  );
  const leaseGapUnits = operationalUnits.filter(
    (unit) => !currentLeasedUnitIds.has(unit.id),
  );
  const vacantUnits = operationalUnits.filter(
    (unit) => unit.status.toLowerCase() === "vacant",
  );
  const nonVacantLeaseGapUnits = leaseGapUnits.filter(
    (unit) => unit.status.toLowerCase() !== "vacant",
  );
  const roleCounts = getRoleCounts(roles);
  const currentPropertyOwnerIds = new Set(
    propertyOwners.map((owner) => owner.property_id),
  );
  const missingOwnerLinks = activeProperties.filter(
    (property) => !currentPropertyOwnerIds.has(property.id),
  );
  const activeRolePersonIds = new Set(roles.map((role) => role.person_id));
  const usableContactPersonIds = getUsableContactPersonIds(contacts);
  const peopleMissingContacts = activePeople.filter((person) =>
    isMissingContact(person, usableContactPersonIds),
  );
  const peopleWithoutRoles = activePeople.filter(
    (person) => !activeRolePersonIds.has(person.id),
  );
  const leasesEndingSoon = getLeasesEndingSoon(currentLeases, businessToday);
  const missingTenantLeases = currentLeases.filter(
    (lease) => !lease.primary_tenant_person_id,
  );
  const largeRecentExpenses = getLargeRecentExpenses({
    ledgerRows,
    recentExpenseStart,
  });
  const negativeNetProperties = getNegativeNetProperties({
    ledgerRows: ledgerNetRows,
    properties: activeProperties,
  });
  const mtdLedgerRows = ledgerRows.filter(
    (entry) =>
      entry.transaction_date >= toDateInput(currentMonthStart) &&
      entry.transaction_date < currentMonthEndInput,
  );
  const occupancyRate =
    operationalUnits.length > 0
      ? `${Math.round((occupiedUnits.length / operationalUnits.length) * 100)}%`
      : "0%";
  const attentionItems = buildAttentionItems({
    largeRecentExpenses,
    leaseGapUnits: nonVacantLeaseGapUnits,
    leasesEndingSoon,
    missingTenantLeases,
    missingOwnerLinks,
    negativeNetProperties,
    openMaintenanceCount,
    peopleMissingContacts,
    peopleWithoutRoles,
    vacantUnits,
  });

  return {
    attentionItems,
    attentionTotal: attentionItems.reduce((total, item) => total + item.count, 0),
    dashboardSummary: buildDashboardSummary({
      attentionItems,
      largeRecentExpenses,
      leaseGapUnits: nonVacantLeaseGapUnits,
      leasesEndingSoon,
      missingTenantLeases,
      missingOwnerLinks,
      negativeNetProperties,
      peopleMissingContacts,
      peopleWithoutRoles,
      vacantUnits,
    }),
    companyFinance: buildCompanyFinanceSummary({
      companyExpenseRows,
      companyIncomeRows,
      monthStart: ledgerStart,
      properties: activeProperties,
    }),
    leaseEndings: buildLeaseEndingsChart(currentLeases, currentMonthStart),
    leaseRiskCount: leasesEndingSoon.length,
    ledgerCurrency: "USD",
    ledgerFlow: buildLedgerFlowChart({
      ledgerRows,
      monthStart: ledgerStart,
    }),
    metrics: buildMetrics({
      activeLeaseCount: currentLeases.length,
      attentionItems,
      mtdLedgerRows,
      occupancyRate,
      peopleCount: activePeople.length,
      roleCounts,
      leaseGapUnitCount: nonVacantLeaseGapUnits.length,
    }),
    occupancyByProperty: buildOccupancyByProperty({
      activeProperties,
      currentLeasedUnitIds,
      operationalUnits,
    }),
    quickActions: [
      { href: "/import", label: "Import data" },
      { href: "/properties?action=create", label: "Add property" },
      { href: "/units?action=create", label: "Add unit" },
      { href: "/leases?action=create", label: "Add lease" },
      { href: "/people?action=create", label: "Add person" },
      { href: "/timeline?action=create", label: "Add event" },
      { href: "/ledger?action=create", label: "Add ledger entry" },
    ],
    recentChanges: (recentActivityResult.data ?? []).map(toRecentChange),
    workspaceSetup: {
      activeLeaseCount: currentLeases.length,
      hasAnyOperatingData:
        activeProperties.length > 0 ||
        operationalUnits.length > 0 ||
        activePeople.length > 0 ||
        currentLeases.length > 0 ||
        ledgerNetRows.length > 0 ||
        openMaintenanceCount > 0,
      ledgerEntryCount: ledgerNetRows.length,
      peopleCount: activePeople.length,
      propertyCount: activeProperties.length,
      unitCount: operationalUnits.length,
    },
  };
}

function buildCompanyFinanceSummary({
  companyExpenseRows,
  companyIncomeRows,
  monthStart,
  properties,
}: {
  companyExpenseRows: CompanyExpenseRow[];
  companyIncomeRows: CompanyIncomeRow[];
  monthStart: Date;
  properties: PropertyRow[];
}) {
  const companyRevenueRows = companyIncomeRows.filter(
    (row) => companyIncomeTypes.has(row.income_type) && row.status !== "void",
  );
  const companyRevenueAmount = sumCompanyRevenue(companyRevenueRows);
  const companyCostAmount = sumCompanyCosts(companyExpenseRows);
  const ownerReceivableAmount = sumOwnerReceivables(companyExpenseRows);
  const companyNetAmount = companyRevenueAmount - companyCostAmount;
  const propertiesById = new Map(properties.map((property) => [property.id, property]));
  const propertyRows = buildCompanyFinanceProperties({
    companyExpenseRows,
    companyRevenueRows,
    propertiesById,
  });

  return {
    companyCost: formatMoneyDisplay(companyCostAmount),
    companyCostAmount,
    companyNet: formatMoneyDisplay(companyNetAmount),
    companyNetAmount,
    companyRevenue: formatMoneyDisplay(companyRevenueAmount),
    companyRevenueAmount,
    marginLabel: formatMargin(companyNetAmount, companyRevenueAmount),
    monthlyPnl: buildCompanyPnlTrend({
      companyExpenseRows,
      companyRevenueRows,
      monthStart,
    }),
    ownerReceivable: formatMoneyDisplay(ownerReceivableAmount),
    ownerReceivableAmount,
    ownerReceivables: buildOwnerReceivables({
      companyExpenseRows,
      propertiesById,
    }),
    properties: propertyRows,
  };
}

function buildCompanyFinanceProperties({
  companyExpenseRows,
  companyRevenueRows,
  propertiesById,
}: {
  companyExpenseRows: CompanyExpenseRow[];
  companyRevenueRows: CompanyIncomeRow[];
  propertiesById: Map<string, PropertyRow>;
}): OverviewCompanyFinanceProperty[] {
  const rowsByProperty = new Map<
    string,
    {
      companyCostAmount: number;
      companyRevenueAmount: number;
      ownerReceivableAmount: number;
    }
  >();

  for (const row of companyRevenueRows) {
    const summary = getPropertyCompanySummary(rowsByProperty, row.property_id);
    summary.companyRevenueAmount += Number(row.amount_received);
  }

  for (const row of companyExpenseRows) {
    const summary = getPropertyCompanySummary(rowsByProperty, row.property_id);
    summary.companyCostAmount += getCompanyCostAmount(row);
    summary.ownerReceivableAmount += getOwnerReceivableAmount(row);
  }

  return Array.from(rowsByProperty.entries())
    .map(([propertyId, summary]) => {
      const property = propertiesById.get(propertyId);
      const companyRevenueAmount = summary.companyRevenueAmount;
      const companyCostAmount = summary.companyCostAmount;
      const ownerReceivableAmount = summary.ownerReceivableAmount;
      const netContributionAmount = companyRevenueAmount - companyCostAmount;

      return {
        companyCost: formatMoneyDisplay(companyCostAmount),
        companyCostAmount,
        companyRevenue: formatMoneyDisplay(companyRevenueAmount),
        companyRevenueAmount,
        href: `/properties/${propertyId}`,
        label: property ? `${property.code} / ${property.name}` : "Unknown property",
        marginLabel: formatMargin(netContributionAmount, companyRevenueAmount),
        netContribution: formatMoneyDisplay(netContributionAmount),
        netContributionAmount,
        ownerReceivable: formatMoneyDisplay(ownerReceivableAmount),
        ownerReceivableAmount,
        tone: (netContributionAmount < 0
          ? "danger"
          : "success") as OverviewCompanyFinanceProperty["tone"],
      };
    })
    .filter(
      (row) =>
        row.companyRevenueAmount > 0 ||
        row.companyCostAmount > 0 ||
        row.ownerReceivableAmount > 0,
    )
    .toSorted(
      (first, second) =>
        second.netContributionAmount - first.netContributionAmount ||
        second.companyRevenueAmount - first.companyRevenueAmount ||
        first.label.localeCompare(second.label),
    )
    .slice(0, 12);
}

function buildCompanyPnlTrend({
  companyExpenseRows,
  companyRevenueRows,
  monthStart,
}: {
  companyExpenseRows: CompanyExpenseRow[];
  companyRevenueRows: CompanyIncomeRow[];
  monthStart: Date;
}): OverviewLedgerPoint[] {
  const months = Array.from({ length: 6 }, (_, index) => addMonths(monthStart, index));
  const points = new Map(
    months.map((month) => [
      getMonthKey(month),
      {
        expense: 0,
        href: `/overview?lens=finance&financeView=company-pnl`,
        income: 0,
        label: monthLabelFormatter.format(month),
        net: 0,
      },
    ]),
  );

  for (const row of companyRevenueRows) {
    const point = points.get(row.due_date.slice(0, 7));

    if (!point) {
      continue;
    }

    const amount = Number(row.amount_received);
    point.income += amount;
    point.net += amount;
  }

  for (const row of companyExpenseRows) {
    const point = points.get(row.invoice_date.slice(0, 7));

    if (!point) {
      continue;
    }

    const amount = getCompanyCostAmount(row);
    point.expense += amount;
    point.net -= amount;
  }

  return Array.from(points.values());
}

function buildOwnerReceivables({
  companyExpenseRows,
  propertiesById,
}: {
  companyExpenseRows: CompanyExpenseRow[];
  propertiesById: Map<string, PropertyRow>;
}) {
  return companyExpenseRows
    .map((row) => {
      const ownerReceivableAmount = getOwnerReceivableAmount(row);
      const property = propertiesById.get(row.property_id);

      return {
        amount: formatMoneyDisplay(row.amount, row.currency),
        amountValue: Number(row.amount),
        billStatus: formatOwnerBillStatus(row.owner_bill_status),
        href:
          row.source_type === "petty_cash"
            ? `/petty-cash?query=${encodeURIComponent(row.vendor_label)}`
            : `/bills-expenses?propertyId=${row.property_id}&query=${encodeURIComponent(row.vendor_label)}`,
        invoiceDate: row.invoice_date,
        label: row.category,
        ownerReceivable: formatMoneyDisplay(ownerReceivableAmount, row.currency),
        ownerReceivableAmount,
        propertyLabel: property
          ? `${property.code} / ${property.name}`
          : "Unknown property",
        reimbursed: formatMoneyDisplay(row.owner_reimbursed_amount, row.currency),
        vendorLabel: row.vendor_label,
      };
    })
    .filter((row) => row.ownerReceivableAmount > 0)
    .toSorted(
      (first, second) =>
        second.ownerReceivableAmount - first.ownerReceivableAmount ||
        first.invoiceDate.localeCompare(second.invoiceDate),
    )
    .slice(0, 12);
}

function getPropertyCompanySummary(
  rowsByProperty: Map<
    string,
    {
      companyCostAmount: number;
      companyRevenueAmount: number;
      ownerReceivableAmount: number;
    }
  >,
  propertyId: string,
) {
  const existing = rowsByProperty.get(propertyId);

  if (existing) {
    return existing;
  }

  const next = {
    companyCostAmount: 0,
    companyRevenueAmount: 0,
    ownerReceivableAmount: 0,
  };
  rowsByProperty.set(propertyId, next);
  return next;
}

function sumCompanyRevenue(rows: CompanyIncomeRow[]) {
  return rows.reduce((total, row) => total + Number(row.amount_received), 0);
}

function sumCompanyCosts(rows: CompanyExpenseRow[]) {
  return rows.reduce((total, row) => total + getCompanyCostAmount(row), 0);
}

function sumOwnerReceivables(rows: CompanyExpenseRow[]) {
  return rows.reduce((total, row) => total + getOwnerReceivableAmount(row), 0);
}

function getCompanyCostAmount(row: CompanyExpenseRow) {
  if (row.economic_scope === "company_cost") {
    return Number(row.company_loss_amount || row.amount);
  }

  if (row.owner_bill_status === "written_off") {
    return Number(row.company_loss_amount || getOwnerReceivableAmount(row));
  }

  return Number(row.company_loss_amount || 0);
}

function getOwnerReceivableAmount(row: CompanyExpenseRow) {
  if (row.economic_scope !== "company_advance") {
    return 0;
  }

  return Math.max(
    0,
    Number(row.owner_reimbursable_amount) - Number(row.owner_reimbursed_amount),
  );
}

function formatMargin(net: number, revenue: number) {
  if (revenue <= 0) {
    return net < 0 ? "Loss" : "No revenue";
  }

  return `${Math.round((net / revenue) * 100)}%`;
}

function formatOwnerBillStatus(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDashboardSummary({
  attentionItems,
  largeRecentExpenses,
  leaseGapUnits,
  leasesEndingSoon,
  missingTenantLeases,
  missingOwnerLinks,
  negativeNetProperties,
  peopleMissingContacts,
  peopleWithoutRoles,
  vacantUnits,
}: {
  attentionItems: OverviewAttentionItem[];
  largeRecentExpenses: LedgerWindowRow[];
  leaseGapUnits: UnitRow[];
  leasesEndingSoon: LeaseRow[];
  missingTenantLeases: LeaseRow[];
  missingOwnerLinks: PropertyRow[];
  negativeNetProperties: PropertyRow[];
  peopleMissingContacts: PersonRow[];
  peopleWithoutRoles: PersonRow[];
  vacantUnits: UnitRow[];
}) {
  const attentionTotal = attentionItems.reduce((total, item) => total + item.count, 0);

  if (peopleWithoutRoles.length > 0) {
    return {
      actionHref: "/people?status=no_role",
      actionLabel: "Review people",
      detail: `${peopleWithoutRoles.length} people need a tenant, owner, vendor, or staff role before workflow checks are reliable.`,
      headline: "People records need cleanup first.",
      tone: "danger" as const,
    };
  }

  if (vacantUnits.length > 0) {
    return {
      actionHref: "/units?status=vacant",
      actionLabel: "View vacant units",
      detail: "Review availability, attach new leases, or make the vacant-units report.",
      headline: `${vacantUnits.length} vacant units are available.`,
      tone: "warning" as const,
    };
  }

  if (leaseGapUnits.length > 0) {
    return {
      actionHref: "/units?leaseStatus=missing",
      actionLabel: "Review lease gaps",
      detail: "Some unit records have no current lease link.",
      headline: `${leaseGapUnits.length} units need lease record review.`,
      tone: "warning" as const,
    };
  }

  if (leasesEndingSoon.length > 0) {
    return {
      actionHref: "/leases?status=current&endsWithin=60d&sort=end_asc",
      actionLabel: "Review leases",
      detail: `${leasesEndingSoon.length} leases end in 60 days. Start renewal or move-out planning here.`,
      headline: "Lease renewals need attention.",
      tone: "warning" as const,
    };
  }

  if (missingTenantLeases.length > 0) {
    return {
      actionHref: "/leases?status=current&tenantStatus=missing",
      actionLabel: "Review tenant links",
      detail: `${missingTenantLeases.length} current leases are missing a linked People tenant.`,
      headline: "Lease tenant links need cleanup.",
      tone: "warning" as const,
    };
  }

  if (missingOwnerLinks.length > 0) {
    return {
      actionHref: "/properties?ownerStatus=missing",
      actionLabel: "Review missing owners",
      detail: `${missingOwnerLinks.length} properties are missing a current primary owner.`,
      headline: "Owner relationships need cleanup.",
      tone: "warning" as const,
    };
  }

  if (negativeNetProperties.length > 0) {
    return {
      actionHref: "/properties?netStatus=negative&sort=net_asc",
      actionLabel: "Review net income",
      detail: `${negativeNetProperties.length} properties have negative active ledger net income.`,
      headline: "Property net income needs review.",
      tone: "warning" as const,
    };
  }

  if (peopleMissingContacts.length > 0) {
    return {
      actionHref: "/people?status=missing_contact",
      actionLabel: "Review missing contacts",
      detail: `${peopleMissingContacts.length} people are missing usable contact information.`,
      headline: "Contact records need review.",
      tone: "warning" as const,
    };
  }

  if (largeRecentExpenses.length > 0) {
    return {
      actionHref: largeExpenseReviewHref,
      actionLabel: "Review expenses",
      detail: `${largeRecentExpenses.length} expenses in 30 days are above the review threshold.`,
      headline: "Recent expenses deserve a closer look.",
      tone: "warning" as const,
    };
  }

  return {
    actionHref: attentionTotal > 0 ? "#focus-now" : "/timeline",
    actionLabel: attentionTotal > 0 ? "Review records" : "Open timeline",
    detail:
      attentionTotal > 0
        ? `${attentionTotal} operating checks are open across the portfolio.`
        : "No high-priority operating checks are open from the current data.",
    headline:
      attentionTotal > 0
        ? "Portfolio needs a light operating review."
        : "Portfolio is clear from the current checks.",
    tone: attentionTotal > 0 ? ("warning" as const) : ("success" as const),
  };
}

function buildMetrics({
  activeLeaseCount,
  attentionItems,
  leaseGapUnitCount,
  mtdLedgerRows,
  occupancyRate,
  peopleCount,
  roleCounts,
}: {
  activeLeaseCount: number;
  attentionItems: OverviewAttentionItem[];
  leaseGapUnitCount: number;
  mtdLedgerRows: LedgerWindowRow[];
  occupancyRate: string;
  peopleCount: number;
  roleCounts: Map<PersonRoleRow["role"], number>;
}): OverviewMetric[] {
  const attentionTotal = attentionItems.reduce((total, item) => total + item.count, 0);

  return [
    {
      helper: "Occupied units",
      label: "Occupancy",
      tone: "success",
      value: occupancyRate,
    },
    {
      helper: "Current tenant agreements",
      label: "Active leases",
      tone: "neutral",
      value: String(activeLeaseCount),
    },
    {
      helper: "Units without active lease",
      label: "Lease gaps",
      tone: leaseGapUnitCount > 0 ? "warning" : "success",
      value: String(leaseGapUnitCount),
    },
    {
      helper: "Tenants, owners, vendors",
      label: "People",
      tone: "neutral",
      value: `${peopleCount} / ${roleCounts.get("tenant") ?? 0} tenants`,
    },
    {
      helper: "Current month",
      label: "Ledger net",
      tone: "neutral",
      value: formatMoneyTotalsDisplay(mtdLedgerRows),
    },
    {
      helper: "Open operating checks",
      label: "Attention",
      tone: attentionTotal > 0 ? "warning" : "success",
      value: String(attentionTotal),
    },
  ];
}

function buildAttentionItems({
  largeRecentExpenses,
  leaseGapUnits,
  leasesEndingSoon,
  missingTenantLeases,
  missingOwnerLinks,
  negativeNetProperties,
  openMaintenanceCount,
  peopleMissingContacts,
  peopleWithoutRoles,
  vacantUnits,
}: {
  largeRecentExpenses: LedgerWindowRow[];
  leaseGapUnits: UnitRow[];
  leasesEndingSoon: LeaseRow[];
  missingTenantLeases: LeaseRow[];
  missingOwnerLinks: PropertyRow[];
  negativeNetProperties: PropertyRow[];
  openMaintenanceCount: number;
  peopleMissingContacts: PersonRow[];
  peopleWithoutRoles: PersonRow[];
  vacantUnits: UnitRow[];
}): OverviewAttentionItem[] {
  return [
    leasesEndingSoon.length > 0
      ? {
          count: leasesEndingSoon.length,
          helper: "Next 60 days",
          href: "/leases?status=current&endsWithin=60d&sort=end_asc",
          label: "Leases ending in 60d",
          tone: "warning",
        }
      : null,
    openMaintenanceCount > 0
      ? {
          count: openMaintenanceCount,
          helper: "Open cases",
          href: "/maintenance?review=open",
          label: "Open maintenance",
          tone: "warning",
        }
      : null,
    vacantUnits.length > 0
      ? {
          count: vacantUnits.length,
          helper: "Marked vacant",
          href: "/units?status=vacant",
          label: "Vacant units",
          tone: "warning",
        }
      : null,
    leaseGapUnits.length > 0
      ? {
          count: leaseGapUnits.length,
          helper: "No active lease link",
          href: "/units?leaseStatus=missing",
          label: "Lease gaps",
          tone: "warning",
        }
      : null,
    missingTenantLeases.length > 0
      ? {
          count: missingTenantLeases.length,
          helper: "No People tenant link",
          href: "/leases?status=current&tenantStatus=missing",
          label: "Leases missing tenant link",
          tone: "warning",
        }
      : null,
    missingOwnerLinks.length > 0
      ? {
          count: missingOwnerLinks.length,
          helper: "Needs ownership relationship",
          href: "/properties?ownerStatus=missing",
          label: "Properties without owner link",
          tone: "warning",
        }
      : null,
    negativeNetProperties.length > 0
      ? {
          count: negativeNetProperties.length,
          helper: "Active ledger net is below zero",
          href: "/properties?netStatus=negative&sort=net_asc",
          label: "Properties with negative net",
          tone: "warning",
        }
      : null,
    peopleMissingContacts.length > 0
      ? {
          count: peopleMissingContacts.length,
          helper: "No primary contact value",
          href: "/people?status=missing_contact",
          label: "People missing contact",
          tone: "warning",
        }
      : null,
    peopleWithoutRoles.length > 0
      ? {
          count: peopleWithoutRoles.length,
          helper: "Needs tenant, owner, vendor, or staff role",
          href: "/people?status=no_role",
          label: "People without role",
          tone: "danger",
        }
      : null,
    largeRecentExpenses.length > 0
      ? {
          count: largeRecentExpenses.length,
          helper: "Last 30 days above review threshold",
          href: largeExpenseReviewHref,
          label: "Large expenses, 30d",
          tone: "warning",
        }
      : null,
  ].filter((item): item is OverviewAttentionItem => Boolean(item));
}

function buildOccupancyByProperty({
  activeProperties,
  currentLeasedUnitIds,
  operationalUnits,
}: {
  activeProperties: PropertyRow[];
  currentLeasedUnitIds: Set<string>;
  operationalUnits: UnitRow[];
}): OverviewOccupancyPoint[] {
  const unitsByProperty = groupBy(operationalUnits, (unit) => unit.property_id);

  return activeProperties
    .map((property) => {
      const propertyUnits = unitsByProperty.get(property.id) ?? [];
      const occupiedUnits = propertyUnits.filter(
        (unit) =>
          currentLeasedUnitIds.has(unit.id) ||
          unit.status.toLowerCase() === "occupied",
      ).length;
      const vacantUnits = propertyUnits.filter(
        (unit) => unit.status.toLowerCase() === "vacant",
      ).length;
      const unoccupiedUnits = propertyUnits.filter(
        (unit) =>
          !currentLeasedUnitIds.has(unit.id) &&
          unit.status.toLowerCase() !== "occupied" &&
          unit.status.toLowerCase() !== "inactive",
      ).length;

      return {
        href: `/units?occupancy=unoccupied&propertyId=${property.id}`,
        label: `${property.code} / ${property.name}`,
        occupiedUnits,
        percent:
          propertyUnits.length > 0
            ? Math.round((occupiedUnits / propertyUnits.length) * 100)
            : 0,
        totalUnits: propertyUnits.length,
        unoccupiedUnits,
        vacantUnits,
      };
    })
    .toSorted(
      (first, second) =>
        first.percent - second.percent ||
        second.totalUnits - first.totalUnits ||
        first.label.localeCompare(second.label),
    )
    .slice(0, 8);
}

function buildLedgerFlowChart({
  ledgerRows,
  monthStart,
}: {
  ledgerRows: LedgerWindowRow[];
  monthStart: Date;
}): OverviewLedgerPoint[] {
  const months = Array.from({ length: 6 }, (_, index) => addMonths(monthStart, index));
  const points = new Map(
    months.map((month) => [
      getMonthKey(month),
      {
        expense: 0,
        href: getLedgerMonthHref(month),
        income: 0,
        label: monthLabelFormatter.format(month),
        net: 0,
      },
    ]),
  );

  for (const row of ledgerRows) {
    const point = points.get(row.transaction_date.slice(0, 7));

    if (!point) {
      continue;
    }

    const amount = Number(row.amount);

    if (row.direction === "expense") {
      point.expense += amount;
      point.net -= amount;
    } else {
      point.income += amount;
      point.net += amount;
    }
  }

  return Array.from(points.values());
}

function buildLeaseEndingsChart(
  currentLeases: LeaseRow[],
  currentMonthStart: Date,
) {
  const months = Array.from({ length: 6 }, (_, index) =>
    addMonths(currentMonthStart, index),
  );
  const points = new Map(
    months.map((month) => [
      getMonthKey(month),
      {
        count: 0,
        href: `/leases?status=current&endMonth=${getMonthKey(month)}&sort=end_asc`,
        label: monthLabelFormatter.format(month),
      },
    ]),
  );

  for (const lease of currentLeases) {
    const point = points.get(lease.lease_end_date.slice(0, 7));

    if (point) {
      point.count += 1;
    }
  }

  return Array.from(points.values());
}

function getLeasesEndingSoon(currentLeases: LeaseRow[], today: string) {
  const soon = addDaysToDateString(today, 60);

  return currentLeases.filter(
    (lease) => lease.lease_end_date >= today && lease.lease_end_date <= soon,
  );
}

function getLargeRecentExpenses({
  ledgerRows,
  recentExpenseStart,
}: {
  ledgerRows: LedgerWindowRow[];
  recentExpenseStart: string;
}) {
  return ledgerRows.filter((row) => {
    if (
      row.direction !== "expense" ||
      row.transaction_date < recentExpenseStart
    ) {
      return false;
    }

    return Number(row.amount) >= largeExpenseReviewThreshold;
  });
}

function getNegativeNetProperties({
  ledgerRows,
  properties,
}: {
  ledgerRows: LedgerNetRow[];
  properties: PropertyRow[];
}) {
  const netByProperty = new Map<string, number>();

  for (const row of ledgerRows) {
    const amount = Number(row.amount);
    const signedAmount = row.direction === "expense" ? -amount : amount;

    netByProperty.set(
      row.property_id,
      (netByProperty.get(row.property_id) ?? 0) + signedAmount,
    );
  }

  return properties
    .filter((property) => (netByProperty.get(property.id) ?? 0) < 0)
    .toSorted(
      (first, second) =>
        (netByProperty.get(first.id) ?? 0) -
          (netByProperty.get(second.id) ?? 0) ||
        first.code.localeCompare(second.code),
    );
}

function getRoleCounts(roles: PersonRoleRow[]) {
  const counts = new Map<PersonRoleRow["role"], number>();

  for (const role of roles) {
    counts.set(role.role, (counts.get(role.role) ?? 0) + 1);
  }

  return counts;
}

function getUsableContactPersonIds(contacts: PersonContactRow[]) {
  const personIds = new Set<string>();

  for (const contact of contacts) {
    if (
      hasText(contact.email) ||
      hasText(contact.phone) ||
      hasText(contact.contact_name)
    ) {
      personIds.add(contact.person_id);
    }
  }

  return personIds;
}

function isMissingContact(
  person: PersonRow,
  usableContactPersonIds: Set<string>,
) {
  if (hasText(person.primary_email) || hasText(person.primary_phone)) {
    return false;
  }

  return !usableContactPersonIds.has(person.id);
}

function hasText(value: string | null) {
  return Boolean(value?.trim());
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = getKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return groups;
}

function startOfMonth(value: string) {
  const year = Number(value.slice(0, 4));
  const monthIndex = Number(value.slice(5, 7)) - 1;

  return new Date(Date.UTC(year, monthIndex, 1));
}

function addMonths(value: Date, amount: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1));
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addDaysToDateString(value: string, days: number) {
  const next = new Date(`${value}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
}

function getBusinessDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
  }).formatToParts(date);
  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return `${getPart("year")}-${String(getPart("month")).padStart(2, "0")}-${String(
    getPart("day"),
  ).padStart(2, "0")}`;
}

function getMonthKey(value: Date) {
  return toDateInput(value).slice(0, 7);
}

function getLedgerMonthHref(monthStart: Date) {
  const nextMonthStart = addMonths(monthStart, 1);
  const monthEnd = addDays(nextMonthStart, -1);
  const params = new URLSearchParams({
    dateFrom: toDateInput(monthStart),
    dateTo: toDateInput(monthEnd),
    sort: "date_desc",
  });

  return `/ledger?${params.toString()}`;
}

function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function assertNoError(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}

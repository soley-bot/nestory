import { toRecentChange } from "@/features/activity/recent-changes";
import type {
  OverviewAttentionItem,
  OverviewLedgerPoint,
  OverviewMetric,
  OverviewOccupancyPoint,
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { getOverviewMonthScope } from "@/features/overview/overview.filters";
import {
  buildOverviewPropertyPerformance,
  type OverviewDepositEventInputRow,
  type OverviewExpenseItemInputRow,
  type OverviewIncomeItemInputRow,
  type OverviewPaymentAllocationInputRow,
  type OverviewReceiptAllocationInputRow,
} from "@/features/overview/property-performance";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { CurrencyCode } from "@/lib/money/format";
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

type ReceiptAllocationRow = {
  amount: number;
  finance_income_items?: OverviewIncomeItemInputRow | null;
  finance_receipts: {
    received_date: string;
    reference?: string | null;
    reversal_of_id: string | null;
  } | null;
  id: string;
  income_item_id: string;
};

type PaymentAllocationRow = {
  amount: number;
  expense_item_id: string;
  finance_expense_items: (OverviewExpenseItemInputRow & {
    ledger_entry_id?: string | null;
  }) | null;
  finance_payments: {
    paid_date: string;
    reversal_of_id: string | null;
  } | null;
  id: string;
};

type DepositEventRow = {
  amount: number;
  event_date: string;
  event_type: string;
  id: string;
  property_id: string;
  reversal_of_id: string | null;
  reversed_event?: { event_type: string } | null;
};

type PagedQuery<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>;
};

type PageQueryFactory<T> = (from: number, to: number) => ReturnType<PagedQuery<T>["range"]>;

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
  query?: OverviewViewQuery,
): Promise<OverviewScreenData> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const businessToday = getBusinessDateString(now);
  const effectiveQuery = query ?? {
    financeView: "collections",
    lens: "all",
    month: businessToday.slice(0, 7),
    propertyId: "all",
    review: "all",
  };
  const monthScope = getOverviewMonthScope(effectiveQuery.month);
  const currentMonthStart = startOfMonth(monthScope.from);
  const ledgerStart = addMonths(currentMonthStart, -5);
  const ledgerStartInput = toDateInput(ledgerStart);
  const currentMonthEndInput = monthScope.before;
  const recentExpenseStart = addDaysToDateString(businessToday, -30);

  let propertiesQuery = supabase
    .from("properties")
    .select("id, code, name")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("code", { ascending: true });
  let unitsQuery = supabase
    .from("units")
    .select("id, property_id, status")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .neq("status", "inactive");
  let leasesQuery = supabase
    .from("leases")
    .select(
      "unit_id, lease_end_date, primary_tenant_person_id, units!inner(property_id)",
    )
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .in("status", [...activeLeaseStatuses]);
  let ledgerWindowQuery = supabase
    .from("ledger_entries")
    .select("transaction_date, direction, amount, currency")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .gte("transaction_date", ledgerStartInput)
    .lt("transaction_date", currentMonthEndInput);
  let ledgerNetQuery = supabase
    .from("ledger_entries")
    .select("property_id, direction, amount, currency")
    .eq("organization_id", organizationId)
    .is("archived_at", null);
  let propertyOwnersQuery = supabase
    .from("property_owners")
    .select("property_id")
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .is("archived_at", null)
    .is("ended_on", null);
  let incomeItemsQuery = supabase
    .from("finance_income_items")
    .select("id, property_id, due_date, income_type, amount_due")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .neq("status", "void")
    .gte("due_date", monthScope.from)
    .lt("due_date", monthScope.before);
  let openBillsQuery = supabase
    .from("finance_expense_items")
    .select("id, property_id, expense_type, economic_scope")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .eq("economic_scope", "property_expense")
    .neq("expense_type", "owner_payout")
    .in("status", ["draft", "approved"])
    .lt("invoice_date", monthScope.before);
  let cashReceiptAllocationsQuery = supabase
    .from("finance_receipt_allocations")
    .select(
      "id, amount, income_item_id, finance_receipts!finance_receipt_allocations_receipt_id_fkey!inner(received_date, reversal_of_id, reference, property_id), finance_income_items!finance_receipt_allocations_income_item_id_fkey!inner(id, property_id, due_date, income_type, amount_due)",
    )
    .eq("organization_id", organizationId)
    .gte("finance_receipts.received_date", monthScope.from)
    .lt("finance_receipts.received_date", monthScope.before);
  let cashPaymentAllocationsQuery = supabase
    .from("finance_payment_allocations")
    .select(
      "id, amount, expense_item_id, finance_payments!finance_payment_allocations_payment_id_fkey!inner(paid_date, reversal_of_id, property_id), finance_expense_items!finance_payment_allocations_expense_item_id_fkey!inner(id, property_id, expense_type, economic_scope, ledger_entry_id)",
    )
    .eq("organization_id", organizationId)
    .gte("finance_payments.paid_date", monthScope.from)
    .lt("finance_payments.paid_date", monthScope.before);
  let depositEventsQuery = supabase
    .from("lease_deposit_events")
    .select(
      "id, property_id, event_date, event_type, amount, reversal_of_id, reversed_event:lease_deposit_events!lease_deposit_events_reversal_of_id_fkey(event_type)",
    )
    .eq("organization_id", organizationId)
    .lt("event_date", monthScope.before);
  let openMaintenanceQuery = supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .in("status", [...openMaintenanceStatuses]);
  let documentsQuery = supabase
    .from("documents")
    .select("property_id, ledger_entry_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null);
  const peopleQuery = supabase
    .from("people")
    .select("id, primary_email, primary_phone")
    .eq("organization_id", organizationId)
    .is("archived_at", null);
  const rolesQuery = supabase
    .from("person_roles")
    .select("person_id, role")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("archived_at", null);
  const contactsQuery = supabase
    .from("person_contacts")
    .select("person_id, contact_name, email, phone")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .or("contact_name.not.is.null,email.not.is.null,phone.not.is.null");

  if (effectiveQuery.propertyId !== "all") {
    const propertyId = effectiveQuery.propertyId;
    propertiesQuery = propertiesQuery.eq("id", propertyId);
    unitsQuery = unitsQuery.eq("property_id", propertyId);
    leasesQuery = leasesQuery.eq("units.property_id", propertyId);
    ledgerWindowQuery = ledgerWindowQuery.eq("property_id", propertyId);
    ledgerNetQuery = ledgerNetQuery.eq("property_id", propertyId);
    propertyOwnersQuery = propertyOwnersQuery.eq("property_id", propertyId);
    incomeItemsQuery = incomeItemsQuery.eq("property_id", propertyId);
    openBillsQuery = openBillsQuery.eq("property_id", propertyId);
    cashReceiptAllocationsQuery = cashReceiptAllocationsQuery.eq(
      "finance_receipts.property_id",
      propertyId,
    );
    cashReceiptAllocationsQuery = cashReceiptAllocationsQuery.eq(
      "finance_income_items.property_id",
      propertyId,
    );
    cashPaymentAllocationsQuery = cashPaymentAllocationsQuery.eq(
      "finance_payments.property_id",
      propertyId,
    );
    cashPaymentAllocationsQuery = cashPaymentAllocationsQuery.eq(
      "finance_expense_items.property_id",
      propertyId,
    );
    depositEventsQuery = depositEventsQuery.eq("property_id", propertyId);
    openMaintenanceQuery = openMaintenanceQuery.eq("property_id", propertyId);
    documentsQuery = documentsQuery.eq("property_id", propertyId);
  }

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
    incomeItemsResult,
    openBillsResult,
    cashReceiptAllocationsResult,
    cashPaymentAllocationsResult,
    depositEventsResult,
    openMaintenanceResult,
    documentsResult,
    recentActivityResult,
  ] = await Promise.all([
    loadAllRows(pageFactory(propertiesQuery), "overview properties"),
    loadAllRows(pageFactory(unitsQuery), "overview units"),
    loadAllRows(pageFactory(leasesQuery), "overview leases"),
    loadAllRows(pageFactory(ledgerWindowQuery), "overview ledger window"),
    loadAllRows(pageFactory(ledgerNetQuery), "overview property ledger net"),
    loadAllRows(pageFactory(peopleQuery), "overview people"),
    loadAllRows(pageFactory(rolesQuery), "overview person roles"),
    loadAllRows(pageFactory(contactsQuery), "overview person contacts"),
    loadAllRows(pageFactory(propertyOwnersQuery), "overview property owners"),
    loadAllRows(pageFactory(incomeItemsQuery), "overview income obligations"),
    loadAllRows(pageFactory(openBillsQuery), "overview open bills"),
    loadAllRows(
      pageFactory<ReceiptAllocationRow>(cashReceiptAllocationsQuery),
      "overview cash receipt allocations",
    ),
    loadAllRows(
      pageFactory<PaymentAllocationRow>(cashPaymentAllocationsQuery),
      "overview cash payment allocations",
    ),
    loadAllRows(
      pageFactory<DepositEventRow>(depositEventsQuery),
      "overview deposit events",
    ),
    openMaintenanceQuery,
    loadAllRows(pageFactory(documentsQuery), "overview documents"),
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
  assertNoError(incomeItemsResult.error, "overview income obligations");
  assertNoError(openBillsResult.error, "overview open bills");
  assertNoError(
    cashReceiptAllocationsResult.error,
    "overview cash receipt allocations",
  );
  assertNoError(
    cashPaymentAllocationsResult.error,
    "overview cash payment allocations",
  );
  assertNoError(depositEventsResult.error, "overview deposit events");
  assertNoError(openMaintenanceResult.error, "overview maintenance");
  assertNoError(documentsResult.error, "overview documents");
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
  const incomeItems = (incomeItemsResult.data ?? []) as OverviewIncomeItemInputRow[];
  const openBills = (openBillsResult.data ?? []) as OverviewExpenseItemInputRow[];
  const cashReceiptRows = (cashReceiptAllocationsResult.data ?? []) as unknown as ReceiptAllocationRow[];
  const cashPaymentRows = (cashPaymentAllocationsResult.data ?? []) as unknown as PaymentAllocationRow[];
  const dueIncomeItemIds = incomeItems.map((item) => item.id);
  const historicalReceiptRows: ReceiptAllocationRow[] = [];

  for (const incomeItemIds of chunk(dueIncomeItemIds, 100)) {
    const historicalReceiptAllocationsResult = await loadAllRows(
      pageFactory<ReceiptAllocationRow>(supabase
        .from("finance_receipt_allocations")
        .select(
          "id, amount, income_item_id, finance_receipts!finance_receipt_allocations_receipt_id_fkey(received_date, reversal_of_id, reference)",
        )
        .eq("organization_id", organizationId)
        .in("income_item_id", incomeItemIds)
        .lt("finance_receipts.received_date", monthScope.before)),
      "overview due-obligation receipt allocation history",
    );
    historicalReceiptRows.push(...historicalReceiptAllocationsResult.data);
  }

  const receiptRows = uniqueById([...cashReceiptRows, ...historicalReceiptRows]);
  const receiptAllocations = receiptRows.flatMap(toReceiptAllocation);
  const paymentAllocations = cashPaymentRows.flatMap(toPaymentAllocation);
  const expenseItems = uniqueById(
    cashPaymentRows.flatMap((row) =>
      row.finance_expense_items ? [row.finance_expense_items] : [],
    ),
  );
  const depositEvents = ((depositEventsResult.data ?? []) as unknown as DepositEventRow[]).map(
    toDepositEvent,
  );
  const documents = (documentsResult.data ?? []) as Array<{
    ledger_entry_id: string | null;
    property_id: string | null;
  }>;
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
  const documentedLedgerIds = new Set(
    documents.flatMap((document) =>
      document.ledger_entry_id ? [document.ledger_entry_id] : [],
    ),
  );
  const missingReceiptPropertyIds = new Set(
    cashPaymentRows.flatMap((allocation) => {
      const item = allocation.finance_expense_items;
      return item &&
        (!item.ledger_entry_id || !documentedLedgerIds.has(item.ledger_entry_id))
        ? [item.property_id]
        : [];
    }),
  );
  const statementBlockerCountByProperty = new Map<string, number>();
  for (const property of missingOwnerLinks) increment(statementBlockerCountByProperty, property.id);
  for (const bill of openBills) increment(statementBlockerCountByProperty, bill.property_id);
  for (const propertyId of missingReceiptPropertyIds) increment(statementBlockerCountByProperty, propertyId);
  const propertyPerformanceInput = {
    currency: "USD" as const,
    depositEvents,
    expenseItems,
    incomeItems: uniqueById([
      ...incomeItems,
      ...cashReceiptRows.flatMap((row) =>
        row.finance_income_items ? [row.finance_income_items] : [],
      ),
    ]),
    monthScope,
    openBills,
    paymentAllocations,
    properties: activeProperties,
    receiptAllocations,
    statementBlockers: Array.from(
      statementBlockerCountByProperty,
      ([property_id, blocker_count]) => ({
        blocker_count,
        property_id,
      }),
    ),
    units: operationalUnits,
  };
  const portfolioPerformance = buildOverviewPropertyPerformance(
    propertyPerformanceInput,
  );
  const propertyPerformance = buildOverviewPropertyPerformance(
    propertyPerformanceInput,
    effectiveQuery.review,
  );
  const activePropertiesById = new Map(activeProperties.map((property) => [property.id, property]));
  const negativeNetProperties = portfolioPerformance.rows.flatMap((row) => {
    const property = activePropertiesById.get(row.propertyId);
    return row.netCashAmount < 0 && property ? [property] : [];
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
    arrearsPropertyCount: portfolioPerformance.rows.filter((row) => row.arrearsAmount > 0).length,
    largeRecentExpenses,
    leaseGapUnits: nonVacantLeaseGapUnits,
    leasesEndingSoon,
    missingTenantLeases,
    missingOwnerLinks,
    missingReceiptCount: missingReceiptPropertyIds.size,
    negativeNetProperties,
    openBillCount: openBills.length,
    openMaintenanceCount,
    overviewQuery: effectiveQuery,
    peopleMissingContacts,
    peopleWithoutRoles,
    statementBlockerCount: portfolioPerformance.summary.statementReadiness.blockedCount,
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
    propertyPerformance,
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

function toReceiptAllocation(
  row: ReceiptAllocationRow,
): OverviewReceiptAllocationInputRow[] {
  if (!row.finance_receipts) return [];
  return [{
    amount: Number(row.amount),
    income_item_id: row.income_item_id,
    received_date: row.finance_receipts.received_date,
    reversal_of_id: row.finance_receipts.reversal_of_id,
  }];
}

function toPaymentAllocation(
  row: PaymentAllocationRow,
): OverviewPaymentAllocationInputRow[] {
  if (!row.finance_payments) return [];
  return [{
    amount: Number(row.amount),
    expense_item_id: row.expense_item_id,
    paid_date: row.finance_payments.paid_date,
    reversal_of_id: row.finance_payments.reversal_of_id,
  }];
}

function toDepositEvent(row: DepositEventRow): OverviewDepositEventInputRow {
  const common = {
    amount: Number(row.amount),
    event_date: row.event_date,
    property_id: row.property_id,
  };

  if (row.event_type === "reversed") {
    const reversedEventType = row.reversed_event?.event_type;
    if (!isDepositEventType(reversedEventType)) {
      throw new Error(`Deposit reversal ${row.id} is missing its original event type`);
    }
    return {
      ...common,
      event_type: "reversed",
      reversed_event_type: reversedEventType,
    };
  }

  if (!isDepositEventType(row.event_type)) {
    throw new Error(`Unsupported deposit event type: ${row.event_type}`);
  }
  return {
    ...common,
    event_type: row.event_type,
    reversed_event_type: null,
  };
}

function isDepositEventType(
  value: string | undefined,
): value is Exclude<OverviewDepositEventInputRow["event_type"], "reversed"> {
  return (
    value === "applied" ||
    value === "received" ||
    value === "refunded" ||
    value === "retained"
  );
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function chunk<T>(rows: T[], size: number) {
  return Array.from(
    { length: Math.ceil(rows.length / size) },
    (_, index) => rows.slice(index * size, (index + 1) * size),
  );
}

function pageFactory<T>(query: unknown): PageQueryFactory<T> {
  const pagedQuery = query as PagedQuery<T>;
  return (from, to) => pagedQuery.range(from, to);
}

async function loadAllRows<T>(queryPage: PageQueryFactory<T>, label: string) {
  const rows: T[] = [];
  const pageSize = 1_000;

  while (true) {
    const result = await queryPage(rows.length, rows.length + pageSize - 1);
    assertNoError(result.error, label);
    const pageRows = result.data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }

  return { data: rows, error: null };
}

function increment(counts: Map<string, number>, propertyId: string) {
  counts.set(propertyId, (counts.get(propertyId) ?? 0) + 1);
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
  arrearsPropertyCount,
  largeRecentExpenses,
  leaseGapUnits,
  leasesEndingSoon,
  missingTenantLeases,
  missingOwnerLinks,
  missingReceiptCount,
  negativeNetProperties,
  openBillCount,
  openMaintenanceCount,
  overviewQuery,
  peopleMissingContacts,
  peopleWithoutRoles,
  statementBlockerCount,
  vacantUnits,
}: {
  arrearsPropertyCount: number;
  largeRecentExpenses: LedgerWindowRow[];
  leaseGapUnits: UnitRow[];
  leasesEndingSoon: LeaseRow[];
  missingTenantLeases: LeaseRow[];
  missingOwnerLinks: PropertyRow[];
  missingReceiptCount: number;
  negativeNetProperties: PropertyRow[];
  openBillCount: number;
  openMaintenanceCount: number;
  overviewQuery: OverviewViewQuery;
  peopleMissingContacts: PersonRow[];
  peopleWithoutRoles: PersonRow[];
  statementBlockerCount: number;
  vacantUnits: UnitRow[];
}): OverviewAttentionItem[] {
  const overviewReviewHref = (review: OverviewViewQuery["review"]) => {
    const params = new URLSearchParams({
      month: overviewQuery.month,
      review,
    });
    if (overviewQuery.propertyId !== "all") {
      params.set("propertyId", overviewQuery.propertyId);
    }
    return `/overview?${params.toString()}`;
  };

  return [
    negativeNetProperties.length > 0
      ? {
          count: negativeNetProperties.length,
          helper: "Selected-month property cash is below zero",
          href: overviewReviewHref("negative"),
          label: "Properties with negative net cash",
          tone: "danger",
        }
      : null,
    arrearsPropertyCount > 0
      ? {
          count: arrearsPropertyCount,
          helper: "Selected-month rent remains uncollected",
          href: overviewReviewHref("arrears"),
          label: "Properties with rent arrears",
          tone: "warning",
        }
      : null,
    openBillCount > 0
      ? {
          count: openBillCount,
          helper: "Draft or approved property bills",
          href: overviewReviewHref("bills"),
          label: "Open property bills",
          tone: "warning",
        }
      : null,
    missingReceiptCount > 0
      ? {
          count: missingReceiptCount,
          helper: "Paid property costs without evidence",
          href: `/ledger?direction=expense&receipt=missing&period=${overviewQuery.month}`,
          label: "Properties missing receipts",
          tone: "warning",
        }
      : null,
    statementBlockerCount > 0
      ? {
          count: statementBlockerCount,
          helper: "Owner statement checks are unresolved",
          href: overviewReviewHref("statement-blocked"),
          label: "Statement blockers",
          tone: "warning",
        }
      : null,
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

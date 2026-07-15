import { formatDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";
import { createSupabaseServerClient } from "@/lib/db/server";
import type {
  PropertyCashDepositEvent,
  PropertyCashExpenseItem,
  PropertyCashIncomeItem,
  PropertyCashPaymentAllocation,
  PropertyCashReceiptAllocation,
} from "@/features/finance/property-cash";
import {
  getReportMonthRange,
  getReportScopeValidation,
} from "@/features/reports/reports.filters";
import type {
  ReportEvidenceLine,
  ReportSourceLink,
  ReportsViewQuery,
  TraceableReportMetric,
  TrustedReport,
  TrustedReportRow,
} from "@/features/reports/reports.types";
import type {
  OwnerStatementDataIssue,
  OwnerStatementEvidenceLine,
  OwnerStatementPerson,
  OwnerStatementReadyRow,
  OwnerStatementResult,
} from "@/features/reports/data/owner-statement";
import {
  buildOwnerStatement,
  type OwnerStatementOwnerLink,
} from "@/features/reports/data/owner-statement";

export type OwnerStatementReportProperty = {
  code: string;
  id: string;
  name: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type IncomeItemRow = {
  amount_due: number;
  due_date: string;
  id: string;
  income_type: string;
  property_id: string;
};

type ExpenseItemRow = {
  economic_scope: string;
  expense_type: string;
  id: string;
  property_id: string;
};

type ReceiptAllocationRow = {
  amount: number;
  finance_income_items?: IncomeItemRow | null;
  finance_receipts: {
    id: string;
    received_date: string;
    reversal_of_id: string | null;
  } | null;
  id: string;
  income_item_id: string;
};

type PaymentAllocationRow = {
  amount: number;
  expense_item_id: string;
  finance_expense_items: ExpenseItemRow | null;
  finance_payments: {
    id: string;
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
};

type OwnerLinkRow = {
  archived_at: string | null;
  ended_on: string | null;
  id: string;
  is_primary: boolean;
  ownership_percent: number | null;
  person_id: string;
  property_id: string;
  started_on: string | null;
};

type PersonRow = {
  display_name: string;
  id: string;
  primary_email: string | null;
  primary_phone: string | null;
};

type PersonContactRow = {
  email: string | null;
  person_id: string;
  phone: string | null;
};

const maxOwnerStatementSourceRows = 5_000;
const ownerStatementSourceRangeEnd = maxOwnerStatementSourceRows - 1;

export async function getOwnerStatementReport({
  organizationId,
  viewQuery,
}: {
  organizationId: string;
  viewQuery: ReportsViewQuery;
}) {
  const scopeValidation = getReportScopeValidation(viewQuery);
  if (scopeValidation) {
    return buildOwnerStatementScopeValidationReport(viewQuery, scopeValidation);
  }

  const supabase = await createSupabaseServerClient();
  const monthScope = getMonthScope(viewQuery.month);
  const properties = await loadProperties(supabase, organizationId, viewQuery);
  const propertyIds = properties.map((property) => property.id);

  if (propertyIds.length === 0) {
    return buildOwnerStatementTrustedReport({
      people: [],
      properties,
      result: buildOwnerStatement({
        cashInput: {
          depositEvents: [],
          expenseItems: [],
          incomeItems: [],
          monthScope,
          paymentAllocations: [],
          propertyIds,
          receiptAllocations: [],
        },
        ownerLinks: [],
        people: [],
      }),
      viewQuery,
    });
  }

  const [
    dueIncomeItems,
    currentReceiptRows,
    paymentRows,
    depositRows,
    ownerRows,
  ] = await Promise.all([
    loadDueIncomeItems(supabase, organizationId, propertyIds, monthScope),
    loadCurrentReceiptAllocations(
      supabase,
      organizationId,
      propertyIds,
      monthScope,
    ),
    loadPaymentAllocations(
      supabase,
      organizationId,
      propertyIds,
      monthScope,
    ),
    loadDepositEvents(
      supabase,
      organizationId,
      propertyIds,
      monthScope.before,
    ),
    loadOwnerLinks(supabase, organizationId, propertyIds),
  ]);
  const historicalReceiptRows = await loadHistoricalReceiptAllocations(
    supabase,
    organizationId,
    dueIncomeItems.map((item) => item.id),
    monthScope.before,
  );
  const personIds = [...new Set(ownerRows.map((owner) => owner.person_id))];
  const [personRows, contactRows] = await Promise.all([
    loadPeople(supabase, organizationId, personIds),
    loadPersonContacts(supabase, organizationId, personIds),
  ]);
  const receiptRows = uniqueById([
    ...currentReceiptRows,
    ...historicalReceiptRows,
  ]);
  const people = toOwnerStatementPeople(personRows, contactRows);
  const deposits = toDepositEvents(depositRows);
  const result = buildOwnerStatement({
    cashInput: {
      depositEvents: deposits.events,
      expenseItems: uniqueById(
        paymentRows.flatMap((row) =>
          row.finance_expense_items ? [row.finance_expense_items] : [],
        ),
      ).map(toExpenseItem),
      incomeItems: uniqueById([
        ...dueIncomeItems,
        ...currentReceiptRows.flatMap((row) =>
          row.finance_income_items ? [row.finance_income_items] : [],
        ),
      ]).map(toIncomeItem),
      monthScope,
      paymentAllocations: paymentRows.flatMap(toPaymentAllocation),
      propertyIds,
      receiptAllocations: receiptRows.flatMap(toReceiptAllocation),
    },
    dataIssues: deposits.issues,
    ownerLinks: ownerRows.map(toOwnerLink),
    people,
  });

  return buildOwnerStatementTrustedReport({
    people,
    properties,
    result,
    viewQuery,
  });
}

export function buildOwnerStatementScopeValidationReport(
  viewQuery: ReportsViewQuery,
  validation: NonNullable<ReturnType<typeof getReportScopeValidation>>,
): TrustedReport {
  const period = getReportMonthRange(viewQuery.month);
  return {
    columns: [],
    description: validation.message,
    emptyDescription: validation.message,
    emptyTitle: "Unsupported Owner Statement scope",
    exportFilenameBase: "owner-statement",
    generatedAt: new Date().toISOString(),
    kind: "owner-statement",
    periodLabel: `${formatDate(period.start)} - ${formatDate(period.end)}`,
    rows: [],
    scopeLabel: "Selected unit",
    scopeValidation: {
      code: validation.code,
      message: validation.message,
    },
    summary: [],
    title: "Owner Statement",
    totalsTraceLabel: validation.message,
  };
}

export function buildOwnerStatementTrustedReport({
  generatedAt = new Date().toISOString(),
  people,
  properties,
  result,
  viewQuery,
}: {
  generatedAt?: string;
  people: Array<Pick<OwnerStatementPerson, "displayName" | "id">>;
  properties: OwnerStatementReportProperty[];
  result: OwnerStatementResult;
  viewQuery: ReportsViewQuery;
}): TrustedReport {
  const propertiesById = new Map(
    properties.map((property) => [property.id, property]),
  );
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const period = getReportMonthRange(viewQuery.month);
  const rows = result.rows.map((row): TrustedReportRow => {
    const property = propertiesById.get(row.propertyId);
    const propertyLabel = property
      ? `${property.code} - ${property.name}`
      : "Unknown property";
    const sourceLinks = buildSourceLinks({
      evidence: row.evidence,
      month: viewQuery.month,
      propertyLabel,
    });
    const sourceCount = row.evidence.length;

    if (row.status === "blocked") {
      return {
        cells: {
          depositsHeld: "—",
          managementEarned: "—",
          managementOutstanding: "—",
          managementReceived: "—",
          netMovement: "—",
          notes: row.reasons.join("; "),
          operatingCash: "—",
          owner: "Blocked",
          ownerContributions: "—",
          ownerPayouts: "—",
          ownership: "—",
          property: propertyLabel,
          propertyExpenses: "—",
          readiness: "Blocked",
        },
        evidence: row.evidence satisfies ReportEvidenceLine[],
        href: `/properties/${row.propertyId}`,
        id: `owner-statement-blocked:${row.propertyId}`,
        sourceCount,
        sourceLinks,
        sourceSummary: sourceLabel(sourceCount),
        title: `Blocked: ${row.reasons.join("; ")} / ${property?.code ?? row.propertyId}`,
        tone: "danger",
      };
    }

    const person = peopleById.get(row.ownerPersonId);
    const ownerName = person?.displayName ?? "Unknown owner";
    const notes = row.warnings.join("; ");
    return {
      cells: {
        depositsHeld: cents(row.securityDepositHeldCents),
        managementEarned: cents(row.managementFeesEarnedCents),
        managementOutstanding: cents(row.managementFeesOutstandingCents),
        managementReceived: cents(row.managementFeesReceivedCents),
        netMovement: cents(row.netOwnerCashMovementCents),
        notes: notes || "—",
        operatingCash: cents(row.operatingCashReceivedCents),
        owner: ownerName,
        ownerContributions: cents(row.ownerContributionCents),
        ownerPayouts: cents(row.ownerPayoutCents),
        ownership: ownershipLabel(row),
        property: propertyLabel,
        propertyExpenses: cents(row.propertyExpensesPaidCents),
        readiness: notes ? "Ready with warning" : "Ready",
      },
      evidence: row.evidence satisfies ReportEvidenceLine[],
      href: `/properties/${row.propertyId}`,
      id: `owner-statement:${row.propertyId}:${row.ownerPersonId}`,
      sourceCount,
      sourceLinks,
      sourceSummary: sourceLabel(sourceCount),
      title: `${ownerName} / ${property?.code ?? row.propertyId}`,
      tone: notes ? "warning" : "success",
    };
  });

  return {
    columns: [
      { key: "readiness", label: "Status" },
      { key: "owner", label: "Owner" },
      { key: "property", label: "Property" },
      { key: "ownership", label: "Ownership share" },
      { align: "right", key: "operatingCash", label: "Operating cash received" },
      { align: "right", key: "propertyExpenses", label: "Property expenses paid" },
      { align: "right", key: "managementEarned", label: "Management fees earned" },
      { align: "right", key: "managementReceived", label: "Management fees received" },
      {
        align: "right",
        key: "managementOutstanding",
        label: "Management fees outstanding from this period",
      },
      { align: "right", key: "ownerContributions", label: "Owner contributions" },
      { align: "right", key: "ownerPayouts", label: "Owner payouts" },
      { align: "right", key: "depositsHeld", label: "Security deposits held" },
      { align: "right", key: "netMovement", label: "Net owner cash movement" },
      { key: "notes", label: "Notes" },
    ],
    description:
      "Property-level cash-basis owner activity allocated across effective ownership, with ambiguous properties explicitly blocked.",
    emptyDescription: "Add active properties or adjust the property filter.",
    emptyTitle: "No owner statement rows",
    exportFilenameBase: "owner-statement",
    generatedAt,
    kind: "owner-statement",
    periodLabel: `${formatDate(period.start)} - ${formatDate(period.end)}`,
    rows,
    scopeLabel: scopeLabel(viewQuery, propertiesById),
    summary: statementSummary(result),
    title: "Owner Statement",
    totalsTraceLabel:
      "Monetary totals include ready properties only and trace to property-cash evidence plus effective owner links.",
  };
}

function statementSummary(result: OwnerStatementResult): TraceableReportMetric[] {
  const readyEvidence = result.rows
    .filter((row): row is OwnerStatementReadyRow => row.status === "ready")
    .flatMap((row) => row.evidence);

  return [
    metric(
      "Ready statements",
      String(result.summary.readyStatementCount),
      "Property/month statements with valid ownership on every required date",
      readyEvidence.length,
    ),
    metric(
      "Blocked properties",
      String(result.summary.blockedPropertyCount),
      "Properties excluded from monetary totals because ownership is ambiguous",
      result.rows.filter((row) => row.status === "blocked").length,
    ),
    metric(
      "Operating cash received",
      cents(result.summary.operatingCashReceivedCents),
      "Receipt-date operating cash allocated across ready statements",
      countEvidence(readyEvidence, "operating_cash_received"),
    ),
    metric(
      "Property expenses paid",
      cents(result.summary.propertyExpensesPaidCents),
      "Payment-date property expenses allocated across ready statements",
      countEvidence(readyEvidence, "property_expenses_paid"),
    ),
    metric(
      "Management fees received",
      cents(result.summary.managementFeesReceivedCents),
      "Receipt-date management fees allocated across ready statements",
      countEvidence(readyEvidence, "management_fees_received"),
    ),
    metric(
      "Net owner cash movement",
      cents(result.summary.netOwnerCashMovementCents),
      "Operating cash less property expenses and received fees, plus contributions less payouts",
      readyEvidence.length,
    ),
  ];
}

function metric(
  label: string,
  value: string,
  detail: string,
  sourceCount: number,
): TraceableReportMetric {
  return { detail, label, sourceCount, value };
}

function countEvidence(
  evidence: OwnerStatementEvidenceLine[],
  fact: OwnerStatementEvidenceLine["statementFact"],
) {
  return evidence.filter((line) => line.statementFact === fact).length;
}

function buildSourceLinks({
  evidence,
  month,
  propertyLabel,
}: {
  evidence: OwnerStatementEvidenceLine[];
  month: string;
  propertyLabel: string;
}) {
  const links: ReportSourceLink[] = [];
  const propertyId = evidence[0]?.propertyId;
  if (propertyId) {
    links.push({
      href: `/properties/${propertyId}`,
      id: propertyId,
      label: propertyLabel,
      recordType: "property",
    });
  }

  for (const line of evidence) {
    const incomeHref = buildIncomeReviewHref(line, month);
    const expenseHref = buildExpenseReviewHref(line, month);
    if (line.ownerLinkId) {
      links.push({
        href: line.ownerPersonId ? `/people/${line.ownerPersonId}` : undefined,
        id: line.ownerLinkId,
        label: "Owner link",
        recordType: "owner",
      });
    }
    if (line.incomeItemId) {
      links.push({
        href: incomeHref,
        id: line.incomeItemId,
        label: "Income obligation (module review)",
        recordType: "income-obligation",
      });
    }
    if (line.receiptId) {
      links.push({
        href: incomeHref,
        id: line.receiptId,
        label: "Receipt (module review)",
        recordType: "receipt",
      });
    }
    if (line.allocationId && line.receiptId) {
      links.push({
        href: incomeHref,
        id: line.allocationId,
        label: "Receipt allocation (module review)",
        recordType: "receipt-allocation",
      });
    }
    if (line.expenseItemId) {
      links.push({
        href: expenseHref,
        id: line.expenseItemId,
        label: "Expense obligation (module review)",
        recordType: "expense-obligation",
      });
    }
    if (line.paymentId) {
      links.push({
        href: expenseHref,
        id: line.paymentId,
        label: "Payment (module review)",
        recordType: "payment",
      });
    }
    if (line.allocationId && line.paymentId) {
      links.push({
        href: expenseHref,
        id: line.allocationId,
        label: "Payment allocation (module review)",
        recordType: "payment-allocation",
      });
    }
    if (line.depositEventId) {
      links.push({
        href: `/leases?propertyId=${line.propertyId}`,
        id: line.depositEventId,
        label: "Deposit event (lease module review)",
        recordType: "deposit-event",
      });
    }
  }

  return uniqueSourceLinks(links);
}

function buildIncomeReviewHref(
  line: OwnerStatementEvidenceLine,
  month: string,
) {
  const params = new URLSearchParams({ month, propertyId: line.propertyId });
  if (
    line.classification === "management_fee_earned" ||
    line.classification === "management_fee_received"
  ) {
    params.set("incomeScope", "management-fees");
  }
  return `/rent-income?${params.toString()}`;
}

function buildExpenseReviewHref(
  line: OwnerStatementEvidenceLine,
  month: string,
) {
  const params = new URLSearchParams({
    dateBasis: "paid",
    month,
    propertyId: line.propertyId,
  });
  if (line.classification === "owner_payout") {
    params.set("expenseType", "owner_payout");
  }
  return `/bills-expenses?${params.toString()}`;
}

function uniqueSourceLinks(links: ReportSourceLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.recordType}:${link.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ownershipLabel(row: OwnerStatementReadyRow) {
  return row.ownershipSharesThousandths.length === 1
    ? formatOwnership(row.ownershipSharesThousandths[0]!)
    : "Varies by effective date";
}

function formatOwnership(thousandths: number) {
  return `${Math.trunc(thousandths / 1_000)}.${String(
    thousandths % 1_000,
  ).padStart(3, "0")}%`;
}

function scopeLabel(
  viewQuery: ReportsViewQuery,
  propertiesById: Map<string, OwnerStatementReportProperty>,
) {
  if (viewQuery.propertyId === "all") return "All properties";
  const property = propertiesById.get(viewQuery.propertyId);
  return property
    ? `${property.code} - ${property.name}`
    : "Selected property";
}

function cents(value: number) {
  return formatMoney(value / 100, "USD");
}

function sourceLabel(count: number) {
  return count === 1 ? "1 evidence line" : `${count} evidence lines`;
}

async function loadProperties(
  supabase: SupabaseServerClient,
  organizationId: string,
  viewQuery: ReportsViewQuery,
) {
  let query = supabase
    .from("properties")
    .select("id, code, name", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("archived_at", null);
  if (viewQuery.propertyId !== "all") {
    query = query.eq("id", viewQuery.propertyId);
  }
  return loadRows<OwnerStatementReportProperty>(
    query.order("code", { ascending: true }),
    "owner statement properties",
  );
}

function loadDueIncomeItems(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
  monthScope: { before: string; from: string },
) {
  return loadRows<IncomeItemRow>(
    supabase
      .from("finance_income_items")
      .select("id, property_id, due_date, income_type, amount_due", {
        count: "exact",
      })
      .eq("organization_id", organizationId)
      .in("property_id", propertyIds)
      .is("archived_at", null)
      .neq("status", "void")
      .gte("due_date", monthScope.from)
      .lt("due_date", monthScope.before),
    "owner statement income obligations",
  );
}

function loadCurrentReceiptAllocations(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
  monthScope: { before: string; from: string },
) {
  return loadRows<ReceiptAllocationRow>(
    supabase
      .from("finance_receipt_allocations")
      .select(
        "id, amount, income_item_id, finance_receipts!finance_receipt_allocations_receipt_id_fkey!inner(id, received_date, reversal_of_id, property_id), finance_income_items!finance_receipt_allocations_income_item_id_fkey!inner(id, property_id, due_date, income_type, amount_due)",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .in("finance_receipts.property_id", propertyIds)
      .in("finance_income_items.property_id", propertyIds)
      .gte("finance_receipts.received_date", monthScope.from)
      .lt("finance_receipts.received_date", monthScope.before),
    "owner statement receipt allocations",
  );
}

function loadPaymentAllocations(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
  monthScope: { before: string; from: string },
) {
  return loadRows<PaymentAllocationRow>(
    supabase
      .from("finance_payment_allocations")
      .select(
        "id, amount, expense_item_id, finance_payments!finance_payment_allocations_payment_id_fkey!inner(id, paid_date, reversal_of_id, property_id), finance_expense_items!finance_payment_allocations_expense_item_id_fkey!inner(id, property_id, expense_type, economic_scope)",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .in("finance_payments.property_id", propertyIds)
      .in("finance_expense_items.property_id", propertyIds)
      .gte("finance_payments.paid_date", monthScope.from)
      .lt("finance_payments.paid_date", monthScope.before),
    "owner statement payment allocations",
  );
}

function loadDepositEvents(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
  before: string,
) {
  return loadRows<DepositEventRow>(
    supabase
      .from("lease_deposit_events")
      .select("id, property_id, event_date, event_type, amount, reversal_of_id", {
        count: "exact",
      })
      .eq("organization_id", organizationId)
      .in("property_id", propertyIds)
      .lt("event_date", before),
    "owner statement deposit events",
  );
}

function loadOwnerLinks(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
) {
  return loadRows<OwnerLinkRow>(
    supabase
      .from("property_owners")
      .select(
        "id, property_id, person_id, ownership_percent, is_primary, started_on, ended_on, archived_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .in("property_id", propertyIds)
      .is("archived_at", null),
    "owner statement owner links",
  );
}

async function loadHistoricalReceiptAllocations(
  supabase: SupabaseServerClient,
  organizationId: string,
  incomeItemIds: string[],
  before: string,
) {
  const rows: ReceiptAllocationRow[] = [];
  for (const ids of chunk(incomeItemIds, 100)) {
    rows.push(
      ...(await loadRows<ReceiptAllocationRow>(
        supabase
          .from("finance_receipt_allocations")
          .select(
            "id, amount, income_item_id, finance_receipts!finance_receipt_allocations_receipt_id_fkey(id, received_date, reversal_of_id)",
            { count: "exact" },
          )
          .eq("organization_id", organizationId)
          .in("income_item_id", ids)
          .lt("finance_receipts.received_date", before),
        "owner statement due-obligation receipt history",
      )),
    );
  }
  return rows;
}

function loadPeople(
  supabase: SupabaseServerClient,
  organizationId: string,
  personIds: string[],
) {
  if (personIds.length === 0) return Promise.resolve<PersonRow[]>([]);
  return loadRows<PersonRow>(
    supabase
      .from("people")
      .select("id, display_name, primary_email, primary_phone", {
        count: "exact",
      })
      .eq("organization_id", organizationId)
      .in("id", personIds)
      .is("archived_at", null),
    "owner statement people",
  );
}

function loadPersonContacts(
  supabase: SupabaseServerClient,
  organizationId: string,
  personIds: string[],
) {
  if (personIds.length === 0) return Promise.resolve<PersonContactRow[]>([]);
  return loadRows<PersonContactRow>(
    supabase
      .from("person_contacts")
      .select("person_id, email, phone", { count: "exact" })
      .eq("organization_id", organizationId)
      .in("person_id", personIds)
      .is("archived_at", null),
    "owner statement person contacts",
  );
}

async function loadRows<T>(
  query: {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{
      count: number | null;
      data: unknown[] | null;
      error: { message: string } | null;
    }>;
  },
  sourceName: string,
) {
  const result = await query.range(0, ownerStatementSourceRangeEnd);
  if (result.error) {
    throw new Error(`Could not load ${sourceName}: ${result.error.message}`);
  }
  const data = (result.data ?? []) as T[];
  const total = result.count ?? data.length;
  if (total > data.length) {
    throw new Error(
      `${sourceName} has ${total.toLocaleString()} rows, which exceeds the ${maxOwnerStatementSourceRows.toLocaleString()} row report source limit. Narrow the property scope before exporting.`,
    );
  }
  return data;
}

function toOwnerLink(row: OwnerLinkRow): OwnerStatementOwnerLink {
  return {
    archivedAt: row.archived_at,
    endedOn: row.ended_on,
    id: row.id,
    isPrimary: row.is_primary,
    ownershipPercent: row.ownership_percent,
    personId: row.person_id,
    propertyId: row.property_id,
    startedOn: row.started_on,
  };
}

function toOwnerStatementPeople(
  people: PersonRow[],
  contacts: PersonContactRow[],
): OwnerStatementPerson[] {
  const contactPersonIds = new Set(
    contacts.flatMap((contact) =>
      hasText(contact.email) || hasText(contact.phone) ? [contact.person_id] : [],
    ),
  );
  return people.map((person) => ({
    displayName: person.display_name,
    hasUsableContact:
      hasText(person.primary_email) ||
      hasText(person.primary_phone) ||
      contactPersonIds.has(person.id),
    id: person.id,
  }));
}

function toIncomeItem(row: IncomeItemRow): PropertyCashIncomeItem {
  return {
    amountDue: row.amount_due,
    dueDate: row.due_date,
    id: row.id,
    incomeType: row.income_type,
    propertyId: row.property_id,
  };
}

function toReceiptAllocation(
  row: ReceiptAllocationRow,
): PropertyCashReceiptAllocation[] {
  if (!row.finance_receipts) return [];
  return [
    {
      allocationId: row.id,
      amount: row.amount,
      incomeItemId: row.income_item_id,
      receiptId: row.finance_receipts.id,
      receivedDate: row.finance_receipts.received_date,
      reversalOfId: row.finance_receipts.reversal_of_id,
    },
  ];
}

function toExpenseItem(row: ExpenseItemRow): PropertyCashExpenseItem {
  return {
    economicScope: row.economic_scope,
    expenseType: row.expense_type,
    id: row.id,
    propertyId: row.property_id,
  };
}

function toPaymentAllocation(
  row: PaymentAllocationRow,
): PropertyCashPaymentAllocation[] {
  if (!row.finance_payments) return [];
  return [
    {
      allocationId: row.id,
      amount: row.amount,
      expenseItemId: row.expense_item_id,
      paidDate: row.finance_payments.paid_date,
      paymentId: row.finance_payments.id,
      reversalOfId: row.finance_payments.reversal_of_id,
    },
  ];
}

function toDepositEvents(rows: DepositEventRow[]): {
  events: PropertyCashDepositEvent[];
  issues: OwnerStatementDataIssue[];
} {
  const typesById = new Map(rows.map((row) => [row.id, row.event_type]));
  const events: PropertyCashDepositEvent[] = [];
  const issues: OwnerStatementDataIssue[] = [];

  for (const row of rows) {
    const common = {
      amount: row.amount,
      depositEventId: row.id,
      eventDate: row.event_date,
      propertyId: row.property_id,
    };
    if (row.event_type === "reversed") {
      const reversedEventType = row.reversal_of_id
        ? typesById.get(row.reversal_of_id)
        : undefined;
      if (!isDepositEventType(reversedEventType)) {
        issues.push(
          depositDataIssue(
            row,
            `Deposit reversal ${row.id} is missing its original event type`,
          ),
        );
        continue;
      }
      events.push({
        ...common,
        eventType: "reversed",
        reversedEventType,
      });
      continue;
    }
    if (!isDepositEventType(row.event_type)) {
      issues.push(
        depositDataIssue(
          row,
          `Deposit event ${row.id} has unsupported type ${row.event_type}`,
        ),
      );
      continue;
    }
    events.push({
      ...common,
      eventType: row.event_type,
      reversedEventType: null,
    });
  }

  return { events, issues };
}

function depositDataIssue(
  row: DepositEventRow,
  reason: string,
): OwnerStatementDataIssue {
  return {
    evidence: {
      allocatedAmountCents: null,
      allocationId: null,
      classification: "security_deposit",
      depositEventId: row.id,
      eventDate: row.event_date,
      expenseItemId: null,
      incomeItemId: null,
      ownerEndedOn: null,
      ownerLinkId: null,
      ownerPersonId: null,
      ownerStartedOn: null,
      paymentId: null,
      propertyId: row.property_id,
      receiptId: null,
      signedAmountCents: null,
      statementFact: "supporting_evidence",
    },
    propertyId: row.property_id,
    reason,
  };
}

function isDepositEventType(
  value: string | undefined,
): value is Exclude<PropertyCashDepositEvent["eventType"], "reversed"> {
  return (
    value === "applied" ||
    value === "received" ||
    value === "refunded" ||
    value === "retained"
  );
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function chunk<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function hasText(value: string | null) {
  return Boolean(value?.trim());
}

function getMonthScope(month: string) {
  const period = getReportMonthRange(month);
  const end = new Date(`${period.end}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    before: end.toISOString().slice(0, 10),
    from: period.start,
  };
}

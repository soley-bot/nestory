import { createSupabaseServerClient } from "@/lib/db/server";
import {
  formatPropertyOptionLabel,
  formatUnitOptionLabel,
} from "@/lib/entity-option-labels";
import type { Database } from "@/types/database";
import type {
  ExpenseSubmissionSummary,
  FinanceExpenseSummary,
  FinanceLease,
  FinanceOperationsData,
  FinanceOption,
  LeaseBillingSummary,
  OwnerInvoiceSummary,
  PropertyAccountEntry,
  PropertyFinancePosition,
  RentGenerationException,
  TenantInvoiceLine,
  TenantInvoiceSummary,
} from "@/features/finance-operations/finance-operations.types";

type TenantInvoiceBalanceRow =
  Database["public"]["Views"]["tenant_invoice_balances"]["Row"];
type TenantInvoiceGenerationRow = Pick<
  Database["public"]["Tables"]["tenant_invoices"]["Row"],
  "billing_period_start" | "generation_source" | "id" | "is_prorated"
>;
type OwnerInvoiceBalanceRow =
  Database["public"]["Views"]["owner_invoice_balances"]["Row"];
type PositionRow =
  Database["public"]["Views"]["property_finance_positions"]["Row"];
type AccountEntryRow =
  Database["public"]["Views"]["property_account_entries"]["Row"];
type ExpenseSubmissionRow =
  Database["public"]["Tables"]["expense_submissions"]["Row"];
type FinancePropertyRow = {
  archived_at: string | null;
  code: string;
  id: string;
  name: string;
};
type FinanceUnitRow = {
  archived_at: string | null;
  id: string;
  property_id: string;
  unit_number: string;
};
type RentGenerationExceptionRow =
  Database["public"]["Tables"]["rent_generation_exceptions"]["Row"];
type ExpenseEvidenceRow = {
  document_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  submission_id: string;
};
type DataPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function fetchAllActionableRows<T>(
  fetchPage: (from: number, to: number) => Promise<DataPageResult<T>>,
  pageSize = 500,
): Promise<DataPageResult<T>> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (page.error) return { data: null, error: page.error };
    const pageRows = page.data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }

  return { data: rows, error: null };
}

export function mergeRowsById<T extends { id: string | null }>(
  actionableRows: T[],
  historyRows: T[],
): T[] {
  const rowsById = new Map<string, T>();

  for (const row of [...historyRows, ...actionableRows]) {
    if (row.id) rowsById.set(row.id, row);
  }

  return [...rowsById.values()];
}

export function isWorkflowOwnedResponsibility(
  responsibility: Pick<
    Database["public"]["Tables"]["ips_expense_responsibilities"]["Row"],
    "idempotency_key"
  >,
): boolean {
  return responsibility.idempotency_key.startsWith("expense-approval:");
}

export function toExpenseSubmissionSummary(
  submission: ExpenseSubmissionRow,
  propertyById: ReadonlyMap<string, FinancePropertyRow>,
  unitById: ReadonlyMap<string, FinanceUnitRow>,
  sourceById: ReadonlyMap<string, string>,
  evidenceBySubmissionId: ReadonlyMap<
    string,
    NonNullable<ExpenseSubmissionSummary["evidence"]>
  >,
): ExpenseSubmissionSummary {
  const property = propertyById.get(submission.property_id);
  const unit = submission.unit_id
    ? unitById.get(submission.unit_id)
    : undefined;

  return {
    adjustsSubmissionId: submission.adjusts_submission_id,
    category: submission.customer_category,
    customerTotal: Number(submission.customer_total_amount),
    date: submission.expense_date,
    evidence: evidenceBySubmissionId.get(submission.id),
    fundingSourceLabel:
      (submission.reconciliation_source_id
        ? sourceById.get(submission.reconciliation_source_id)
        : null) ??
      (submission.source_type === "maintenance_task" &&
      submission.status === "submitted"
        ? "Choose at approval"
        : "Funding source unavailable"),
    id: submission.id,
    internalCost: Number(submission.internal_cost_amount),
    internalMarkup: Number(submission.internal_markup_amount),
    propertyId: submission.property_id,
    propertyLabel: property ? propertyLabel(property) : "Property unavailable",
    previouslyApproved:
      submission.previously_approved_amount === null
        ? null
        : Number(submission.previously_approved_amount),
    recordedTotal:
      submission.recorded_total_amount === null
        ? null
        : Number(submission.recorded_total_amount),
    reference: submission.reference,
    responsibility: submission.responsibility as "owner" | "tenant",
    reviewReason: submission.review_reason,
    reversalReason: submission.reversal_reason,
    sourceId: submission.source_id,
    sourceType: submission.source_type as "general" | "maintenance_task",
    status: submission.status as
      | "approved"
      | "rejected"
      | "reversed"
      | "submitted",
    submittedAt: submission.submitted_at,
    unitId: submission.unit_id,
    unitLabel:
      unit && property
        ? unitLabel(unit, property)
        : submission.unit_id
          ? "Unit unavailable"
          : "All units",
    vendorLabel: submission.vendor_label,
  };
}

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
    rentGenerationExceptionsResult,
    tenantLinesResult,
    ownerInvoicesResult,
    expenseSubmissionsResult,
    responsibilitiesResult,
    expensesResult,
    positionsResult,
    entriesResult,
    sourcesResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, code, name, archived_at")
      .eq("organization_id", organizationId)
      .order("code"),
    supabase
      .from("units")
      .select("id, property_id, unit_number, archived_at")
      .eq("organization_id", organizationId)
      .order("unit_number"),
    supabase
      .from("people")
      .select("id, display_name, archived_at")
      .eq("organization_id", organizationId)
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
      .in("status", ["active", "notice_given", "ended", "terminated"])
      .order("lease_start_date", { ascending: false }),
    supabase
      .from("lease_billing_terms")
      .select("*")
      .eq("organization_id", organizationId)
      .is("superseded_at", null),
    getTenantInvoiceBalanceRows(supabase, organizationId, propertyId),
    getUnresolvedRentGenerationExceptions(supabase, organizationId),
    supabase
      .from("tenant_invoice_line_balances")
      .select(
        "id, invoice_id, income_item_id, line_type, customer_label, amount, balance_due, sort_order",
      )
      .eq("organization_id", organizationId)
      .order("sort_order"),
    getOwnerInvoiceBalanceRows(supabase, organizationId, propertyId),
    getExpenseSubmissionRows(supabase, organizationId),
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
      .select("id, property_id, code, display_name, archived_at")
      .eq("organization_id", organizationId)
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
    rentGenerationExceptionsResult,
    tenantLinesResult,
    ownerInvoicesResult,
    expenseSubmissionsResult,
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

  const tenantInvoiceGenerationResult =
    await getTenantInvoiceGenerationRows(
      supabase,
      organizationId,
      (tenantInvoicesResult.data ?? []).flatMap((invoice) =>
        invoice.id ? [invoice.id] : [],
      ),
    );
  if (tenantInvoiceGenerationResult.error) {
    throw new Error(
      `Could not load tenant invoice generation metadata: ${tenantInvoiceGenerationResult.error.message}`,
    );
  }

  const properties = propertiesResult.data ?? [];
  const units = unitsResult.data ?? [];
  const people = peopleResult.data ?? [];
  const owners = ownersResult.data ?? [];
  const activePropertyIds = new Set(
    properties
      .filter((property) => property.archived_at === null)
      .map((property) => property.id),
  );
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
  const generationByInvoiceId = new Map(
    (tenantInvoiceGenerationResult.data ?? []).map((invoice) => [
      invoice.id,
      invoice,
    ]),
  );
  const linesByInvoiceId = new Map<string, TenantInvoiceLine[]>();

  for (const line of tenantLinesResult.data ?? []) {
    if (
      !line.invoice_id ||
      !line.id ||
      !line.customer_label ||
      !line.line_type
    ) {
      continue;
    }
    const invoiceLines = linesByInvoiceId.get(line.invoice_id) ?? [];
    invoiceLines.push({
      amount: Number(line.amount),
      balanceDue: Number(line.balance_due ?? 0),
      id: line.id,
      label: line.customer_label,
      lineType: line.line_type,
    });
    linesByInvoiceId.set(line.invoice_id, invoiceLines);
  }

  const expenseById = new Map(
    (expensesResult.data ?? []).map((expense) => [expense.id, expense]),
  );
  const sourceById = new Map(
    (sourcesResult.data ?? []).map((source) => [
      source.id,
      `${source.code} · ${source.display_name}`,
    ]),
  );
  const evidenceResult = await getExpenseEvidenceRows(
    supabase,
    organizationId,
    (expenseSubmissionsResult.data ?? []).map((submission) => submission.id),
  );
  if (evidenceResult.error) {
    throw new Error(
      `Could not load finance expense evidence: ${evidenceResult.error.message}`,
    );
  }

  const evidenceRows = evidenceResult.data ?? [];
  const evidencePaths = [...new Set(evidenceRows.map((row) => row.storage_path))];
  const signedEvidence =
    evidencePaths.length > 0
      ? await supabase.storage
          .from("nestory-documents")
          .createSignedUrls(evidencePaths, 60 * 15)
      : { data: [] };
  const signedUrlByPath = new Map(
    evidencePaths.flatMap((path, index) => {
      const href = signedEvidence.data?.[index]?.signedUrl;
      return href ? [[path, href] as const] : [];
    }),
  );
  const evidenceBySubmissionId = new Map(
    evidenceRows.map((row) => [
      row.submission_id,
      {
        documentId: row.document_id,
        fileName: row.file_name,
        href: signedUrlByPath.get(row.storage_path),
        mimeType: row.mime_type,
        sizeBytes: Number(row.size_bytes),
      },
    ]),
  );
  return {
    accountEntries: (entriesResult.data ?? []).flatMap((row) =>
      toAccountEntry(row as AccountEntryRow),
    ),
    expenseSubmissions: (expenseSubmissionsResult.data ?? []).map(
      (submission) =>
        toExpenseSubmissionSummary(
          submission,
          propertyById,
          unitById,
          sourceById,
          evidenceBySubmissionId,
        ),
    ),
    expenses: (responsibilitiesResult.data ?? []).flatMap((responsibility) => {
      if (isWorkflowOwnedResponsibility(responsibility)) return [];
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
    peopleOptions: people
      .filter((person) => person.archived_at === null)
      .map((person) => ({
        id: person.id,
        label: person.display_name,
      })),
    positions: (positionsResult.data ?? []).flatMap((row) =>
      toPosition(row as PositionRow, personById),
    ),
    propertyOptions: properties
      .filter((property) => property.archived_at === null)
      .map((property) => ({
        id: property.id,
        label: propertyLabel(property),
      })),
    reconciliationSources: (sourcesResult.data ?? [])
      .filter((source) => source.archived_at === null)
      .map((source) => ({
        id: source.id,
        label: `${source.code} · ${source.display_name}`,
        propertyId: source.property_id,
      })),
    rentGenerationExceptions: (rentGenerationExceptionsResult.data ?? []).map(
      (exception) => ({
        attemptCount: exception.attempt_count,
        billingPeriodStart: exception.billing_period_start,
        code: exception.error_code,
        id: exception.id,
        lastAttemptAt: exception.last_attempt_at,
        leaseId: exception.lease_id,
        message: exception.safe_message,
        propertyId: exception.property_id,
      } satisfies RentGenerationException),
    ),
    tenantInvoices: (tenantInvoicesResult.data ?? []).flatMap((row) =>
      toTenantInvoice(
        row as TenantInvoiceBalanceRow,
        propertyById,
        unitById,
        linesByInvoiceId,
        generationByInvoiceId,
      ),
    ),
    unitOptions: units.flatMap((unit) => {
      const property = propertyById.get(unit.property_id);
      if (
        unit.archived_at !== null ||
        !property ||
        !activePropertyIds.has(unit.property_id)
      ) {
        return [];
      }
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

async function getUnresolvedRentGenerationExceptions(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
): Promise<DataPageResult<RentGenerationExceptionRow>> {
  return fetchAllActionableRows(async (from, to) => {
    const { data, error } = await supabase
      .from("rent_generation_exceptions")
      .select("*")
      .eq("organization_id", organizationId)
      .is("resolved_at", null)
      .order("last_attempt_at", { ascending: false })
      .order("id")
      .range(from, to);
    return { data, error };
  });
}

async function getTenantInvoiceBalanceRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  propertyId?: string | null,
): Promise<DataPageResult<TenantInvoiceBalanceRow>> {
  const [actionableResult, historyResult] = await Promise.all([
    fetchAllActionableRows<TenantInvoiceBalanceRow>(async (from, to) => {
      let query = supabase
        .from("tenant_invoice_balances")
        .select("*")
        .eq("organization_id", organizationId)
        .gt("balance_due", 0)
        .order("due_date", { ascending: false })
        .order("id")
        .range(from, to);

      if (propertyId) query = query.eq("property_id", propertyId);
      return query;
    }),
    (() => {
      let query = supabase
        .from("tenant_invoice_balances")
        .select("*")
        .eq("organization_id", organizationId)
        .order("due_date", { ascending: false })
        .order("id")
        .limit(250);

      if (propertyId) query = query.eq("property_id", propertyId);
      return query;
    })(),
  ]);

  if (actionableResult.error) return actionableResult;
  if (historyResult.error) {
    return { data: null, error: historyResult.error };
  }

  return {
    data: mergeRowsById(
      actionableResult.data ?? [],
      historyResult.data ?? [],
    ).sort((left, right) =>
      (right.due_date ?? "").localeCompare(left.due_date ?? ""),
    ),
    error: null,
  };
}

async function getTenantInvoiceGenerationRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  invoiceIds: string[],
): Promise<DataPageResult<TenantInvoiceGenerationRow>> {
  const rows: TenantInvoiceGenerationRow[] = [];

  for (let from = 0; from < invoiceIds.length; from += 100) {
    const result = await supabase
      .from("tenant_invoices")
      .select("id, billing_period_start, generation_source, is_prorated")
      .eq("organization_id", organizationId)
      .in("id", invoiceIds.slice(from, from + 100));

    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
  }

  return { data: rows, error: null };
}

async function getOwnerInvoiceBalanceRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  propertyId?: string | null,
): Promise<DataPageResult<OwnerInvoiceBalanceRow>> {
  const [actionableResult, historyResult] = await Promise.all([
    fetchAllActionableRows<OwnerInvoiceBalanceRow>(async (from, to) => {
      let query = supabase
        .from("owner_invoice_balances")
        .select("*")
        .eq("organization_id", organizationId)
        .gt("balance_due", 0)
        .order("due_date", { ascending: false })
        .order("id")
        .range(from, to);

      if (propertyId) query = query.eq("property_id", propertyId);
      return query;
    }),
    (() => {
      let query = supabase
        .from("owner_invoice_balances")
        .select("*")
        .eq("organization_id", organizationId)
        .order("due_date", { ascending: false })
        .order("id")
        .limit(250);

      if (propertyId) query = query.eq("property_id", propertyId);
      return query;
    })(),
  ]);

  if (actionableResult.error) return actionableResult;
  if (historyResult.error) {
    return { data: null, error: historyResult.error };
  }

  return {
    data: mergeRowsById(
      actionableResult.data ?? [],
      historyResult.data ?? [],
    ).sort((left, right) =>
      (right.due_date ?? "").localeCompare(left.due_date ?? ""),
    ),
    error: null,
  };
}

async function getExpenseSubmissionRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
): Promise<DataPageResult<ExpenseSubmissionRow>> {
  const pending = await fetchAllActionableRows(async (from, to) => {
    const { data, error } = await supabase
      .from("expense_submissions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .order("id")
      .range(from, to);
    return { data, error };
  });
  if (pending.error) return pending;

  const history = await supabase
    .from("expense_submissions")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .order("id")
    .limit(250);

  return {
    data: [...(pending.data ?? []), ...(history.data ?? [])],
    error: history.error,
  };
}

async function getExpenseEvidenceRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  submissionIds: string[],
): Promise<DataPageResult<ExpenseEvidenceRow>> {
  const rows: ExpenseEvidenceRow[] = [];

  for (let index = 0; index < submissionIds.length; index += 500) {
    const { data, error } = await supabase.rpc(
      "get_expense_submission_evidence",
      {
        p_organization_id: organizationId,
        p_submission_ids: submissionIds.slice(index, index + 500),
      },
    );
    if (error) return { data: null, error };
    rows.push(...((data ?? []) as ExpenseEvidenceRow[]));
  }

  return { data: rows, error: null };
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
  generationByInvoiceId: Map<
    string,
    {
      billing_period_start: string;
      generation_source: string | null;
      id: string;
      is_prorated: boolean | null;
    }
  >,
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
  const generation = generationByInvoiceId.get(row.id);
  return [
    {
      balanceDue: Number(row.balance_due ?? 0),
      billingPeriodStart:
        generation?.billing_period_start ??
        row.billing_period_start ??
        row.issue_date,
      collectedByOwner: Number(row.collected_by_owner ?? 0),
      collectionRoute: row.collection_route as
        "direct_to_owner" | "through_ips",
      dueDate: row.due_date,
      generationSource: isRentGenerationSource(
        generation?.generation_source,
      )
        ? generation.generation_source
        : null,
      id: row.id,
      invoiceNumber: row.invoice_number,
      isProrated: generation?.is_prorated ?? null,
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

function isRentGenerationSource(
  value: string | null | undefined,
): value is NonNullable<TenantInvoiceSummary["generationSource"]> {
  return (
    value === "activation_catch_up" ||
    value === "manual_recovery" ||
    value === "scheduled"
  );
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

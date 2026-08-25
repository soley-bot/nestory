import { createSupabaseServerClient } from "@/lib/db/server";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { selectCurrentLeaseBillingRulesByLeaseId } from "@/features/leases/lease-billing-rule-state";
import {
  formatPropertyOptionLabel,
  formatUnitOptionLabel,
} from "@/lib/entity-option-labels";
import type { Database } from "@/types/database";
import type {
  ExpenseSubmissionSummary,
  CommercialDocumentLink,
  FinanceCategory,
  FinanceLease,
  FinanceOperationsData,
  FinanceOption,
  LeasePaymentResolutionData,
  LeaseBillingSummary,
  OwnerInvoiceSummary,
  PropertyAccountEntry,
  PropertyFinancePosition,
  RentGenerationException,
  TenantInvoiceLine,
  TenantInvoicePublicationSnapshot,
  TenantInvoiceSettlement,
  TenantInvoiceSummary,
} from "@/features/finance-operations/finance-operations.types";
import { sortPropertyAccountEntriesNewestFirst } from "@/features/finance-operations/property-account";

type TenantInvoiceBalanceRow =
  Database["public"]["Views"]["tenant_invoice_balances"]["Row"];
type TenantInvoiceGenerationRow = Pick<
  Database["public"]["Tables"]["tenant_invoices"]["Row"],
  "billing_period_start" | "generation_source" | "id" | "is_prorated"
>;
type TenantInvoiceLineBalanceRow = Pick<
  Database["public"]["Views"]["tenant_invoice_line_balances"]["Row"],
  | "amount"
  | "balance_due"
  | "customer_label"
  | "id"
  | "income_item_id"
  | "invoice_id"
  | "line_type"
  | "sort_order"
>;
type OwnerInvoiceBalanceRow =
  Database["public"]["Views"]["owner_invoice_balances"]["Row"];
type PositionRow =
  Database["public"]["Views"]["property_finance_positions"]["Row"];
type AccountEntryRow =
  Database["public"]["Views"]["property_account_entries"]["Row"];
type ExpenseSubmissionRow =
  Database["public"]["Tables"]["expense_submissions"]["Row"];
type LeaseBillingTermRow =
  Database["public"]["Tables"]["lease_billing_terms"]["Row"];
type MaintenanceTaskRow = Pick<
  Database["public"]["Tables"]["tasks"]["Row"],
  "completed_at" | "description" | "id" | "status" | "title"
>;
type InvoiceSettlementRow = {
  amount: number;
  date: string;
  id: string;
  invoiceId: string;
  reference: string | null;
  reversalOfId: string | null;
  reversalReason: string | null;
  route: TenantInvoiceSettlement["route"];
};
type CommercialDocumentArtifactRow = Pick<
  Database["public"]["Tables"]["tenant_commercial_document_artifacts"]["Row"],
  | "document_number"
  | "id"
  | "organization_id"
  | "publication_status"
  | "presentation_snapshot"
  | "published_at"
  | "source_id"
  | "source_kind"
>;
type CommercialDocumentLinks = {
  invoices: Map<string, CommercialDocumentLink>;
  invoicePublicationSnapshots: Map<
    string,
    TenantInvoicePublicationSnapshot | null
  >;
  receiptNumbers: Map<string, string>;
  receipts: Map<string, CommercialDocumentLink>;
};
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
  content_sha256: string;
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

type FinanceServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type LeasePaymentResolutionInput = {
  invoiceId: string;
  leaseId: string;
  organizationId: string;
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

export async function fetchRowsByIdBatches<T>(
  ids: readonly string[],
  fetchPage: (
    batchIds: readonly string[],
    from: number,
    to: number,
  ) => Promise<DataPageResult<T>>,
  batchSize = 100,
  pageSize = 500,
): Promise<DataPageResult<T>> {
  const rows: T[] = [];
  const uniqueIds = [...new Set(ids)];

  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    const batchIds = uniqueIds.slice(index, index + batchSize);
    const result = await fetchAllActionableRows(
      (from, to) => fetchPage(batchIds, from, to),
      pageSize,
    );
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
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

export function toExpenseSubmissionSummary(
  submission: ExpenseSubmissionRow,
  propertyById: ReadonlyMap<string, FinancePropertyRow>,
  unitById: ReadonlyMap<string, FinanceUnitRow>,
  sourceById: ReadonlyMap<string, string>,
  evidenceBySubmissionId: ReadonlyMap<
    string,
    NonNullable<ExpenseSubmissionSummary["evidence"]>
  >,
  maintenanceTaskById: ReadonlyMap<string, MaintenanceTaskRow> = new Map(),
  submitterLabelByUserId: ReadonlyMap<string, string> = new Map(),
  financeCategories: readonly FinanceCategory[] = [],
): ExpenseSubmissionSummary {
  const property = propertyById.get(submission.property_id);
  const unit = submission.unit_id
    ? unitById.get(submission.unit_id)
    : undefined;
  const maintenanceTask =
    submission.source_type === "maintenance_task" && submission.source_id
      ? maintenanceTaskById.get(submission.source_id)
      : undefined;
  const categoryNamespace =
    submission.responsibility === "tenant"
      ? "tenant_billing"
      : "owner_expense";
  const financeCategory = financeCategories.find(
    (category) =>
      category.namespace === categoryNamespace &&
      category.code === submission.customer_category,
  );

  return {
    adjustsSubmissionId: submission.adjusts_submission_id,
    category: submission.customer_category,
    categoryLabel: financeCategory?.displayLabel ?? null,
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
    maintenanceTask: maintenanceTask
      ? {
          completedAt: maintenanceTask.completed_at,
          description: maintenanceTask.description,
          href: `/maintenance?archiveState=all&taskId=${maintenanceTask.id}`,
          status: maintenanceTask.status,
          title: maintenanceTask.title,
        }
      : undefined,
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
    reviewedAt: submission.reviewed_at,
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
    submittedByLabel:
      submitterLabelByUserId.get(submission.submitted_by) ?? "Workspace member",
    submittedByUserId: submission.submitted_by,
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
    organizationResult,
    propertiesResult,
    unitsResult,
    peopleResult,
    ownersResult,
    leasesResult,
    billingResult,
    tenantInvoicesResult,
    rentGenerationExceptionsResult,
    ownerInvoicesResult,
    expenseSubmissionsResult,
    positionsResult,
    entriesResult,
    sourcesResult,
    financeCategoriesResult,
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("operational_timezone")
      .eq("id", organizationId)
      .single(),
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
      .select("id, display_name, party_type, archived_at")
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
      .from("current_leases")
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
      .eq("organization_id", organizationId),
    getTenantInvoiceBalanceRows(supabase, organizationId, propertyId),
    getUnresolvedRentGenerationExceptions(supabase, organizationId),
    getOwnerInvoiceBalanceRows(supabase, organizationId, propertyId),
    getExpenseSubmissionRows(supabase, organizationId),
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
    supabase
      .from("finance_categories")
      .select(
        "id, namespace, code, display_label, reporting_group, sort_order, is_default, is_active, archived_at",
      )
      .eq("organization_id", organizationId)
      .order("namespace")
      .order("sort_order")
      .order("display_label"),
  ]);

  const results = [
    organizationResult,
    propertiesResult,
    unitsResult,
    peopleResult,
    ownersResult,
    leasesResult,
    billingResult,
    tenantInvoicesResult,
    rentGenerationExceptionsResult,
    ownerInvoicesResult,
    expenseSubmissionsResult,
    positionsResult,
    entriesResult,
    sourcesResult,
    financeCategoriesResult,
  ];
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new Error(
      `Could not load finance operations: ${failed.error.message}`,
    );
  }

  const tenantInvoiceIds = (tenantInvoicesResult.data ?? []).flatMap(
    (invoice) => (invoice.id ? [invoice.id] : []),
  );
  const tenantLinesResult = await getTenantInvoiceLineRows(
    supabase,
    organizationId,
    tenantInvoiceIds,
  );
  if (tenantLinesResult.error) {
    throw new Error(
      `Could not load tenant invoice lines: ${tenantLinesResult.error.message}`,
    );
  }

  const tenantInvoiceGenerationResult =
    await getTenantInvoiceGenerationRows(
      supabase,
      organizationId,
      tenantInvoiceIds,
    );
  if (tenantInvoiceGenerationResult.error) {
    throw new Error(
      `Could not load tenant invoice generation metadata: ${tenantInvoiceGenerationResult.error.message}`,
    );
  }

  const tenantInvoiceSettlementResult = await getTenantInvoiceSettlementRows(
    supabase,
    organizationId,
    tenantInvoiceIds,
  );
  if (tenantInvoiceSettlementResult.error) {
    throw new Error(
      `Could not load tenant invoice settlements: ${tenantInvoiceSettlementResult.error.message}`,
    );
  }

  const ipsPaymentIds = (tenantInvoiceSettlementResult.data ?? []).flatMap(
    (settlement) =>
      settlement.route === "through_ips" && !settlement.reversalOfId
        ? [settlement.id]
        : [],
  );
  const commercialDocuments = await loadCommercialDocumentLinks(
    supabase,
    organizationId,
    tenantInvoiceIds,
    ipsPaymentIds,
  );

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
  const operationalTimezone =
    organizationResult.data?.operational_timezone || "UTC";
  const billingClock = new Date();
  const billingByLeaseId = new Map<string, LeaseBillingSummary>();
  for (const [leaseId, billing] of selectCurrentFinanceLeaseBillingRulesByLeaseId(
    billingResult.data ?? [],
    billingClock,
  )) {
    billingByLeaseId.set(leaseId, toBilling(billing));
  }
  const billingRuleIdByLeaseId =
    selectCurrentFinanceLeaseBillingRuleIdsByLeaseId(
      billingResult.data ?? [],
      billingClock,
    );
  const generationByInvoiceId = new Map(
    (tenantInvoiceGenerationResult.data ?? []).map((invoice) => [
      invoice.id,
      invoice,
    ]),
  );
  const settlementsByInvoiceId = buildSettlementsByInvoiceId(
    tenantInvoiceSettlementResult.data ?? [],
    commercialDocuments,
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
  const maintenanceTaskIds = (expenseSubmissionsResult.data ?? []).flatMap(
    (submission) =>
      submission.source_type === "maintenance_task" && submission.source_id
        ? [submission.source_id]
        : [],
  );
  const maintenanceTaskResult =
    maintenanceTaskIds.length > 0
      ? await supabase
          .from("tasks")
          .select("id, title, description, status, completed_at")
          .eq("organization_id", organizationId)
          .in("id", [...new Set(maintenanceTaskIds)])
      : { data: [] as MaintenanceTaskRow[], error: null };
  if (maintenanceTaskResult.error) {
    throw new Error(
      `Could not load maintenance review context: ${maintenanceTaskResult.error.message}`,
    );
  }
  const maintenanceTaskById = new Map(
    (maintenanceTaskResult.data ?? []).map((task) => [task.id, task]),
  );
  const submitterIds = [
    ...new Set(
      (expenseSubmissionsResult.data ?? []).map(
        (submission) => submission.submitted_by,
      ),
    ),
  ];
  const submitterLabelsResult =
    submitterIds.length > 0
      ? await supabase.rpc("get_finance_submission_actor_labels", {
          p_organization_id: organizationId,
          p_user_ids: submitterIds,
        })
      : { data: [], error: null };
  if (submitterLabelsResult.error) {
    throw new Error(
      `Could not load finance submission actor labels: ${submitterLabelsResult.error.message}`,
    );
  }
  const submitterLabelByUserId = new Map(
    (submitterLabelsResult.data ?? []).map((actor) => [
      actor.user_id,
      actor.label,
    ]),
  );

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
        sha256: row.content_sha256,
        sizeBytes: Number(row.size_bytes),
      },
    ]),
  );
  const financeCategories = (financeCategoriesResult.data ?? []).map(
    (category) =>
      ({
        archivedAt: category.archived_at,
        code: category.code,
        displayLabel: category.display_label,
        id: category.id,
        isActive: category.is_active ?? category.archived_at === null,
        isDefault: category.is_default,
        namespace: category.namespace as FinanceCategory["namespace"],
        reportingGroup: category.reporting_group,
        sortOrder: category.sort_order,
      }) satisfies FinanceCategory,
  );
  return {
    accountEntries: sortPropertyAccountEntriesNewestFirst(
      (entriesResult.data ?? []).flatMap((row) =>
        toAccountEntry(row as AccountEntryRow),
      ),
    ),
    expenseSubmissions: (expenseSubmissionsResult.data ?? []).map(
      (submission) =>
        toExpenseSubmissionSummary(
          submission,
          propertyById,
          unitById,
          sourceById,
          evidenceBySubmissionId,
          maintenanceTaskById,
          submitterLabelByUserId,
          financeCategories,
        ),
    ),
    financeCategories,
    leases: (leasesResult.data ?? []).flatMap((lease) => {
      const property = propertyById.get(lease.property_id);
      if (!property) return [];
      const unit = lease.unit_id ? unitById.get(lease.unit_id) : null;
      const ownerPersonId = ownerByPropertyId.get(lease.property_id) ?? null;
      return [
        {
          billing: billingByLeaseId.get(lease.id) ?? null,
          endDate: lease.lease_end_date,
          expectedCurrentBillingRuleId:
            billingRuleIdByLeaseId.get(lease.id) ?? null,
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
    operationalTimezone,
    peopleOptions: people
      .filter((person) => person.archived_at === null)
      .map((person) => ({
        id: person.id,
        label: person.display_name,
        partyType: person.party_type,
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
        settlementsByInvoiceId,
        commercialDocuments.invoices,
        commercialDocuments.invoicePublicationSnapshots,
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

export async function getLeasePaymentResolutionData(
  input: LeasePaymentResolutionInput,
): Promise<LeasePaymentResolutionData | null> {
  return loadLeasePaymentResolutionData(
    await createSupabaseServerClient(),
    input,
  );
}

export async function loadLeasePaymentResolutionData(
  supabase: FinanceServerClient,
  { invoiceId, leaseId, organizationId }: LeasePaymentResolutionInput,
): Promise<LeasePaymentResolutionData | null> {
  const selectedResult = await supabase
    .from("tenant_invoice_balances")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("lease_id", leaseId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (selectedResult.error) {
    throw new Error(
      `Could not load Lease payment resolution: ${selectedResult.error.message}`,
    );
  }
  if (!selectedResult.data) return null;

  const row = selectedResult.data as TenantInvoiceBalanceRow;
  if (
    row.id !== invoiceId ||
    !row.property_id ||
    row.organization_id !== organizationId ||
    row.lease_id !== leaseId
  ) {
    return null;
  }

  const [
    propertyResult,
    unitResult,
    linesResult,
    generationResult,
    settlementsResult,
    sourcesResult,
    nextInvoiceResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, code, name")
      .eq("organization_id", organizationId)
      .eq("id", row.property_id)
      .maybeSingle(),
    row.unit_id
      ? supabase
          .from("units")
          .select("id, property_id, unit_number")
          .eq("organization_id", organizationId)
          .eq("property_id", row.property_id)
          .eq("id", row.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    getTenantInvoiceLineRows(supabase, organizationId, [invoiceId]),
    getTenantInvoiceGenerationRows(supabase, organizationId, [invoiceId]),
    getTenantInvoiceSettlementRows(supabase, organizationId, [invoiceId]),
    supabase
      .from("financial_reconciliation_sources")
      .select("id, property_id, code, display_name, archived_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .or(`property_id.is.null,property_id.eq.${row.property_id}`)
      .order("code"),
    supabase
      .from("tenant_invoice_balances")
      .select("id, due_date")
      .eq("organization_id", organizationId)
      .eq("lease_id", leaseId)
      .neq("id", invoiceId)
      .neq("payment_status", "voided")
      .gte("due_date", getBusinessDateValue())
      .order("due_date", { ascending: true })
      .limit(1),
  ]);

  const supportingError = [
    propertyResult,
    unitResult,
    linesResult,
    generationResult,
    settlementsResult,
    sourcesResult,
    nextInvoiceResult,
  ].find((result) => result.error)?.error;
  if (supportingError) {
    throw new Error(
      `Could not load Lease payment resolution: ${supportingError.message}`,
    );
  }

  const ipsPaymentIds = (settlementsResult.data ?? []).flatMap((settlement) =>
    settlement.route === "through_ips" && !settlement.reversalOfId
      ? [settlement.id]
      : [],
  );
  let commercialDocuments: CommercialDocumentLinks;
  try {
    commercialDocuments = await loadCommercialDocumentLinks(
      supabase,
      organizationId,
      [invoiceId],
      ipsPaymentIds,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Could not load Lease payment resolution: ${message}`);
  }

  const properties = new Map(
    propertyResult.data
      ? [[propertyResult.data.id, propertyResult.data] as const]
      : [],
  );
  const units = new Map(
    unitResult.data ? [[unitResult.data.id, unitResult.data] as const] : [],
  );
  const linesByInvoiceId = new Map<string, TenantInvoiceLine[]>();
  for (const line of linesResult.data ?? []) {
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
  const generationByInvoiceId = new Map(
    (generationResult.data ?? []).map((generation) => [
      generation.id,
      generation,
    ]),
  );
  const settlementsByInvoiceId = buildSettlementsByInvoiceId(
    settlementsResult.data ?? [],
    commercialDocuments,
  );
  const invoice = toTenantInvoice(
    row,
    properties,
    units,
    linesByInvoiceId,
    generationByInvoiceId,
    settlementsByInvoiceId,
    commercialDocuments.invoices,
    commercialDocuments.invoicePublicationSnapshots,
  )[0];
  if (!invoice) return null;

  return {
    invoice,
    nextInvoiceDueDate: nextInvoiceResult.data?.[0]?.due_date ?? null,
    reconciliationSources: (sourcesResult.data ?? []).map((source) => ({
      id: source.id,
      label: `${source.code} · ${source.display_name}`,
      propertyId: source.property_id,
    })),
  };
}

export function selectCurrentFinanceLeaseBillingRulesByLeaseId(
  rules: readonly LeaseBillingTermRow[],
  clock: Date,
) {
  return selectCurrentLeaseBillingRulesByLeaseId(
    rules.filter((rule) => rule.rule_source === "lease_default_v1"),
    clock,
  );
}

export function selectCurrentFinanceLeaseBillingRuleIdsByLeaseId(
  rules: readonly LeaseBillingTermRow[],
  clock: Date,
) {
  const leasesWithAuthoritativeRules = new Set(
    rules.flatMap((rule) =>
      rule.rule_source === "lease_default_v1" ? [rule.lease_id] : [],
    ),
  );
  const clockRules = rules.filter(
    (rule) =>
      rule.rule_source === "lease_default_v1" ||
      !leasesWithAuthoritativeRules.has(rule.lease_id),
  );

  return new Map(
    [...selectCurrentLeaseBillingRulesByLeaseId(clockRules, clock)].flatMap(
      ([leaseId, rule]) => (rule.id ? [[leaseId, rule.id] as const] : []),
    ),
  );
}

export function scopeFinanceOperationsData(
  data: FinanceOperationsData,
  scope: { propertyId: string; unitId?: string | null },
): FinanceOperationsData {
  const inScope = (propertyId: string, unitId?: string | null) =>
    propertyId === scope.propertyId &&
    (!scope.unitId || unitId === scope.unitId);

  return {
    accountEntries: data.accountEntries.filter(
      (entry) => entry.propertyId === scope.propertyId,
    ),
    expenseSubmissions: data.expenseSubmissions.filter((submission) =>
      inScope(submission.propertyId, submission.unitId),
    ),
    financeCategories: data.financeCategories,
    leases: data.leases.filter((lease) =>
      inScope(lease.propertyId, lease.unitId),
    ),
    ownerInvoices: data.ownerInvoices.filter(
      (invoice) => invoice.propertyId === scope.propertyId,
    ),
    operationalTimezone: data.operationalTimezone,
    peopleOptions: data.peopleOptions,
    positions: data.positions.filter(
      (position) => position.propertyId === scope.propertyId,
    ),
    propertyOptions: data.propertyOptions.filter(
      (property) => property.id === scope.propertyId,
    ),
    reconciliationSources: data.reconciliationSources.filter(
      (source) => !source.propertyId || source.propertyId === scope.propertyId,
    ),
    rentGenerationExceptions: data.rentGenerationExceptions.filter(
      (exception) => exception.propertyId === scope.propertyId &&
        (!scope.unitId || data.leases.some(
          (lease) => lease.id === exception.leaseId && lease.unitId === scope.unitId,
        )),
    ),
    tenantInvoices: data.tenantInvoices.filter((invoice) =>
      inScope(invoice.propertyId, invoice.unitId),
    ),
    unitOptions: data.unitOptions.filter(
      (unit) =>
        unit.propertyId === scope.propertyId &&
        (!scope.unitId || unit.id === scope.unitId),
    ),
  };
}

async function getTenantInvoiceSettlementRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  invoiceIds: string[],
): Promise<DataPageResult<InvoiceSettlementRow>> {
  const rows: InvoiceSettlementRow[] = [];

  for (let index = 0; index < invoiceIds.length; index += 100) {
    const invoiceIdBatch = invoiceIds.slice(index, index + 100);
    const [paymentsResult, confirmationsResult] = await Promise.all([
      supabase
        .from("tenant_invoice_payments")
        .select(
          "id, invoice_id, received_date, amount, reference, reversal_of_id, reversal_reason",
        )
        .eq("organization_id", organizationId)
        .in("invoice_id", invoiceIdBatch),
      supabase
        .from("owner_collection_confirmations")
        .select(
          "id, invoice_id, confirmed_date, amount, reference, reversal_of_id, reversal_reason",
        )
        .eq("organization_id", organizationId)
        .in("invoice_id", invoiceIdBatch),
    ]);

    if (paymentsResult.error) {
      return { data: null, error: paymentsResult.error };
    }
    if (confirmationsResult.error) {
      return { data: null, error: confirmationsResult.error };
    }

    rows.push(
      ...(paymentsResult.data ?? []).map((payment) => ({
        amount: Number(payment.amount),
        date: payment.received_date,
        id: payment.id,
        invoiceId: payment.invoice_id,
        reference: payment.reference,
        reversalOfId: payment.reversal_of_id,
        reversalReason: payment.reversal_reason,
        route: "through_ips" as const,
      })),
      ...(confirmationsResult.data ?? []).map((confirmation) => ({
        amount: Number(confirmation.amount),
        date: confirmation.confirmed_date,
        id: confirmation.id,
        invoiceId: confirmation.invoice_id,
        reference: confirmation.reference,
        reversalOfId: confirmation.reversal_of_id,
        reversalReason: confirmation.reversal_reason,
        route: "direct_to_owner" as const,
      })),
    );
  }

  return { data: rows, error: null };
}

export async function loadCommercialDocumentLinks(
  supabase: Pick<
    Awaited<ReturnType<typeof createSupabaseServerClient>>,
    "from"
  >,
  organizationId: string,
  invoiceIds: readonly string[],
  ipsPaymentIds: readonly string[],
): Promise<CommercialDocumentLinks> {
  const sourceIds = [...new Set([...invoiceIds, ...ipsPaymentIds])];
  if (sourceIds.length === 0) {
    return {
      invoices: new Map(),
      invoicePublicationSnapshots: new Map(),
      receiptNumbers: new Map(),
      receipts: new Map(),
    };
  }

  const result = await fetchRowsByIdBatches<CommercialDocumentArtifactRow>(
    sourceIds,
    async (batchIds, from, to) => {
      const { data, error } = await supabase
        .from("tenant_commercial_document_artifacts")
        .select(
          "id, organization_id, source_kind, source_id, document_number, publication_status, published_at, presentation_snapshot",
        )
        .eq("organization_id", organizationId)
        .in("source_id", [...batchIds])
        .order("source_id")
        .order("source_kind")
        .range(from, to);
      return { data, error };
    },
  );
  if (result.error) {
    throw new Error("Could not load commercial document status.");
  }
  return mapCommercialDocumentLinks(
    organizationId,
    result.data ?? [],
    invoiceIds,
    ipsPaymentIds,
  );
}

export function mapCommercialDocumentLinks(
  organizationId: string,
  rows: readonly CommercialDocumentArtifactRow[],
  invoiceIds: readonly string[],
  ipsPaymentIds: readonly string[],
): CommercialDocumentLinks {
  const invoiceIdSet = new Set(invoiceIds);
  const ipsPaymentIdSet = new Set(ipsPaymentIds);
  const invoices = new Map<string, CommercialDocumentLink>();
  const invoicePublicationSnapshots = new Map<
    string,
    TenantInvoicePublicationSnapshot | null
  >();
  const receiptNumbers = new Map<string, string>();
  const receipts = new Map<string, CommercialDocumentLink>();

  for (const invoiceId of invoiceIdSet) {
    invoices.set(invoiceId, notPublishedCommercialDocument());
    invoicePublicationSnapshots.set(invoiceId, null);
  }
  for (const paymentId of ipsPaymentIdSet) {
    receipts.set(paymentId, notPublishedCommercialDocument());
  }

  for (const row of rows) {
    if (row.organization_id !== organizationId) continue;
    const isInvoice = row.source_kind === "invoice" && invoiceIdSet.has(row.source_id);
    const isReceipt = row.source_kind === "receipt" && ipsPaymentIdSet.has(row.source_id);
    if (!isInvoice && !isReceipt) continue;

    const link = toCommercialDocumentLink(row);
    if (isInvoice) {
      invoices.set(row.source_id, link);
      invoicePublicationSnapshots.set(
        row.source_id,
        toTenantInvoicePublicationSnapshot(row),
      );
    } else {
      receipts.set(row.source_id, link);
      if (link.publicationStatus === "published") {
        receiptNumbers.set(row.source_id, row.document_number);
      }
    }
  }

  return { invoices, invoicePublicationSnapshots, receiptNumbers, receipts };
}

function notPublishedCommercialDocument(): CommercialDocumentLink {
  return {
    artifactId: null,
    href: null,
    publicationStatus: "not_published",
    publishedAt: null,
  };
}

function toCommercialDocumentLink(
  row: CommercialDocumentArtifactRow,
): CommercialDocumentLink {
  const published = row.publication_status === "published";
  return {
    artifactId: row.id,
    href: published ? `/api/finance/documents/${row.id}` : null,
    publicationStatus: published ? "published" : "failed",
    publishedAt: published ? row.published_at : null,
  };
}

function toTenantInvoicePublicationSnapshot(
  row: CommercialDocumentArtifactRow,
): TenantInvoicePublicationSnapshot | null {
  if (row.publication_status !== "published") return null;
  const snapshot = row.presentation_snapshot;
  if (!isRecord(snapshot)) return null;
  const paymentInstructions = snapshot.paymentInstructions;
  const issuer = snapshot.issuer;
  if (typeof paymentInstructions !== "string" || !isRecord(issuer)) return null;

  const contactEmail = nullableString(issuer.contactEmail);
  const contactPhone = nullableString(issuer.contactPhone);
  const note = nullableString(snapshot.note);
  if (contactEmail === undefined || contactPhone === undefined || note === undefined) {
    return null;
  }

  return { contactEmail, contactPhone, note, paymentInstructions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : undefined;
}

export function buildSettlementsByInvoiceId(
  rows: InvoiceSettlementRow[],
  commercialDocuments: CommercialDocumentLinks,
): Map<string, TenantInvoiceSettlement[]> {
  const reversalByOriginalId = new Map(
    rows.flatMap((row) =>
      row.reversalOfId ? ([[row.reversalOfId, row]] as const) : [],
    ),
  );
  const settlementsByInvoiceId = new Map<string, TenantInvoiceSettlement[]>();

  for (const row of rows) {
    if (row.reversalOfId) continue;
    const reversal = reversalByOriginalId.get(row.id);
    const settlements = settlementsByInvoiceId.get(row.invoiceId) ?? [];
    settlements.push({
      amount: row.amount,
      date: row.date,
      id: row.id,
      isReversed: Boolean(reversal),
      reference: row.reference,
      reversalReason: reversal?.reversalReason ?? null,
      receipt:
        row.route === "through_ips"
          ? (commercialDocuments.receipts.get(row.id) ??
            notPublishedCommercialDocument())
          : null,
      receiptNumber:
        row.route === "through_ips"
          ? (commercialDocuments.receiptNumbers.get(row.id) ?? null)
          : null,
      route: row.route,
    });
    settlementsByInvoiceId.set(row.invoiceId, settlements);
  }

  for (const settlements of settlementsByInvoiceId.values()) {
    settlements.sort((left, right) => right.date.localeCompare(left.date));
  }

  return settlementsByInvoiceId;
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

async function getTenantInvoiceLineRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  invoiceIds: readonly string[],
): Promise<DataPageResult<TenantInvoiceLineBalanceRow>> {
  return fetchRowsByIdBatches(invoiceIds, async (batchIds, from, to) => {
    const { data, error } = await supabase
      .from("tenant_invoice_line_balances")
      .select(
        "id, invoice_id, income_item_id, line_type, customer_label, amount, balance_due, sort_order",
      )
      .eq("organization_id", organizationId)
      .in("invoice_id", [...batchIds])
      .order("invoice_id")
      .order("sort_order")
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
      "get_paid_cost_submission_evidence",
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
  return query
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("source_type", { ascending: false })
    .order("source_id", { ascending: false })
    .limit(300);
}

function toBilling(
  row: Database["public"]["Tables"]["lease_billing_terms"]["Row"],
): LeaseBillingSummary {
  return {
    billingRecipientKind: row.billing_recipient_kind as
      | "company"
      | "individual"
      | null,
    billingRecipientPersonId: row.billing_recipient_person_id,
    chargeManagementFeeWhenActive: row.charge_management_fee_when_active,
    chargeThroughLeaseEnd: row.charge_through_lease_end,
    collectionRoute: row.collection_route as
      | "direct_to_owner"
      | "through_ips"
      | null,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
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
    leaseEndProrationRule: row.lease_end_proration_rule as "actual_days" | null,
    leaseStartProrationRule: row.lease_start_proration_rule as
      | "actual_days"
      | null,
    managementFeeMode: row.management_fee_mode as
      | "flat"
      | "percentage"
      | null,
    managementFeeValue:
      row.management_fee_value === null
        ? null
        : Number(row.management_fee_value),
    midPeriodRentChangeRule: row.mid_period_rent_change_rule as
      | "next_full_month"
      | null,
    rentCalculationTimezone: row.rent_calculation_timezone,
    shortMonthDueDayRule: row.short_month_due_day_rule as
      | "last_calendar_day"
      | null,
  };
}

export function toTenantInvoice(
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
  settlementsByInvoiceId: Map<string, TenantInvoiceSettlement[]>,
  commercialDocumentsByInvoiceId: Map<string, CommercialDocumentLink>,
  publicationSnapshotsByInvoiceId: Map<
    string,
    TenantInvoicePublicationSnapshot | null
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
      pdf:
        commercialDocumentsByInvoiceId.get(row.id) ??
        notPublishedCommercialDocument(),
      publicationSnapshot: publicationSnapshotsByInvoiceId.get(row.id) ?? null,
      propertyId: row.property_id,
      propertyLabel: propertyLabel(property),
      recipientLabel: row.recipient_label ?? "Unknown",
      settlements: settlementsByInvoiceId.get(row.id) ?? [],
      totalAmount: Number(row.total_amount ?? 0),
      unitId: row.unit_id,
      unitLabel: unit ? unitLabel(unit, property) : "No unit",
    },
  ];
}

export function isRentGenerationSource(
  value: string | null | undefined,
): value is NonNullable<TenantInvoiceSummary["generationSource"]> {
  return (
    value === "activation_catch_up" ||
    value === "lease_rules_v1" ||
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
    !row.created_at ||
    !row.category ||
    !row.label ||
    !row.source_type
  )
    return [];
  return [
    {
      amount: Number(row.amount ?? 0),
      category: row.category,
      createdAt: row.created_at,
      date: row.event_date,
      id: row.source_id,
      label: row.label,
      note: row.note,
      propertyId: row.property_id,
      runningBalance: Number(row.running_balance ?? 0),
      sourceType: row.source_type,
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

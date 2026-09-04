import "server-only";

import { iteratePropertyCashEvents } from "@/features/finance/data/property-cash-events";
import type {
  PropertyCashEvent,
  PropertyCashEventsRpcClient,
} from "@/features/finance/data/property-cash-events.types";
import { iterateOwnerProfitLossEvents } from "@/features/reports/data/owner-profit-loss-events";
import type {
  OwnerProfitLossEvent,
  OwnerProfitLossEventsRpcClient,
} from "@/features/reports/data/owner-profit-loss-events.types";
import { createSupabaseServerClient } from "@/lib/db/server";

export type FinanceAccountActivityFilters = {
  periodEnd: string;
  periodStart: string;
  propertyId?: string;
};

export type FinanceAccountActivity = {
  account: {
    accountClass: string;
    accountNumber: string | null;
    accountSubtype: string;
    archivedAt: string | null;
    description: string | null;
    displayName: string;
    id: string;
    propertyId: string | null;
    propertyLabel: string | null;
  };
  basisLabel: string;
  filters: FinanceAccountActivityFilters;
  properties: { id: string; label: string }[];
  rows: FinanceAccountActivityRow[];
  runningBalance: string | null;
  total: string;
};

export type FinanceAccountActivityRow = {
  contact: string | null;
  date: string;
  decrease: string | null;
  description: string;
  id: string;
  increase: string | null;
  propertyId: string;
  propertyLabel: string;
  runningBalance: string | null;
  sourceHref: string;
};

type AccountRow = {
  account_class: string;
  account_number: string | null;
  account_subtype: string;
  archived_at: string | null;
  description: string | null;
  display_name: string;
  id: string;
  property_id: string | null;
  system_role: string | null;
  use_for_lease_deposits: boolean;
};

type AuthorityRow = {
  authority_id: string;
  authority_kind: "category" | "event" | "role" | "source" | "system_role";
  event_key: string | null;
  event_matches: boolean;
  valid_from: string;
  valid_to: string | null;
};

type OwnerAssignmentRow = {
  ended_on: string | null;
  person_id: string;
  property_id: string;
  started_on: string;
};

type OwnerSourceRow = {
  allocated_gross_signed_amount: string;
  allocation_set_id: string;
  event_date: string;
  reversal_of_allocation_set_id: string | null;
  source_id: string;
  source_line_id: string;
  source_type: string;
};

export async function getFinanceAccountActivity(
  organizationId: string,
  accountId: string,
  filters: FinanceAccountActivityFilters,
): Promise<FinanceAccountActivity | null> {
  validateFilters(filters);
  const client = await createSupabaseServerClient();
  const accountResult = await client.from("finance_accounts").select(
    "id, account_class, account_number, account_subtype, archived_at, description, display_name, property_id, system_role, use_for_lease_deposits",
  ).eq("organization_id", organizationId).eq("id", accountId).maybeSingle();
  assertRead("account", accountResult.error);
  if (!accountResult.data) return null;
  const account = accountResult.data as AccountRow;

  const rpcClient = client as unknown as {
    rpc?: (name: string, args: Record<string, unknown>) => PromiseLike<{
      data: AuthorityRow[] | null; error: { message: string } | null;
    }>;
  };
  let authorityRows: AuthorityRow[] = [];
  let authorityContractLoaded = false;
  if (rpcClient.rpc) {
    const authorityResult = await rpcClient.rpc("get_finance_account_activity_authorities", {
      p_account_id: accountId,
      p_organization_id: organizationId,
      p_period_end: filters.periodEnd,
      p_period_start: filters.periodStart,
      p_property_id: filters.propertyId ?? null,
    });
    assertRead("authority", authorityResult.error);
    authorityRows = authorityResult.data ?? [];
    authorityContractLoaded = true;
  }

  const [propertiesResult, sourceLinksResult, categoryLinksResult] = await Promise.all([
    client.from("properties").select("id, code, name, archived_at")
      .eq("organization_id", organizationId).order("code").order("name"),
    client.from("finance_account_source_links").select("source_id")
      .eq("organization_id", organizationId).eq("account_id", accountId),
    client.from("finance_account_category_links").select("category_id")
      .eq("organization_id", organizationId).eq("account_id", accountId),
  ]);
  assertRead("properties", propertiesResult.error);
  assertRead("source mappings", sourceLinksResult.error);
  assertRead("category mappings", categoryLinksResult.error);

  const propertyRows = (propertiesResult.data ?? []) as Array<{
    archived_at: string | null; code: string; id: string; name: string;
  }>;
  const readablePropertyIds = new Set(propertyRows.map(({ id }) => id));
  if (filters.propertyId && !readablePropertyIds.has(filters.propertyId)) return null;
  const scopedProperties = propertyRows.filter(({ id }) =>
    (!filters.propertyId || id === filters.propertyId)
    && (!account.property_id || id === account.property_id));
  const propertyLabelById = new Map(propertyRows.map((property) => [
    property.id, `${property.code} · ${property.name}`,
  ]));

  const sourceIds = new Set((sourceLinksResult.data ?? []).map(
    (row: { source_id: string }) => row.source_id,
  ));
  const categoryIds = (categoryLinksResult.data ?? []).map(
    (row: { category_id: string }) => row.category_id,
  );
  for (const authority of authorityRows) {
    if (authority.authority_kind === "source") sourceIds.add(authority.authority_id);
    if (authority.authority_kind === "category") categoryIds.push(authority.authority_id);
  }
  let categoryCodes = new Set<string>();
  if (categoryIds.length > 0) {
    const categoriesResult = await client.from("finance_categories").select("id, code")
      .eq("organization_id", organizationId).in("id", categoryIds);
    assertRead("categories", categoriesResult.error);
    categoryCodes = new Set((categoriesResult.data ?? []).map(
      (row: { code: string }) => row.code,
    ));
  }

  const cashEvents: PropertyCashEvent[] = [];
  const profitLossEvents: OwnerProfitLossEvent[] = [];
  const ownerSources: Array<{ ownerPersonId: string; propertyId: string; source: OwnerSourceRow }> = [];
  const seenCashKeys = new Set<string>();
  const seenProfitLossKeys = new Set<string>();
  for (const property of scopedProperties) {
    if (["asset", "liability"].includes(account.account_class)) {
      for await (const event of iteratePropertyCashEvents(client as unknown as PropertyCashEventsRpcClient, {
        currency: "USD",
        organizationId,
        periodEnd: filters.periodEnd,
        periodStart: filters.periodStart,
        propertyId: property.id,
      })) {
        if (event.propertyId === property.id && !seenCashKeys.has(event.eventKey)) {
          seenCashKeys.add(event.eventKey);
          cashEvents.push(event);
        }
      }
    } else if (["income", "expense"].includes(account.account_class)) {
      for await (const event of iterateOwnerProfitLossEvents(client as unknown as OwnerProfitLossEventsRpcClient, {
        currency: "USD",
        organizationId,
        periodEnd: filters.periodEnd,
        periodStart: filters.periodStart,
        propertyId: property.id,
      })) {
        if (event.propertyId === property.id && !seenProfitLossKeys.has(event.eventKey)) {
          seenProfitLossKeys.add(event.eventKey);
          profitLossEvents.push(event);
        }
      }
    }
  }

  if (account.account_class === "equity") {
    const assignmentsResult = await client.from("property_owners")
      .select("property_id, person_id, started_on, ended_on")
      .eq("organization_id", organizationId);
    assertRead("owner assignments", assignmentsResult.error);
    const assignments = (assignmentsResult.data ?? []) as OwnerAssignmentRow[];
    const assignmentKeys = new Set<string>();
    for (const assignment of assignments) {
      if (!scopedProperties.some(({ id }) => id === assignment.property_id)) continue;
      if (assignment.started_on > filters.periodEnd) continue;
      if (assignment.ended_on && assignment.ended_on < filters.periodStart) continue;
      const key = `${assignment.property_id}:${assignment.person_id}`;
      if (assignmentKeys.has(key)) continue;
      assignmentKeys.add(key);
      if (!rpcClient.rpc) continue;
      const sourceResult = await rpcClient.rpc("get_owner_balance_source_ledger", {
        p_currency: "USD",
        p_organization_id: organizationId,
        p_owner_person_id: assignment.person_id,
        p_period_end: monthStart(filters.periodEnd),
        p_period_start: monthStart(filters.periodStart),
        p_property_id: assignment.property_id,
      });
      assertRead("owner activity", sourceResult.error);
      for (const source of (sourceResult.data ?? []) as unknown as OwnerSourceRow[]) {
        if (source.event_date < filters.periodStart || source.event_date > filters.periodEnd) continue;
        ownerSources.push({ ownerPersonId: assignment.person_id, propertyId: assignment.property_id, source });
      }
    }
  }

  const eventOverrides = new Map(authorityRows.filter((row) => row.authority_kind === "event")
    .map((row) => [row.event_key ?? row.authority_id, row.event_matches]));
  const selectedCashEvents = cashEvents.flatMap((event) => {
    const exactDecision = eventOverrides.get(event.eventKey);
    if (exactDecision === false) return [];
    const effect = cashEffect(account, event, sourceIds, authorityRows, authorityContractLoaded, exactDecision === true);
    return effect === null ? [] : [{ cents: effect, event }];
  });
  const selectedProfitLossEvents = profitLossEvents
    .filter((event) => eventOverrides.get(event.eventKey) !== false)
    .filter((event) => eventOverrides.get(event.eventKey) === true || (event.categoryId
      ? authorityMatches(authorityRows, "category", event.categoryId, event.recognizedOn)
        || (!authorityContractLoaded && categoryCodes.has(event.categoryCode))
      : categoryCodes.has(event.categoryCode)))
    .filter((event) => account.account_class === "income"
      ? event.economicClass === "owner_income"
      : event.economicClass === "owner_expense")
    .map((event) => ({ cents: event.signedAmountCents, event }));

  const seenOwnerSources = new Set<string>();
  const selectedOwnerSources = ownerSources.flatMap((item) => {
    const key = `${item.ownerPersonId}:${item.source.allocation_set_id}`;
    if (seenOwnerSources.has(key)) return [];
    seenOwnerSources.add(key);
    const exactDecision = eventOverrides.get(`owner_balance_source:${item.source.allocation_set_id}`);
    if (exactDecision === false) return [];
    const authorityId = item.source.source_type === "owner_contribution"
      ? "owner_contributions"
      : item.source.source_type === "owner_distribution" ? "owner_distributions" : null;
    const roleMatches = exactDecision === true || (authorityId !== null
      && (authorityMatches(authorityRows, "role", authorityId, item.source.event_date)
        || authorityMatches(authorityRows, "system_role", authorityId, item.source.event_date)
        || (!authorityContractLoaded && account.system_role === authorityId)));
    return roleMatches
      ? [{ ...item, cents: decimalToCents(item.source.allocated_gross_signed_amount) }]
      : [];
  });

  const leaseIds = new Set(selectedProfitLossEvents.flatMap(({ event }) => event.leaseId ? [event.leaseId] : []));
  const tenantByLeaseId = new Map<string, string>();
  if (leaseIds.size > 0) {
    const leasesResult = await client.from("leases").select("id, primary_tenant_person_id")
      .eq("organization_id", organizationId).in("id", [...leaseIds]);
    assertRead("leases", leasesResult.error);
    for (const lease of (leasesResult.data ?? []) as Array<{ id: string; primary_tenant_person_id: string | null }>) {
      if (lease.primary_tenant_person_id) tenantByLeaseId.set(lease.id, lease.primary_tenant_person_id);
    }
  }
  const ownerInvoiceIds = new Set(selectedProfitLossEvents.flatMap(({ event }) =>
    event.sourceParentType === "owner_invoice" && event.sourceParentId ? [event.sourceParentId] : []));
  const ownerByInvoiceId = new Map<string, string>();
  if (ownerInvoiceIds.size > 0) {
    const invoicesResult = await client.from("owner_invoices").select("id, owner_person_id")
      .eq("organization_id", organizationId).in("id", [...ownerInvoiceIds]);
    assertRead("owner invoices", invoicesResult.error);
    for (const invoice of (invoicesResult.data ?? []) as Array<{ id: string; owner_person_id: string }>) {
      ownerByInvoiceId.set(invoice.id, invoice.owner_person_id);
    }
  }
  const expenseLineIds = new Set(selectedProfitLossEvents.flatMap(({ event }) =>
    event.sourceType === "owner_invoice_line" ? [event.sourceId] : []));
  const expenseItemByLineId = new Map<string, string>();
  if (expenseLineIds.size > 0) {
    const responsibilitiesResult = await client.from("ips_expense_responsibilities")
      .select("owner_invoice_line_id, finance_expense_item_id")
      .eq("organization_id", organizationId).in("owner_invoice_line_id", [...expenseLineIds]);
    assertRead("expense responsibilities", responsibilitiesResult.error);
    for (const responsibility of (responsibilitiesResult.data ?? []) as Array<{
      finance_expense_item_id: string; owner_invoice_line_id: string;
    }>) {
      expenseItemByLineId.set(responsibility.owner_invoice_line_id, responsibility.finance_expense_item_id);
    }
  }
  const vendorByExpenseItemId = new Map<string, string>();
  if (expenseItemByLineId.size > 0) {
    const expenseItemsResult = await client.from("finance_expense_items")
      .select("id, vendor_person_id").eq("organization_id", organizationId)
      .in("id", [...expenseItemByLineId.values()]);
    assertRead("expense contacts", expenseItemsResult.error);
    for (const item of (expenseItemsResult.data ?? []) as Array<{ id: string; vendor_person_id: string | null }>) {
      if (item.vendor_person_id) vendorByExpenseItemId.set(item.id, item.vendor_person_id);
    }
  }

  const peopleIds = new Set<string>();
  for (const { event } of selectedCashEvents) {
    for (const id of [event.ownerPersonId, event.tenantPersonId, event.vendorPersonId]) {
      if (id) peopleIds.add(id);
    }
  }
  for (const personId of tenantByLeaseId.values()) peopleIds.add(personId);
  for (const personId of ownerByInvoiceId.values()) peopleIds.add(personId);
  for (const personId of vendorByExpenseItemId.values()) peopleIds.add(personId);
  for (const { ownerPersonId } of selectedOwnerSources) peopleIds.add(ownerPersonId);
  const peopleById = new Map<string, string>();
  if (peopleIds.size > 0) {
    const peopleResult = await client.from("people").select("id, display_name")
      .eq("organization_id", organizationId).in("id", [...peopleIds]);
    assertRead("contacts", peopleResult.error);
    for (const person of (peopleResult.data ?? []) as Array<{ display_name: string; id: string }>) {
      peopleById.set(person.id, person.display_name);
    }
  }

  const rows: FinanceAccountActivityRow[] = [
    ...selectedCashEvents.map(({ cents, event }) => toCashRow(cents, event, propertyLabelById, peopleById)),
    ...selectedProfitLossEvents.map(({ cents, event }) => toProfitLossRow(
      cents, event, propertyLabelById, peopleById, tenantByLeaseId, ownerByInvoiceId,
      expenseItemByLineId, vendorByExpenseItemId,
    )),
    ...selectedOwnerSources.map((item) => toOwnerSourceRow(item, propertyLabelById, peopleById)),
  ].sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id));
  const totalCents = [...selectedCashEvents, ...selectedProfitLossEvents, ...selectedOwnerSources]
    .reduce((total, item) => total + item.cents, BigInt(0));

  return {
    account: {
      accountClass: account.account_class,
      accountNumber: account.account_number,
      accountSubtype: account.account_subtype,
      archivedAt: account.archived_at,
      description: account.description,
      displayName: account.display_name,
      id: account.id,
      propertyId: account.property_id,
      propertyLabel: account.property_id ? propertyLabelById.get(account.property_id) ?? null : null,
    },
    basisLabel: basisLabel(account),
    filters,
    properties: scopedProperties.filter(({ archived_at }) => archived_at === null).map((property) => ({
      id: property.id,
      label: propertyLabelById.get(property.id)!,
    })),
    rows,
    runningBalance: null,
    total: centsToDecimal(totalCents),
  };
}

function cashEffect(
  account: AccountRow,
  event: PropertyCashEvent,
  sourceIds: Set<string>,
  authorities: readonly AuthorityRow[],
  authorityContractLoaded: boolean,
  exactMatch: boolean,
) {
  if (event.resolutionState !== "resolved") return null;
  if (account.account_class === "asset") {
    return exactMatch || (event.reconciliationSourceId && (
      authorityMatches(authorities, "source", event.reconciliationSourceId, event.eventDate)
      || (!authorityContractLoaded && sourceIds.has(event.reconciliationSourceId))
    ))
      ? event.amountCents : null;
  }
  if (account.account_class === "liability" && event.depositLiabilityEffectCents !== null && (
    exactMatch
    || authorityMatches(authorities, "role", "security_deposits", event.eventDate)
    || authorityMatches(authorities, "system_role", "security_deposits", event.eventDate)
    || (!authorityContractLoaded && account.system_role === "security_deposits")
  )) {
    return event.depositLiabilityEffectCents;
  }
  if (account.account_class === "liability" && account.account_subtype === "credit_card") {
    return exactMatch || (event.reconciliationSourceId && (
      authorityMatches(authorities, "source", event.reconciliationSourceId, event.eventDate)
      || (!authorityContractLoaded && sourceIds.has(event.reconciliationSourceId))
    ))
      ? event.amountCents : null;
  }
  return null;
}

function authorityMatches(
  authorities: readonly AuthorityRow[],
  kind: AuthorityRow["authority_kind"],
  id: string,
  date: string,
) {
  const instant = `${date}T23:59:59.999Z`;
  return authorities.some((row) => row.authority_kind === kind
    && row.authority_id === id
    && (row.valid_from === "-infinity" || row.valid_from <= instant)
    && (row.valid_to === null || instant < row.valid_to));
}

function toCashRow(
  cents: bigint,
  event: PropertyCashEvent,
  propertyLabels: ReadonlyMap<string, string>,
  people: ReadonlyMap<string, string>,
): FinanceAccountActivityRow {
  const contactId = event.tenantPersonId ?? event.vendorPersonId ?? event.ownerPersonId;
  return toRow({
    cents,
    contact: contactId ? people.get(contactId) ?? null : null,
    date: event.eventDate,
    description: event.description,
    id: event.eventKey,
    propertyId: event.propertyId,
    propertyLabel: propertyLabels.get(event.propertyId) ?? "Property unavailable",
    sourceHref: cashEventHref(event),
  });
}

function cashEventHref(event: PropertyCashEvent) {
  if (event.leaseId) return `/leases/${encodeURIComponent(event.leaseId)}`;
  const activity = event.isReversal
    ? "corrections"
    : event.depositLiabilityEffectCents !== null
      ? "deposits"
      : event.economicClass === "owner_contribution" || event.economicClass === "owner_distribution"
        ? "owner_cash"
        : event.amountCents < BigInt(0) ? "costs" : "rent";
  return `/properties/${encodeURIComponent(event.propertyId)}/account?activity=${activity}&month=${event.eventDate.slice(0, 7)}`;
}

function toProfitLossRow(
  cents: bigint,
  event: OwnerProfitLossEvent,
  propertyLabels: ReadonlyMap<string, string>,
  people: ReadonlyMap<string, string>,
  tenantByLeaseId: ReadonlyMap<string, string>,
  ownerByInvoiceId: ReadonlyMap<string, string>,
  expenseItemByLineId: ReadonlyMap<string, string>,
  vendorByExpenseItemId: ReadonlyMap<string, string>,
): FinanceAccountActivityRow {
  const expenseItemId = expenseItemByLineId.get(event.sourceId);
  const ownerPersonId = event.sourceParentId ? ownerByInvoiceId.get(event.sourceParentId) : null;
  const contactId = event.leaseId
    ? tenantByLeaseId.get(event.leaseId)
    : expenseItemId && vendorByExpenseItemId.get(expenseItemId)
      ? vendorByExpenseItemId.get(expenseItemId)
      : ownerPersonId;
  const month = event.recognizedOn.slice(0, 7);
  return toRow({
    cents,
    contact: contactId ? people.get(contactId) ?? null : null,
    date: event.recognizedOn,
    description: event.description,
    id: event.eventKey,
    propertyId: event.propertyId,
    propertyLabel: propertyLabels.get(event.propertyId) ?? "Property unavailable",
    sourceHref: event.leaseId
      ? `/leases/${encodeURIComponent(event.leaseId)}`
      : `/properties/${encodeURIComponent(event.propertyId)}/account?activity=${event.economicClass === "owner_income" ? "rent" : "costs"}&month=${month}${ownerPersonId ? `&ownerPersonId=${encodeURIComponent(ownerPersonId)}` : ""}`,
  });
}

function toOwnerSourceRow(
  item: { cents: bigint; ownerPersonId: string; propertyId: string; source: OwnerSourceRow },
  propertyLabels: ReadonlyMap<string, string>,
  people: ReadonlyMap<string, string>,
): FinanceAccountActivityRow {
  const month = item.source.event_date.slice(0, 7);
  const allocationSetId = encodeURIComponent(item.source.allocation_set_id);
  return toRow({
    cents: item.cents,
    contact: people.get(item.ownerPersonId) ?? null,
    date: item.source.event_date,
    description: item.source.source_type === "owner_contribution" ? "Owner contribution" : "Owner distribution",
    id: `owner_balance_source:${item.source.allocation_set_id}`,
    propertyId: item.propertyId,
    propertyLabel: propertyLabels.get(item.propertyId) ?? "Property unavailable",
    sourceHref: `/properties/${encodeURIComponent(item.propertyId)}/account?activity=owner_cash&month=${month}&ownerPersonId=${encodeURIComponent(item.ownerPersonId)}&focusAllocationSetId=${allocationSetId}#owner-source-${allocationSetId}`,
  });
}

function toRow(input: Omit<FinanceAccountActivityRow, "increase" | "decrease" | "runningBalance"> & { cents: bigint }): FinanceAccountActivityRow {
  const { cents, ...row } = input;
  const amount = centsToDecimal(cents < BigInt(0) ? -cents : cents);
  return {
    ...row,
    decrease: cents < BigInt(0) ? amount : null,
    increase: cents >= BigInt(0) ? amount : null,
    runningBalance: null,
  };
}

function basisLabel(account: AccountRow) {
  if (account.account_class === "asset") return "Recorded cash activity";
  if (account.account_class === "expense") return "Expense activity for this period";
  if (account.account_class === "income") return "Income activity for this period";
  if (account.use_for_lease_deposits || account.system_role === "security_deposits") {
    return "Security deposit activity for this period";
  }
  if (account.account_class === "equity") return "Authoritative owner-balance activity";
  return "Recorded account activity";
}

function centsToDecimal(cents: bigint) {
  const sign = cents < BigInt(0) ? "-" : "";
  const absolute = cents < BigInt(0) ? -cents : cents;
  return `${sign}${absolute / BigInt(100)}.${(absolute % BigInt(100)).toString().padStart(2, "0")}`;
}

function decimalToCents(value: string) {
  if (!/^-?\d+\.\d{2}$/.test(value)) throw new Error("Invalid authoritative owner amount.");
  const negative = value.startsWith("-");
  const [whole, fraction] = value.replace("-", "").split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction);
  return negative ? -cents : cents;
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function validateFilters(filters: FinanceAccountActivityFilters) {
  for (const value of [filters.periodStart, filters.periodEnd]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid activity period.");
  }
  if (filters.periodStart > filters.periodEnd) throw new Error("Invalid activity period.");
  const start = Date.parse(`${filters.periodStart}T00:00:00.000Z`);
  const end = Date.parse(`${filters.periodEnd}T00:00:00.000Z`);
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (!Number.isFinite(days) || days < 1 || days > 366) {
    throw new Error("Activity period must be between 1 and 366 days.");
  }
}

function assertRead(subject: string, error: { message: string } | null) {
  if (error) throw new Error(`Could not load account ${subject}: ${error.message}`);
}

import "server-only";

import { iteratePropertyCashEvents } from "@/features/finance/data/property-cash-events";
import { resolvePropertyCashEventHref } from "@/features/finance/data/property-cash-events.links";
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

export async function getFinanceAccountActivity(
  organizationId: string,
  accountId: string,
  filters: FinanceAccountActivityFilters,
): Promise<FinanceAccountActivity | null> {
  validateFilters(filters);
  const client = await createSupabaseServerClient();
  const accountResult = await client.from("finance_accounts").select(
    "id, account_class, account_number, account_subtype, archived_at, display_name, property_id, system_role, use_for_lease_deposits",
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
  const seenCashKeys = new Set<string>();
  const seenProfitLossKeys = new Set<string>();
  for (const property of scopedProperties) {
    if (["asset", "liability", "equity"].includes(account.account_class)) {
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
    } else {
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

  const eventOverrides = new Map(authorityRows.filter((row) => row.authority_kind === "event")
    .map((row) => [row.event_key ?? row.authority_id, row.event_matches]));
  const selectedCashEvents = cashEvents.flatMap((event) => {
    if (eventOverrides.get(event.eventKey) === false) return [];
    const effect = cashEffect(account, event, sourceIds, authorityRows, authorityContractLoaded);
    return effect === null ? [] : [{ cents: effect, event }];
  });
  const selectedProfitLossEvents = profitLossEvents
    .filter((event) => eventOverrides.get(event.eventKey) !== false)
    .filter((event) => event.categoryId
      ? authorityMatches(authorityRows, "category", event.categoryId, event.recognizedOn)
        || (!authorityContractLoaded && categoryCodes.has(event.categoryCode))
      : categoryCodes.has(event.categoryCode))
    .filter((event) => account.account_class === "income"
      ? event.economicClass === "owner_income"
      : event.economicClass === "owner_expense")
    .map((event) => ({ cents: event.signedAmountCents, event }));

  const peopleIds = new Set<string>();
  for (const { event } of selectedCashEvents) {
    for (const id of [event.ownerPersonId, event.tenantPersonId, event.vendorPersonId]) {
      if (id) peopleIds.add(id);
    }
  }
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
    ...selectedProfitLossEvents.map(({ cents, event }) => toProfitLossRow(cents, event, propertyLabelById)),
  ].sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id));
  const totalCents = [...selectedCashEvents, ...selectedProfitLossEvents]
    .reduce((total, item) => total + item.cents, BigInt(0));

  return {
    account: {
      accountClass: account.account_class,
      accountNumber: account.account_number,
      accountSubtype: account.account_subtype,
      archivedAt: account.archived_at,
      displayName: account.display_name,
      id: account.id,
      propertyId: account.property_id,
      propertyLabel: account.property_id ? propertyLabelById.get(account.property_id) ?? null : null,
    },
    basisLabel: basisLabel(account),
    filters,
    properties: propertyRows.filter(({ archived_at }) => archived_at === null).map((property) => ({
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
) {
  if (event.resolutionState !== "resolved") return null;
  if (account.account_class === "asset") {
    return event.reconciliationSourceId && (
      authorityMatches(authorities, "source", event.reconciliationSourceId, event.eventDate)
      || (!authorityContractLoaded && sourceIds.has(event.reconciliationSourceId))
    )
      ? event.amountCents : null;
  }
  if (account.account_class === "liability" &&
    (account.use_for_lease_deposits || account.system_role === "security_deposits")) {
    return event.depositLiabilityEffectCents;
  }
  if (account.account_class === "equity") {
    const contributionRole = authorityMatches(authorities, "role", "owner_contributions", event.eventDate)
      || authorityMatches(authorities, "system_role", "owner_contributions", event.eventDate)
      || (!authorityContractLoaded && account.system_role === "owner_contributions");
    const distributionRole = authorityMatches(authorities, "role", "owner_distributions", event.eventDate)
      || authorityMatches(authorities, "system_role", "owner_distributions", event.eventDate)
      || (!authorityContractLoaded && account.system_role === "owner_distributions");
    if (contributionRole && event.economicClass === "owner_contribution") return event.ownerCashEffectCents;
    if (distributionRole && event.economicClass === "owner_distribution") return event.ownerCashEffectCents;
    return null;
  }
  if (account.account_class === "liability" && account.account_subtype === "credit_card") {
    return event.reconciliationSourceId && (
      authorityMatches(authorities, "source", event.reconciliationSourceId, event.eventDate)
      || (!authorityContractLoaded && sourceIds.has(event.reconciliationSourceId))
    )
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
    sourceHref: resolvePropertyCashEventHref(event),
  });
}

function toProfitLossRow(
  cents: bigint,
  event: OwnerProfitLossEvent,
  propertyLabels: ReadonlyMap<string, string>,
): FinanceAccountActivityRow {
  return toRow({
    cents,
    contact: null,
    date: event.recognizedOn,
    description: event.description,
    id: event.eventKey,
    propertyId: event.propertyId,
    propertyLabel: propertyLabels.get(event.propertyId) ?? "Property unavailable",
    sourceHref: event.sourceType === "tenant_invoice_line"
      ? `/rent-income?archiveState=all&incomeItemId=${encodeURIComponent(event.sourceParentId ?? event.sourceId)}`
      : `/bills-expenses?archiveState=all&expenseItemId=${encodeURIComponent(event.sourceParentId ?? event.sourceId)}`,
  });
}

function toRow(input: Omit<FinanceAccountActivityRow, "increase" | "decrease" | "runningBalance"> & { cents: bigint }): FinanceAccountActivityRow {
  const amount = centsToDecimal(input.cents < BigInt(0) ? -input.cents : input.cents);
  return {
    ...input,
    decrease: input.cents < BigInt(0) ? amount : null,
    increase: input.cents >= BigInt(0) ? amount : null,
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
  if (account.account_class === "equity") return "Owner activity for this period";
  return "Recorded account activity";
}

function centsToDecimal(cents: bigint) {
  const sign = cents < BigInt(0) ? "-" : "";
  const absolute = cents < BigInt(0) ? -cents : cents;
  return `${sign}${absolute / BigInt(100)}.${(absolute % BigInt(100)).toString().padStart(2, "0")}`;
}

function validateFilters(filters: FinanceAccountActivityFilters) {
  for (const value of [filters.periodStart, filters.periodEnd]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid activity period.");
  }
  if (filters.periodStart > filters.periodEnd) throw new Error("Invalid activity period.");
}

function assertRead(subject: string, error: { message: string } | null) {
  if (error) throw new Error(`Could not load account ${subject}: ${error.message}`);
}

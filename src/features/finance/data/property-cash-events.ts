import { parseExactMoneyToCents } from "@/features/finance/data/property-cash-events.money";
import {
  propertyCashEconomicClasses,
  propertyCashResolutionStates,
  propertyCashSourceTypes,
  type PropertyCashEvent,
  type PropertyCashEventCursor,
  type PropertyCashEventDatabaseRow,
  type PropertyCashEventScope,
  type PropertyCashEventsRpcClient,
} from "@/features/finance/data/property-cash-events.types";

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 1_000;
const MAX_PERIOD_DAYS = 366;
const MAX_TRACKED_EVENT_KEYS = 10_000;

export async function loadPropertyCashEventPage(
  client: PropertyCashEventsRpcClient,
  scope: PropertyCashEventScope,
  cursor: PropertyCashEventCursor | null = null,
) {
  const validated = validateScope(scope);
  const validatedCursor = cursor ? validateCursor(cursor) : null;
  const { data, error } = await client.rpc("get_property_cash_events_page", {
    p_after_event_date: validatedCursor?.eventDate ?? null,
    p_after_source_id: validatedCursor?.sourceId ?? null,
    p_after_source_type: validatedCursor?.sourceType ?? null,
    p_currency: validated.currency,
    p_organization_id: validated.organizationId,
    p_page_size: validated.pageSize,
    p_period_end: validated.periodEnd,
    p_period_start: validated.periodStart,
    p_property_id: validated.propertyId,
  });

  if (error) {
    throw new Error(`Unable to load property cash events: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length > validated.pageSize) {
    throw new Error("Property cash RPC returned more than the bounded page size.");
  }

  const normalized: PropertyCashEvent[] = [];
  const pageEventKeys = new Set<string>();
  let previousCursor = validatedCursor;
  for (const row of rows) {
    const event = normalizePropertyCashEvent(row);
    assertEventScope(event, validated);
    assertDeterministicEventKey(event);

    if (pageEventKeys.has(event.eventKey)) {
      throw new Error(`Property cash event duplicate event key: ${event.eventKey}`);
    }
    pageEventKeys.add(event.eventKey);

    const eventCursor = cursorFor(event);
    if (previousCursor && compareCursors(eventCursor, previousCursor) <= 0) {
      throw new Error("Property cash event cursor did not advance strictly.");
    }
    previousCursor = eventCursor;
    normalized.push(event);
  }

  return { pageSize: validated.pageSize, rows: normalized };
}

export async function* iteratePropertyCashEventPages(
  client: PropertyCashEventsRpcClient,
  scope: PropertyCashEventScope,
): AsyncGenerator<PropertyCashEvent[]> {
  const validated = validateScope(scope);
  let cursor: PropertyCashEventCursor | null = null;
  const seenEventKeys = new Set<string>();

  while (true) {
    const page = await loadPropertyCashEventPage(client, validated, cursor);
    const filtered: PropertyCashEvent[] = [];

    for (const event of page.rows) {
      if (seenEventKeys.has(event.eventKey)) {
        throw new Error(`Property cash event duplicate event key: ${event.eventKey}`);
      }
      if (seenEventKeys.size >= MAX_TRACKED_EVENT_KEYS) {
        throw new Error(
          `Property cash event key tracking limit of ${MAX_TRACKED_EVENT_KEYS} exceeded.`,
        );
      }
      seenEventKeys.add(event.eventKey);
      cursor = cursorFor(event);

      if (!validated.unitId || event.unitId === validated.unitId) {
        filtered.push(event);
      }
    }

    yield filtered;

    if (page.rows.length < page.pageSize) return;
  }
}

export async function* iteratePropertyCashEvents(
  client: PropertyCashEventsRpcClient,
  scope: PropertyCashEventScope,
): AsyncGenerator<PropertyCashEvent> {
  for await (const page of iteratePropertyCashEventPages(client, scope)) {
    yield* page;
  }
}

export function normalizePropertyCashEvent(
  row: PropertyCashEventDatabaseRow,
): PropertyCashEvent {
  if (row.contract_version !== "property_cash_events.v1") {
    throw new Error(`Unsupported property cash contract: ${row.contract_version}`);
  }
  if (row.currency !== "USD") {
    throw new Error(`Property cash event has unsupported currency: ${row.currency}`);
  }

  const sourceType = assertMember(
    row.source_type,
    propertyCashSourceTypes,
    "source type",
  );
  const resolutionState = assertMember(
    row.resolution_state,
    propertyCashResolutionStates,
    "resolution state",
  );
  const amountCents = parseExactMoneyToCents(row.amount);
  if (amountCents === BigInt(0)) {
    throw new Error("Property cash event amount cannot be zero.");
  }

  const effects = [
    row.owner_cash_effect,
    row.operating_cash_effect,
    row.deposit_liability_effect,
    row.management_fee_effect,
  ];
  if (resolutionState === "resolved") {
    if (row.resolution_reason !== null || effects.some((value) => value === null)) {
      throw new Error("Resolved property cash events require complete effects and no reason.");
    }
  } else if (
    !row.resolution_reason ||
    effects.some((value) => value !== null)
  ) {
    throw new Error("Unresolved property cash events require a reason and null effects.");
  }

  if (
    row.cursor_event_date !== row.event_date ||
    row.cursor_source_type !== row.source_type ||
    row.cursor_source_id !== row.source_id
  ) {
    throw new Error("Property cash event cursor identity is inconsistent.");
  }

  return {
    amountCents,
    categoryCode: row.category_code,
    contractVersion: row.contract_version,
    currency: row.currency,
    depositLiabilityEffectCents: nullableCents(row.deposit_liability_effect),
    description: row.description,
    economicClass: assertMember(
      row.economic_class,
      propertyCashEconomicClasses,
      "economic class",
    ),
    eventDate: row.event_date,
    eventKey: row.event_key,
    isReversal: row.is_reversal,
    leaseId: row.lease_id,
    ledgerEntryId: row.ledger_entry_id,
    managementFeeEffectCents: nullableCents(row.management_fee_effect),
    obligationId: row.obligation_id,
    obligationType: row.obligation_type,
    operatingCashEffectCents: nullableCents(row.operating_cash_effect),
    organizationId: row.organization_id,
    ownerCashEffectCents: nullableCents(row.owner_cash_effect),
    ownerPersonId: row.owner_person_id,
    periodStart: row.period_start,
    propertyId: row.property_id,
    reconciliationSourceId: row.reconciliation_source_id,
    reference: row.reference,
    resolutionReason: row.resolution_reason,
    resolutionState,
    reversalSourceId: row.reversal_source_id,
    reversalSourceType: row.reversal_source_type,
    sourceId: row.source_id,
    sourceParentId: row.source_parent_id,
    sourceParentType: row.source_parent_type,
    sourceType,
    taskId: row.task_id,
    tenantPersonId: row.tenant_person_id,
    unitId: row.unit_id,
    vendorPersonId: row.vendor_person_id,
  };
}

function validateScope(scope: PropertyCashEventScope) {
  const pageSize = scope.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error("Property cash page size must be between 1 and 1,000.");
  }
  if (scope.currency !== "USD") {
    throw new Error(`Property cash scope has unsupported currency: ${scope.currency}`);
  }

  const periodStart = parseBusinessDate(scope.periodStart);
  const periodEnd = parseBusinessDate(scope.periodEnd);
  const dayCount =
    Math.floor((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;
  if (dayCount < 1 || dayCount > MAX_PERIOD_DAYS) {
    throw new Error("Property cash period must be between 1 and 366 days.");
  }
  if (!scope.organizationId || !scope.propertyId) {
    throw new Error("Property cash organization and property are required.");
  }

  return { ...scope, pageSize };
}

function parseBusinessDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid property cash business date: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid property cash business date: ${value}`);
  }
  return parsed;
}

function validateCursor(cursor: PropertyCashEventCursor) {
  if (!cursor.sourceId || !cursor.sourceType) {
    throw new Error("Property cash cursor requires source type and source ID.");
  }
  assertMember(cursor.sourceType, propertyCashSourceTypes, "cursor source type");
  parseBusinessDate(cursor.eventDate);
  return cursor;
}

function assertEventScope(
  event: PropertyCashEvent,
  scope: ReturnType<typeof validateScope>,
) {
  if (
    event.organizationId !== scope.organizationId ||
    event.propertyId !== scope.propertyId
  ) {
    throw new Error("Property cash RPC returned a row outside the requested scope.");
  }
  if (event.currency !== scope.currency) {
    throw new Error("Property cash RPC returned mixed or unsupported currency.");
  }
}

function assertDeterministicEventKey(event: PropertyCashEvent) {
  const expected = `${event.sourceType}:${event.sourceId}`;
  if (event.eventKey !== expected) {
    throw new Error(
      `Property cash event key ${event.eventKey} does not match its source identity ${expected}.`,
    );
  }
}

function nullableCents(value: number | string | null) {
  return value === null ? null : parseExactMoneyToCents(value);
}

function cursorFor(event: PropertyCashEvent): PropertyCashEventCursor {
  return {
    eventDate: event.eventDate,
    sourceId: event.sourceId,
    sourceType: event.sourceType,
  };
}

function compareCursors(
  current: PropertyCashEventCursor,
  previous: PropertyCashEventCursor,
) {
  if (current.eventDate !== previous.eventDate) {
    return current.eventDate < previous.eventDate ? -1 : 1;
  }
  if (current.sourceType !== previous.sourceType) {
    return current.sourceType < previous.sourceType ? -1 : 1;
  }
  if (current.sourceId === previous.sourceId) return 0;
  return current.sourceId < previous.sourceId ? -1 : 1;
}

function assertMember<T extends string>(
  value: string,
  values: readonly T[],
  label: string,
): T {
  if (!(values as readonly string[]).includes(value)) {
    throw new Error(`Unknown property cash ${label}: ${value}`);
  }
  return value as T;
}

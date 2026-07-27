import { parseExactMoneyToCents } from "@/features/finance/data/property-cash-events.money";
import {
  propertyCashClassificationStatuses,
  propertyCashEconomicClasses,
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
  const { data, error } = await client.rpc("get_property_cash_events_v1_page", {
    p_after_event_date: cursor?.eventDate ?? null,
    p_after_source_id: cursor?.sourceId ?? null,
    p_after_source_type: cursor?.sourceType ?? null,
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

  return {
    pageSize: validated.pageSize,
    rows,
  };
}

export async function* iteratePropertyCashEventPages(
  client: PropertyCashEventsRpcClient,
  scope: PropertyCashEventScope,
): AsyncGenerator<PropertyCashEvent[]> {
  const validated = validateScope(scope);
  let cursor: PropertyCashEventCursor | null = null;
  let previousCursor: PropertyCashEventCursor | null = null;
  const seenEventKeys = new Set<string>();

  while (true) {
    const page = await loadPropertyCashEventPage(client, validated, cursor);
    const normalized: PropertyCashEvent[] = [];

    for (const row of page.rows) {
      const event = normalizePropertyCashEvent(row);
      assertEventScope(event, validated);
      assertDeterministicEventKey(event);
      const eventCursor = cursorFor(event);

      if (seenEventKeys.has(event.eventKey)) {
        throw new Error(
          `Property cash event duplicate event key: ${event.eventKey}`,
        );
      }
      if (seenEventKeys.size >= MAX_TRACKED_EVENT_KEYS) {
        throw new Error(
          `Property cash event key tracking limit of ${MAX_TRACKED_EVENT_KEYS} exceeded.`,
        );
      }
      seenEventKeys.add(event.eventKey);

      if (previousCursor && compareCursors(eventCursor, previousCursor) <= 0) {
        throw new Error("Property cash event cursor did not advance strictly.");
      }

      previousCursor = eventCursor;

      if (
        (!validated.unitId || event.unitId === validated.unitId) &&
        (!validated.ownerPersonId ||
          event.ownerPersonId === validated.ownerPersonId)
      ) {
        normalized.push(event);
      }
    }

    if (page.rows.length > 0) {
      cursor = previousCursor;
    }

    yield normalized;

    if (page.rows.length < page.pageSize) {
      return;
    }
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
  if (row.contract_version !== "property_cash_events_v1") {
    throw new Error(`Unsupported property cash contract: ${row.contract_version}`);
  }
  if (row.currency !== "USD") {
    throw new Error(`Property cash event has unsupported currency: ${row.currency}`);
  }

  const amountCents = parseExactMoneyToCents(row.amount);
  if (amountCents <= BigInt(0)) {
    throw new Error("Property cash event amount must be positive.");
  }

  return {
    amountCents,
    archivedAt: row.archived_at,
    categoryCode: row.category_code,
    classificationStatus: assertMember(
      row.classification_status,
      propertyCashClassificationStatuses,
      "classification status",
    ),
    contractVersion: row.contract_version,
    createdAt: row.created_at,
    createdBy: row.created_by,
    currency: row.currency,
    depositLiabilityEffectCents: nullableCents(
      row.deposit_liability_effect,
    ),
    economicClass: assertMember(
      row.economic_class,
      propertyCashEconomicClasses,
      "economic class",
    ),
    eventDate: row.event_date,
    eventKey: row.event_key,
    isLegacy: row.is_legacy,
    isReversal: row.is_reversal,
    journalEntryId: row.journal_entry_id,
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
    projectionStatus: row.projection_status,
    propertyId: row.property_id,
    requiresResolution: row.requires_resolution,
    reversalSourceId: row.reversal_source_id,
    reversalSourceType: row.reversal_source_type,
    sourceId: row.source_id,
    sourceParentId: row.source_parent_id,
    sourceParentType: row.source_parent_type,
    sourceType: assertMember(
      row.source_type,
      propertyCashSourceTypes,
      "source type",
    ),
    statementSection: row.statement_section,
    taskId: row.task_id,
    tenantPersonId: row.tenant_person_id,
    unitId: row.unit_id,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
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
  if (current.eventDate === null && previous.eventDate !== null) return 1;
  if (current.eventDate !== null && previous.eventDate === null) return -1;
  if (current.eventDate !== previous.eventDate) {
    return current.eventDate! < previous.eventDate! ? -1 : 1;
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

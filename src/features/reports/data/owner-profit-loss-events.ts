import { parseExactMoneyToCents } from "@/features/finance/data/property-cash-events.money";
import {
  ownerProfitLossEconomicClasses,
  ownerProfitLossSourceTypes,
  type OwnerProfitLossEvent,
  type OwnerProfitLossEventCursor,
  type OwnerProfitLossEventDatabaseRow,
  type OwnerProfitLossEventScope,
  type OwnerProfitLossEventsRpcClient,
} from "@/features/reports/data/owner-profit-loss-events.types";

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 1_000;
const MAX_PERIOD_DAYS = 366;
const MAX_TRACKED_EVENT_KEYS = 10_000;

export async function loadOwnerProfitLossEventPage(
  client: OwnerProfitLossEventsRpcClient,
  scope: OwnerProfitLossEventScope,
  cursor: OwnerProfitLossEventCursor | null = null,
) {
  const validated = validateScope(scope);
  const validatedCursor = cursor ? validateCursor(cursor) : null;
  const { data, error } = await client.rpc(
    "get_owner_profit_loss_events_page",
    {
      p_after_recognized_on: validatedCursor?.recognizedOn ?? null,
      p_after_source_id: validatedCursor?.sourceId ?? null,
      p_after_source_type: validatedCursor?.sourceType ?? null,
      p_currency: validated.currency,
      p_organization_id: validated.organizationId,
      p_page_size: validated.pageSize,
      p_period_end: validated.periodEnd,
      p_period_start: validated.periodStart,
      p_property_id: validated.propertyId,
    },
  );

  if (error) {
    throw new Error(`Unable to load owner profit and loss events: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length > validated.pageSize) {
    throw new Error("Owner P&L RPC returned more than the bounded page size.");
  }

  const normalized: OwnerProfitLossEvent[] = [];
  const pageEventKeys = new Set<string>();
  let previousCursor = validatedCursor;
  for (const row of rows) {
    const event = normalizeOwnerProfitLossEvent(row);
    assertEventScope(event, validated);
    assertDeterministicEventKey(event);

    if (pageEventKeys.has(event.eventKey)) {
      throw new Error(`Owner P&L duplicate event key: ${event.eventKey}`);
    }
    pageEventKeys.add(event.eventKey);

    const eventCursor = cursorFor(event);
    if (previousCursor && compareCursors(eventCursor, previousCursor) <= 0) {
      throw new Error("Owner P&L event cursor did not advance strictly.");
    }
    previousCursor = eventCursor;
    normalized.push(event);
  }

  return { pageSize: validated.pageSize, rows: normalized };
}

export async function* iterateOwnerProfitLossEvents(
  client: OwnerProfitLossEventsRpcClient,
  scope: OwnerProfitLossEventScope,
): AsyncGenerator<OwnerProfitLossEvent> {
  const validated = validateScope(scope);
  let cursor: OwnerProfitLossEventCursor | null = null;
  const seenEventKeys = new Set<string>();

  while (true) {
    const page = await loadOwnerProfitLossEventPage(client, validated, cursor);

    for (const event of page.rows) {
      if (seenEventKeys.has(event.eventKey)) {
        throw new Error(`Owner P&L duplicate event key: ${event.eventKey}`);
      }
      if (seenEventKeys.size >= MAX_TRACKED_EVENT_KEYS) {
        throw new Error(
          `Owner P&L event key tracking limit of ${MAX_TRACKED_EVENT_KEYS} exceeded.`,
        );
      }
      seenEventKeys.add(event.eventKey);
      cursor = cursorFor(event);

      if (
        !validated.unitId ||
        event.unitId === validated.unitId ||
        event.unitId === null
      ) {
        yield event;
      }
    }

    if (page.rows.length < page.pageSize) return;
  }
}

export function normalizeOwnerProfitLossEvent(
  row: OwnerProfitLossEventDatabaseRow,
): OwnerProfitLossEvent {
  if (row.contract_version !== "owner_profit_loss_events.v1") {
    throw new Error(`Unsupported owner P&L contract: ${row.contract_version}`);
  }
  if (row.currency !== "USD") {
    throw new Error(`Owner P&L event has unsupported currency: ${row.currency}`);
  }

  const sourceType = assertMember(
    row.source_type,
    ownerProfitLossSourceTypes,
    "source type",
  );
  const reversalSourceType = row.reversal_source_type
    ? assertMember(
        row.reversal_source_type,
        ownerProfitLossSourceTypes,
        "reversal source type",
      )
    : null;
  const signedAmountCents = parseExactMoneyToCents(row.signed_amount);
  if (signedAmountCents === BigInt(0)) {
    throw new Error("Owner P&L event amount cannot be zero.");
  }
  if (
    row.is_reversal !== (row.reversal_of_id !== null) ||
    row.is_reversal !== (reversalSourceType !== null)
  ) {
    throw new Error("Owner P&L reversal evidence is inconsistent.");
  }
  if (
    row.cursor_recognized_on !== row.recognized_on ||
    row.cursor_source_type !== row.source_type ||
    row.cursor_source_id !== row.source_id
  ) {
    throw new Error("Owner P&L event cursor identity is inconsistent.");
  }

  return {
    categoryCode: row.category_code,
    contractVersion: row.contract_version,
    currency: row.currency,
    description: row.description,
    economicClass: assertMember(
      row.economic_class,
      ownerProfitLossEconomicClasses,
      "economic class",
    ),
    eventKey: row.event_key,
    isReversal: row.is_reversal,
    leaseId: row.lease_id,
    organizationId: row.organization_id,
    periodStart: row.period_start,
    propertyId: row.property_id,
    recognitionBasis: row.recognition_basis,
    recognizedOn: row.recognized_on,
    reversalOfId: row.reversal_of_id,
    reversalSourceType,
    signedAmountCents,
    sourceId: row.source_id,
    sourceParentId: row.source_parent_id,
    sourceParentType: row.source_parent_type,
    sourceType,
    unitId: row.unit_id,
  };
}

function validateScope(scope: OwnerProfitLossEventScope) {
  const pageSize = scope.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error("Owner P&L page size must be between 1 and 1,000.");
  }
  if (scope.currency !== "USD") {
    throw new Error(`Owner P&L scope has unsupported currency: ${scope.currency}`);
  }

  const periodStart = parseBusinessDate(scope.periodStart);
  const periodEnd = parseBusinessDate(scope.periodEnd);
  const dayCount =
    Math.floor((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;
  if (dayCount < 1 || dayCount > MAX_PERIOD_DAYS) {
    throw new Error("Owner P&L period must be between 1 and 366 days.");
  }
  if (!scope.organizationId || !scope.propertyId) {
    throw new Error("Owner P&L organization and property are required.");
  }

  return { ...scope, pageSize };
}

function validateCursor(cursor: OwnerProfitLossEventCursor) {
  if (!cursor.sourceId || !cursor.sourceType) {
    throw new Error("Owner P&L cursor requires source type and source ID.");
  }
  assertMember(cursor.sourceType, ownerProfitLossSourceTypes, "cursor source type");
  parseBusinessDate(cursor.recognizedOn);
  return cursor;
}

function parseBusinessDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid owner P&L business date: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid owner P&L business date: ${value}`);
  }
  return parsed;
}

function assertEventScope(
  event: OwnerProfitLossEvent,
  scope: ReturnType<typeof validateScope>,
) {
  if (
    event.organizationId !== scope.organizationId ||
    event.propertyId !== scope.propertyId
  ) {
    throw new Error("Owner P&L RPC returned a row outside the requested scope.");
  }
  if (event.currency !== scope.currency) {
    throw new Error("Owner P&L RPC returned mixed or unsupported currency.");
  }
}

function assertDeterministicEventKey(event: OwnerProfitLossEvent) {
  const expected = `${event.sourceType}:${event.sourceId}`;
  if (event.eventKey !== expected) {
    throw new Error(
      `Owner P&L event key ${event.eventKey} does not match ${expected}.`,
    );
  }
}

function cursorFor(event: OwnerProfitLossEvent): OwnerProfitLossEventCursor {
  return {
    recognizedOn: event.recognizedOn,
    sourceId: event.sourceId,
    sourceType: event.sourceType,
  };
}

function compareCursors(
  current: OwnerProfitLossEventCursor,
  previous: OwnerProfitLossEventCursor,
) {
  if (current.recognizedOn !== previous.recognizedOn) {
    return current.recognizedOn < previous.recognizedOn ? -1 : 1;
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
    throw new Error(`Unknown owner P&L ${label}: ${value}`);
  }
  return value as T;
}

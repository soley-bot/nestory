import { requireOwnerBalanceReadContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { formatPropertyOptionLabel } from "@/lib/entity-option-labels";
import { canonicalizeSignedOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";
import {
  OWNER_BALANCE_COMPONENTS,
  type OwnerBalanceComponent,
  type OwnerBalanceData,
  type OwnerBalancePeriodRecord,
  type OwnerBalancePeriodStatus,
  type OwnerBalanceSourceRecord,
  type OwnerWithdrawalCapacity,
} from "@/features/owner-balances/owner-balance.types";
import type { Database } from "@/types/database";

type OwnerBalanceLedgerRow = Database["public"]["Functions"]["get_owner_balance_ledger"]["Returns"][number] & {
  available_withdrawal: string | null;
  blocked_reason_code: string | null;
  blocked_reason_detail: unknown;
  closing_amount: string | null;
  component: OwnerBalanceComponent | null;
  input_hash: string | null;
  input_watermark: string | null;
  movement_amount: string | null;
  opening_amount: string | null;
};

type OwnerEventQueueRow = Database["public"]["Functions"]["get_owner_event_allocation_queue"]["Returns"][number] & {
  allocation_set_id: string | null;
  remediation_code: string | null;
  remediation_detail: unknown;
};

type GeneratedOwnerBalanceSourceRow =
  Database["public"]["Functions"]["get_owner_balance_source_ledger"]["Returns"][number];
type OwnerBalanceSourceRow = Omit<
  GeneratedOwnerBalanceSourceRow,
  | "component"
  | "movement_id"
  | "reversal_of_allocation_set_id"
  | "reversal_of_movement_id"
  | "signed_amount"
> & {
  component: OwnerBalanceComponent | null;
  movement_id: string | null;
  reversal_of_allocation_set_id: string | null;
  reversal_of_movement_id: string | null;
  signed_amount: string | null;
};

type OwnerBalanceScope = {
  currency: "USD";
  periodStart: string;
  periodEnd: string;
  propertyId?: string;
  ownerPersonId?: string;
};

const PERIOD_STATUSES = new Set<OwnerBalancePeriodStatus>([
  "blocked",
  "closed",
  "ready",
  "stale",
]);

export async function getOwnerBalanceData(
  scope: OwnerBalanceScope,
): Promise<OwnerBalanceData> {
  const context = await requireOwnerBalanceReadContext();
  const supabase = await createSupabaseServerClient();

  const [propertiesResult, peopleResult, assignmentsResult] = await Promise.all([
    supabase
      .from("properties")
      .select("id, code, name, archived_at")
      .eq("organization_id", context.organizationId)
      .is("archived_at", null)
      .order("code"),
    supabase
      .from("people")
      .select("id, display_name, archived_at")
      .eq("organization_id", context.organizationId)
      .is("archived_at", null)
      .order("display_name"),
    supabase
      .from("property_owners")
      .select("id, property_id, person_id, started_on, ended_on, archived_at")
      .eq("organization_id", context.organizationId)
      .is("archived_at", null)
      .order("started_on"),
  ]);

  if (propertiesResult.error || peopleResult.error || assignmentsResult.error) {
    throw new Error("Unable to load authoritative owner balance scope.");
  }

  const propertyOptions = (propertiesResult.data ?? []).map((property) => ({
    id: property.id,
    label: formatPropertyOptionLabel(property),
  }));
  const assignments = assignmentsResult.data ?? [];
  const explicitOwnerIds = new Set(
    assignments.map((assignment) => assignment.person_id),
  );
  const ownerPropertyIds = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const propertyIds = ownerPropertyIds.get(assignment.person_id) ?? new Set();
    propertyIds.add(assignment.property_id);
    ownerPropertyIds.set(assignment.person_id, propertyIds);
  }
  const ownerOptions = (peopleResult.data ?? [])
    .filter((person) => explicitOwnerIds.has(person.id))
    .map((person) => ({
      id: person.id,
      label: person.display_name,
      propertyIds: Array.from(ownerPropertyIds.get(person.id) ?? []).sort(),
    }));

  if (!scope.propertyId || !scope.ownerPersonId) {
    return {
      ownerOptions,
      periods: [],
      propertyOptions,
      queue: [],
      sources: [],
      withdrawalCapacity: null,
    };
  }

  const asOfDate = endOfMonth(scope.periodEnd);
  const [ledgerResult, queueResult, sourcesResult, capacityResult] = await Promise.all([
    supabase.rpc("get_owner_balance_ledger", {
      p_currency: scope.currency,
      p_organization_id: context.organizationId,
      p_owner_person_id: scope.ownerPersonId,
      p_period_end: scope.periodEnd,
      p_period_start: scope.periodStart,
      p_property_id: scope.propertyId,
    }),
    supabase.rpc("get_owner_event_allocation_queue", {
      p_currency: scope.currency,
      p_organization_id: context.organizationId,
      p_period_end: endOfMonth(scope.periodEnd),
      p_period_start: scope.periodStart,
      p_property_id: scope.propertyId,
    }),
    supabase.rpc("get_owner_balance_source_ledger", {
      p_currency: scope.currency,
      p_organization_id: context.organizationId,
      p_owner_person_id: scope.ownerPersonId,
      p_period_end: scope.periodEnd,
      p_period_start: scope.periodStart,
      p_property_id: scope.propertyId,
    }),
    supabase.rpc("get_owner_available_withdrawal", {
      p_as_of_date: asOfDate,
      p_currency: scope.currency,
      p_organization_id: context.organizationId,
      p_owner_person_id: scope.ownerPersonId,
      p_property_id: scope.propertyId,
    }),
  ]);

  if (
    ledgerResult.error ||
    queueResult.error ||
    sourcesResult.error ||
    capacityResult.error
  ) {
    throw new Error("Unable to load authoritative owner balances.");
  }

  return {
    ownerOptions,
    periods: mapPeriods((ledgerResult.data ?? []) as OwnerBalanceLedgerRow[]),
    propertyOptions,
    queue: ((queueResult.data ?? []) as OwnerEventQueueRow[]).map((row) => ({
      allocationSetId: row.allocation_set_id,
      allocationState: row.allocation_state,
      eventDate: row.event_date,
      grossSignedAmount: canonicalizeSignedOwnerOpeningAmount(row.gross_signed_amount),
      remediationCode: row.remediation_code,
      remediationDetail: row.remediation_detail,
      sourceId: row.source_id,
      sourceLineId: row.source_line_id,
      sourceType: row.source_type,
    })),
    sources: mapSources((sourcesResult.data ?? []) as OwnerBalanceSourceRow[]),
    withdrawalCapacity: mapWithdrawalCapacity(capacityResult.data),
  };
}

function mapWithdrawalCapacity(value: unknown): OwnerWithdrawalCapacity {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid authoritative owner distribution capacity.");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.as_of_date !== "string" ||
    typeof row.authoritative_held_cash !== "string" ||
    (row.available_withdrawal !== null &&
      typeof row.available_withdrawal !== "string") ||
    typeof row.committed_reserved !== "string" ||
    (row.period_status !== null && typeof row.period_status !== "string") ||
    typeof row.status !== "string"
  ) {
    throw new Error("Invalid authoritative owner distribution capacity.");
  }
  return {
    asOfDate: row.as_of_date,
    authoritativeHeldCash: canonicalizeSignedOwnerOpeningAmount(
      row.authoritative_held_cash,
    ),
    availableWithdrawal: row.available_withdrawal === null
      ? null
      : canonicalizeSignedOwnerOpeningAmount(row.available_withdrawal),
    committedReserved: canonicalizeSignedOwnerOpeningAmount(
      row.committed_reserved,
    ),
    periodStatus: row.period_status,
    status: row.status,
  };
}

function mapSources(rows: OwnerBalanceSourceRow[]): OwnerBalanceSourceRecord[] {
  const sources = new Map<string, OwnerBalanceSourceRecord>();

  for (const row of rows) {
    if (!/^\d{1,3}\.\d{3}$/.test(row.ownership_percent_snapshot)) {
      throw new Error("Invalid authoritative ownership percentage snapshot.");
    }
    const existing = sources.get(row.allocation_set_id) ?? {
      allocatedGrossSignedAmount: canonicalizeSignedOwnerOpeningAmount(
        row.allocated_gross_signed_amount,
      ),
      allocationBasis: row.allocation_basis,
      allocationSetId: row.allocation_set_id,
      eventDate: row.event_date,
      grossSignedAmount: canonicalizeSignedOwnerOpeningAmount(row.gross_signed_amount),
      movements: [],
      ownershipPercentSnapshot: row.ownership_percent_snapshot,
      ownershipRosterHash: row.ownership_roster_hash,
      reversalOfAllocationSetId: row.reversal_of_allocation_set_id,
      sourceFingerprint: row.source_fingerprint,
      sourceId: row.source_id,
      sourceLineId: row.source_line_id,
      sourceType: row.source_type,
    };
    if (row.movement_id !== null) {
      if (row.component === null || row.signed_amount === null) {
        throw new Error("Incomplete authoritative owner component movement.");
      }
      existing.movements.push({
        component: row.component,
        id: row.movement_id,
        reversalOfMovementId: row.reversal_of_movement_id,
        signedAmount: canonicalizeSignedOwnerOpeningAmount(row.signed_amount),
      });
    }
    sources.set(row.allocation_set_id, existing);
  }

  return [...sources.values()].sort((left, right) =>
    left.eventDate.localeCompare(right.eventDate) ||
    left.sourceLineId.localeCompare(right.sourceLineId),
  );
}

function endOfMonth(monthStart: string) {
  const date = new Date(`${monthStart}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

function mapPeriods(rows: OwnerBalanceLedgerRow[]): OwnerBalancePeriodRecord[] {
  const periods = new Map<string, OwnerBalancePeriodRecord>();

  for (const row of rows) {
    if (!PERIOD_STATUSES.has(row.period_status as OwnerBalancePeriodStatus)) {
      throw new Error("Invalid authoritative owner balance period status.");
    }
    const existing = periods.get(row.period_id) ?? {
      availableWithdrawal: row.available_withdrawal === null
        ? null
        : canonicalizeSignedOwnerOpeningAmount(row.available_withdrawal),
      blockedReasonCode: row.blocked_reason_code,
      blockedReasonDetail: row.blocked_reason_detail,
      components: [],
      id: row.period_id,
      inputHash: row.input_hash,
      inputWatermark: row.input_watermark,
      monthStart: row.month_start,
      status: row.period_status as OwnerBalancePeriodStatus,
    };

    if (row.component !== null) {
      if (
        row.opening_amount === null ||
        row.movement_amount === null ||
        row.closing_amount === null ||
        !OWNER_BALANCE_COMPONENTS.includes(row.component)
      ) {
        throw new Error("Incomplete authoritative owner balance component.");
      }
      if (existing.components.some((item) => item.component === row.component)) {
        throw new Error("Duplicate authoritative owner balance component.");
      }
      existing.components.push({
        closingAmount: canonicalizeSignedOwnerOpeningAmount(row.closing_amount),
        component: row.component,
        movementAmount: canonicalizeSignedOwnerOpeningAmount(row.movement_amount),
        openingAmount: canonicalizeSignedOwnerOpeningAmount(row.opening_amount),
      });
    }
    periods.set(row.period_id, existing);
  }

  const componentRank = new Map(
    OWNER_BALANCE_COMPONENTS.map((component, index) => [component, index]),
  );
  const result = [...periods.values()].sort((left, right) =>
    left.monthStart.localeCompare(right.monthStart),
  );
  for (const period of result) {
    period.components.sort(
      (left, right) =>
        (componentRank.get(left.component) ?? 0) -
        (componentRank.get(right.component) ?? 0),
    );
    if (period.status !== "blocked" && period.components.length !== 4) {
      throw new Error("Authoritative owner balance period is missing a component.");
    }
  }
  return result;
}

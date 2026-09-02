import { requireOwnerBalanceReadContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { formatPropertyOptionLabel } from "@/lib/entity-option-labels";
import { canonicalizeSignedOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";
import {
  OWNER_BALANCE_COMPONENTS,
  type OwnerAccountRegisterRecord,
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
  registerPage?: number;
};

const OWNER_ACCOUNT_REGISTER_PAGE_SIZE = 12;
const OWNER_ACCOUNT_REGISTER_RPC_CONCURRENCY = 4;

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

  const propertyLabels = new Map(
    propertyOptions.map((option) => [option.id, option.label]),
  );
  const ownerLabels = new Map(
    ownerOptions.map((option) => [option.id, option.label]),
  );
  const accountAssignments = uniqueAccountAssignments(
    assignments.filter(
      (assignment) =>
        (!scope.propertyId || assignment.property_id === scope.propertyId) &&
        (!scope.ownerPersonId || assignment.person_id === scope.ownerPersonId) &&
        assignment.started_on !== null &&
        assignment.started_on <= endOfMonth(scope.periodEnd) &&
        (!assignment.ended_on || assignment.ended_on >= scope.periodStart) &&
        propertyLabels.has(assignment.property_id) &&
        ownerLabels.has(assignment.person_id),
    ),
  ).sort(
    (left, right) =>
      ownerLabels.get(left.person_id)!.localeCompare(
        ownerLabels.get(right.person_id)!,
      ) ||
      propertyLabels.get(left.property_id)!.localeCompare(
        propertyLabels.get(right.property_id)!,
      ),
  );
  const hasExactScope = Boolean(
    scope.propertyId &&
      scope.ownerPersonId &&
      assignments.some(
        (assignment) =>
          assignment.property_id === scope.propertyId &&
          assignment.person_id === scope.ownerPersonId &&
          propertyLabels.has(assignment.property_id) &&
          ownerLabels.has(assignment.person_id),
      ),
  );

  if (!hasExactScope) {
    const accountTotal = accountAssignments.length;
    const accountPageCount = Math.max(
      1,
      Math.ceil(accountTotal / OWNER_ACCOUNT_REGISTER_PAGE_SIZE),
    );
    const accountPage = Math.min(
      Math.max(scope.registerPage ?? 1, 1),
      accountPageCount,
    );
    const pageStart =
      (accountPage - 1) * OWNER_ACCOUNT_REGISTER_PAGE_SIZE;
    const accounts = await loadOwnerAccountRegister({
      assignments: accountAssignments.slice(
        pageStart,
        pageStart + OWNER_ACCOUNT_REGISTER_PAGE_SIZE,
      ),
      currency: scope.currency,
      organizationId: context.organizationId,
      ownerLabels,
      periodEnd: scope.periodEnd,
      periodStart: scope.periodStart,
      propertyLabels,
      supabase,
    });
    return {
      accountPage,
      accountPageCount,
      accountPageSize: OWNER_ACCOUNT_REGISTER_PAGE_SIZE,
      accountTotal,
      accounts,
      ownerOptions,
      periods: [],
      propertyOptions,
      queue: [],
      sources: [],
      withdrawalCapacity: null,
    };
  }

  const propertyId = scope.propertyId;
  const ownerPersonId = scope.ownerPersonId;
  if (!propertyId || !ownerPersonId) {
    throw new Error("Invalid authoritative owner balance scope.");
  }

  const asOfDate = endOfMonth(scope.periodEnd);
  const [ledgerResult, queueResult, sourcesResult, capacityResult] = await Promise.all([
    supabase.rpc("get_owner_balance_ledger", {
      p_currency: scope.currency,
      p_organization_id: context.organizationId,
      p_owner_person_id: ownerPersonId,
      p_period_end: scope.periodEnd,
      p_period_start: scope.periodStart,
      p_property_id: propertyId,
    }),
    supabase.rpc("get_owner_event_allocation_queue", {
      p_currency: scope.currency,
      p_organization_id: context.organizationId,
      p_period_end: endOfMonth(scope.periodEnd),
      p_period_start: scope.periodStart,
      p_property_id: propertyId,
    }),
    supabase.rpc("get_owner_balance_source_ledger", {
      p_currency: scope.currency,
      p_organization_id: context.organizationId,
      p_owner_person_id: ownerPersonId,
      p_period_end: scope.periodEnd,
      p_period_start: scope.periodStart,
      p_property_id: propertyId,
    }),
    supabase.rpc("get_owner_available_withdrawal", {
      p_as_of_date: asOfDate,
      p_currency: scope.currency,
      p_organization_id: context.organizationId,
      p_owner_person_id: ownerPersonId,
      p_property_id: propertyId,
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
    accountPage: 1,
    accountPageCount: 1,
    accountPageSize: OWNER_ACCOUNT_REGISTER_PAGE_SIZE,
    accountTotal: 1,
    accounts: [],
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

type OwnerAssignment = {
  ended_on: string | null;
  person_id: string;
  property_id: string;
  started_on: string | null;
};

function uniqueAccountAssignments<T extends OwnerAssignment>(assignments: T[]) {
  const unique = new Map<string, T>();
  for (const assignment of assignments) {
    const key = `${assignment.property_id}:${assignment.person_id}`;
    const existing = unique.get(key);
    if (
      !existing ||
      (assignment.started_on ?? "") > (existing.started_on ?? "")
    ) {
      unique.set(key, assignment);
    }
  }
  return [...unique.values()];
}

async function loadOwnerAccountRegister({
  assignments,
  currency,
  organizationId,
  ownerLabels,
  periodEnd,
  periodStart,
  propertyLabels,
  supabase,
}: {
  assignments: OwnerAssignment[];
  currency: "USD";
  organizationId: string;
  ownerLabels: Map<string, string>;
  periodEnd: string;
  periodStart: string;
  propertyLabels: Map<string, string>;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}): Promise<OwnerAccountRegisterRecord[]> {
  const asOfDate = endOfMonth(periodEnd);
  const propertyIds = Array.from(
    new Set(assignments.map((assignment) => assignment.property_id)),
  );
  const queueEntries = await mapWithConcurrency(
    propertyIds,
    OWNER_ACCOUNT_REGISTER_RPC_CONCURRENCY,
    async (propertyId) => {
      const result = await supabase.rpc("get_owner_event_allocation_queue", {
          p_currency: currency,
          p_organization_id: organizationId,
          p_period_end: asOfDate,
          p_period_start: periodStart,
          p_property_id: propertyId,
        });
      if (result.error) {
        throw new Error("Unable to load authoritative owner account register.");
      }
      return [
        propertyId,
        mapQueue((result.data ?? []) as OwnerEventQueueRow[]),
      ] as const;
    },
  );
  const queueByProperty = new Map(queueEntries);

  const accounts = await mapWithConcurrency(
    assignments,
    Math.max(1, Math.floor(OWNER_ACCOUNT_REGISTER_RPC_CONCURRENCY / 2)),
    async (assignment) => {
      const [ledgerResult, capacityResult] = await Promise.all([
        supabase.rpc("get_owner_balance_ledger", {
          p_currency: currency,
          p_organization_id: organizationId,
          p_owner_person_id: assignment.person_id,
          p_period_end: periodEnd,
          p_period_start: periodStart,
          p_property_id: assignment.property_id,
        }),
        supabase.rpc("get_owner_available_withdrawal", {
          p_as_of_date: asOfDate,
          p_currency: currency,
          p_organization_id: organizationId,
          p_owner_person_id: assignment.person_id,
          p_property_id: assignment.property_id,
        }),
      ]);

      if (ledgerResult.error || capacityResult.error) {
        throw new Error("Unable to load authoritative owner account register.");
      }

      const periods = mapPeriods(
        (ledgerResult.data ?? []) as OwnerBalanceLedgerRow[],
      );
      const period = periods.find((item) => item.monthStart === periodStart) ?? null;
      const capacity = mapWithdrawalCapacity(capacityResult.data);
      const queue = queueByProperty.get(assignment.property_id) ?? [];
      const issueCodes = Array.from(
        new Set(
          queue.map(
            (item) => item.remediationCode ?? item.allocationState,
          ),
        ),
      );
      if (period?.blockedReasonCode) {
        issueCodes.push(period.blockedReasonCode);
      }
      const remediationPath = queue
        .map((item) => ownerRemediationPath(item.remediationDetail))
        .find((value): value is string => value !== null) ?? null;

      return {
        availableAmount:
          period && capacity.status === "available"
            ? capacity.availableWithdrawal
            : null,
        issueCodes: Array.from(new Set(issueCodes)),
        issueCount:
          queue.length > 0
            ? queue.length
            : period?.status === "blocked"
              ? blockedIssueCount(period.blockedReasonDetail)
              : 0,
        lastActivityDate:
          registerActivityDate(period?.inputWatermark, capacity.asOfDate),
        lastActivityDetail: period?.inputWatermark ?? null,
        ownerLabel: ownerLabels.get(assignment.person_id)!,
        ownerPersonId: assignment.person_id,
        periodStatus: period?.status ?? null,
        propertyId: assignment.property_id,
        propertyLabel: propertyLabels.get(assignment.property_id)!,
        remediationPath,
        withdrawalStatus: capacity.status,
      } satisfies OwnerAccountRegisterRecord;
    },
  );

  return accounts.sort(
    (left, right) =>
      left.ownerLabel.localeCompare(right.ownerLabel) ||
      left.propertyLabel.localeCompare(right.propertyLabel),
  );
}

function registerActivityDate(
  inputWatermark: string | null | undefined,
  fallbackDate: string,
) {
  return inputWatermark?.match(/^\d{4}-\d{2}-\d{2}(?=T|$)/)?.[0] ?? fallbackDate;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  map: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await map(items[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function ownerRemediationPath(value: unknown) {
  if (!value || typeof value !== "object" || !("setup_path" in value)) {
    return null;
  }
  const path = (value as { setup_path?: unknown }).setup_path;
  return typeof path === "string" && path.startsWith("/properties/")
    ? path
    : null;
}

function blockedIssueCount(value: unknown) {
  if (!value || typeof value !== "object" || !("source_count" in value)) {
    return 1;
  }
  const count = (value as { source_count?: unknown }).source_count;
  return typeof count === "number" && Number.isSafeInteger(count) && count > 0
    ? count
    : 1;
}

function mapQueue(rows: OwnerEventQueueRow[]) {
  return rows.map((row) => ({
    allocationSetId: row.allocation_set_id,
    allocationState: row.allocation_state,
    eventDate: row.event_date,
    grossSignedAmount: canonicalizeSignedOwnerOpeningAmount(row.gross_signed_amount),
    remediationCode: row.remediation_code,
    remediationDetail: row.remediation_detail,
    sourceId: row.source_id,
    sourceLineId: row.source_line_id,
    sourceType: row.source_type,
  }));
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

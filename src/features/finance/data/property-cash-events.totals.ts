import { formatExactCents } from "@/features/finance/data/property-cash-events.money";
import type {
  PropertyCashEvent,
  PropertyCashEventSourceIdentity,
} from "@/features/finance/data/property-cash-events.types";

const DEFAULT_DIAGNOSTIC_SOURCE_LIMIT = 10_000;
const MAX_DIAGNOSTIC_SOURCE_LIMIT = 10_000;

export type PropertyCashMovementTotals = {
  countedEffectCount: number;
  currency: "USD";
  depositLiabilityMovementCents: bigint;
  managementFeeEffectCents: bigint;
  operatingExpenseCents: bigint;
  operatingIncomeCents: bigint;
  ownerCashMovementCents: bigint;
  ownerContributionCents: bigint;
  ownerDistributionCents: bigint;
  ownerReserveCents: bigint;
  provisional: {
    count: number;
    sources: PropertyCashEventSourceIdentity[];
  };
  requiresResolutionCount: number;
  sourceStableCount: number;
  unresolved: {
    count: number;
    sources: PropertyCashEventSourceIdentity[];
  };
};

export async function summarizePropertyCashMovements(
  events: AsyncIterable<PropertyCashEvent>,
  options: { diagnosticSourceLimit?: number } = {},
): Promise<PropertyCashMovementTotals> {
  const diagnosticSourceLimit =
    options.diagnosticSourceLimit ?? DEFAULT_DIAGNOSTIC_SOURCE_LIMIT;
  if (
    !Number.isSafeInteger(diagnosticSourceLimit) ||
    diagnosticSourceLimit < 1
  ) {
    throw new Error("Property cash diagnostic source limit must be positive.");
  }
  if (diagnosticSourceLimit > MAX_DIAGNOSTIC_SOURCE_LIMIT) {
    throw new Error(
      "Property cash diagnostic source limit cannot exceed 10,000.",
    );
  }

  const totals: PropertyCashMovementTotals = {
    countedEffectCount: 0,
    currency: "USD",
    depositLiabilityMovementCents: BigInt(0),
    managementFeeEffectCents: BigInt(0),
    operatingExpenseCents: BigInt(0),
    operatingIncomeCents: BigInt(0),
    ownerCashMovementCents: BigInt(0),
    ownerContributionCents: BigInt(0),
    ownerDistributionCents: BigInt(0),
    ownerReserveCents: BigInt(0),
    provisional: { count: 0, sources: [] },
    requiresResolutionCount: 0,
    sourceStableCount: 0,
    unresolved: { count: 0, sources: [] },
  };

  for await (const event of events) {
    if (event.currency !== "USD" || event.currency !== totals.currency) {
      throw new Error("Property cash totals reject mixed or unsupported currency.");
    }

    if (event.requiresResolution) {
      totals.requiresResolutionCount += 1;
    }
    addClassificationMetadata(totals, event, diagnosticSourceLimit);

    const hasCountedEffect =
      event.ownerCashEffectCents !== null ||
      event.operatingCashEffectCents !== null ||
      event.depositLiabilityEffectCents !== null ||
      event.managementFeeEffectCents !== null;
    if (hasCountedEffect) totals.countedEffectCount += 1;

    totals.ownerCashMovementCents +=
      event.ownerCashEffectCents ?? BigInt(0);
    totals.depositLiabilityMovementCents +=
      event.depositLiabilityEffectCents ?? BigInt(0);
    totals.managementFeeEffectCents +=
      event.managementFeeEffectCents ?? BigInt(0);

    if (
      event.economicClass === "operating_income" &&
      event.operatingCashEffectCents !== null
    ) {
      totals.operatingIncomeCents += event.operatingCashEffectCents;
    }
    if (
      event.economicClass === "operating_expense" &&
      event.operatingCashEffectCents !== null
    ) {
      totals.operatingExpenseCents += event.operatingCashEffectCents;
    }
    if (
      event.economicClass === "owner_contribution" &&
      event.ownerCashEffectCents !== null
    ) {
      totals.ownerContributionCents += event.ownerCashEffectCents;
    }
    if (
      event.economicClass === "owner_distribution" &&
      event.ownerCashEffectCents !== null
    ) {
      totals.ownerDistributionCents += event.ownerCashEffectCents;
    }
    if (
      event.economicClass === "owner_reserve" &&
      event.ownerCashEffectCents !== null
    ) {
      totals.ownerReserveCents += event.ownerCashEffectCents;
    }
  }

  return totals;
}

export function serializePropertyCashMovementTotals(
  totals: PropertyCashMovementTotals,
) {
  return {
    currency: totals.currency,
    depositLiabilityMovement: formatExactCents(
      totals.depositLiabilityMovementCents,
    ),
    managementFeeEffect: formatExactCents(totals.managementFeeEffectCents),
    operatingExpenses: formatExactCents(totals.operatingExpenseCents),
    operatingIncome: formatExactCents(totals.operatingIncomeCents),
    ownerCashMovement: formatExactCents(totals.ownerCashMovementCents),
    ownerContributions: formatExactCents(totals.ownerContributionCents),
    ownerDistributions: formatExactCents(totals.ownerDistributionCents),
    ownerReserves: formatExactCents(totals.ownerReserveCents),
    provisional: totals.provisional,
    requiresResolutionCount: totals.requiresResolutionCount,
    sourceStableCount: totals.sourceStableCount,
    unresolved: totals.unresolved,
  };
}

function addClassificationMetadata(
  totals: PropertyCashMovementTotals,
  event: PropertyCashEvent,
  diagnosticSourceLimit: number,
) {
  if (event.classificationStatus === "source_stable") {
    totals.sourceStableCount += 1;
    return;
  }

  const identity = {
    eventKey: event.eventKey,
    sourceId: event.sourceId,
    sourceType: event.sourceType,
  };

  if (event.classificationStatus === "provisional_current_obligation") {
    totals.provisional.count += 1;
    pushBoundedIdentity(
      totals.provisional.sources,
      identity,
      diagnosticSourceLimit,
    );
    return;
  }

  totals.unresolved.count += 1;
  pushBoundedIdentity(
    totals.unresolved.sources,
    identity,
    diagnosticSourceLimit,
  );
}

function pushBoundedIdentity(
  identities: PropertyCashEventSourceIdentity[],
  identity: PropertyCashEventSourceIdentity,
  limit: number,
) {
  if (identities.length >= limit) {
    throw new Error(
      "Property cash diagnostic source limit exceeded before exact identities could be returned.",
    );
  }
  identities.push(identity);
}

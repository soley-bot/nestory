import { formatExactCents } from "@/features/finance/data/property-cash-events.money";
import type {
  PropertyCashEvent,
  PropertyCashEventSourceIdentity,
} from "@/features/finance/data/property-cash-events.types";

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
  resolvedCount: number;
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
    options.diagnosticSourceLimit ?? MAX_DIAGNOSTIC_SOURCE_LIMIT;
  if (
    !Number.isSafeInteger(diagnosticSourceLimit) ||
    diagnosticSourceLimit < 1 ||
    diagnosticSourceLimit > MAX_DIAGNOSTIC_SOURCE_LIMIT
  ) {
    throw new Error(
      "Property cash diagnostic source limit must be between 1 and 10,000.",
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
    resolvedCount: 0,
    unresolved: { count: 0, sources: [] },
  };

  for await (const event of events) {
    if (event.currency !== totals.currency) {
      throw new Error("Property cash totals reject mixed or unsupported currency.");
    }

    if (event.resolutionState === "unresolved") {
      totals.unresolved.count += 1;
      if (totals.unresolved.sources.length >= diagnosticSourceLimit) {
        throw new Error(
          "Property cash diagnostic source limit exceeded before exact identities could be returned.",
        );
      }
      totals.unresolved.sources.push({
        eventKey: event.eventKey,
        sourceId: event.sourceId,
        sourceType: event.sourceType,
      });
      continue;
    }

    totals.resolvedCount += 1;
    totals.countedEffectCount += 1;
    totals.ownerCashMovementCents += event.ownerCashEffectCents ?? BigInt(0);
    totals.depositLiabilityMovementCents +=
      event.depositLiabilityEffectCents ?? BigInt(0);
    totals.managementFeeEffectCents +=
      event.managementFeeEffectCents ?? BigInt(0);

    if (event.economicClass === "operating_income") {
      totals.operatingIncomeCents += event.operatingCashEffectCents ?? BigInt(0);
    }
    if (event.economicClass === "operating_expense") {
      totals.operatingExpenseCents += event.operatingCashEffectCents ?? BigInt(0);
    }
    if (event.economicClass === "owner_contribution") {
      totals.ownerContributionCents += event.ownerCashEffectCents ?? BigInt(0);
    }
    if (event.economicClass === "owner_distribution") {
      totals.ownerDistributionCents += event.ownerCashEffectCents ?? BigInt(0);
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
    resolvedCount: totals.resolvedCount,
    unresolved: totals.unresolved,
  };
}

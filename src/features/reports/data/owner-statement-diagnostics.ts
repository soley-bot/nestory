import {
  buildPropertyCash,
  type PropertyCashInput,
} from "@/features/finance/property-cash";

export type OwnerStatementCashDiagnostic = {
  currentPeriodRentCashCents: number;
  propertyId: string;
  rentArrearsCents: number;
  rentChargeCount: number;
  rentDueCents: number;
  rentReceivedCents: number;
};

export function buildOwnerStatementCashDiagnostics(
  cashInput: PropertyCashInput,
): OwnerStatementCashDiagnostic[] {
  const result = buildPropertyCash(cashInput);
  const rentIds = new Set(
    cashInput.incomeItems
      .filter(
        (item) =>
          item.incomeType === "rent" &&
          item.dueDate >= cashInput.monthScope.from &&
          item.dueDate < cashInput.monthScope.before,
      )
      .map((item) => item.id),
  );

  return result.properties.map((facts) => ({
    currentPeriodRentCashCents: facts.sourceLines
      .filter(
        (line) =>
          line.classification === "operating_receipt" &&
          line.incomeItemId !== null &&
          rentIds.has(line.incomeItemId) &&
          line.eventDate >= cashInput.monthScope.from &&
          line.eventDate < cashInput.monthScope.before,
      )
      .reduce((sum, line) => sum + line.signedAmountCents, 0),
    propertyId: facts.propertyId,
    rentArrearsCents: facts.arrearsCents,
    rentChargeCount: facts.sourceLines.filter(
      (line) => line.classification === "rent_due",
    ).length,
    rentDueCents: facts.rentDueCents,
    rentReceivedCents: facts.rentReceivedCents,
  }));
}

export function ownerStatementCashDiagnosticCopy(
  diagnostic: OwnerStatementCashDiagnostic | undefined,
) {
  if (!diagnostic || diagnostic.rentChargeCount === 0) {
    return "No rent charge is due in the selected period.";
  }

  if (diagnostic.rentReceivedCents <= 0) {
    return "Cash-basis: rent was charged, but no cash was received for that charge by period end.";
  }

  if (diagnostic.rentArrearsCents > 0) {
    return "Cash-basis: rent was partially received. Only received cash appears; the remaining balance stays outside cash totals.";
  }

  if (diagnostic.currentPeriodRentCashCents <= 0) {
    return "Cash-basis: the rent charge was fully received outside this period, so no rent cash appears in this period's totals.";
  }

  return "Cash-basis: the full rent receipt is included in this period's operating cash.";
}

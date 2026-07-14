export type PropertyCashMoney = number | string;

export type PropertyCashMonthScope = {
  before: string;
  from: string;
};

export type PropertyCashIncomeItem = {
  amountDue: PropertyCashMoney;
  dueDate: string;
  id: string;
  incomeType: string;
  propertyId: string;
};

export type PropertyCashReceiptAllocation = {
  allocationId: string;
  amount: PropertyCashMoney;
  incomeItemId: string;
  receiptId: string;
  receivedDate: string;
  reversalOfId: string | null;
};

export type PropertyCashExpenseItem = {
  economicScope: string;
  expenseType: string;
  id: string;
  propertyId: string;
};

export type PropertyCashPaymentAllocation = {
  allocationId: string;
  amount: PropertyCashMoney;
  expenseItemId: string;
  paidDate: string;
  paymentId: string;
  reversalOfId: string | null;
};

export type PropertyCashDepositEventType =
  | "applied"
  | "received"
  | "refunded"
  | "retained";

export type PropertyCashDepositEvent = {
  amount: PropertyCashMoney;
  depositEventId: string;
  eventDate: string;
  eventType: PropertyCashDepositEventType | "reversed";
  propertyId: string;
  reversedEventType: PropertyCashDepositEventType | null;
};

export type PropertyCashInput = {
  depositEvents: PropertyCashDepositEvent[];
  expenseItems: PropertyCashExpenseItem[];
  incomeItems: PropertyCashIncomeItem[];
  monthScope: PropertyCashMonthScope;
  paymentAllocations: PropertyCashPaymentAllocation[];
  propertyIds: string[];
  receiptAllocations: PropertyCashReceiptAllocation[];
};

export type PropertyCashClassification =
  | "management_fee_earned"
  | "management_fee_received"
  | "operating_receipt"
  | "owner_contribution"
  | "owner_payout"
  | "property_expense"
  | "rent_due"
  | "security_deposit";

export type PropertyCashSourceLine = {
  allocationId: string | null;
  classification: PropertyCashClassification;
  depositEventId: string | null;
  eventDate: string;
  expenseItemId: string | null;
  incomeItemId: string | null;
  paymentId: string | null;
  propertyId: string;
  receiptId: string | null;
  signedAmountCents: number;
};

export type PropertyCashTotals = {
  arrearsCents: number;
  managementFeesEarnedCents: number;
  managementFeesOutstandingCents: number;
  managementFeesReceivedCents: number;
  netOwnerCashMovementCents: number;
  operatingCashReceivedCents: number;
  ownerContributionCents: number;
  ownerPayoutCents: number;
  propertyExpensesPaidCents: number;
  rentDueCents: number;
  rentReceivedCents: number;
  securityDepositHeldCents: number;
};

export type PropertyCashPropertyFacts = PropertyCashTotals & {
  propertyId: string;
  sourceLines: PropertyCashSourceLine[];
};

export type PropertyCashResult = {
  properties: PropertyCashPropertyFacts[];
  totals: PropertyCashTotals;
};

export function buildPropertyCash(input: PropertyCashInput): PropertyCashResult {
  const factsByPropertyId = new Map<string, PropertyCashPropertyFacts>();
  const incomeItemsById = new Map(
    input.incomeItems.map((item) => [item.id, item]),
  );
  const expenseItemsById = new Map(
    input.expenseItems.map((item) => [item.id, item]),
  );
  const receivedCentsByIncomeItemId = sumSignedReceiptAllocations(
    input.receiptAllocations,
    input.monthScope.before,
  );

  for (const propertyId of [...new Set(input.propertyIds)].toSorted()) {
    factsByPropertyId.set(propertyId, emptyPropertyFacts(propertyId));
  }

  for (const item of input.incomeItems) {
    const facts = factsByPropertyId.get(item.propertyId);
    if (!facts || !isDateInScope(item.dueDate, input.monthScope)) continue;

    const amountDueCents = toCents(item.amountDue);
    const receivedCents = receivedCentsByIncomeItemId.get(item.id) ?? 0;

    if (item.incomeType === "rent") {
      facts.rentDueCents += amountDueCents;
      facts.rentReceivedCents += clamp(receivedCents, 0, amountDueCents);
      facts.arrearsCents += Math.max(amountDueCents - receivedCents, 0);
      facts.sourceLines.push(
        sourceLine({
          classification: "rent_due",
          eventDate: item.dueDate,
          incomeItemId: item.id,
          propertyId: item.propertyId,
          signedAmountCents: amountDueCents,
        }),
      );
    }

    if (isManagementCompanyFee(item.incomeType)) {
      facts.managementFeesEarnedCents += amountDueCents;
      facts.managementFeesOutstandingCents += Math.max(
        amountDueCents - receivedCents,
        0,
      );
      facts.sourceLines.push(
        sourceLine({
          classification: "management_fee_earned",
          eventDate: item.dueDate,
          incomeItemId: item.id,
          propertyId: item.propertyId,
          signedAmountCents: amountDueCents,
        }),
      );
    }
  }

  for (const allocation of input.receiptAllocations) {
    const item = incomeItemsById.get(allocation.incomeItemId);
    const facts = item ? factsByPropertyId.get(item.propertyId) : undefined;
    if (!item || !facts || item.incomeType === "security_deposit") continue;

    const cashInScope = isDateInScope(
      allocation.receivedDate,
      input.monthScope,
    );
    const supportsScopedObligation =
      allocation.receivedDate < input.monthScope.before &&
      isDateInScope(item.dueDate, input.monthScope) &&
      (item.incomeType === "rent" ||
        isManagementCompanyFee(item.incomeType));
    if (!cashInScope && !supportsScopedObligation) continue;

    const signedAmountCents = signedCents(
      allocation.amount,
      allocation.reversalOfId,
    );
    const classification = classifyReceipt(item.incomeType);

    if (cashInScope) {
      if (classification === "management_fee_received") {
        facts.managementFeesReceivedCents += signedAmountCents;
      } else if (classification === "owner_contribution") {
        facts.ownerContributionCents += signedAmountCents;
      } else {
        facts.operatingCashReceivedCents += signedAmountCents;
      }
    }

    facts.sourceLines.push(
      sourceLine({
        allocationId: allocation.allocationId,
        classification,
        eventDate: allocation.receivedDate,
        incomeItemId: item.id,
        propertyId: item.propertyId,
        receiptId: allocation.receiptId,
        signedAmountCents,
      }),
    );
  }

  for (const allocation of input.paymentAllocations) {
    if (!isDateInScope(allocation.paidDate, input.monthScope)) continue;

    const item = expenseItemsById.get(allocation.expenseItemId);
    const facts = item ? factsByPropertyId.get(item.propertyId) : undefined;
    if (!item || !facts || item.economicScope !== "property_expense") continue;

    const signedAmountCents = signedCents(
      allocation.amount,
      allocation.reversalOfId,
    );
    const classification =
      item.expenseType === "owner_payout"
        ? "owner_payout"
        : "property_expense";

    if (classification === "owner_payout") {
      facts.ownerPayoutCents += signedAmountCents;
    } else {
      facts.propertyExpensesPaidCents += signedAmountCents;
    }

    facts.sourceLines.push(
      sourceLine({
        allocationId: allocation.allocationId,
        classification,
        eventDate: allocation.paidDate,
        expenseItemId: item.id,
        paymentId: allocation.paymentId,
        propertyId: item.propertyId,
        signedAmountCents,
      }),
    );
  }

  for (const event of input.depositEvents) {
    if (event.eventDate >= input.monthScope.before) continue;

    const facts = factsByPropertyId.get(event.propertyId);
    if (!facts) continue;

    const signedAmountCents = depositBalanceEffectCents(event);
    facts.securityDepositHeldCents += signedAmountCents;
    facts.sourceLines.push(
      sourceLine({
        classification: "security_deposit",
        depositEventId: event.depositEventId,
        eventDate: event.eventDate,
        propertyId: event.propertyId,
        signedAmountCents,
      }),
    );
  }

  const properties = [...factsByPropertyId.values()]
    .map(finalizePropertyFacts)
    .toSorted((first, second) => first.propertyId.localeCompare(second.propertyId));

  return {
    properties,
    totals: sumPropertyFacts(properties),
  };
}

function emptyPropertyFacts(propertyId: string): PropertyCashPropertyFacts {
  return {
    ...emptyTotals(),
    propertyId,
    sourceLines: [],
  };
}

function emptyTotals(): PropertyCashTotals {
  return {
    arrearsCents: 0,
    managementFeesEarnedCents: 0,
    managementFeesOutstandingCents: 0,
    managementFeesReceivedCents: 0,
    netOwnerCashMovementCents: 0,
    operatingCashReceivedCents: 0,
    ownerContributionCents: 0,
    ownerPayoutCents: 0,
    propertyExpensesPaidCents: 0,
    rentDueCents: 0,
    rentReceivedCents: 0,
    securityDepositHeldCents: 0,
  };
}

function finalizePropertyFacts(
  facts: PropertyCashPropertyFacts,
): PropertyCashPropertyFacts {
  return {
    ...facts,
    netOwnerCashMovementCents:
      facts.operatingCashReceivedCents -
      facts.propertyExpensesPaidCents -
      facts.managementFeesReceivedCents +
      facts.ownerContributionCents -
      facts.ownerPayoutCents,
    sourceLines: facts.sourceLines.toSorted(compareSourceLines),
  };
}

function sumPropertyFacts(
  properties: PropertyCashPropertyFacts[],
): PropertyCashTotals {
  const totals = emptyTotals();

  for (const facts of properties) {
    totals.arrearsCents += facts.arrearsCents;
    totals.managementFeesEarnedCents += facts.managementFeesEarnedCents;
    totals.managementFeesOutstandingCents += facts.managementFeesOutstandingCents;
    totals.managementFeesReceivedCents += facts.managementFeesReceivedCents;
    totals.netOwnerCashMovementCents += facts.netOwnerCashMovementCents;
    totals.operatingCashReceivedCents += facts.operatingCashReceivedCents;
    totals.ownerContributionCents += facts.ownerContributionCents;
    totals.ownerPayoutCents += facts.ownerPayoutCents;
    totals.propertyExpensesPaidCents += facts.propertyExpensesPaidCents;
    totals.rentDueCents += facts.rentDueCents;
    totals.rentReceivedCents += facts.rentReceivedCents;
    totals.securityDepositHeldCents += facts.securityDepositHeldCents;
  }

  return totals;
}

function sumSignedReceiptAllocations(
  rows: PropertyCashReceiptAllocation[],
  before: string,
) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.receivedDate >= before) continue;

    totals.set(
      row.incomeItemId,
      (totals.get(row.incomeItemId) ?? 0) +
        signedCents(row.amount, row.reversalOfId),
    );
  }
  return totals;
}

function signedCents(amount: PropertyCashMoney, reversalOfId: string | null) {
  const cents = toCents(amount);
  return reversalOfId ? -cents : cents;
}

function depositBalanceEffectCents(event: PropertyCashDepositEvent) {
  const amountCents = toCents(event.amount);

  if (event.eventType === "reversed") {
    if (!event.reversedEventType) {
      throw new Error("Deposit reversal must identify the reversed event type");
    }

    return -depositDirection(event.reversedEventType) * amountCents;
  }

  return depositDirection(event.eventType) * amountCents;
}

function depositDirection(eventType: PropertyCashDepositEventType) {
  return eventType === "received" ? 1 : -1;
}

function toCents(value: PropertyCashMoney) {
  const input = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(input);
  if (!match) {
    throw new Error(`Invalid property cash amount: ${input}`);
  }

  const [, sign, whole, fraction = ""] = match;
  const paddedFraction = fraction.padEnd(3, "0");
  const wholeCents = Number(whole) * 100;
  const fractionCents = Number(paddedFraction.slice(0, 2));
  const shouldRound = Number(paddedFraction[2] ?? "0") >= 5;
  const absoluteCents =
    wholeCents + fractionCents + (shouldRound ? 1 : 0);
  const signedValue = sign === "-" ? -absoluteCents : absoluteCents;
  const cents = signedValue;

  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Property cash amount exceeds safe integer cents: ${input}`);
  }

  return cents;
}

function sourceLine(
  line: Pick<
    PropertyCashSourceLine,
    | "classification"
    | "eventDate"
    | "propertyId"
    | "signedAmountCents"
  > &
    Partial<
      Pick<
        PropertyCashSourceLine,
        | "allocationId"
        | "depositEventId"
        | "expenseItemId"
        | "incomeItemId"
        | "paymentId"
        | "receiptId"
      >
    >,
): PropertyCashSourceLine {
  return {
    allocationId: line.allocationId ?? null,
    classification: line.classification,
    depositEventId: line.depositEventId ?? null,
    eventDate: line.eventDate,
    expenseItemId: line.expenseItemId ?? null,
    incomeItemId: line.incomeItemId ?? null,
    paymentId: line.paymentId ?? null,
    propertyId: line.propertyId,
    receiptId: line.receiptId ?? null,
    signedAmountCents: line.signedAmountCents,
  };
}

function compareSourceLines(
  first: PropertyCashSourceLine,
  second: PropertyCashSourceLine,
) {
  return (
    first.eventDate.localeCompare(second.eventDate) ||
    first.classification.localeCompare(second.classification) ||
    sourceLineKey(first).localeCompare(sourceLineKey(second))
  );
}

function sourceLineKey(line: PropertyCashSourceLine) {
  return [
    line.incomeItemId,
    line.expenseItemId,
    line.receiptId,
    line.paymentId,
    line.allocationId,
    line.depositEventId,
  ]
    .filter(Boolean)
    .join(":");
}

function classifyReceipt(
  incomeType: string,
): Extract<
  PropertyCashClassification,
  "management_fee_received" | "operating_receipt" | "owner_contribution"
> {
  if (isManagementCompanyFee(incomeType)) return "management_fee_received";
  if (incomeType === "owner_contribution") return "owner_contribution";
  return "operating_receipt";
}

function isManagementCompanyFee(incomeType: string) {
  return managementCompanyFeeTypes.has(incomeType);
}

function isDateInScope(date: string, scope: PropertyCashMonthScope) {
  return date >= scope.from && date < scope.before;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

const managementCompanyFeeTypes = new Set([
  "leasing_commission",
  "maintenance_markup",
  "management_fee",
  "service_fee",
]);

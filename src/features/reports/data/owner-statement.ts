import {
  buildPropertyCash,
  type PropertyCashClassification,
  type PropertyCashInput,
  type PropertyCashPropertyFacts,
  type PropertyCashSourceLine,
} from "@/features/finance/property-cash";

export type OwnerStatementOwnerLink = {
  archivedAt: string | null;
  endedOn: string | null;
  id: string;
  isPrimary: boolean;
  ownershipPercent: number | string | null;
  personId: string;
  propertyId: string;
  startedOn: string | null;
};

export type OwnerStatementPerson = {
  displayName: string;
  hasUsableContact: boolean;
  id: string;
};

export type OwnerStatementInput = {
  cashInput: PropertyCashInput;
  dataIssues?: OwnerStatementDataIssue[];
  ownerLinks: OwnerStatementOwnerLink[];
  people: OwnerStatementPerson[];
};

export type OwnerStatementFact =
  | "management_fees_earned"
  | "management_fees_outstanding"
  | "management_fees_received"
  | "operating_cash_received"
  | "owner_contributions"
  | "owner_payouts"
  | "ownership"
  | "property_expenses_paid"
  | "security_deposits_held"
  | "supporting_evidence";

export type OwnerStatementEvidenceLine = {
  allocatedAmountCents: number | null;
  allocationId: string | null;
  classification: PropertyCashClassification | "owner_link";
  depositEventId: string | null;
  eventDate: string | null;
  expenseItemId: string | null;
  incomeItemId: string | null;
  ownerEndedOn: string | null;
  ownerLinkId: string | null;
  ownerPersonId: string | null;
  ownerStartedOn: string | null;
  paymentId: string | null;
  propertyId: string;
  receiptId: string | null;
  signedAmountCents: number | null;
  statementFact: OwnerStatementFact;
};

export type OwnerStatementDataIssue = {
  evidence?: OwnerStatementEvidenceLine;
  propertyId: string;
  reason: string;
};

export type OwnerStatementReadyRow = OwnerStatementMoneyFacts & {
  evidence: OwnerStatementEvidenceLine[];
  ownerLinkIds: string[];
  ownerPersonId: string;
  ownershipSharesThousandths: number[];
  propertyId: string;
  status: "ready";
  warnings: string[];
};

export type OwnerStatementBlockedRow = {
  evidence: OwnerStatementEvidenceLine[];
  propertyId: string;
  reasons: string[];
  status: "blocked";
};

export type OwnerStatementRow =
  | OwnerStatementBlockedRow
  | OwnerStatementReadyRow;

export type OwnerStatementSummary = OwnerStatementMoneyFacts & {
  blockedPropertyCount: number;
  readyPropertyCount: number;
  readyStatementCount: number;
};

export type OwnerStatementResult = {
  rows: OwnerStatementRow[];
  summary: OwnerStatementSummary;
};

type OwnerStatementMoneyFacts = {
  managementFeesEarnedCents: number;
  managementFeesOutstandingCents: number;
  managementFeesReceivedCents: number;
  netOwnerCashMovementCents: number;
  operatingCashReceivedCents: number;
  ownerContributionCents: number;
  ownerPayoutCents: number;
  propertyExpensesPaidCents: number;
  securityDepositHeldCents: number;
};

type EffectiveOwner = {
  link: OwnerStatementOwnerLink;
  shareThousandths: number;
};

type ReadyAccumulator = OwnerStatementMoneyFacts & {
  evidence: OwnerStatementEvidenceLine[];
  links: Map<string, OwnerStatementOwnerLink>;
  ownerPersonId: string;
  propertyId: string;
  shares: Set<number>;
};

const totalOwnershipThousandths = 100_000;

export function buildOwnerStatement(
  input: OwnerStatementInput,
): OwnerStatementResult {
  const cash = buildPropertyCash(input.cashInput);
  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  const rows: OwnerStatementRow[] = [];

  for (const facts of cash.properties) {
    const propertyDataIssues = (input.dataIssues ?? []).filter(
      (issue) => issue.propertyId === facts.propertyId,
    );
    const propertyLinks = input.ownerLinks
      .filter(
        (link) =>
          !link.archivedAt &&
          link.propertyId === facts.propertyId &&
          intervalIntersectsMonth(link, input.cashInput.monthScope),
      )
      .toSorted(compareOwnerLinks);
    const periodEnd = previousDate(input.cashInput.monthScope.before);
    const requiredDates = getRequiredRosterDates({
      facts,
      links: propertyLinks,
      monthScope: input.cashInput.monthScope,
      periodEnd,
    });
    const blockers = [
      ...propertyDataIssues.map((issue) => issue.reason),
      ...duplicateOverlapReasons(propertyLinks, input.cashInput.monthScope),
    ];
    const rostersByDate = new Map<string, EffectiveOwner[]>();

    for (const date of requiredDates) {
      const roster = resolveRoster(propertyLinks, date);
      if (roster.reason) blockers.push(roster.reason);
      else rostersByDate.set(date, roster.owners);
    }

    for (const line of facts.sourceLines) {
      if (
        !isDateInMonth(line.eventDate, input.cashInput.monthScope) ||
        (line.classification !== "owner_contribution" &&
          line.classification !== "owner_payout")
      ) {
        continue;
      }

      const roster = rostersByDate.get(line.eventDate);
      if (roster && roster.length > 1) {
        blockers.push(
          line.classification === "owner_contribution"
            ? "Owner contribution cannot be attributed across multiple owners"
            : "Owner payout cannot be attributed across multiple owners",
        );
      }
    }

    if (
      facts.securityDepositHeldCents !== 0 &&
      !rostersByDate.has(periodEnd)
    ) {
      blockers.push(
        "Period-end ownership is ambiguous for deposit disclosure",
      );
    }

    const uniqueBlockers = [...new Set(blockers)].toSorted();
    if (uniqueBlockers.length > 0) {
      rows.push({
        evidence: blockedEvidence(facts, propertyLinks, propertyDataIssues),
        propertyId: facts.propertyId,
        reasons: uniqueBlockers,
        status: "blocked",
      });
      continue;
    }

    const accumulators = createAccumulators(
      facts.propertyId,
      propertyLinks,
      rostersByDate,
    );

    allocatePropertyFacts({
      accumulators,
      facts,
      monthScope: input.cashInput.monthScope,
      periodEnd,
      rostersByDate,
    });

    for (const accumulator of [...accumulators.values()].toSorted(
      compareAccumulators,
    )) {
      for (const link of accumulator.links.values()) {
        accumulator.evidence.push(ownerLinkEvidence(link));
      }

      const person = peopleById.get(accumulator.ownerPersonId);
      rows.push({
        ...moneyFacts(accumulator),
        evidence: accumulator.evidence.toSorted(compareEvidence),
        ownerLinkIds: [...accumulator.links.keys()].toSorted(),
        ownerPersonId: accumulator.ownerPersonId,
        ownershipSharesThousandths: [...accumulator.shares].toSorted(
          (first, second) => first - second,
        ),
        propertyId: accumulator.propertyId,
        status: "ready",
        warnings:
          person?.hasUsableContact === true
            ? []
            : ["Owner contact details are missing"],
      });
    }
  }

  const readyRows = rows.filter(
    (row): row is OwnerStatementReadyRow => row.status === "ready",
  );

  return {
    rows: rows.toSorted(compareRows),
    summary: {
      ...sumReadyRows(readyRows),
      blockedPropertyCount: rows.filter((row) => row.status === "blocked")
        .length,
      readyPropertyCount: new Set(readyRows.map((row) => row.propertyId)).size,
      readyStatementCount: readyRows.length,
    },
  };
}

function allocatePropertyFacts({
  accumulators,
  facts,
  monthScope,
  periodEnd,
  rostersByDate,
}: {
  accumulators: Map<string, ReadyAccumulator>;
  facts: PropertyCashPropertyFacts;
  monthScope: PropertyCashInput["monthScope"];
  periodEnd: string;
  rostersByDate: Map<string, EffectiveOwner[]>;
}) {
  for (const line of facts.sourceLines) {
    if (!isDateInMonth(line.eventDate, monthScope)) continue;
    const roster = requiredRoster(rostersByDate, line.eventDate);

    if (line.classification === "operating_receipt") {
      allocatePercentageFact({
        accumulators,
        amountCents: line.signedAmountCents,
        fact: "operating_cash_received",
        field: "operatingCashReceivedCents",
        line,
        roster,
      });
    } else if (line.classification === "property_expense") {
      allocatePercentageFact({
        accumulators,
        amountCents: line.signedAmountCents,
        fact: "property_expenses_paid",
        field: "propertyExpensesPaidCents",
        line,
        roster,
      });
    } else if (line.classification === "management_fee_earned") {
      allocatePercentageFact({
        accumulators,
        amountCents: line.signedAmountCents,
        fact: "management_fees_earned",
        field: "managementFeesEarnedCents",
        line,
        roster,
      });
    } else if (line.classification === "management_fee_received") {
      allocatePercentageFact({
        accumulators,
        amountCents: line.signedAmountCents,
        fact: "management_fees_received",
        field: "managementFeesReceivedCents",
        line,
        roster,
      });
    } else if (line.classification === "owner_contribution") {
      allocateDirectFact({
        accumulator: requiredAccumulator(accumulators, roster[0]!),
        amountCents: line.signedAmountCents,
        fact: "owner_contributions",
        field: "ownerContributionCents",
        line,
        owner: roster[0]!,
      });
    } else if (line.classification === "owner_payout") {
      allocateDirectFact({
        accumulator: requiredAccumulator(accumulators, roster[0]!),
        amountCents: line.signedAmountCents,
        fact: "owner_payouts",
        field: "ownerPayoutCents",
        line,
        owner: roster[0]!,
      });
    }
  }

  allocateManagementOutstanding({ accumulators, facts, rostersByDate });

  if (facts.securityDepositHeldCents !== 0) {
    const depositLines = facts.sourceLines.filter(
      (line) => line.classification === "security_deposit",
    );
    const roster = requiredRoster(rostersByDate, periodEnd);
    const allocations = allocateByShares(
      facts.securityDepositHeldCents,
      roster,
    );

    for (const allocation of allocations) {
      const accumulator = requiredAccumulator(accumulators, allocation.owner);
      accumulator.securityDepositHeldCents += allocation.amountCents;
      for (const line of depositLines) {
        accumulator.evidence.push(
          cashEvidence({
            allocatedAmountCents: null,
            fact: "security_deposits_held",
            line,
            owner: allocation.owner,
          }),
        );
      }
    }
  }

  for (const accumulator of accumulators.values()) {
    accumulator.netOwnerCashMovementCents =
      accumulator.operatingCashReceivedCents -
      accumulator.propertyExpensesPaidCents -
      accumulator.managementFeesReceivedCents +
      accumulator.ownerContributionCents -
      accumulator.ownerPayoutCents;
  }
}

function allocateManagementOutstanding({
  accumulators,
  facts,
  rostersByDate,
}: {
  accumulators: Map<string, ReadyAccumulator>;
  facts: PropertyCashPropertyFacts;
  rostersByDate: Map<string, EffectiveOwner[]>;
}) {
  let outstandingCents = 0;
  const earnedLines = facts.sourceLines.filter(
    (line) => line.classification === "management_fee_earned",
  );

  for (const earned of earnedLines) {
    const receipts = facts.sourceLines.filter(
      (line) =>
        line.classification === "management_fee_received" &&
        line.incomeItemId === earned.incomeItemId,
    );
    const remainingCents = Math.max(
      earned.signedAmountCents -
        receipts.reduce((total, line) => total + line.signedAmountCents, 0),
      0,
    );
    outstandingCents += remainingCents;
    const roster = requiredRoster(rostersByDate, earned.eventDate);

    if (remainingCents !== 0) {
      allocatePercentageFact({
        accumulators,
        amountCents: remainingCents,
        fact: "management_fees_outstanding",
        field: "managementFeesOutstandingCents",
        line: earned,
        roster,
      });
    }

    for (const receipt of receipts) {
      for (const owner of roster) {
        requiredAccumulator(accumulators, owner).evidence.push(
          cashEvidence({
            allocatedAmountCents: null,
            fact: "management_fees_outstanding",
            line: receipt,
            owner,
          }),
        );
      }
    }
  }

  if (outstandingCents !== facts.managementFeesOutstandingCents) {
    throw new Error(
      `Owner statement management fee outstanding does not match property cash for ${facts.propertyId}`,
    );
  }
}

function allocatePercentageFact({
  accumulators,
  amountCents,
  fact,
  field,
  line,
  roster,
}: {
  accumulators: Map<string, ReadyAccumulator>;
  amountCents: number;
  fact: OwnerStatementFact;
  field: keyof OwnerStatementMoneyFacts;
  line: PropertyCashSourceLine;
  roster: EffectiveOwner[];
}) {
  for (const allocation of allocateByShares(amountCents, roster)) {
    const accumulator = requiredAccumulator(accumulators, allocation.owner);
    accumulator[field] += allocation.amountCents;
    accumulator.evidence.push(
      cashEvidence({
        allocatedAmountCents: allocation.amountCents,
        fact,
        line,
        owner: allocation.owner,
      }),
    );
  }
}

function allocateDirectFact({
  accumulator,
  amountCents,
  fact,
  field,
  line,
  owner,
}: {
  accumulator: ReadyAccumulator;
  amountCents: number;
  fact: OwnerStatementFact;
  field: keyof OwnerStatementMoneyFacts;
  line: PropertyCashSourceLine;
  owner: EffectiveOwner;
}) {
  accumulator[field] += amountCents;
  accumulator.evidence.push(
    cashEvidence({
      allocatedAmountCents: amountCents,
      fact,
      line,
      owner,
    }),
  );
}

function allocateByShares(amountCents: number, roster: EffectiveOwner[]) {
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error(`Owner statement cents must be a safe integer: ${amountCents}`);
  }

  const sign = amountCents < 0 ? -1 : 1;
  const absoluteCents = BigInt(Math.abs(amountCents));
  const denominator = BigInt(totalOwnershipThousandths);
  const allocations = roster.map((owner) => {
    const numerator = absoluteCents * BigInt(owner.shareThousandths);
    return {
      amountCents: Number(numerator / denominator),
      owner,
      remainder: numerator % denominator,
    };
  });
  const allocatedCents = allocations.reduce(
    (total, allocation) => total + allocation.amountCents,
    0,
  );
  let remainderCents = Math.abs(amountCents) - allocatedCents;
  const remainderOrder = allocations.toSorted(
    (first, second) =>
      compareBigInt(second.remainder, first.remainder) ||
      compareEffectiveOwners(first.owner, second.owner),
  );

  for (const allocation of remainderOrder) {
    if (remainderCents === 0) break;
    allocation.amountCents += 1;
    remainderCents -= 1;
  }

  return allocations
    .map((allocation) => ({
      amountCents: allocation.amountCents * sign,
      owner: allocation.owner,
    }))
    .toSorted((first, second) =>
      compareEffectiveOwners(first.owner, second.owner),
    );
}

function createAccumulators(
  propertyId: string,
  links: OwnerStatementOwnerLink[],
  rostersByDate: Map<string, EffectiveOwner[]>,
) {
  const accumulators = new Map<string, ReadyAccumulator>();

  for (const owner of [...rostersByDate.values()].flat()) {
    ensureAccumulator(accumulators, propertyId, owner);
  }

  for (const link of links) {
    if (!accumulators.has(link.personId)) {
      const share = parseOwnershipThousandths(link.ownershipPercent);
      const accumulator = emptyAccumulator(propertyId, link.personId);
      accumulator.links.set(link.id, link);
      if (share !== null) accumulator.shares.add(share);
      accumulators.set(link.personId, accumulator);
    }
  }

  return accumulators;
}

function ensureAccumulator(
  accumulators: Map<string, ReadyAccumulator>,
  propertyId: string,
  owner: EffectiveOwner,
) {
  const accumulator =
    accumulators.get(owner.link.personId) ??
    emptyAccumulator(propertyId, owner.link.personId);
  accumulator.links.set(owner.link.id, owner.link);
  accumulator.shares.add(owner.shareThousandths);
  accumulators.set(owner.link.personId, accumulator);
  return accumulator;
}

function requiredAccumulator(
  accumulators: Map<string, ReadyAccumulator>,
  owner: EffectiveOwner,
) {
  const accumulator = accumulators.get(owner.link.personId);
  if (!accumulator) {
    throw new Error(
      `Owner statement accumulator is missing for ${owner.link.personId}`,
    );
  }
  accumulator.links.set(owner.link.id, owner.link);
  accumulator.shares.add(owner.shareThousandths);
  return accumulator;
}

function emptyAccumulator(
  propertyId: string,
  ownerPersonId: string,
): ReadyAccumulator {
  return {
    ...emptyMoneyFacts(),
    evidence: [],
    links: new Map(),
    ownerPersonId,
    propertyId,
    shares: new Set(),
  };
}

function resolveRoster(links: OwnerStatementOwnerLink[], date: string) {
  const effectiveLinks = links.filter((link) => isEffective(link, date));
  if (effectiveLinks.length === 0) {
    return {
      owners: [],
      reason: `No effective owner on ${formatBlockerDate(date)}`,
    };
  }

  const duplicatePersonId = findDuplicate(
    effectiveLinks.map((link) => link.personId),
  );
  if (duplicatePersonId) {
    return {
      owners: [],
      reason: `Duplicate or overlapping owner links for ${duplicatePersonId}`,
    };
  }

  if (effectiveLinks.length === 1) {
    const link = effectiveLinks[0]!;
    const share = parseOwnershipThousandths(link.ownershipPercent);
    if (share === null || share === totalOwnershipThousandths) {
      return {
        owners: [
          { link, shareThousandths: totalOwnershipThousandths } satisfies EffectiveOwner,
        ],
        reason: null,
      };
    }
    return {
      owners: [],
      reason: `Single owner percentage is ${formatOwnership(share)}, not 100.000%`,
    };
  }

  const parsed = effectiveLinks.map((link) => ({
    link,
    shareThousandths: parseOwnershipThousandths(link.ownershipPercent),
  }));
  if (parsed.some((owner) => owner.shareThousandths === null)) {
    return {
      owners: [],
      reason: "Multiple owners require explicit percentages",
    };
  }
  if (parsed.some((owner) => owner.shareThousandths! <= 0)) {
    return {
      owners: [],
      reason: "Multiple owners require positive percentages",
    };
  }

  const owners = parsed as EffectiveOwner[];
  const total = owners.reduce(
    (sum, owner) => sum + owner.shareThousandths,
    0,
  );
  if (total !== totalOwnershipThousandths) {
    return {
      owners: [],
      reason: `Ownership percentages total ${formatOwnership(total)}, not 100.000%`,
    };
  }

  return {
    owners: owners.toSorted(compareEffectiveOwners),
    reason: null,
  };
}

function getRequiredRosterDates({
  facts,
  links,
  monthScope,
  periodEnd,
}: {
  facts: PropertyCashPropertyFacts;
  links: OwnerStatementOwnerLink[];
  monthScope: PropertyCashInput["monthScope"];
  periodEnd: string;
}) {
  const dates = new Set([monthScope.from, periodEnd]);

  for (const link of links) {
    if (link.startedOn && isDateInMonth(link.startedOn, monthScope)) {
      dates.add(link.startedOn);
    }
    if (link.endedOn && isDateInMonth(link.endedOn, monthScope)) {
      dates.add(link.endedOn);
    }
  }

  for (const line of facts.sourceLines) {
    if (isDateInMonth(line.eventDate, monthScope)) dates.add(line.eventDate);
  }

  return [...dates].toSorted();
}

function duplicateOverlapReasons(
  links: OwnerStatementOwnerLink[],
  monthScope: PropertyCashInput["monthScope"],
) {
  const reasons: string[] = [];

  for (let firstIndex = 0; firstIndex < links.length; firstIndex += 1) {
    const first = links[firstIndex]!;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < links.length;
      secondIndex += 1
    ) {
      const second = links[secondIndex]!;
      if (
        first.personId === second.personId &&
        intervalsOverlapInMonth(first, second, monthScope)
      ) {
        reasons.push(
          `Duplicate or overlapping owner links for ${first.personId}`,
        );
      }
    }
  }

  return reasons;
}

function intervalsOverlapInMonth(
  first: OwnerStatementOwnerLink,
  second: OwnerStatementOwnerLink,
  monthScope: PropertyCashInput["monthScope"],
) {
  const start = maxDate(
    monthScope.from,
    first.startedOn ?? monthScope.from,
    second.startedOn ?? monthScope.from,
  );
  const end = minDate(
    monthScope.before,
    first.endedOn ?? monthScope.before,
    second.endedOn ?? monthScope.before,
  );
  return start < end;
}

function intervalIntersectsMonth(
  link: OwnerStatementOwnerLink,
  monthScope: PropertyCashInput["monthScope"],
) {
  const start = maxDate(monthScope.from, link.startedOn ?? monthScope.from);
  const end = minDate(monthScope.before, link.endedOn ?? monthScope.before);
  return start < end;
}

function isEffective(link: OwnerStatementOwnerLink, date: string) {
  return (
    (!link.startedOn || link.startedOn <= date) &&
    (!link.endedOn || date < link.endedOn)
  );
}

function parseOwnershipThousandths(value: number | string | null) {
  if (value === null) return null;
  const input = String(value).trim();
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(input);
  if (!match) throw new Error(`Invalid ownership percentage: ${input}`);
  const [, whole = "0", fraction = ""] = match;
  const thousandths = Number(whole) * 1_000 + Number(fraction.padEnd(3, "0"));
  if (!Number.isSafeInteger(thousandths) || thousandths > 100_000) {
    throw new Error(`Invalid ownership percentage: ${input}`);
  }
  return thousandths;
}

function blockedEvidence(
  facts: PropertyCashPropertyFacts,
  links: OwnerStatementOwnerLink[],
  dataIssues: OwnerStatementDataIssue[],
) {
  return [
    ...facts.sourceLines.map((line) =>
      cashEvidence({
        allocatedAmountCents: null,
        fact: "supporting_evidence",
        line,
        owner: null,
      }),
    ),
    ...links.map(ownerLinkEvidence),
    ...dataIssues.flatMap((issue) =>
      issue.evidence ? [issue.evidence] : [],
    ),
  ].toSorted(compareEvidence);
}

function cashEvidence({
  allocatedAmountCents,
  fact,
  line,
  owner,
}: {
  allocatedAmountCents: number | null;
  fact: OwnerStatementFact;
  line: PropertyCashSourceLine;
  owner: EffectiveOwner | null;
}): OwnerStatementEvidenceLine {
  return {
    allocatedAmountCents,
    allocationId: line.allocationId,
    classification: line.classification,
    depositEventId: line.depositEventId,
    eventDate: line.eventDate,
    expenseItemId: line.expenseItemId,
    incomeItemId: line.incomeItemId,
    ownerEndedOn: owner?.link.endedOn ?? null,
    ownerLinkId: owner?.link.id ?? null,
    ownerPersonId: owner?.link.personId ?? null,
    ownerStartedOn: owner?.link.startedOn ?? null,
    paymentId: line.paymentId,
    propertyId: line.propertyId,
    receiptId: line.receiptId,
    signedAmountCents: line.signedAmountCents,
    statementFact: fact,
  };
}

function ownerLinkEvidence(
  link: OwnerStatementOwnerLink,
): OwnerStatementEvidenceLine {
  return {
    allocatedAmountCents: null,
    allocationId: null,
    classification: "owner_link",
    depositEventId: null,
    eventDate: null,
    expenseItemId: null,
    incomeItemId: null,
    ownerEndedOn: link.endedOn,
    ownerLinkId: link.id,
    ownerPersonId: link.personId,
    ownerStartedOn: link.startedOn,
    paymentId: null,
    propertyId: link.propertyId,
    receiptId: null,
    signedAmountCents: null,
    statementFact: "ownership",
  };
}

function emptyMoneyFacts(): OwnerStatementMoneyFacts {
  return {
    managementFeesEarnedCents: 0,
    managementFeesOutstandingCents: 0,
    managementFeesReceivedCents: 0,
    netOwnerCashMovementCents: 0,
    operatingCashReceivedCents: 0,
    ownerContributionCents: 0,
    ownerPayoutCents: 0,
    propertyExpensesPaidCents: 0,
    securityDepositHeldCents: 0,
  };
}

function moneyFacts(facts: OwnerStatementMoneyFacts): OwnerStatementMoneyFacts {
  return {
    managementFeesEarnedCents: facts.managementFeesEarnedCents,
    managementFeesOutstandingCents: facts.managementFeesOutstandingCents,
    managementFeesReceivedCents: facts.managementFeesReceivedCents,
    netOwnerCashMovementCents: facts.netOwnerCashMovementCents,
    operatingCashReceivedCents: facts.operatingCashReceivedCents,
    ownerContributionCents: facts.ownerContributionCents,
    ownerPayoutCents: facts.ownerPayoutCents,
    propertyExpensesPaidCents: facts.propertyExpensesPaidCents,
    securityDepositHeldCents: facts.securityDepositHeldCents,
  };
}

function sumReadyRows(rows: OwnerStatementReadyRow[]) {
  const totals = emptyMoneyFacts();
  for (const row of rows) {
    totals.managementFeesEarnedCents += row.managementFeesEarnedCents;
    totals.managementFeesOutstandingCents +=
      row.managementFeesOutstandingCents;
    totals.managementFeesReceivedCents += row.managementFeesReceivedCents;
    totals.netOwnerCashMovementCents += row.netOwnerCashMovementCents;
    totals.operatingCashReceivedCents += row.operatingCashReceivedCents;
    totals.ownerContributionCents += row.ownerContributionCents;
    totals.ownerPayoutCents += row.ownerPayoutCents;
    totals.propertyExpensesPaidCents += row.propertyExpensesPaidCents;
    totals.securityDepositHeldCents += row.securityDepositHeldCents;
  }
  return totals;
}

function compareRows(first: OwnerStatementRow, second: OwnerStatementRow) {
  return (
    first.propertyId.localeCompare(second.propertyId) ||
    ownerId(first).localeCompare(ownerId(second))
  );
}

function ownerId(row: OwnerStatementRow) {
  return row.status === "ready" ? row.ownerPersonId : "";
}

function compareAccumulators(
  first: ReadyAccumulator,
  second: ReadyAccumulator,
) {
  return (
    first.propertyId.localeCompare(second.propertyId) ||
    first.ownerPersonId.localeCompare(second.ownerPersonId)
  );
}

function compareEvidence(
  first: OwnerStatementEvidenceLine,
  second: OwnerStatementEvidenceLine,
) {
  return (
    (first.eventDate ?? "").localeCompare(second.eventDate ?? "") ||
    first.classification.localeCompare(second.classification) ||
    evidenceKey(first).localeCompare(evidenceKey(second)) ||
    first.statementFact.localeCompare(second.statementFact)
  );
}

function evidenceKey(line: OwnerStatementEvidenceLine) {
  return [
    line.ownerPersonId,
    line.ownerLinkId,
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

function compareOwnerLinks(
  first: OwnerStatementOwnerLink,
  second: OwnerStatementOwnerLink,
) {
  return (
    first.propertyId.localeCompare(second.propertyId) ||
    first.personId.localeCompare(second.personId) ||
    (first.startedOn ?? "").localeCompare(second.startedOn ?? "") ||
    first.id.localeCompare(second.id)
  );
}

function compareEffectiveOwners(first: EffectiveOwner, second: EffectiveOwner) {
  return (
    first.link.personId.localeCompare(second.link.personId) ||
    first.link.id.localeCompare(second.link.id)
  );
}

function compareBigInt(first: bigint, second: bigint) {
  return first < second ? -1 : first > second ? 1 : 0;
}

function findDuplicate(values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function requiredRoster(
  rostersByDate: Map<string, EffectiveOwner[]>,
  date: string,
) {
  const roster = rostersByDate.get(date);
  if (!roster) throw new Error(`Owner statement roster is missing for ${date}`);
  return roster;
}

function isDateInMonth(
  date: string,
  monthScope: PropertyCashInput["monthScope"],
) {
  return date >= monthScope.from && date < monthScope.before;
}

function previousDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function formatBlockerDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  })
    .format(new Date(`${date}T00:00:00.000Z`))
    .replace(/^0/, "");
}

function formatOwnership(thousandths: number) {
  return `${Math.trunc(thousandths / 1_000)}.${String(
    Math.abs(thousandths % 1_000),
  ).padStart(3, "0")}%`;
}

function maxDate(...dates: string[]) {
  return dates.toSorted().at(-1)!;
}

function minDate(...dates: string[]) {
  return dates.toSorted()[0]!;
}

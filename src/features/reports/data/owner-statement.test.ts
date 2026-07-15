import { describe, expect, it } from "vitest";

import {
  buildOwnerStatement,
  type OwnerStatementInput,
  type OwnerStatementReadyRow,
} from "@/features/reports/data/owner-statement";
import type {
  PropertyCashDepositEvent,
  PropertyCashExpenseItem,
  PropertyCashIncomeItem,
  PropertyCashInput,
  PropertyCashPaymentAllocation,
  PropertyCashReceiptAllocation,
} from "@/features/finance/property-cash";

const propertyId = "property-1";
const ownerPersonId = "owner-person-1";

type FixtureOverrides = Partial<Omit<OwnerStatementInput, "cashInput">> &
  Partial<PropertyCashInput>;

describe("buildOwnerStatement financial facts", () => {
  it("isolates property-scoped data issues from ready statements and summaries", () => {
    const blockedPropertyId = "property-2";
    const result = buildOwnerStatement({
      cashInput: {
        depositEvents: [],
        expenseItems: [],
        incomeItems: [
          incomeItem("rent-ready", 100),
          {
            amountDue: 200,
            dueDate: "2026-07-01",
            id: "rent-blocked",
            incomeType: "rent",
            propertyId: blockedPropertyId,
          },
        ],
        monthScope: { before: "2026-08-01", from: "2026-07-01" },
        paymentAllocations: [],
        propertyIds: [propertyId, blockedPropertyId],
        receiptAllocations: [
          receiptAllocation("rent-ready", 100),
          {
            allocationId: "receipt-allocation-blocked",
            amount: 200,
            incomeItemId: "rent-blocked",
            receiptId: "receipt-blocked",
            receivedDate: "2026-07-20",
            reversalOfId: null,
          },
        ],
      },
      dataIssues: [
        {
          evidence: {
            allocatedAmountCents: null,
            allocationId: null,
            classification: "security_deposit",
            depositEventId: "deposit-reversal-b",
            eventDate: "2026-07-22",
            expenseItemId: null,
            incomeItemId: null,
            ownerEndedOn: null,
            ownerLinkId: null,
            ownerPersonId: null,
            ownerStartedOn: null,
            paymentId: null,
            propertyId: blockedPropertyId,
            receiptId: null,
            signedAmountCents: null,
            statementFact: "supporting_evidence",
          },
          propertyId: blockedPropertyId,
          reason:
            "Deposit reversal deposit-reversal-b is missing its original event type",
        },
      ],
      ownerLinks: [
        ownerLink(),
        ownerLink({
          id: "owner-link-2",
          personId: "owner-person-2",
          propertyId: blockedPropertyId,
        }),
      ],
      people: twoPeople(),
    });

    expect(result.rows).toHaveLength(2);
    expect(readyRow(result)).toMatchObject({
      operatingCashReceivedCents: 10_000,
      propertyId,
      status: "ready",
    });
    const blocked = result.rows.find(
      (row) => row.propertyId === blockedPropertyId,
    );
    expect(blocked).toMatchObject({
      reasons: [
        "Deposit reversal deposit-reversal-b is missing its original event type",
      ],
      status: "blocked",
    });
    expect(blocked?.evidence).toContainEqual(
      expect.objectContaining({
        allocatedAmountCents: null,
        classification: "security_deposit",
        depositEventId: "deposit-reversal-b",
        eventDate: "2026-07-22",
        propertyId: blockedPropertyId,
        signedAmountCents: null,
      }),
    );
    expect(result.summary).toMatchObject({
      blockedPropertyCount: 1,
      operatingCashReceivedCents: 10_000,
      readyStatementCount: 1,
    });
  });

  it("allocates full and partial operating receipts on their receipt dates", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [incomeItem("rent-1", 1_000)],
        receiptAllocations: [
          receiptAllocation("rent-1", 400, "2026-07-10", "partial"),
          receiptAllocation("rent-1", 600, "2026-07-20", "final"),
        ],
      }),
    );

    expect(readyRow(result)).toMatchObject({
      netOwnerCashMovementCents: 100_000,
      operatingCashReceivedCents: 100_000,
    });
    expect(readyRow(result).evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          allocationId: "receipt-allocation-partial",
          allocatedAmountCents: 40_000,
          classification: "operating_receipt",
          eventDate: "2026-07-10",
          incomeItemId: "rent-1",
          ownerLinkId: "owner-link-1",
          ownerPersonId,
          receiptId: "receipt-partial",
          signedAmountCents: 40_000,
          statementFact: "operating_cash_received",
        }),
      ]),
    );
  });

  it("includes a current-month receipt for an obligation due in an earlier month", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [incomeItem("june-rent", 125, "rent", "2026-06-05")],
        receiptAllocations: [
          receiptAllocation("june-rent", 125, "2026-07-12", "late"),
        ],
      }),
    );

    expect(readyRow(result)).toMatchObject({
      netOwnerCashMovementCents: 12_500,
      operatingCashReceivedCents: 12_500,
    });
    expect(readyRow(result).evidence).toContainEqual(
      expect.objectContaining({
        eventDate: "2026-07-12",
        incomeItemId: "june-rent",
        receiptId: "receipt-late",
        statementFact: "operating_cash_received",
      }),
    );
  });

  it("uses the reversal receipt date and keeps prior-period evidence out of current cash", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [incomeItem("rent-1", 100)],
        receiptAllocations: [
          receiptAllocation("rent-1", 100, "2026-06-20", "original"),
          receiptAllocation(
            "rent-1",
            100,
            "2026-07-20",
            "reversal",
            "receipt-original",
          ),
        ],
      }),
    );

    expect(readyRow(result)).toMatchObject({
      netOwnerCashMovementCents: -10_000,
      operatingCashReceivedCents: -10_000,
    });
    expect(
      readyRow(result).evidence.find(
        (line) => line.receiptId === "receipt-original",
      ),
    ).toBeUndefined();
    expect(readyRow(result).evidence).toContainEqual(
      expect.objectContaining({
        eventDate: "2026-07-20",
        receiptId: "receipt-reversal",
        signedAmountCents: -10_000,
      }),
    );
  });

  it("allocates partial payments and payment reversals on payment dates", () => {
    const result = buildOwnerStatement(
      fixture({
        expenseItems: [expenseItem("bill-1")],
        paymentAllocations: [
          paymentAllocation("bill-1", 75, "2026-07-05", "partial"),
          paymentAllocation(
            "bill-1",
            25,
            "2026-07-25",
            "reversal",
            "payment-original",
          ),
        ],
      }),
    );

    expect(readyRow(result)).toMatchObject({
      netOwnerCashMovementCents: -5_000,
      propertyExpensesPaidCents: 5_000,
    });
    expect(readyRow(result).evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          allocationId: "payment-allocation-partial",
          allocatedAmountCents: 7_500,
          expenseItemId: "bill-1",
          paymentId: "payment-partial",
        }),
        expect.objectContaining({
          allocationId: "payment-allocation-reversal",
          allocatedAmountCents: -2_500,
          eventDate: "2026-07-25",
          paymentId: "payment-reversal",
        }),
      ]),
    );
  });

  it("keeps a bill outside the month when its payment occurs inside the month", () => {
    const result = buildOwnerStatement(
      fixture({
        expenseItems: [expenseItem("june-bill")],
        paymentAllocations: [paymentAllocation("june-bill", 90)],
      }),
    );

    expect(readyRow(result).propertyExpensesPaidCents).toBe(9_000);
  });

  it("allocates earned, received, and period-scoped outstanding management fees", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [
          incomeItem("fee-1", 100, "management_fee", "2026-07-05"),
          incomeItem("fee-2", 80, "management_fee", "2026-07-15"),
        ],
        receiptAllocations: [
          receiptAllocation("fee-1", 40, "2026-06-30", "prepaid"),
          receiptAllocation("fee-1", 25, "2026-07-10", "current"),
          receiptAllocation("fee-2", 80, "2026-07-20", "paid"),
        ],
      }),
    );

    expect(readyRow(result)).toMatchObject({
      managementFeesEarnedCents: 18_000,
      managementFeesOutstandingCents: 3_500,
      managementFeesReceivedCents: 10_500,
      netOwnerCashMovementCents: -10_500,
    });
    expect(readyRow(result).evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          allocatedAmountCents: 3_500,
          eventDate: "2026-07-05",
          incomeItemId: "fee-1",
          statementFact: "management_fees_outstanding",
        }),
        expect.objectContaining({
          allocatedAmountCents: null,
          eventDate: "2026-06-30",
          receiptId: "receipt-prepaid",
          statementFact: "management_fees_outstanding",
        }),
      ]),
    );
  });

  it("separates owner contributions and payouts from operating cash", () => {
    const result = buildOwnerStatement(
      fixture({
        expenseItems: [expenseItem("payout-1", "owner_payout")],
        incomeItems: [incomeItem("contribution-1", 200, "owner_contribution")],
        paymentAllocations: [paymentAllocation("payout-1", 75)],
        receiptAllocations: [receiptAllocation("contribution-1", 200)],
      }),
    );

    expect(readyRow(result)).toMatchObject({
      netOwnerCashMovementCents: 12_500,
      operatingCashReceivedCents: 0,
      ownerContributionCents: 20_000,
      ownerPayoutCents: 7_500,
      propertyExpensesPaidCents: 0,
    });
  });

  it("discloses the closing deposit balance without changing net movement", () => {
    const result = buildOwnerStatement(
      fixture({
        depositEvents: [
          depositEvent("received", 500, "received", "2026-06-10"),
          depositEvent("refund", 125, "refunded", "2026-07-10"),
          depositEvent(
            "refund-reversal",
            125,
            "reversed",
            "2026-07-20",
            "refunded",
          ),
        ],
      }),
    );

    expect(readyRow(result)).toMatchObject({
      netOwnerCashMovementCents: 0,
      securityDepositHeldCents: 50_000,
    });
    expect(readyRow(result).evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          depositEventId: "received",
          eventDate: "2026-06-10",
          signedAmountCents: 50_000,
          statementFact: "security_deposits_held",
        }),
        expect.objectContaining({
          depositEventId: "refund-reversal",
          eventDate: "2026-07-20",
          signedAmountCents: 12_500,
        }),
      ]),
    );
  });
});

describe("buildOwnerStatement ownership readiness", () => {
  it.each([
    { label: "an inferred null share", ownershipPercent: null },
    { label: "an explicit 100 percent share", ownershipPercent: "100.000" },
  ])("accepts one owner with $label", ({ ownershipPercent }) => {
    const result = buildOwnerStatement(
      fixture({ ownerLinks: [ownerLink({ ownershipPercent })] }),
    );

    expect(readyRow(result).ownershipSharesThousandths).toEqual([100_000]);
  });

  it("blocks a single owner with an explicit non-100 percentage", () => {
    const result = buildOwnerStatement(
      fixture({ ownerLinks: [ownerLink({ ownershipPercent: "60.000" })] }),
    );

    expect(blockedRow(result).reasons).toContain(
      "Single owner percentage is 60.000%, not 100.000%",
    );
  });

  it("accepts two owners totaling exactly 100.000 percent", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [incomeItem("rent-1", 100)],
        ownerLinks: twoOwnerLinks("60.000", "40.000"),
        people: twoPeople(),
        receiptAllocations: [receiptAllocation("rent-1", 100)],
      }),
    );

    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operatingCashReceivedCents: 6_000,
          ownerPersonId: "owner-person-1",
          status: "ready",
        }),
        expect.objectContaining({
          operatingCashReceivedCents: 4_000,
          ownerPersonId: "owner-person-2",
          status: "ready",
        }),
      ]),
    );
  });

  it.each([
    {
      expected: "Multiple owners require explicit percentages",
      first: "60.000",
      label: "a missing share",
      second: null,
    },
    {
      expected: "Ownership percentages total 90.000%, not 100.000%",
      first: "60.000",
      label: "a total below 100 percent",
      second: "30.000",
    },
    {
      expected: "Ownership percentages total 110.000%, not 100.000%",
      first: "60.000",
      label: "a total above 100 percent",
      second: "50.000",
    },
    {
      expected: "Multiple owners require positive percentages",
      first: "100.000",
      label: "a zero share",
      second: "0.000",
    },
  ])("blocks multiple owners with $label", ({ expected, first, second }) => {
    const result = buildOwnerStatement(
      fixture({ ownerLinks: twoOwnerLinks(first, second), people: twoPeople() }),
    );

    expect(blockedRow(result).reasons).toContain(expected);
  });

  it("excludes archived owner links", () => {
    const result = buildOwnerStatement(
      fixture({
        ownerLinks: [
          ownerLink(),
          ownerLink({
            archivedAt: "2026-07-01T00:00:00.000Z",
            id: "archived-owner-link",
            personId: "owner-person-2",
            ownershipPercent: "50.000",
          }),
        ],
        people: twoPeople(),
      }),
    );

    expect(result.rows).toHaveLength(1);
    expect(readyRow(result).ownerPersonId).toBe(ownerPersonId);
  });

  it("ignores an empty half-open owner interval", () => {
    const result = buildOwnerStatement(
      fixture({
        ownerLinks: [
          ownerLink(),
          ownerLink({
            endedOn: "2026-07-15",
            id: "empty-link",
            personId: "owner-person-2",
            startedOn: "2026-07-15",
          }),
        ],
        people: twoPeople(),
      }),
    );

    expect(readyRows(result).map((row) => row.ownerPersonId)).toEqual([
      "owner-person-1",
    ]);
  });

  it("uses historical and new owners on their dated sides of a half-open transfer", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [
          incomeItem("before-transfer", 100, "other", "2026-06-01"),
          incomeItem("on-transfer", 200, "other", "2026-06-01"),
        ],
        ownerLinks: [
          ownerLink({ endedOn: "2026-07-15" }),
          ownerLink({
            id: "owner-link-2",
            personId: "owner-person-2",
            startedOn: "2026-07-15",
          }),
        ],
        people: twoPeople(),
        receiptAllocations: [
          receiptAllocation(
            "before-transfer",
            100,
            "2026-07-14",
            "before-transfer",
          ),
          receiptAllocation(
            "on-transfer",
            200,
            "2026-07-15",
            "on-transfer",
          ),
        ],
      }),
    );

    const readyRows = result.rows.filter(
      (row): row is OwnerStatementReadyRow => row.status === "ready",
    );
    expect(readyRows).toEqual([
      expect.objectContaining({
        operatingCashReceivedCents: 10_000,
        ownerPersonId: "owner-person-1",
      }),
      expect.objectContaining({
        operatingCashReceivedCents: 20_000,
        ownerPersonId: "owner-person-2",
      }),
    ]);
  });

  it("blocks duplicate overlapping links for the same owner", () => {
    const result = buildOwnerStatement(
      fixture({
        ownerLinks: [
          ownerLink(),
          ownerLink({ id: "owner-link-duplicate", startedOn: "2026-07-10" }),
        ],
      }),
    );

    expect(blockedRow(result).reasons).toContain(
      `Duplicate or overlapping owner links for ${ownerPersonId}`,
    );
  });

  it("blocks a property with no effective owner and excludes its money from summary", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [incomeItem("rent-1", 100)],
        ownerLinks: [],
        receiptAllocations: [receiptAllocation("rent-1", 100)],
      }),
    );

    expect(blockedRow(result).reasons).toContain(
      "No effective owner on 1 Jul 2026",
    );
    expect(result.summary).toMatchObject({
      blockedPropertyCount: 1,
      netOwnerCashMovementCents: 0,
      operatingCashReceivedCents: 0,
      readyStatementCount: 0,
    });
  });

  it("warns instead of blocking when owner contact details are missing", () => {
    const result = buildOwnerStatement(
      fixture({
        people: [
          {
            displayName: "Owner One",
            hasUsableContact: false,
            id: ownerPersonId,
          },
        ],
      }),
    );

    expect(readyRow(result).warnings).toEqual([
      "Owner contact details are missing",
    ]);
  });
});

describe("buildOwnerStatement exact allocation", () => {
  it("allocates 60/40 deterministically and preserves the property-cent sum", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [incomeItem("rent-1", 101)],
        ownerLinks: twoOwnerLinks("60.000", "40.000"),
        people: twoPeople(),
        receiptAllocations: [receiptAllocation("rent-1", 101)],
      }),
    );
    const rows = readyRows(result);

    expect(rows.map((row) => row.operatingCashReceivedCents)).toEqual([
      6_060,
      4_040,
    ]);
    expect(
      rows.reduce(
        (total, row) => total + row.operatingCashReceivedCents,
        0,
      ),
    ).toBe(10_100);
  });

  it("assigns a one-cent equal-share remainder by person then owner-link ID", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [incomeItem("cent", 1, "other")],
        ownerLinks: twoOwnerLinks("50.000", "50.000"),
        people: twoPeople(),
        receiptAllocations: [receiptAllocation("cent", 0.01)],
      }),
    );

    expect(
      readyRows(result).map((row) => [
        row.ownerPersonId,
        row.operatingCashReceivedCents,
      ]),
    ).toEqual([
      ["owner-person-1", 1],
      ["owner-person-2", 0],
    ]);
  });

  it("allocates negative reversal cents with the same deterministic sum", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [incomeItem("cent", 1, "other")],
        ownerLinks: twoOwnerLinks("50.000", "50.000"),
        people: twoPeople(),
        receiptAllocations: [
          receiptAllocation(
            "cent",
            0.01,
            "2026-07-20",
            "reversal",
            "receipt-original",
          ),
        ],
      }),
    );

    expect(
      readyRows(result).map((row) => row.operatingCashReceivedCents),
    ).toEqual([-1, 0]);
    expect(result.summary.operatingCashReceivedCents).toBe(-1);
  });

  it("returns identical rows regardless of input order", () => {
    const input = fixture({
      incomeItems: [incomeItem("rent-1", 100)],
      ownerLinks: twoOwnerLinks("60.000", "40.000"),
      people: twoPeople(),
      receiptAllocations: [
        receiptAllocation("rent-1", 40, "2026-07-05", "first"),
        receiptAllocation("rent-1", 60, "2026-07-20", "second"),
      ],
    });
    const reversed: OwnerStatementInput = {
      cashInput: {
        ...input.cashInput,
        incomeItems: input.cashInput.incomeItems.toReversed(),
        receiptAllocations: input.cashInput.receiptAllocations.toReversed(),
      },
      ownerLinks: input.ownerLinks.toReversed(),
      people: input.people.toReversed(),
    };

    expect(buildOwnerStatement(reversed)).toEqual(buildOwnerStatement(input));
  });

  it("allocates fee earned and outstanding by due date but received by receipt date", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [
          incomeItem("fee-transfer", 100, "management_fee", "2026-07-10"),
        ],
        ownerLinks: [
          ownerLink({ endedOn: "2026-07-15" }),
          ownerLink({
            id: "owner-link-2",
            personId: "owner-person-2",
            startedOn: "2026-07-15",
          }),
        ],
        people: twoPeople(),
        receiptAllocations: [
          receiptAllocation(
            "fee-transfer",
            40,
            "2026-07-20",
            "fee-transfer",
          ),
        ],
      }),
    );
    const [oldOwner, newOwner] = readyRows(result);

    expect(oldOwner).toMatchObject({
      managementFeesEarnedCents: 10_000,
      managementFeesOutstandingCents: 6_000,
      managementFeesReceivedCents: 0,
      ownerPersonId: "owner-person-1",
    });
    expect(newOwner).toMatchObject({
      managementFeesEarnedCents: 0,
      managementFeesOutstandingCents: 0,
      managementFeesReceivedCents: 4_000,
      ownerPersonId: "owner-person-2",
    });
  });

  it("blocks unidentified contributions and payouts across multiple owners", () => {
    for (const transfer of ["contribution", "payout"] as const) {
      const result = buildOwnerStatement(
        fixture({
          expenseItems:
            transfer === "payout" ? [expenseItem("transfer", "owner_payout")] : [],
          incomeItems:
            transfer === "contribution"
              ? [incomeItem("transfer", 100, "owner_contribution")]
              : [],
          ownerLinks: twoOwnerLinks("60.000", "40.000"),
          paymentAllocations:
            transfer === "payout" ? [paymentAllocation("transfer", 100)] : [],
          people: twoPeople(),
          receiptAllocations:
            transfer === "contribution"
              ? [receiptAllocation("transfer", 100)]
              : [],
        }),
      );

      expect(blockedRow(result).reasons).toContain(
        transfer === "contribution"
          ? "Owner contribution cannot be attributed across multiple owners"
          : "Owner payout cannot be attributed across multiple owners",
      );
    }
  });

  it("retains the effective owner-link ID for a direct transfer", () => {
    const result = buildOwnerStatement(
      fixture({
        incomeItems: [incomeItem("transfer", 100, "owner_contribution")],
        ownerLinks: [
          ownerLink({ endedOn: "2026-07-15" }),
          ownerLink({ id: "owner-link-current", startedOn: "2026-07-15" }),
        ],
        receiptAllocations: [
          receiptAllocation("transfer", 100, "2026-07-20", "transfer"),
        ],
      }),
    );

    expect(readyRow(result).evidence).toContainEqual(
      expect.objectContaining({
        ownerLinkId: "owner-link-current",
        receiptId: "receipt-transfer",
        statementFact: "owner_contributions",
      }),
    );
  });

  it("allocates the closing deposit balance to period-end owners", () => {
    const result = buildOwnerStatement(
      fixture({
        depositEvents: [depositEvent("deposit", 100, "received", "2026-06-01")],
        ownerLinks: [
          ownerLink({ endedOn: "2026-07-15" }),
          ...twoOwnerLinks("60.000", "40.000").map((link) => ({
            ...link,
            id: `period-end-${link.id}`,
            startedOn: "2026-07-15",
          })),
        ],
        people: twoPeople(),
      }),
    );

    expect(
      readyRows(result).map((row) => [
        row.ownerPersonId,
        row.securityDepositHeldCents,
      ]),
    ).toEqual([
      ["owner-person-1", 6_000],
      ["owner-person-2", 4_000],
    ]);
  });

  it("blocks ambiguous period-end deposit ownership", () => {
    const result = buildOwnerStatement(
      fixture({
        depositEvents: [depositEvent("deposit", 100, "received", "2026-06-01")],
        ownerLinks: twoOwnerLinks("60.000", null),
        people: twoPeople(),
      }),
    );

    expect(blockedRow(result).reasons).toContain(
      "Period-end ownership is ambiguous for deposit disclosure",
    );
  });
});

function fixture({
  depositEvents = [],
  expenseItems = [],
  incomeItems = [],
  ownerLinks,
  paymentAllocations = [],
  people,
  receiptAllocations = [],
}: FixtureOverrides = {}): OwnerStatementInput {
  return {
    cashInput: {
      depositEvents,
      expenseItems,
      incomeItems,
      monthScope: { before: "2026-08-01", from: "2026-07-01" },
      paymentAllocations,
      propertyIds: [propertyId],
      receiptAllocations,
    },
    ownerLinks: ownerLinks ?? [ownerLink()],
    people:
      people ??
      [
        {
          displayName: "Owner One",
          hasUsableContact: true,
          id: ownerPersonId,
        },
      ],
  };
}

function readyRow(result: ReturnType<typeof buildOwnerStatement>) {
  const row = result.rows.find(
    (candidate): candidate is OwnerStatementReadyRow =>
      candidate.status === "ready" && candidate.propertyId === propertyId,
  );
  expect(row).toBeDefined();
  return row!;
}

function readyRows(result: ReturnType<typeof buildOwnerStatement>) {
  return result.rows.filter(
    (row): row is OwnerStatementReadyRow => row.status === "ready",
  );
}

function blockedRow(result: ReturnType<typeof buildOwnerStatement>) {
  const row = result.rows.find(
    (candidate) =>
      candidate.status === "blocked" && candidate.propertyId === propertyId,
  );
  expect(row?.status).toBe("blocked");
  return row! as Extract<(typeof result.rows)[number], { status: "blocked" }>;
}

function twoOwnerLinks(
  firstPercent: number | string | null,
  secondPercent: number | string | null,
) {
  return [
    ownerLink({ ownershipPercent: firstPercent }),
    ownerLink({
      id: "owner-link-2",
      isPrimary: false,
      ownershipPercent: secondPercent,
      personId: "owner-person-2",
    }),
  ];
}

function twoPeople(): OwnerStatementInput["people"] {
  return [
    { displayName: "Owner One", hasUsableContact: true, id: "owner-person-1" },
    { displayName: "Owner Two", hasUsableContact: true, id: "owner-person-2" },
  ];
}

function ownerLink(overrides: Partial<OwnerStatementInput["ownerLinks"][number]> = {}) {
  return {
    archivedAt: null,
    endedOn: null,
    id: "owner-link-1",
    isPrimary: true,
    ownershipPercent: null,
    personId: ownerPersonId,
    propertyId,
    startedOn: null,
    ...overrides,
  };
}

function incomeItem(
  id: string,
  amountDue: number,
  incomeType = "rent",
  dueDate = "2026-07-01",
): PropertyCashIncomeItem {
  return { amountDue, dueDate, id, incomeType, propertyId };
}

function receiptAllocation(
  incomeItemId: string,
  amount: number,
  receivedDate = "2026-07-20",
  suffix = incomeItemId,
  reversalOfId: string | null = null,
): PropertyCashReceiptAllocation {
  return {
    allocationId: `receipt-allocation-${suffix}`,
    amount,
    incomeItemId,
    receiptId: `receipt-${suffix}`,
    receivedDate,
    reversalOfId,
  };
}

function expenseItem(
  id: string,
  expenseType = "vendor_bill",
): PropertyCashExpenseItem {
  return {
    economicScope: "property_expense",
    expenseType,
    id,
    propertyId,
  };
}

function paymentAllocation(
  expenseItemId: string,
  amount: number,
  paidDate = "2026-07-21",
  suffix = expenseItemId,
  reversalOfId: string | null = null,
): PropertyCashPaymentAllocation {
  return {
    allocationId: `payment-allocation-${suffix}`,
    amount,
    expenseItemId,
    paidDate,
    paymentId: `payment-${suffix}`,
    reversalOfId,
  };
}

function depositEvent(
  depositEventId: string,
  amount: number,
  eventType: PropertyCashDepositEvent["eventType"],
  eventDate: string,
  reversedEventType: PropertyCashDepositEvent["reversedEventType"] = null,
): PropertyCashDepositEvent {
  return {
    amount,
    depositEventId,
    eventDate,
    eventType,
    propertyId,
    reversedEventType,
  };
}

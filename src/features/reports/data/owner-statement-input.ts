import type {
  PropertyCashDepositEvent,
  PropertyCashExpenseItem,
  PropertyCashIncomeItem,
  PropertyCashMoney,
  PropertyCashPaymentAllocation,
  PropertyCashReceiptAllocation,
} from "@/features/finance/property-cash";
import type {
  OwnerStatementDataIssue,
  OwnerStatementInput,
  OwnerStatementOwnerLink,
  OwnerStatementPerson,
} from "@/features/reports/data/owner-statement";

export type OwnerStatementIncomeItemRow = {
  amount_due: PropertyCashMoney;
  due_date: string;
  id: string;
  income_type: string;
  property_id: string;
};

export type OwnerStatementExpenseItemRow = {
  economic_scope: string;
  expense_type: string;
  id: string;
  property_id: string;
};

export type OwnerStatementReceiptAllocationRow = {
  amount: PropertyCashMoney;
  finance_income_items?: OwnerStatementIncomeItemRow | null;
  finance_receipts: {
    id: string;
    received_date: string;
    reversal_of_id: string | null;
  } | null;
  id: string;
  income_item_id: string;
};

export type OwnerStatementPaymentAllocationRow = {
  amount: PropertyCashMoney;
  expense_item_id: string;
  finance_expense_items: OwnerStatementExpenseItemRow | null;
  finance_payments: {
    id: string;
    paid_date: string;
    reversal_of_id: string | null;
  } | null;
  id: string;
};

export type OwnerStatementDepositEventRow = {
  amount: PropertyCashMoney;
  event_date: string;
  event_type: string;
  id: string;
  property_id: string;
  reversal_of_id: string | null;
};

export type OwnerStatementOwnerLinkRow = {
  archived_at: string | null;
  ended_on: string | null;
  id: string;
  is_primary: boolean;
  ownership_percent: number | string | null;
  person_id: string;
  property_id: string;
  started_on: string | null;
};

export type OwnerStatementPersonRow = {
  display_name: string;
  id: string;
  primary_email: string | null;
  primary_phone: string | null;
};

export type OwnerStatementPersonContactRow = {
  email: string | null;
  person_id: string;
  phone: string | null;
};

export function toOwnerStatementInput({
  contactRows,
  currentReceiptRows,
  depositRows,
  dueIncomeItems,
  historicalReceiptRows,
  monthScope,
  ownerRows,
  paymentRows,
  personRows,
  propertyIds,
}: {
  contactRows: OwnerStatementPersonContactRow[];
  currentReceiptRows: OwnerStatementReceiptAllocationRow[];
  depositRows: OwnerStatementDepositEventRow[];
  dueIncomeItems: OwnerStatementIncomeItemRow[];
  historicalReceiptRows: OwnerStatementReceiptAllocationRow[];
  monthScope: OwnerStatementInput["cashInput"]["monthScope"];
  ownerRows: OwnerStatementOwnerLinkRow[];
  paymentRows: OwnerStatementPaymentAllocationRow[];
  personRows: OwnerStatementPersonRow[];
  propertyIds: string[];
}): OwnerStatementInput {
  const receiptRows = uniqueById([
    ...currentReceiptRows,
    ...historicalReceiptRows,
  ]);
  const deposits = toDepositEvents(depositRows);

  return {
    cashInput: {
      depositEvents: deposits.events,
      expenseItems: uniqueById(
        paymentRows.flatMap((row) =>
          row.finance_expense_items ? [row.finance_expense_items] : [],
        ),
      ).map(toExpenseItem),
      incomeItems: uniqueById([
        ...dueIncomeItems,
        ...currentReceiptRows.flatMap((row) =>
          row.finance_income_items ? [row.finance_income_items] : [],
        ),
      ]).map(toIncomeItem),
      monthScope,
      paymentAllocations: paymentRows.flatMap(toPaymentAllocation),
      propertyIds,
      receiptAllocations: receiptRows.flatMap(toReceiptAllocation),
    },
    dataIssues: deposits.issues,
    ownerLinks: ownerRows.map(toOwnerLink),
    people: toOwnerStatementPeople(personRows, contactRows),
  };
}

function toOwnerLink(
  row: OwnerStatementOwnerLinkRow,
): OwnerStatementOwnerLink {
  return {
    archivedAt: row.archived_at,
    endedOn: row.ended_on,
    id: row.id,
    isPrimary: row.is_primary,
    ownershipPercent: row.ownership_percent,
    personId: row.person_id,
    propertyId: row.property_id,
    startedOn: row.started_on,
  };
}

function toOwnerStatementPeople(
  people: OwnerStatementPersonRow[],
  contacts: OwnerStatementPersonContactRow[],
): OwnerStatementPerson[] {
  const contactPersonIds = new Set(
    contacts.flatMap((contact) =>
      hasText(contact.email) || hasText(contact.phone) ? [contact.person_id] : [],
    ),
  );
  return people.map((person) => ({
    displayName: person.display_name,
    hasUsableContact:
      hasText(person.primary_email) ||
      hasText(person.primary_phone) ||
      contactPersonIds.has(person.id),
    id: person.id,
  }));
}

function toIncomeItem(
  row: OwnerStatementIncomeItemRow,
): PropertyCashIncomeItem {
  return {
    amountDue: row.amount_due,
    dueDate: row.due_date,
    id: row.id,
    incomeType: row.income_type,
    propertyId: row.property_id,
  };
}

function toReceiptAllocation(
  row: OwnerStatementReceiptAllocationRow,
): PropertyCashReceiptAllocation[] {
  if (!row.finance_receipts) return [];
  return [
    {
      allocationId: row.id,
      amount: row.amount,
      incomeItemId: row.income_item_id,
      receiptId: row.finance_receipts.id,
      receivedDate: row.finance_receipts.received_date,
      reversalOfId: row.finance_receipts.reversal_of_id,
    },
  ];
}

function toExpenseItem(
  row: OwnerStatementExpenseItemRow,
): PropertyCashExpenseItem {
  return {
    economicScope: row.economic_scope,
    expenseType: row.expense_type,
    id: row.id,
    propertyId: row.property_id,
  };
}

function toPaymentAllocation(
  row: OwnerStatementPaymentAllocationRow,
): PropertyCashPaymentAllocation[] {
  if (!row.finance_payments) return [];
  return [
    {
      allocationId: row.id,
      amount: row.amount,
      expenseItemId: row.expense_item_id,
      paidDate: row.finance_payments.paid_date,
      paymentId: row.finance_payments.id,
      reversalOfId: row.finance_payments.reversal_of_id,
    },
  ];
}

function toDepositEvents(rows: OwnerStatementDepositEventRow[]): {
  events: PropertyCashDepositEvent[];
  issues: OwnerStatementDataIssue[];
} {
  const typesById = new Map(rows.map((row) => [row.id, row.event_type]));
  const events: PropertyCashDepositEvent[] = [];
  const issues: OwnerStatementDataIssue[] = [];

  for (const row of rows) {
    const common = {
      amount: row.amount,
      depositEventId: row.id,
      eventDate: row.event_date,
      propertyId: row.property_id,
    };
    if (row.event_type === "reversed") {
      const reversedEventType = row.reversal_of_id
        ? typesById.get(row.reversal_of_id)
        : undefined;
      if (!isDepositEventType(reversedEventType)) {
        issues.push(
          depositDataIssue(
            row,
            `Deposit reversal ${row.id} is missing its original event type`,
          ),
        );
        continue;
      }
      events.push({
        ...common,
        eventType: "reversed",
        reversedEventType,
      });
      continue;
    }
    if (!isDepositEventType(row.event_type)) {
      issues.push(
        depositDataIssue(
          row,
          `Deposit event ${row.id} has unsupported type ${row.event_type}`,
        ),
      );
      continue;
    }
    events.push({
      ...common,
      eventType: row.event_type,
      reversedEventType: null,
    });
  }

  return { events, issues };
}

function depositDataIssue(
  row: OwnerStatementDepositEventRow,
  reason: string,
): OwnerStatementDataIssue {
  return {
    evidence: {
      allocatedAmountCents: null,
      allocationId: null,
      classification: "security_deposit",
      depositEventId: row.id,
      eventDate: row.event_date,
      expenseItemId: null,
      incomeItemId: null,
      ownerEndedOn: null,
      ownerLinkId: null,
      ownerPersonId: null,
      ownerStartedOn: null,
      paymentId: null,
      propertyId: row.property_id,
      receiptId: null,
      signedAmountCents: null,
      statementFact: "supporting_evidence",
    },
    propertyId: row.property_id,
    reason,
  };
}

function isDepositEventType(
  value: string | undefined,
): value is Exclude<PropertyCashDepositEvent["eventType"], "reversed"> {
  return (
    value === "applied" ||
    value === "received" ||
    value === "refunded" ||
    value === "retained"
  );
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function hasText(value: string | null) {
  return Boolean(value?.trim());
}

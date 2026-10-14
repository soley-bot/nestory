export type RentInvoiceSearchParams = {
  due?: string | string[];
  overdueDays?: string | string[];
  page?: string | string[];
  property?: string | string[];
  q?: string | string[];
  sort?: string | string[];
  status?: string | string[];
};

export function parseRentInvoiceQuery(params: RentInvoiceSearchParams) {
  const value = (input: string | string[] | undefined) => typeof input === "string" ? input.trim() : "";
  const page = Number(value(params.page));
  const property = value(params.property);
  return {
    due: oneOf(value(params.due), ["all", "next_7_days", "overdue", "this_month", "today"] as const, "all"),
    overdueDays: oneOf(value(params.overdueDays), ["all", "7", "30", "60"] as const, "all"),
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 2_147_483_647) : 1,
    propertyId: property && property !== "all" ? property : undefined,
    query: value(params.q),
    sort: oneOf(value(params.sort), ["balance_desc", "default", "due_asc", "due_desc", "tenant_asc"] as const, "default"),
    status: oneOf(value(params.status), ["all", "open", "paid", "partly_paid", "unpaid"] as const, "all"),
  };
}

export type RentInvoiceQuery = ReturnType<typeof parseRentInvoiceQuery> & {
  leaseId?: string;
  selectedInvoiceId?: string;
  unitId?: string;
};

function oneOf<const T extends readonly string[]>(value: string, options: T, fallback: T[number]): T[number] {
  return options.includes(value) ? value as T[number] : fallback;
}

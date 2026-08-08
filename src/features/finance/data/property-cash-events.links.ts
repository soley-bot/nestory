import type { PropertyCashEvent } from "@/features/finance/data/property-cash-events.types";
import { buildHref } from "@/lib/url/href";

export function resolvePropertyCashEventHref(event: PropertyCashEvent): string {
  const month = event.eventDate?.slice(0, 7) ?? event.periodStart?.slice(0, 7);

  switch (event.sourceType) {
    case "receipt_allocation":
    case "owner_collection_allocation":
      return buildHref("/rent-income", {
        archiveState: "all",
        incomeItemId:
          event.obligationType === "finance_income_item"
            ? event.obligationId
            : null,
        month,
        propertyId: event.propertyId,
        unitId: event.unitId,
      });
    case "payment_allocation":
      return buildHref("/bills-expenses", {
        archiveState: "all",
        dateBasis: "paid",
        expenseItemId:
          event.obligationType === "finance_expense_item"
            ? event.obligationId
            : null,
        month,
        propertyId: event.propertyId,
        unitId: event.unitId,
      });
    case "deposit_event":
      return event.leaseId
        ? buildHref("/leases", {
            archiveState: "all",
            leaseId: event.leaseId,
          })
        : propertyFallbackHref(event);
    case "petty_cash_entry":
      return buildHref("/petty-cash", { entryId: event.sourceId });
    case "owner_payment":
    case "property_withdrawal":
      return `/properties/${encodeURIComponent(event.propertyId)}/account`;
  }
}

function propertyFallbackHref(event: PropertyCashEvent) {
  if (event.unitId) {
    return `/units/${encodeURIComponent(event.unitId)}`;
  }

  return `/properties/${encodeURIComponent(event.propertyId)}`;
}

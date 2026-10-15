export const tenantReceiptHistoryReviewMessage =
  "Receipt history needs finance support review. Retrying cannot resolve the payment order.";

export class TenantReceiptHistoryReviewRequiredError extends Error {
  constructor() {
    super(tenantReceiptHistoryReviewMessage);
    this.name = "TenantReceiptHistoryReviewRequiredError";
  }
}

export function tenantReceiptSourceError(error: {
  code?: string;
  message?: string;
}): Error {
  if (
    error.code === "55000" &&
    error.message === "tenant_receipt_snapshot_order_ambiguous"
  ) {
    return new TenantReceiptHistoryReviewRequiredError();
  }
  return new Error("Tenant Receipt source is unavailable.");
}

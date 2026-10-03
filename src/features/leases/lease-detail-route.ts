import { workflowReturnHref } from "./workflow-return";
import { buildHref } from "@/lib/url/href";

export type LeaseRecordSection = "overview" | "rent" | "occupancy" | "files";

export type LeaseDetailQuery = {
  paymentFocusRequested: boolean;
  paymentInvoiceId: string | null;
  rentEditInvoiceId: string | null;
  section: LeaseRecordSection;
  returnTo?: string;
};

const databaseIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const leaseRecordSections = new Set<LeaseRecordSection>([
  "overview",
  "rent",
  "occupancy",
  "files",
]);

export function parseLeaseDetailQuery(
  searchParams: Record<string, string | string[] | undefined>,
): LeaseDetailQuery {
  const section = firstValue(searchParams.section);
  const action = firstValue(searchParams.action);
  const invoiceId = firstValue(searchParams.invoiceId)?.trim();
  const paymentFocusRequested = action === "record-payment";
  const rentEditRequested = action === "edit-current-rent";

  const returnTo = workflowReturnHref(firstValue(searchParams.returnTo));
  return {
    ...(returnTo ? { returnTo } : {}),
    paymentFocusRequested,
    paymentInvoiceId:
      paymentFocusRequested && invoiceId && databaseIdPattern.test(invoiceId)
        ? invoiceId
        : null,
    rentEditInvoiceId:
      rentEditRequested && invoiceId && databaseIdPattern.test(invoiceId)
        ? invoiceId
        : null,
    section: leaseRecordSections.has(section as LeaseRecordSection)
      ? (section as LeaseRecordSection)
      : "overview",
  };
}

export function buildLeaseCurrentRentEditHref({
  invoiceId,
  leaseId,
  returnTo,
}: {
  invoiceId: string;
  leaseId: string;
  returnTo?: string;
}) {
  return buildHref(`/leases/${leaseId}`, {
    returnTo: workflowReturnHref(returnTo),
    action: "edit-current-rent",
    invoiceId,
    section: "rent",
  });
}

export function buildLeasePaymentResolutionHref({
  invoiceId,
  leaseId,
  returnTo,
}: {
  invoiceId: string;
  leaseId: string;
  returnTo?: string;
}) {
  return buildHref(`/leases/${leaseId}`, {
    returnTo: workflowReturnHref(returnTo),
    action: "record-payment",
    invoiceId,
  });
}

export function buildLeaseRecordHref({
  leaseId,
  returnTo,
  section,
}: {
  leaseId: string;
  returnTo?: string;
  section?: LeaseRecordSection;
}) {
  return buildHref(`/leases/${leaseId}`, { section, returnTo: workflowReturnHref(returnTo) });
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

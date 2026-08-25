import { buildHref } from "@/lib/url/href";

export type LeaseRecordSection = "overview" | "rent" | "occupancy" | "files";

export type LeaseDetailQuery = {
  paymentFocusRequested: boolean;
  paymentInvoiceId: string | null;
  section: LeaseRecordSection;
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

  return {
    paymentFocusRequested,
    paymentInvoiceId:
      paymentFocusRequested && invoiceId && databaseIdPattern.test(invoiceId)
        ? invoiceId
        : null,
    section: leaseRecordSections.has(section as LeaseRecordSection)
      ? (section as LeaseRecordSection)
      : "overview",
  };
}

export function buildLeasePaymentResolutionHref({
  invoiceId,
  leaseId,
}: {
  invoiceId: string;
  leaseId: string;
}) {
  return buildHref(`/leases/${leaseId}`, {
    action: "record-payment",
    invoiceId,
  });
}

export function buildLeaseRecordHref({
  leaseId,
  section,
}: {
  leaseId: string;
  section?: LeaseRecordSection;
}) {
  return buildHref(`/leases/${leaseId}`, { section });
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

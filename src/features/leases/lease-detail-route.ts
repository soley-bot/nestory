import { workflowReturnHref } from "./workflow-return";
import type { HistoricalRentCorrectionCandidate } from "./lease.types";
import { buildHref } from "@/lib/url/href";

export type LeaseRecordSection = "overview" | "rent" | "occupancy" | "files";
export type IssuedChargeEdit = { invoiceId: string; mode: "rent" | "management_fee" };

export function canCorrectIssuedCharge(candidate: HistoricalRentCorrectionCandidate, mode: IssuedChargeEdit["mode"]) {
  return mode === "management_fee" ? !candidate.managementFeeCorrected : !candidate.managementFeeOnly;
}

export type LeaseDetailQuery = {
  paymentFocusRequested: boolean;
  paymentInvoiceId: string | null;
  rentEditInvoiceId: string | null;
  issuedChargeEdit?: IssuedChargeEdit;
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
    ...(invoiceId && databaseIdPattern.test(invoiceId) && (action === "correct-issued-rent" || action === "correct-management-fee")
      ? { issuedChargeEdit: { invoiceId, mode: action === "correct-management-fee" ? "management_fee" : "rent" } as IssuedChargeEdit } : {}),
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

export function buildIssuedChargeEditHref(leaseId: string, edit: IssuedChargeEdit, returnTo?: string) {
  return buildHref(`/leases/${leaseId}`, { action: edit.mode === "rent" ? "correct-issued-rent" : "correct-management-fee",
    invoiceId: edit.invoiceId, section: "rent", returnTo: workflowReturnHref(returnTo) });
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

export function buildLeaseRentChargesHref({ leaseId, propertyId, unitId, returnTo, canViewPropertyRecords = true }: {
  leaseId: string;
  propertyId: string;
  unitId?: string | null;
  returnTo?: string;
  canViewPropertyRecords?: boolean;
}) {
  if (!canViewPropertyRecords) {
    return buildHref("/rent-income", {
      leaseId,
      returnTo: buildLeaseRecordHref({ leaseId, section: "rent", returnTo }),
    });
  }
  return buildHref(unitId ? `/units/${unitId}/finance` : `/properties/${propertyId}/finance`, {
    view: "rent",
    returnTo: buildLeaseRecordHref({ leaseId, section: "rent", returnTo }),
  });
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

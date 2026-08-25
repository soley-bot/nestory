import { LeaseDetailScreen } from "@/features/leases/components/lease-detail-screen";
import { getLeasePaymentResolutionData } from "@/features/finance-operations/data/finance-operations";
import type { LeasePaymentResolutionData } from "@/features/finance-operations/finance-operations.types";
import { getLeasesScreenData } from "@/features/leases/data/leases";
import { parseLeaseSearchParams } from "@/features/leases/lease.filters";
import { parseLeaseDetailQuery } from "@/features/leases/lease-detail-route";
import { requirePermission } from "@/lib/auth/context";
import LeaseNotFound from "./not-found";

type LeasePageProps = {
  params: Promise<{ leaseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeasePage({ params, searchParams }: LeasePageProps) {
  const [{ leaseId }, rawSearchParams] = await Promise.all([params, searchParams]);
  const context = await requirePermission("leases.view");
  const { paymentFocusRequested, paymentInvoiceId, section } =
    parseLeaseDetailQuery(rawSearchParams);
  const viewQuery = {
    ...parseLeaseSearchParams({ archiveState: "all" }),
    leaseId,
  };
  const [leaseData, paymentResolution] = await Promise.all([
    getLeasesScreenData(context.organizationId, viewQuery),
    paymentInvoiceId
      ? getLeasePaymentResolutionData({
          invoiceId: paymentInvoiceId,
          leaseId,
          organizationId: context.organizationId,
        })
      : Promise.resolve(null),
  ]);
  const {
    billingFormConfig,
    leases,
    propertyOptions,
    tenantOptions,
    unitOptions,
  } = leaseData;
  const lease = leases[0];

  if (!lease || lease.id !== leaseId) {
    return <LeaseNotFound />;
  }

  const eligiblePaymentResolution =
    paymentResolution &&
    paymentResolution.invoice.leaseId === lease.id &&
    !lease.isArchived &&
    paymentResolution.invoice.collectionRoute === "through_ips" &&
    paymentResolution.invoice.balanceDue > 0 &&
    (paymentResolution.invoice.paymentStatus === "unpaid" ||
      paymentResolution.invoice.paymentStatus === "partly_paid")
      ? paymentResolution
      : undefined;
  const canViewFinance = context.permissionKeys.has("finance.view");
  const routeNotice = paymentFocusRequested
    ? getPaymentRouteNotice({
        canViewFinance,
        leaseId,
        leaseIsArchived: lease.isArchived,
        paymentResolution,
      })
    : undefined;

  return (
    <LeaseDetailScreen
      activeSection={section}
      billingFormConfig={billingFormConfig}
      canRecordPayments={context.permissionKeys.has("finance.record_payments")}
      canViewFinance={canViewFinance}
      permissions={{
        canActivate: context.permissionKeys.has("leases.activate"),
        canArchive: context.permissionKeys.has("leases.archive"),
        canChangeTerms: context.permissionKeys.has("leases.change_terms"),
        canClose: context.permissionKeys.has("leases.close"),
        canPrepare: context.permissionKeys.has("leases.prepare"),
      }}
      lease={lease}
      paymentResolution={eligiblePaymentResolution}
      propertyOptions={propertyOptions}
      routeNotice={eligiblePaymentResolution ? undefined : routeNotice}
      tenantOptions={tenantOptions}
      unitOptions={unitOptions}
    />
  );
}

function getPaymentRouteNotice({
  canViewFinance,
  leaseId,
  leaseIsArchived,
  paymentResolution,
}: {
  canViewFinance: boolean;
  leaseId: string;
  leaseIsArchived: boolean;
  paymentResolution: LeasePaymentResolutionData | null;
}) {
  if (!paymentResolution || paymentResolution.invoice.leaseId !== leaseId) {
    return { message: "That invoice is no longer available for this Lease." };
  }

  if (leaseIsArchived) {
    return { message: "Archived Leases cannot receive a new payment." };
  }

  const { invoice } = paymentResolution;
  if (invoice.paymentStatus === "voided") {
    return {
      message: "This invoice is voided and cannot receive a payment.",
    };
  }

  if (invoice.collectionRoute === "direct_to_owner") {
    return canViewFinance
      ? {
          href: `/rent-income?leaseId=${leaseId}`,
          linkLabel: "Open Finance",
          message: "Confirm owner collection in Finance.",
        }
      : { message: "Confirm owner collection in Finance." };
  }

  if (invoice.paymentStatus === "paid" || invoice.balanceDue <= 0) {
    const receiptHref = invoice.settlements.find(
      (settlement) =>
        !settlement.isReversed &&
        settlement.receipt?.publicationStatus === "published" &&
        settlement.receipt.href,
    )?.receipt?.href;

    return receiptHref
      ? {
          href: receiptHref,
          linkLabel: "Download receipt",
          message: "This invoice is already paid.",
        }
      : { message: "This invoice is already paid." };
  }

  return { message: "That invoice is no longer available for this Lease." };
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { ChevronRight, Eye, Plus, WalletCards } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { PaginationControls } from "@/components/data/pagination-controls";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";
import { AuditDetails } from "@/components/ui/audit-details";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { EmptyState } from "@/components/ui/empty-state";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { NumberInput } from "@/components/ui/number-input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";
import { findConfiguredAccountId } from "@/features/finance-accounts/finance-account-selection";
import { LeaseBillingRuleFields } from "@/features/leases/components/lease-billing-rule-fields";
import { buildLeasePaymentResolutionHref } from "@/features/leases/lease-detail-route";
import type { LeaseBillingRule } from "@/features/leases/lease.types";
import {
  createManualTenantChargeAction,
  publishTenantInvoicePdfAction,
  recordOwnerPaymentAction,
  recordWithdrawalAction,
  recoverLeaseRentPeriodAction,
  recoverRentGenerationExceptionAction,
  reverseExpenseAction,
  reverseOwnerCollectionConfirmationAction,
  reverseTenantInvoicePaymentAction,
  retryTenantReceiptPdfAction,
  reviewExpenseAction,
  saveLeaseBillingAction,
  submitExpenseAction,
  cancelExpenseAction,
} from "@/features/finance-operations/actions";
import { FinanceCategorySetupEntry } from "@/features/finance-operations/components/finance-category-manager";
import {
  TenantInvoicePaymentForm,
  type TenantPaymentReceiptResult,
} from "@/features/finance-operations/components/tenant-invoice-payment-form";
import {
  getRentInvoiceView,
  RentInvoiceFilterBar,
} from "@/features/finance-operations/components/rent-invoice-filters";
import type {
  CommercialDocumentLink,
  ExpenseSubmissionSummary,
  FinanceLease,
  FinanceOperationsActionState,
  FinanceOperationsData,
  OwnerInvoiceSummary,
  PropertyAccountEntry,
  PropertyFinancePosition,
  RentGenerationException,
  TenantInvoiceSettlement,
  TenantInvoiceSummary,
} from "@/features/finance-operations/finance-operations.types";
import {
  categoryLabel,
  expenseStatusPresentation,
  formatEvidenceSize,
  getInvoiceStatusPresentation,
  maintenanceStatusLabel,
} from "@/features/finance-operations/finance-operations-view-model";
import { sortPropertyAccountEntriesNewestFirst } from "@/features/finance-operations/property-account";
import {
  getBusinessDateValue,
  getBusinessMonthValue,
} from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import { cn } from "@/lib/utils";

export type FinanceOperationsView =
  "account" | "balances" | "expenses" | "rent" | "work";

type ModalState =
  | { mode: "expense-cancel"; submission: ExpenseSubmissionSummary }
  | { lease?: FinanceLease; mode: "manual-charge" }
  | {
      invoice: TenantInvoiceSummary;
      mode: "invoice-details";
    }
  | {
      mode: "expense-details";
      submission: ExpenseSubmissionSummary;
    }
  | {
      mode: "owner-balance-details";
      ownerInvoice?: OwnerInvoiceSummary;
      position: PropertyFinancePosition;
    }
  | {
      canChooseAnother?: boolean;
      invoice?: TenantInvoiceSummary;
      mode: "payment";
    }
  | { mode: "rent-recovery" }
  | { invoice: OwnerInvoiceSummary; mode: "owner-payment" }
  | {
      decision: "approve" | "reject";
      mode: "expense-review";
      submission: ExpenseSubmissionSummary;
    }
  | {
      mode: "expense-reversal";
      submission: ExpenseSubmissionSummary;
    }
  | {
      invoice: TenantInvoiceSummary;
      mode: "settlement-reversal";
    }
  | { mode: "withdrawal"; position: PropertyFinancePosition };

type DrawerState =
  | { lease: FinanceLease; mode: "billing" }
  | {
      initialInvoiceId?: string;
      initialResponsibility?: "owner" | "tenant";
      mode: "expense";
      replacement?: ExpenseSubmissionSummary;
    };

type FinanceOperationsScreenProps = FinanceOperationsData & {
  currentUserId?: string;
  canApproveOwnExpense?: boolean;
  canCreateVendor?: boolean;
  canConfigureRent: boolean;
  canManageFinanceCategories?: boolean;
  canCorrectFinance: boolean;
  canRecordOwnerCash: boolean;
  canRecordPayments: boolean;
  canReadFinanceReports?: boolean;
  canRecoverRent: boolean;
  canReviewExpense: boolean;
  canReverseExpense: boolean;
  canRetryCurrentRent: boolean;
  canSubmitExpense: boolean;
  canViewLeases?: boolean;
  canViewPropertyRecords?: boolean;
  initialBillingLeaseId?: string;
  initialExpenseIntent?: "owner" | "tenant";
  initialRentLeaseId?: string;
  openingAuthority?: ReactNode;
  organizationName: string;
  selectedPropertyId?: string | null;
  scope?: {
    id: string;
    kind: "property" | "unit";
    label: string;
    propertyId: string;
    propertyLabel: string;
  };
  view: FinanceOperationsView;
};

const actionInitialState: FinanceOperationsActionState = {};
const leaseMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

export function FinanceOperationsScreen(input: FinanceOperationsScreenProps) {
  const props = {
    ...input,
    expenseSubmissions: input.expenseSubmissions.map((submission) => ({
      ...submission,
      selfApprovalOnly: Boolean(
        submission.transactionId && input.currentUserId &&
        submission.submittedByUserId === input.currentUserId && input.canApproveOwnExpense,
      ),
      reviewRequiresAnotherUser: Boolean(
        submission.transactionId && input.currentUserId &&
        submission.submittedByUserId === input.currentUserId && !input.canApproveOwnExpense,
      ),
    })),
  };
  const organizationName = props.organizationName.trim() || "our company";
  const initialBillingLease = props.initialBillingLeaseId
    ? props.leases.find((lease) => lease.id === props.initialBillingLeaseId)
    : undefined;
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    initialBillingLease
      ? { lease: initialBillingLease, mode: "billing" }
      : props.initialExpenseIntent && props.canSubmitExpense
        ? {
            initialResponsibility: props.initialExpenseIntent,
            mode: "expense",
          }
        : null,
  );
  const [modal, setModal] = useState<ModalState | null>(null);
  const [invoicePdfResultHref, setInvoicePdfResultHref] = useState<string | null>(
    null,
  );
  const [invoicePdfPublicationOpen, setInvoicePdfPublicationOpen] =
    useState(false);
  const pdfDrawerTriggerRef = useRef<HTMLElement | null>(null);
  const [receiptResult, setReceiptResult] =
    useState<TenantPaymentReceiptResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const closeDrawer = () => setDrawer(null);
  const closeModal = () => setModal(null);
  const closeInvoicePdfPublication = () => setInvoicePdfPublicationOpen(false);
  useEffect(() => {
    if (invoicePdfPublicationOpen) return;
    const trigger = pdfDrawerTriggerRef.current;
    if (!trigger) return;
    window.setTimeout(() => {
      if (trigger.isConnected) trigger.focus();
    }, 0);
  }, [invoicePdfPublicationOpen]);
  const openDrawer = (next: DrawerState) => {
    setStatusMessage(null);
    setInvoicePdfResultHref(null);
    setReceiptResult(null);
    setModal(null);
    setDrawer(next);
  };
  const openModal = (next: ModalState) => {
    setStatusMessage(null);
    setInvoicePdfResultHref(null);
    setReceiptResult(null);
    setDrawer(null);
    setInvoicePdfPublicationOpen(false);
    setModal(next);
  };
  const onActionSuccess = (message: string) => {
    setStatusMessage(message);
    closeDrawer();
    closeModal();
  };
  const screen = getScreen(
    { ...props, organizationName },
    openModal,
    openDrawer,
  );
  const visibleDrawer =
    drawer &&
    (drawer.mode === "billing"
      ? props.canConfigureRent
      : drawer.mode === "expense"
        ? props.canSubmitExpense
          && (!drawer.replacement || canReplaceExpense(drawer.replacement, props))
        : true)
      ? drawer
      : null;
  const visibleModal =
    modal && canRenderFinanceModal(modal, props) ? modal : null;
  const visibleDetailDrawer =
    visibleModal && isFinanceDetailSurface(visibleModal) ? visibleModal : null;
  const visibleActionModal = visibleDetailDrawer ? null : visibleModal;

  return (
    <WorkspacePage
      actions={screen.actions}
      context={screen.context}
      contextHref={screen.contextHref}
      header={
        props.scope ? (
          <PageHeader
            actions={screen.actions}
            breadcrumb={
              <PageBreadcrumb
                current="Finance"
                items={
                  !props.canViewPropertyRecords
                    ? [{ href: "/finance", label: "Finance" }]
                    : props.scope.kind === "property"
                    ? [
                        { href: "/properties", label: "Properties" },
                        {
                          href: `/properties/${props.scope.id}`,
                          label: props.scope.label,
                        },
                      ]
                    : [
                        { href: "/properties", label: "Properties" },
                        {
                          href: `/properties/${props.scope.propertyId}`,
                          label: props.scope.propertyLabel,
                        },
                        {
                          href: `/units/${props.scope.id}`,
                          label: props.scope.label,
                        },
                      ]
                }
              />
            }
            className="px-4 py-3 sm:px-6 lg:py-3 2xl:px-8"
            context={screen.title}
            description={
              props.scope.kind === "unit"
                ? props.scope.propertyLabel
                : "Property workspace"
            }
            title={`${props.scope.label} finance`}
          />
        ) : "header" in screen ? (
          screen.header
        ) : undefined
      }
      headerClassName="px-4 py-3 sm:px-6 lg:py-3 2xl:px-8"
      localNav={
        props.scope ? (
          <ScopedFinanceNavigation scope={props.scope} view={props.view} />
        ) : (
          <FinanceWorkspaceNavigation
            activeRoute={screen.activeRoute}
            canCorrectFinance={props.canCorrectFinance}
            canReadFinanceReports={props.canReadFinanceReports ?? false}
            canRecordPayments={props.canRecordPayments}
            canReviewExpense={props.canReviewExpense}
            canSubmitExpense={props.canSubmitExpense}
          />
        )
      }
      title={props.scope ? undefined : screen.title}
      toolbar={screen.toolbar}
    >
      <div className="flex min-w-0 flex-col">
        {statusMessage ? (
          <div className="shrink-0 border-b border-border bg-card px-4 py-2 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" role="status">
              <span>{statusMessage}</span>
              {receiptResult?.href ? (
                <a
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  href={receiptResult.href}
                >
                  Download receipt
                </a>
              ) : receiptResult?.unavailable && receiptResult.paymentId ? (
                <ReceiptAction
                  canRetry={props.canRecordPayments}
                  onSuccess={(state) => {
                    setReceiptResult({
                      href: state.artifactHref ?? null,
                      paymentId: receiptResult.paymentId,
                      unavailable: state.publicationStatus === "failed",
                    });
                    setStatusMessage(state.message ?? null);
                  }}
                  settlement={{
                    amount: 0,
                    date: "",
                    id: receiptResult.paymentId,
                    isReversed: false,
                    receipt: {
                      artifactId: null,
                      href: null,
                      publicationStatus: "failed",
                      publishedAt: null,
                    },
                    receiptNumber: null,
                    reference: null,
                    reversalReason: null,
                    route: "through_ips",
                  }}
                />
              ) : receiptResult?.unavailable ? (
                <span>Receipt unavailable</span>
              ) : null}
            </div>
          </div>
        ) : null}
        {screen.body}
      </div>

      {visibleDrawer ? (
        <SideDrawer
          onClose={closeDrawer}
          open
          title={getDrawerTitle(visibleDrawer)}
        >
          {visibleDrawer.mode === "billing" ? (
            <BillingSetupForm
              lease={visibleDrawer.lease}
              onSuccess={onActionSuccess}
              operationalTimezone={props.operationalTimezone ?? "UTC"}
              organizationName={organizationName}
              peopleOptions={props.peopleOptions}
            />
          ) : visibleDrawer.mode === "expense" ? (
            <ExpenseForm
              expenseAccounts={props.expenseAccounts}
              replacement={visibleDrawer.replacement}
              fixedScope={props.scope}
              initialInvoiceId={visibleDrawer.initialInvoiceId}
              initialResponsibility={visibleDrawer.initialResponsibility}
              invoices={props.tenantInvoices}
              onClose={closeDrawer}
              onSuccess={onActionSuccess}
              propertyOptions={visibleDrawer.initialResponsibility === "tenant" ? props.propertyOptions : props.expenseEntryOptions?.propertyOptions ?? props.propertyOptions}
              payFromAccounts={visibleDrawer.initialResponsibility === "tenant" ? props.payFromAccounts : props.expenseEntryOptions?.payFromAccounts ?? props.payFromAccounts}
              peopleOptions={props.peopleOptions}
              positions={visibleDrawer.initialResponsibility === "tenant" ? props.positions : props.expenseEntryOptions?.positions ?? props.positions}
              canCreateVendor={props.canCreateVendor}
              unitOptions={visibleDrawer.initialResponsibility === "tenant" ? props.unitOptions : props.expenseEntryOptions?.unitOptions ?? props.unitOptions}
            />
          ) : null}
        </SideDrawer>
      ) : null}

      {visibleDetailDrawer ? (
        <SideDrawer
          onClose={
            visibleDetailDrawer.mode === "invoice-details" &&
            invoicePdfPublicationOpen
              ? closeInvoicePdfPublication
              : closeModal
          }
          open
          title={
            visibleDetailDrawer.mode === "invoice-details" &&
            invoicePdfPublicationOpen
              ? "Publish invoice PDF"
              : getModalTitle(visibleDetailDrawer)
          }
        >
          {visibleDetailDrawer.mode === "invoice-details" ? (
            <InvoiceDetails
              canCorrectFinance={props.canCorrectFinance}
              canRecordPayments={props.canRecordPayments}
              invoice={visibleDetailDrawer.invoice}
              pdf={visibleDetailDrawer.invoice.pdf}
              pdfResultHref={invoicePdfResultHref}
              onCorrect={() =>
                setModal({
                  invoice: visibleDetailDrawer.invoice,
                  mode: "settlement-reversal",
                })
              }
              onRecordPayment={() =>
                setModal({
                  invoice: visibleDetailDrawer.invoice,
                  mode: "payment",
                })
              }
              onPublishPdf={(trigger) => {
                pdfDrawerTriggerRef.current = trigger;
                setInvoicePdfPublicationOpen(true);
              }}
              onPublicationClose={closeInvoicePdfPublication}
              onPublicationSuccess={(state) => {
                setInvoicePdfResultHref(state.artifactHref ?? null);
                setStatusMessage(state.message ?? null);
                closeInvoicePdfPublication();
              }}
              publicationOpen={invoicePdfPublicationOpen}
              organizationName={organizationName}
            />
          ) : visibleDetailDrawer.mode === "expense-details" ? (
            <ExpenseDetails
              originalExpense={visibleDetailDrawer.submission.replacesTransactionId ? props.expenseSubmissions.find((item) => item.transactionId === visibleDetailDrawer.submission.replacesTransactionId) : undefined}
              replacementExpense={visibleDetailDrawer.submission.replacementTransactionId ? props.expenseSubmissions.find((item) => item.transactionId === visibleDetailDrawer.submission.replacementTransactionId) : undefined}
              onViewRelated={(submission) => setModal({ mode: "expense-details", submission })}
              canEdit={canReplaceExpense(visibleDetailDrawer.submission, props)}
              onEdit={() => {
                const replacement = visibleDetailDrawer.submission;
                closeModal();
                setDrawer({ mode: "expense", replacement });
              }}
              onCancelExpense={() => setModal({ mode: "expense-cancel", submission: visibleDetailDrawer.submission })}
              canReview={props.canReviewExpense}
              canReverse={props.canReverseExpense}
              onApprove={() =>
                setModal({
                  decision: "approve",
                  mode: "expense-review",
                  submission: visibleDetailDrawer.submission,
                })
              }
              onClose={closeModal}
              onReject={() =>
                setModal({
                  decision: "reject",
                  mode: "expense-review",
                  submission: visibleDetailDrawer.submission,
                })
              }
              onReverse={() =>
                setModal({
                  mode: "expense-reversal",
                  submission: visibleDetailDrawer.submission,
                })
              }
              submission={visibleDetailDrawer.submission}
            />
          ) : (
            <OwnerBalanceDetails
              canRecordOwnerCash={props.canRecordOwnerCash}
              onClose={closeModal}
              onOwnerPayment={
                visibleDetailDrawer.ownerInvoice
                  ? () =>
                      setModal({
                        invoice: visibleDetailDrawer.ownerInvoice!,
                        mode: "owner-payment",
                      })
                  : undefined
              }
              onWithdrawal={() =>
                setModal({
                  mode: "withdrawal",
                  position: visibleDetailDrawer.position,
                })
              }
              organizationName={organizationName}
              position={visibleDetailDrawer.position}
            />
          )}
        </SideDrawer>
      ) : null}

      {visibleActionModal ? (
        <Modal
          onClose={closeModal}
          open
          title={getModalTitle(visibleActionModal)}
        >
          {visibleActionModal.mode === "manual-charge" ? (
            <ManualTenantChargeForm
              leaseChargeAccounts={props.leaseChargeAccounts}
              fixedLease={visibleActionModal.lease}
              invoices={props.tenantInvoices}
              leases={props.leases}
              onClose={closeModal}
              onSuccess={onActionSuccess}
              scope={props.scope}
            />
          ) : visibleActionModal.mode === "rent-recovery" ? (
            <HistoricalRentRecoveryForm
              leases={props.leases}
              onSuccess={onActionSuccess}
            />
          ) : visibleActionModal.mode === "payment" ? (
            visibleActionModal.invoice ? (
              <TenantInvoicePaymentForm
                invoice={visibleActionModal.invoice}
                onChooseAnother={
                  visibleActionModal.canChooseAnother
                    ? () => setModal({ mode: "payment" })
                    : undefined
                }
                onReceiptResult={setReceiptResult}
                onSuccess={onActionSuccess}
                ownerLabel={
                  props.leases.find(
                    (lease) => lease.id === visibleActionModal.invoice?.leaseId,
                  )?.ownerLabel ?? "Owner needed"
                }
                payFromAccounts={props.payFromAccounts}
              />
            ) : (
              <PaymentChooser
                invoices={props.tenantInvoices.filter(
                  (invoice) => invoice.balanceDue > 0,
                )}
                onChoose={(invoice) =>
                  setModal({ canChooseAnother: true, invoice, mode: "payment" })
                }
              />
            )
          ) : visibleActionModal.mode === "owner-payment" ? (
            <OwnerPaymentForm
              invoice={visibleActionModal.invoice}
              onSuccess={onActionSuccess}
            />
          ) : visibleActionModal.mode === "expense-review" ? (
            <ExpenseReviewForm
              decision={visibleActionModal.decision}
              onSuccess={onActionSuccess}
              payFromAccounts={props.payFromAccounts}
              submission={visibleActionModal.submission}
            />
          ) : visibleActionModal.mode === "expense-cancel" ? (
            <ExpenseCancellationForm submission={visibleActionModal.submission} onSuccess={onActionSuccess} />
          ) : visibleActionModal.mode === "expense-reversal" ? (
            <ExpenseReversalForm
              onSuccess={onActionSuccess}
              submission={visibleActionModal.submission}
            />
          ) : visibleActionModal.mode === "settlement-reversal" ? (
            <SettlementReversalForm
              invoice={visibleActionModal.invoice}
              onSuccess={onActionSuccess}
            />
          ) : visibleActionModal.mode === "withdrawal" ? (
            <WithdrawalForm
              onClose={closeModal}
              onSuccess={onActionSuccess}
              position={visibleActionModal.position}
            />
          ) : null}
        </Modal>
      ) : null}

    </WorkspacePage>
  );
}

function ScopedFinanceNavigation({
  scope,
  view,
}: {
  scope: NonNullable<FinanceOperationsScreenProps["scope"]>;
  view: FinanceOperationsView;
}) {
  const base =
    scope.kind === "property"
      ? `/properties/${scope.id}/finance`
      : `/units/${scope.id}/finance`;
  const items = [
    {
      active: view === "rent",
      href: `${base}?view=rent`,
      label: "Rent & charges",
    },
    {
      active: view === "expenses",
      href: `${base}?view=expenses`,
      label: "Expenses",
    },
    scope.kind === "property"
      ? {
          active: view === "account",
          href: `${base}?view=owner`,
          label: "Owner account",
        }
      : {
          active: false,
          href: `/properties/${scope.propertyId}/finance?view=owner`,
          label: "Owner account (Property)",
        },
  ];

  return (
    <LocalWorkspaceNav
      className="workspace-gutter-x py-1"
      items={items}
      label={`${scope.kind === "property" ? "Property" : "Unit"} finance`}
    />
  );
}

function getScreen(
  props: FinanceOperationsScreenProps,
  openModal: (modal: ModalState) => void,
  openDrawer: (drawer: DrawerState) => void,
) {
  const canConfigureRent = props.canConfigureRent;

  if (props.view === "rent") {
    const focusedLease = props.initialRentLeaseId
      ? props.leases.find((lease) => lease.id === props.initialRentLeaseId)
      : undefined;
    const invoices = props.initialRentLeaseId
      ? props.tenantInvoices.filter(
          (invoice) => invoice.leaseId === props.initialRentLeaseId,
        )
      : props.tenantInvoices;
    const scope = props.scope;
    const scopedLeases = scope
      ? props.leases.filter(
          (lease) =>
            (lease.status === "active" || lease.status === "notice_given") &&
            (scope.kind === "unit"
              ? lease.unitId === scope.id
              : lease.propertyId === scope.id),
        )
      : [];
    const scopedLease = scopedLeases.length === 1 ? scopedLeases[0] : undefined;
    const openInvoices = invoices.filter((invoice) => invoice.balanceDue > 0);
    const focusedPayableInvoice = props.initialRentLeaseId
      ? invoices.find((invoice) => invoice.balanceDue > 0)
      : undefined;
    return {
      activeRoute: "/rent-income" as const,
      actions: props.canRecordPayments ? (
          <>
            {!props.initialRentLeaseId ? (
              <Button
                onClick={() =>
                  openModal({
                    lease: scopedLease,
                    mode: "manual-charge",
                  })
                }
              >
                <Plus size={15} /> Bill tenant
              </Button>
            ) : null}
            <div className="flex flex-col items-end gap-1">
              <Button
                aria-describedby={
                  openInvoices.length === 0
                    ? "tenant-payment-unavailable-reason"
                    : undefined
                }
                disabled={openInvoices.length === 0}
                onClick={() =>
                  openModal(
                    focusedPayableInvoice
                      ? { invoice: focusedPayableInvoice, mode: "payment" }
                      : { mode: "payment" },
                  )
                }
                variant="outline"
              >
                <WalletCards size={15} /> Record tenant payment
              </Button>
              {openInvoices.length === 0 ? (
                <span
                  className="text-xs text-muted-foreground"
                  id="tenant-payment-unavailable-reason"
                >
                  No open tenant invoices
                </span>
              ) : null}
            </div>
          </>
        ) : undefined,
      body: (
        <RentView
          invoices={invoices}
          openModal={openModal}
          organizationName={props.organizationName}
          scoped={props.scope !== undefined}
        />
      ),
      context: `${invoices.length} ${invoices.length === 1 ? "invoice" : "invoices"}`,
      contextHref: "/rent-income",
      title: focusedLease
        ? `First rent charge · ${focusedLease.tenantLabel}`
        : "Rent & collections",
      toolbar: undefined,
    };
  }

  if (props.view === "expenses") {
    const hasOpenTenantInvoice = props.tenantInvoices.some(
      (invoice) => invoice.balanceDue > 0,
    );
    return {
      activeRoute: "/bills-expenses" as const,
      actions: props.canSubmitExpense ? (
        <>
          <Button
            onClick={() =>
              openDrawer({ initialResponsibility: "owner", mode: "expense" })
            }
            variant="default"
          >
            <Plus size={15} /> Record property expense
          </Button>
          <div className="flex flex-col items-end gap-1">
            <Button
              aria-describedby={
                hasOpenTenantInvoice
                  ? undefined
                  : "recoverable-cost-unavailable-reason"
              }
              disabled={!hasOpenTenantInvoice}
              onClick={() =>
                openDrawer({
                  initialResponsibility: "tenant",
                  mode: "expense",
                })
              }
              variant="outline"
            >
              <Plus size={15} /> Record recoverable cost
            </Button>
            {!hasOpenTenantInvoice ? (
              <span
                className="text-xs text-muted-foreground"
                id="recoverable-cost-unavailable-reason"
              >
                Needs an open tenant invoice
              </span>
            ) : null}
          </div>
        </>
      ) : undefined,
      body: (
        <ExpensesView
          canReview={props.canReviewExpense}
          openModal={openModal}
          submissions={props.expenseSubmissions}
        />
      ),
      context: `${props.expenseSubmissions.length} submissions`,
      contextHref: "/bills-expenses",
      title: "Expenses",
      toolbar: undefined,
    };
  }

  if (props.view === "balances") {
    return {
      activeRoute: "/balances" as const,
      actions: undefined,
      body: (
        <BalancesView
          canRecordOwnerCash={props.canRecordOwnerCash}
          invoices={props.tenantInvoices}
          openingAuthority={props.openingAuthority}
          openModal={openModal}
          ownerInvoices={props.ownerInvoices}
          positions={props.positions}
        />
      ),
      context: `${props.positions.length} properties`,
      contextHref: "/balances",
      title: "Balances",
      toolbar: undefined,
    };
  }

  if (props.view === "account") {
    const position =
      props.positions.find(
        (item) => item.propertyId === props.selectedPropertyId,
      ) ?? null;
    return {
      activeRoute: "/balances" as const,
      actions: undefined,
      body: (
        <PropertyAccountView
          entries={props.accountEntries}
          onRecordWithdrawal={
            props.canRecordOwnerCash &&
            position?.ownerPersonId &&
            position.availableWithdrawal > 0
              ? () => openModal({ mode: "withdrawal", position })
              : undefined
          }
          position={position}
        />
      ),
      context: position?.propertyLabel,
      contextHref: position
        ? `/properties/${position.propertyId}/account`
        : "/balances",
      header: position ? (
        <PageHeader
          breadcrumb={
            <PageBreadcrumb
              current="Owner account"
              items={
                props.canViewPropertyRecords
                  ? [
                      { href: "/properties", label: "Properties" },
                      {
                        href: `/properties/${position.propertyId}`,
                        label: position.propertyLabel,
                      },
                    ]
                  : [{ href: "/finance", label: "Finance" }]
              }
            />
          }
          className="px-4 py-3 sm:px-6 2xl:px-8 lg:py-3"
          title="Owner account"
        />
      ) : undefined,
      title: "Owner account",
      toolbar: undefined,
    };
  }

  return {
    activeRoute: "/finance" as const,
    actions: undefined,
    body: (
      <FinanceWorkView
        canConfigureRent={canConfigureRent}
        canRetryCurrentRent={props.canRetryCurrentRent}
        canViewLeases={props.canViewLeases ?? false}
        leases={props.leases}
        openDrawer={openDrawer}
        ownerInvoices={props.ownerInvoices}
        rentGenerationExceptions={props.rentGenerationExceptions}
        tenantInvoices={props.tenantInvoices}
      />
    ),
    context: "Portfolio review",
    contextHref: "/finance",
    title: "Finance",
    toolbar: undefined,
  };
}

const FINANCE_WORK_PAGE_SIZE = 25;

type FinanceWorkFilter = "all" | "setup" | "tenant" | "owner";
type FinanceWorkGroup = "urgency" | "type" | "none";
type FinanceWorkSort = "priority" | "due" | "amount";
type FinanceWorkItem =
  | { key: string; kind: "setup"; lease: FinanceLease }
  | {
      exception: RentGenerationException;
      key: string;
      kind: "exception";
      lease: FinanceLease | null;
    }
  | {
      invoice: TenantInvoiceSummary;
      key: string;
      kind: "tenant";
    }
  | {
      invoice: OwnerInvoiceSummary;
      key: string;
      kind: "owner";
    };

function FinanceWorkView({
  canConfigureRent,
  canRetryCurrentRent,
  canViewLeases,
  leases,
  openDrawer,
  ownerInvoices,
  rentGenerationExceptions,
  tenantInvoices,
}: {
  canConfigureRent: boolean;
  canRetryCurrentRent: boolean;
  canViewLeases: boolean;
  leases: FinanceLease[];
  openDrawer: (drawer: DrawerState) => void;
  ownerInvoices: OwnerInvoiceSummary[];
  rentGenerationExceptions: RentGenerationException[];
  tenantInvoices: TenantInvoiceSummary[];
}) {
  const [workFilter, setWorkFilter] = useState<FinanceWorkFilter>("all");
  const [workGroup, setWorkGroup] = useState<FinanceWorkGroup>("urgency");
  const [workSort, setWorkSort] = useState<FinanceWorkSort>("priority");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessDate = getBusinessDateValue();
  const leasesNeedingSetup = leases.filter(
    (lease) =>
      (lease.status === "active" || lease.status === "notice_given") &&
      !isLeaseBillingRuleComplete(lease.billing),
  );
  const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
  const tenantDue = tenantInvoices.filter((invoice) => invoice.balanceDue > 0);
  const ownerDue = ownerInvoices.filter((invoice) => invoice.balanceDue > 0);
  const workCount =
    leasesNeedingSetup.length +
    rentGenerationExceptions.length +
    tenantDue.length +
    ownerDue.length;
  const workItems: FinanceWorkItem[] = [
    ...leasesNeedingSetup.map((lease) => ({
      key: `setup-${lease.id}`,
      kind: "setup" as const,
      lease,
    })),
    ...rentGenerationExceptions.map((exception) => ({
      exception,
      key: `rent-exception-${exception.id}`,
      kind: "exception" as const,
      lease: leaseById.get(exception.leaseId) ?? null,
    })),
    ...tenantDue.map((invoice) => ({
      invoice,
      key: `tenant-${invoice.id}`,
      kind: "tenant" as const,
    })),
    ...ownerDue.map((invoice) => ({
      invoice,
      key: `owner-${invoice.id}`,
      kind: "owner" as const,
    })),
  ];
  const visibleWork = workItems
    .filter((item) => financeWorkMatchesFilter(item, workFilter))
    .sort((left, right) =>
      compareFinanceWork(left, right, workGroup, workSort, businessDate),
    );
  const visibleWorkCount = visibleWork.length;
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const totalPages = Math.max(
    1,
    Math.ceil(visibleWorkCount / FINANCE_WORK_PAGE_SIZE),
  );
  const page = Number.isNaN(requestedPage)
    ? 1
    : Math.min(Math.max(requestedPage, 1), totalPages);
  const pageStart = (page - 1) * FINANCE_WORK_PAGE_SIZE;
  const pageEnd = Math.min(pageStart + FINANCE_WORK_PAGE_SIZE, visibleWorkCount);
  const pageItems = visibleWork.slice(pageStart, pageEnd);
  const groupCounts = new Map<string, number>();
  for (const item of visibleWork) {
    const label = getFinanceWorkGroupLabel(item, workGroup, businessDate);
    if (label) groupCounts.set(label, (groupCounts.get(label) ?? 0) + 1);
  }
  const pagination = {
    from: visibleWorkCount === 0 ? 0 : pageStart + 1,
    page,
    pageSize: FINANCE_WORK_PAGE_SIZE,
    to: pageEnd,
    totalCount: visibleWorkCount,
    totalPages,
  };

  function resetWorkPage() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("page");
    const query = nextParams.toString();

    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function changeWorkFilter(value: string) {
    setWorkFilter(value as FinanceWorkFilter);
    resetWorkPage();
  }

  function changeWorkGroup(value: string) {
    setWorkGroup(value as FinanceWorkGroup);
    resetWorkPage();
  }

  function changeWorkSort(value: string) {
    setWorkSort(value as FinanceWorkSort);
    resetWorkPage();
  }

  return (
    <div className="workspace-gutter-x mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-4 py-4 sm:px-6 2xl:px-8">
      <p
        aria-label="Finance work summary"
        className="text-sm text-muted-foreground"
      >
        <span className="font-medium text-foreground">
          {formatCount(workCount, "open item")}
        </span>
        {" · "}
        {formatCount(tenantDue.length, "tenant payment")}
        {" · "}
        {formatCount(ownerDue.length, "owner invoice payment")}
      </p>
      <FinanceCategorySetupEntry />
      <section
        className="min-h-0 flex-1 border-t border-border"
        data-slot="finance-work-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
          <h2 className="text-sm font-semibold">Finance work</h2>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <SelectControl
              ariaLabel="Filter work queue"
              className="h-8 w-40"
              onValueChange={changeWorkFilter}
              options={[
                { label: "All work", value: "all" },
                { label: "Setup & exceptions", value: "setup" },
                { label: "Tenant payments", value: "tenant" },
                { label: "Owner invoice payments", value: "owner" },
              ]}
              value={workFilter}
            />
            <SelectControl
              ariaLabel="Group work queue"
              className="h-8 w-36"
              onValueChange={changeWorkGroup}
              options={[
                { label: "Urgency", value: "urgency" },
                { label: "Work type", value: "type" },
                { label: "No groups", value: "none" },
              ]}
              value={workGroup}
            />
            <SelectControl
              ariaLabel="Sort work queue"
              className="h-8 w-44"
              onValueChange={changeWorkSort}
              options={[
                { label: "Priority first", value: "priority" },
                { label: "Due date", value: "due" },
                { label: "Amount: high to low", value: "amount" },
              ]}
              value={workSort}
            />
          </div>
        </div>
        {visibleWorkCount === 0 ? (
          <EmptyState
            body={
              workCount === 0
                ? "Billing and balances are up to date."
                : "Choose another work type to continue."
            }
            className="flex-1"
            kind={workCount === 0 ? "empty" : "filtered"}
            title={workCount === 0 ? "No finance work" : "No matching work"}
          />
        ) : (
          <>
            <TableFrame borderless className="p-0">
              <Table className="min-w-[860px]">
              <thead className="bg-[var(--table-header-bg)]">
                <tr>
                  <Th>Work</Th>
                  <Th>Property</Th>
                  <Th>Amount</Th>
                  <Th>Due</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, index) => {
                  const groupLabel = getFinanceWorkGroupLabel(
                    item,
                    workGroup,
                    businessDate,
                  );
                  const previousGroupLabel = pageItems[index - 1]
                    ? getFinanceWorkGroupLabel(
                        pageItems[index - 1]!,
                        workGroup,
                        businessDate,
                      )
                    : null;
                  const groupCount = groupLabel
                    ? (groupCounts.get(groupLabel) ?? 0)
                    : 0;

                  return (
                    <Fragment key={item.key}>
                      {groupLabel !== null && groupLabel !== previousGroupLabel ? (
                        <tr className="border-b border-border bg-muted/35">
                          <th
                            className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                            colSpan={5}
                            scope="colgroup"
                          >
                            <span>{groupLabel}</span>
                            <span className="ml-2 font-normal tabular-nums">
                              {groupCount}
                            </span>
                          </th>
                        </tr>
                      ) : null}
                      {item.kind === "setup" ? (
                        <tr className="border-b border-border">
                          <Td>
                            <p className="font-medium">
                              {item.lease.billing
                                ? "Repair lease billing"
                                : "Set up lease billing"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.lease.tenantLabel} · {item.lease.unitLabel}
                            </p>
                          </Td>
                          <Td>{item.lease.propertyLabel}</Td>
                          <Td>—</Td>
                          <Td>Before invoicing</Td>
                          <Td align="right">
                            {canConfigureRent ? (
                              <Button
                                onClick={() =>
                                  openDrawer({ lease: item.lease, mode: "billing" })
                                }
                                size="sm"
                                variant="outline"
                              >
                                {item.lease.billing ? "Repair" : "Set up"}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Super Admin setup
                              </span>
                            )}
                          </Td>
                        </tr>
                      ) : item.kind === "exception" ? (
                        <RentGenerationExceptionRow
                          canRecover={canRetryCurrentRent}
                          exception={item.exception}
                          lease={item.lease}
                          primaryAction
                        />
                      ) : item.kind === "tenant" ? (
                        <tr className="border-b border-border">
                      <Td>
                        <p className="font-medium">
                          {item.invoice.collectionRoute === "through_ips"
                            ? "Tenant payment"
                            : "Confirm owner collection"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.invoice.recipientLabel} · {item.invoice.invoiceNumber}
                        </p>
                      </Td>
                      <Td>{item.invoice.propertyLabel}</Td>
                      <Td>
                        <Money amount={item.invoice.balanceDue} />
                      </Td>
                      <FinanceWorkDue
                        businessDate={businessDate}
                        dueDate={item.invoice.dueDate}
                      />
                      <Td align="right">
                        <Button
                          asChild
                          size="sm"
                          variant={
                            isFinanceWorkOverdue(item, businessDate)
                              ? "default"
                              : "outline"
                          }
                        >
                          <Link
                            href={
                              item.invoice.collectionRoute === "through_ips" &&
                              canViewLeases
                                ? buildLeasePaymentResolutionHref({
                                    invoiceId: item.invoice.id,
                                    leaseId: item.invoice.leaseId,
                                  })
                                : `/rent-income?leaseId=${item.invoice.leaseId}`
                            }
                          >
                            Review tenant payment
                          </Link>
                        </Button>
                      </Td>
                        </tr>
                      ) : (
                        <tr className="border-b border-border">
                      <Td>
                        <p className="font-medium">Owner invoice payment</p>
                        <p className="text-xs text-muted-foreground">
                          {item.invoice.ownerLabel} · {item.invoice.invoiceNumber}
                        </p>
                      </Td>
                      <Td>{item.invoice.propertyLabel}</Td>
                      <Td>
                        <Money amount={item.invoice.balanceDue} />
                      </Td>
                      <FinanceWorkDue
                        businessDate={businessDate}
                        dueDate={item.invoice.dueDate}
                      />
                      <Td align="right">
                        <Button
                          asChild
                          size="sm"
                          variant={
                            isFinanceWorkOverdue(item, businessDate)
                              ? "default"
                              : "outline"
                          }
                        >
                          <Link
                            href={`/properties/${item.invoice.propertyId}/account`}
                          >
                            Review owner account
                          </Link>
                        </Button>
                      </Td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              </Table>
            </TableFrame>
            <PaginationControls pagination={pagination} />
          </>
        )}
      </section>
    </div>
  );
}

function financeWorkMatchesFilter(
  item: FinanceWorkItem,
  filter: FinanceWorkFilter,
) {
  if (filter === "all") return true;
  if (filter === "setup") {
    return item.kind === "setup" || item.kind === "exception";
  }
  return item.kind === filter;
}

function compareFinanceWork(
  left: FinanceWorkItem,
  right: FinanceWorkItem,
  group: FinanceWorkGroup,
  sort: FinanceWorkSort,
  businessDate: string,
) {
  const groupDifference =
    financeWorkGroupRank(left, group, businessDate) -
    financeWorkGroupRank(right, group, businessDate);
  if (groupDifference !== 0) return groupDifference;

  if (sort === "amount") {
    const amountDifference = financeWorkAmount(right) - financeWorkAmount(left);
    if (amountDifference !== 0) return amountDifference;
  }

  if (sort === "priority") {
    const priorityDifference =
      financeWorkPriority(left, businessDate) -
      financeWorkPriority(right, businessDate);
    if (priorityDifference !== 0) return priorityDifference;
  }

  const dueDifference = financeWorkDueDate(left).localeCompare(
    financeWorkDueDate(right),
  );
  return dueDifference;
}

function financeWorkGroupRank(
  item: FinanceWorkItem,
  group: FinanceWorkGroup,
  businessDate: string,
) {
  if (group === "none") return 0;
  if (group === "type") {
    return item.kind === "exception"
      ? 0
      : item.kind === "setup"
        ? 1
        : item.kind === "tenant"
          ? 2
          : 3;
  }
  return financeWorkPriority(item, businessDate);
}

function financeWorkPriority(item: FinanceWorkItem, businessDate: string) {
  if (item.kind === "exception") return 0;
  if (isFinanceWorkOverdue(item, businessDate)) return 1;
  if (item.kind === "setup") return 2;
  return 3;
}

function financeWorkDueDate(item: FinanceWorkItem) {
  if (item.kind === "tenant" || item.kind === "owner") {
    return item.invoice.dueDate;
  }
  if (item.kind === "exception") return item.exception.billingPeriodStart;
  return "9999-12-31";
}

function financeWorkAmount(item: FinanceWorkItem) {
  if (item.kind === "tenant" || item.kind === "owner") {
    return item.invoice.balanceDue;
  }
  if (item.kind === "exception") return item.lease?.monthlyRent ?? -1;
  return -1;
}

function isFinanceWorkOverdue(item: FinanceWorkItem, businessDate: string) {
  return (
    (item.kind === "tenant" || item.kind === "owner") &&
    item.invoice.dueDate < businessDate
  );
}

function getFinanceWorkGroupLabel(
  item: FinanceWorkItem,
  group: FinanceWorkGroup,
  businessDate: string,
) {
  if (group === "none") return null;
  if (group === "type") {
    if (item.kind === "exception") return "Exceptions";
    if (item.kind === "setup") return "Lease setup";
    if (item.kind === "tenant") return "Tenant payments";
    return "Owner invoice payments";
  }
  if (item.kind === "exception") return "Needs attention";
  if (isFinanceWorkOverdue(item, businessDate)) return "Overdue";
  if (item.kind === "setup") return "Setup required";
  return "Upcoming";
}

function FinanceWorkDue({
  businessDate,
  dueDate,
}: {
  businessDate: string;
  dueDate: string;
}) {
  const dayDifference = isoDayDifference(businessDate, dueDate);
  const timing =
    dayDifference < 0
      ? `${formatCount(Math.abs(dayDifference), "day")} overdue`
      : dayDifference === 0
        ? "Due today"
        : dayDifference === 1
          ? "Due tomorrow"
          : `Due in ${formatCount(dayDifference, "day")}`;

  return (
    <Td>
      <p>{formatDate(dueDate)}</p>
      <p
        className={cn(
          "mt-0.5 text-xs font-medium",
          dayDifference < 0
            ? "text-danger"
            : dayDifference === 0
              ? "text-warning"
              : "text-muted-foreground",
        )}
      >
        {timing}
      </p>
    </Td>
  );
}

function isoDayDifference(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear!, toMonth! - 1, toDay!) -
      Date.UTC(fromYear!, fromMonth! - 1, fromDay!)) /
      86_400_000,
  );
}

function formatCount(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function RentGenerationExceptionRow({
  canRecover,
  exception,
  lease,
  primaryAction = false,
}: {
  canRecover: boolean;
  exception: RentGenerationException;
  lease: FinanceLease | null;
  primaryAction?: boolean;
}) {
  const monthLabel = formatLeaseMonth(exception.billingPeriodStart);

  return (
    <tr className="border-b border-border">
      <Td>
        <p className="font-medium">Rent generation needs attention</p>
        <p className="text-xs text-muted-foreground">{exception.message}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {exception.attemptCount}{" "}
          {exception.attemptCount === 1 ? "attempt" : "attempts"}
        </p>
      </Td>
      <Td>{lease?.propertyLabel ?? "Property unavailable"}</Td>
      <Td>{lease ? <Money amount={lease.monthlyRent} /> : "—"}</Td>
      <Td>{monthLabel}</Td>
      <Td align="right">
        {canRecover ? (
          <RentGenerationRetry
            exceptionId={exception.id}
            monthLabel={monthLabel}
            primaryAction={primaryAction}
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            Super Admin retry
          </span>
        )}
      </Td>
    </tr>
  );
}

function RentGenerationRetry({
  exceptionId,
  monthLabel,
  primaryAction,
}: {
  exceptionId: string;
  monthLabel: string;
  primaryAction: boolean;
}) {
  const [state, action, pending] = useActionState(
    recoverRentGenerationExceptionAction,
    actionInitialState,
  );

  return (
    <form action={action} className="space-y-1">
      <input name="exceptionId" type="hidden" value={exceptionId} />
      <Button
        aria-label={`Generate missing rent for ${monthLabel}`}
        disabled={pending}
        size="sm"
        type="submit"
        variant={primaryAction ? "default" : "outline"}
      >
        {pending ? "Generating..." : "Generate missing rent"}
      </Button>
      {state.message ? (
        <p
          className={cn(
            "max-w-48 text-xs",
            state.status === "error" ? "text-destructive" : "text-success",
          )}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function HistoricalRentRecoveryForm({
  leases,
  onSuccess,
}: {
  leases: FinanceLease[];
  onSuccess: (message: string) => void;
}) {
  const eligibleLeases = leases.filter(
    (lease) =>
      lease.status === "active" ||
      lease.status === "notice_given" ||
      lease.status === "ended" ||
      lease.status === "terminated",
  );
  const [state, action] = useActionState(
    recoverLeaseRentPeriodAction,
    actionInitialState,
  );
  useSuccess(state, onSuccess);

  if (eligibleLeases.length === 0) {
    return (
      <EmptyState
        body="A current or ended lease with confirmed historical rent setup is required."
        className="h-full"
        kind="empty"
        title="No eligible leases"
      />
    );
  }

  return (
    <form action={action} className="space-y-4 p-4">
      <Field label="Lease">
        <SelectControl
          defaultValue={eligibleLeases[0]?.id}
          name="leaseId"
          options={eligibleLeases.map((lease) => ({
            label: `${lease.tenantLabel} · ${lease.unitLabel}`,
            value: lease.id,
          }))}
          required
        />
      </Field>
      <Field label="Missed rent month">
        <MonthPickerField
          ariaLabel="Missed rent month"
          defaultValue={getPreviousBusinessMonthValue()}
          name="billingPeriod"
          required
        />
      </Field>
      <ActionMessage state={state} />
      <FormFooter>
        <span className="text-xs text-muted-foreground">
          Existing lease-month invoices are replayed safely.
        </span>
        <SubmitButton label="Generate selected month" />
      </FormFooter>
    </form>
  );
}

function RentView({
  invoices,
  openModal,
  organizationName,
  scoped,
}: {
  invoices: TenantInvoiceSummary[];
  openModal: (modal: ModalState) => void;
  organizationName: string;
  scoped: boolean;
}) {
  const searchParams = useSearchParams();
  const { filteredInvoices } = getRentInvoiceView(
    invoices,
    searchParams,
    getBusinessDateValue(),
  );
  const unpaid = filteredInvoices.reduce(
    (sum, invoice) => sum + invoice.balanceDue,
    0,
  );
  const collected = filteredInvoices.reduce(
    (sum, invoice) => sum + invoice.paidThroughIps + invoice.collectedByOwner,
    0,
  );
  return (
    <div className="workspace-gutter-x mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-4 py-4 sm:px-6 2xl:px-8">
      <CompactTotals
        items={[
          { label: "Collected", value: <Money amount={collected} /> },
          { label: "Outstanding", value: <Money amount={unpaid} /> },
          { label: "Invoices", value: filteredInvoices.length },
        ]}
      />
      <RentInvoiceFilterBar
        invoices={invoices}
        resultCount={filteredInvoices.length}
      />
      <section className="min-h-0 flex-1" data-slot="rent-invoices-surface">
        {filteredInvoices.length === 0 ? (
          <EmptyState
            body={
              invoices.length === 0
                ? "Rent charges are generated automatically from each active Lease."
                : "Clear or change the filters to see more invoices."
            }
            className="flex-1 rounded-xl border border-border/80 bg-card shadow-sm"
            kind="empty"
            title={invoices.length === 0 ? "No rent invoices" : "No matching invoices"}
          />
        ) : (
          <TableFrame className="p-0">
            <Table
              className={cn("table-fixed min-w-[720px]", scoped && "lg:min-w-0")}
            >
              <colgroup>
                <col className="w-[21%]" />
                <col className="w-[30%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead className="bg-[var(--table-header-bg)]">
                <tr>
                  <Th>Invoice</Th>
                  <Th>Tenant / property</Th>
                  <Th>Collected by</Th>
                  <Th>Balance</Th>
                  <Th>Status</Th>
                  <Th align="right">Preview</Th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => (
                  <tr className="border-b border-border" key={invoice.id}>
                    <Td className="overflow-hidden">
                      <p className="truncate font-medium" title={invoice.invoiceNumber}>
                        {invoice.invoiceNumber}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Due {formatDate(invoice.dueDate)}
                      </p>
                    </Td>
                    <Td className="overflow-hidden">
                      <p className="truncate font-medium" title={invoice.recipientLabel}>
                        {invoice.recipientLabel}
                      </p>
                      <p
                        className="truncate text-xs text-muted-foreground"
                        title={invoice.propertyLabel}
                      >
                        {invoice.propertyLabel}
                      </p>
                    </Td>
                    <Td className="overflow-hidden">
                      {invoice.collectionRoute === "through_ips" ? (
                        <span
                          aria-label={organizationName}
                          className="block truncate"
                          title={organizationName}
                        >
                          {getOrganizationShortLabel(organizationName)}
                        </span>
                      ) : (
                        "Owner"
                      )}
                    </Td>
                    <Td className="overflow-hidden">
                      {invoice.balanceDue === 0 ? (
                        <p className="font-medium tabular-nums">
                          Paid {formatMoneyDisplay(invoice.totalAmount).primary}
                        </p>
                      ) : (
                        <Money amount={invoice.balanceDue} />
                      )}
                      {invoice.balanceDue > 0 &&
                      invoice.totalAmount !== invoice.balanceDue ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          of {formatMoneyDisplay(invoice.totalAmount).primary}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="overflow-hidden">
                      <StatusBadge
                        dueDate={invoice.dueDate}
                        settlements={invoice.settlements}
                        status={invoice.paymentStatus}
                      />
                    </Td>
                    <Td align="right">
                      <Button
                        aria-label={`View invoice ${invoice.invoiceNumber}`}
                        className="h-8 w-8 px-0"
                        onClick={() =>
                          openModal({ invoice, mode: "invoice-details" })
                        }
                        title={`View invoice ${invoice.invoiceNumber}`}
                        variant="ghost"
                      >
                        <Eye size={15} />
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        )}
      </section>
    </div>
  );
}

function ExpensesView({
  canReview,
  openModal,
  submissions,
}: {
  canReview: boolean;
  openModal: (modal: ModalState) => void;
  submissions: FinanceOperationsData["expenseSubmissions"];
}) {
  const [status, setStatus] =
    useState<ExpenseSubmissionSummary["status"]>("submitted");

  if (submissions.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 py-4 sm:px-6 2xl:px-8">
        <EmptyState
          body="Record an expense to start Finance review."
          className="min-h-64 rounded-xl border border-border/80 bg-card shadow-sm"
          kind="empty"
          title="No expenses"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 px-4 py-4 sm:px-6 2xl:px-8">
      <Tabs
        className="space-y-3"
        onValueChange={(value) =>
          setStatus(value as ExpenseSubmissionSummary["status"])
        }
        value={status}
      >
        <TabsList
          aria-label="Paid cost status"
          className="rounded-xl border border-border/80 bg-card p-1 shadow-sm"
        >
          {(["submitted", "approved", "rejected", "reversed"] as const).map(
            (value) => (
              <TabsTrigger key={value} value={value}>
                {value === "rejected" ? "Cancelled / rejected" : expenseStatusLabel(value)} (
                {submissions.filter((item) => item.status === value).length})
              </TabsTrigger>
            ),
          )}
        </TabsList>
        {(["submitted", "approved", "rejected", "reversed"] as const).map(
          (value) => (
            <TabsContent key={value} value={value}>
              <ExpenseSubmissionTable
                canReview={canReview}
                openModal={openModal}
                status={value}
                submissions={submissions.filter(
                  (submission) => submission.status === value,
                )}
              />
            </TabsContent>
          ),
        )}
      </Tabs>
    </div>
  );
}

function ExpenseSubmissionTable({
  canReview,
  openModal,
  status,
  submissions,
}: {
  canReview: boolean;
  openModal: (modal: ModalState) => void;
  status: ExpenseSubmissionSummary["status"];
  submissions: ExpenseSubmissionSummary[];
}) {
  if (submissions.length === 0) {
    return (
      <EmptyState
        body="There are no paid costs in this status."
        className="min-h-56 rounded-xl border border-border/80 bg-card shadow-sm"
        kind="empty"
        title={`No ${expenseStatusLabel(status).toLowerCase()} paid costs`}
      />
    );
  }

  return (
    <TableFrame>
      <Table className="table-fixed min-w-[720px]">
        <colgroup>
          <col className="w-[11%]" />
          <col className="w-[29%]" />
          <col className="w-[25%]" />
          <col className="w-[15%]" />
          <col className="w-[20%]" />
        </colgroup>
        <thead className="bg-[var(--table-header-bg)]">
          <tr>
            <Th>Date</Th>
            <Th>Paid cost</Th>
            <Th>Property / charged to</Th>
            <Th>Amount</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((submission) => (
            <tr className="border-b border-border" key={submission.id}>
              <Td>{formatDate(submission.date)}</Td>
              <Td>
                <p className="font-medium">
                  {submission.categoryLabel ?? categoryLabel(submission.category)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {submission.vendorLabel}
                </p>
              </Td>
              <Td>
                <p className="font-medium">{submission.propertyLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {submission.responsibility === "owner"
                    ? "Property owner"
                    : "Tenant recharge"}
                </p>
              </Td>
              <Td>
                <Money amount={submission.internalCost} />
              </Td>
              <Td>
                <div className="flex flex-col items-start gap-2">
                  <Badge tone={expenseStatusTone(submission.status)}>
                    {submission.cancelledAt ? "Cancelled" : expenseStatusLabel(submission.status)}
                  </Badge>
                  <Button
                    aria-label={`${submission.status === "submitted" && canReview && !submission.transactionReviewBlocked && !submission.reviewRequiresAnotherUser ? "Review" : "View"} ${submission.vendorLabel}`}
                    onClick={() =>
                      openModal({ mode: "expense-details", submission })
                    }
                    size="sm"
                    variant="outline"
                  >
                    {submission.status === "submitted" && canReview && !submission.transactionReviewBlocked && !submission.reviewRequiresAnotherUser
                      ? "Review"
                      : "View"}
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );
}

function BalancesView({
  invoices,
  openingAuthority,
  openModal,
  ownerInvoices,
  positions,
}: {
  canRecordOwnerCash: boolean;
  invoices: TenantInvoiceSummary[];
  openingAuthority?: ReactNode;
  openModal: (modal: ModalState) => void;
  ownerInvoices: OwnerInvoiceSummary[];
  positions: PropertyFinancePosition[];
}) {
  const [tab, setTab] = useState<"owners" | "tenants">("owners");
  const tenantBalances = useMemo(() => {
    const map = new Map<
      string,
      { label: string; total: number; invoices: number; settled: number }
    >();
    for (const invoice of invoices) {
      const current = map.get(invoice.recipientLabel) ?? {
        invoices: 0,
        label: invoice.recipientLabel,
        settled: 0,
        total: 0,
      };
      current.invoices += 1;
      current.settled += invoice.paidThroughIps + invoice.collectedByOwner;
      current.total += invoice.balanceDue;
      map.set(invoice.recipientLabel, current);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [invoices]);

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1280px] bg-background px-4 py-4 sm:px-6 2xl:px-8">
      {openingAuthority ? <div>{openingAuthority}</div> : null}
      <section
        aria-labelledby="current-balance-projection-heading"
        className="min-h-[420px]"
      >
        <div className="border-b px-4 py-3 sm:px-6">
          <h2
            className="text-base font-semibold"
            id="current-balance-projection-heading"
          >
            Current balances
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This view is not an official owner statement.
          </p>
        </div>
        <Tabs
          className="min-h-0 gap-0 bg-background"
          onValueChange={(value) => setTab(value as "owners" | "tenants")}
          value={tab}
        >
          <TabsList
            className="h-11 w-full shrink-0 justify-start rounded-none border-b px-4 sm:px-6"
            variant="line"
          >
            <TabsTrigger className="flex-none px-3" value="owners">
              Owners
            </TabsTrigger>
            <TabsTrigger className="flex-none px-3" value="tenants">
              Tenants &amp; companies
            </TabsTrigger>
          </TabsList>
          <TabsContent tabIndex={-1} value="owners">
            <TableFrame>
              <Table className="table-fixed min-w-[680px]">
                <colgroup>
                  <col className="w-[40%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead className="bg-[var(--table-header-bg)]">
                  <tr>
                    <Th>Property / owner</Th>
                    <Th>Cash collected</Th>
                    <Th>Available</Th>
                    <Th align="right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => {
                    const ownerInvoice = ownerInvoices.find(
                      (invoice) =>
                        invoice.propertyId === position.propertyId &&
                        invoice.balanceDue > 0,
                    );
                    return (
                      <tr
                        className="border-b border-border"
                        key={position.propertyId}
                      >
                        <Td>
                          <Link
                            className="font-medium hover:underline"
                            href={`/properties/${position.propertyId}/account`}
                          >
                            {position.propertyLabel}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {position.ownerLabel}
                          </p>
                        </Td>
                        <Td>
                          <Money amount={position.cashHeldByIps} />
                        </Td>
                        <Td>
                          <Money amount={position.availableWithdrawal} />
                        </Td>
                        <Td align="right">
                          <Button
                            aria-label={`View balance for ${position.ownerLabel}`}
                            onClick={() =>
                              openModal({
                                mode: "owner-balance-details",
                                ownerInvoice,
                                position,
                              })
                            }
                            size="sm"
                            variant="outline"
                          >
                            View
                          </Button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableFrame>
          </TabsContent>
          <TabsContent tabIndex={-1} value="tenants">
            <TableFrame>
              <Table className="min-w-[720px]">
                <thead className="bg-[var(--table-header-bg)]">
                  <tr>
                    <Th>Customer</Th>
                    <Th>Invoices</Th>
                    <Th>Outstanding</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {tenantBalances.map((balance) => (
                    <tr className="border-b border-border" key={balance.label}>
                      <Td className="font-medium">{balance.label}</Td>
                      <Td>{balance.invoices}</Td>
                      <Td>
                        <Money amount={balance.total} />
                      </Td>
                      <Td>
                        <StatusBadge
                          status={
                            balance.total === 0
                              ? "paid"
                              : balance.settled > 0
                                ? "partly_paid"
                                : "unpaid"
                          }
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableFrame>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function InvoiceDetails({
  canCorrectFinance,
  canRecordPayments,
  invoice,
  onCorrect,
  onPublicationClose,
  onPublicationSuccess,
  onPublishPdf,
  onRecordPayment,
  organizationName,
  pdf,
  pdfResultHref,
  publicationOpen,
}: {
  canCorrectFinance: boolean;
  canRecordPayments: boolean;
  invoice: TenantInvoiceSummary;
  onCorrect: () => void;
  onPublicationClose: () => void;
  onPublicationSuccess: (state: FinanceOperationsActionState) => void;
  onPublishPdf: (trigger: HTMLElement) => void;
  onRecordPayment: () => void;
  organizationName: string;
  pdf: CommercialDocumentLink;
  pdfResultHref: string | null;
  publicationOpen: boolean;
}) {
  const canCorrect =
    canCorrectFinance &&
    invoice.settlements.some((settlement) => !settlement.isReversed);
  const publishButtonRef = useRef<HTMLAnchorElement | null>(null);
  const pdfHref = pdf.href ?? pdfResultHref;
  const canPublishPdf =
    canRecordPayments && invoice.paymentStatus !== "voided" && !pdfHref;

  return (
    <>
      <div className="space-y-4 p-4" hidden={publicationOpen}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">{invoice.invoiceNumber}</p>
          <p className="text-sm text-muted-foreground">
            {invoice.recipientLabel} · {invoice.propertyLabel}
          </p>
        </div>
        <StatusBadge
          dueDate={invoice.dueDate}
          settlements={invoice.settlements}
          status={invoice.paymentStatus}
        />
      </div>
      <section aria-labelledby="invoice-charges-heading">
        <h3 className="text-sm font-semibold" id="invoice-charges-heading">
          Charges
        </h3>
        <div className="mt-2 divide-y divide-border border-y border-border">
          {invoice.lines.map((line) => (
            <div
              className="flex items-center justify-between gap-4 py-2.5 text-sm"
              key={line.id}
            >
              <span className="font-medium">{line.label}</span>
              <Money amount={line.amount} />
            </div>
          ))}
        </div>
      </section>
      <DefinitionRows
        rows={[
          [
            "Lease month",
            `${formatLeaseMonth(invoice.billingPeriodStart)} lease month`,
          ],
          ["Unit", invoice.unitLabel],
          ["Occupants", invoice.occupantLabels.join(", ") || "—"],
          [
            "Collected by",
            invoice.collectionRoute === "through_ips"
              ? organizationName
              : "Owner",
          ],
          ["Issued", formatDate(invoice.issueDate)],
          ["Due", formatDate(invoice.dueDate)],
          [
            "Records",
            <span className="flex flex-wrap gap-x-3 gap-y-1" key="records">
              <Link
                className="text-primary underline-offset-2 hover:underline"
                href={`/properties/${invoice.propertyId}/finance?view=rent`}
              >
                Open Property finance
              </Link>
              {invoice.unitId ? (
                <Link
                  className="text-primary underline-offset-2 hover:underline"
                  href={`/units/${invoice.unitId}/finance?view=rent`}
                >
                  Open Unit finance
                </Link>
              ) : null}
            </span>,
          ],
          [
            "Invoice total",
            <Money amount={invoice.totalAmount} key="invoice-total" />,
          ],
          ["Balance", <Money amount={invoice.balanceDue} key="balance" />],
        ]}
      />
      {invoice.isProrated ? <Badge tone="accent">Prorated</Badge> : null}
      <SettlementHistory
        canRetryReceipt={canRecordPayments}
        settlements={invoice.settlements}
      />
      {pdf.publicationStatus === "published" && pdf.publishedAt ? (
        <p className="text-xs text-muted-foreground">
          Published {formatDate(pdf.publishedAt)}
        </p>
      ) : null}
      {invoice.publicationSnapshot ? (
        <DefinitionRows
          rows={[
            ["Payment instructions", invoice.publicationSnapshot.paymentInstructions],
            ["Email", invoice.publicationSnapshot.contactEmail ?? "—"],
            ["Phone", invoice.publicationSnapshot.contactPhone ?? "—"],
            ["Note", invoice.publicationSnapshot.note ?? "—"],
          ]}
        />
      ) : null}
      <FormFooter>
        <span />
        <div className="flex flex-wrap justify-end gap-2">
          {canCorrect ? (
            <Button onClick={onCorrect} variant="outline">
              Correct settlement
            </Button>
          ) : null}
          {pdfHref || canPublishPdf ? (
            <Button asChild variant="outline">
              <a
                href={pdfHref ?? undefined}
                onClick={(event) => {
                  if (pdfHref) return;
                  event.preventDefault();
                  onPublishPdf(event.currentTarget);
                }}
                onKeyDown={(event) => {
                  if (!pdfHref && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    event.currentTarget.click();
                  }
                }}
                ref={publishButtonRef}
                role={pdfHref ? undefined : "button"}
                tabIndex={0}
              >
                {pdfHref ? "Download PDF" : "Publish PDF"}
              </a>
            </Button>
          ) : null}
          {canRecordPayments && invoice.balanceDue > 0 ? (
            <Button onClick={onRecordPayment}>
              {invoice.collectionRoute === "through_ips"
                ? "Record payment"
                : "Confirm collected"}
            </Button>
          ) : null}
        </div>
      </FormFooter>
      </div>
      {canPublishPdf ? (
        <InvoicePdfPublicationForm
          hidden={!publicationOpen}
          invoice={invoice}
          onClose={onPublicationClose}
          onSuccess={(state) => {
            onPublicationSuccess(state);
            window.setTimeout(() => publishButtonRef.current?.focus(), 0);
          }}
        />
      ) : null}
    </>
  );
}

function InvoicePdfPublicationForm({
  hidden,
  invoice,
  onClose,
  onSuccess,
}: {
  hidden: boolean;
  invoice: TenantInvoiceSummary;
  onClose: () => void;
  onSuccess: (state: FinanceOperationsActionState) => void;
}) {
  const [state, formAction] = useActionState(
    publishTenantInvoicePdfAction,
    actionInitialState,
  );
  const handledStateRef = useRef<FinanceOperationsActionState | null>(null);
  const paymentInstructionsRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (state.status !== "success" || handledStateRef.current === state) return;
    handledStateRef.current = state;
    onSuccess(state);
  }, [onSuccess, state]);

  useEffect(() => {
    if (hidden) return;
    window.setTimeout(() => paymentInstructionsRef.current?.focus(), 0);
  }, [hidden]);

  return (
    <form action={formAction} className="space-y-4 p-4" hidden={hidden}>
      <input name="invoiceId" type="hidden" value={invoice.id} />
      <Field label="Payment instructions">
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          name="paymentInstructions"
          ref={paymentInstructionsRef}
          required
        />
      </Field>
      <Field label="Email">
        <Input name="contactEmail" required type="email" />
      </Field>
      <Field label="Phone">
        <Input name="contactPhone" required />
      </Field>
      <Field label="Note">
        <textarea
          className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          name="note"
        />
      </Field>
      <ActionMessage state={state} />
      <FormFooter>
        <Button onClick={onClose} type="button" variant="outline">
          Cancel
        </Button>
        <SubmitButton label="Publish PDF" />
      </FormFooter>
    </form>
  );
}

function SettlementHistory({
  canRetryReceipt,
  settlements,
}: {
  canRetryReceipt: boolean;
  settlements: TenantInvoiceSettlement[];
}) {
  const ipsSettlements = settlements.filter(
    (settlement) => settlement.route === "through_ips",
  );
  if (ipsSettlements.length === 0) return null;

  return (
    <section aria-labelledby="settlement-history-heading">
      <h3 className="text-sm font-semibold" id="settlement-history-heading">
        Settlement history
      </h3>
      <div className="mt-2 divide-y divide-border border-y border-border">
        {ipsSettlements.map((settlement) => (
          <div
            className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
            key={settlement.id}
          >
            <div className="min-w-0">
              <p className="font-medium">
                {settlement.receiptNumber ?? formatDate(settlement.date)}
              </p>
              {settlement.isReversed ? (
                <Badge tone="warning">Reversed</Badge>
              ) : null}
            </div>
            <ReceiptAction
              canRetry={canRetryReceipt}
              settlement={settlement}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function ReceiptAction({
  canRetry,
  onSuccess,
  settlement,
}: {
  canRetry: boolean;
  onSuccess?: (state: FinanceOperationsActionState) => void;
  settlement: TenantInvoiceSettlement;
}) {
  const [state, formAction] = useActionState(
    retryTenantReceiptPdfAction,
    actionInitialState,
  );
  const href =
    state.status === "success" && state.artifactHref
      ? state.artifactHref
      : settlement.receipt?.href;
  const unavailable =
    !href &&
    (settlement.receipt?.publicationStatus === "failed" ||
      settlement.receipt?.publicationStatus === "not_published");
  const handledStateRef = useRef<FinanceOperationsActionState | null>(null);

  useEffect(() => {
    if (state.status !== "success" || handledStateRef.current === state) return;
    handledStateRef.current = state;
    onSuccess?.(state);
  }, [onSuccess, state]);

  if (href) {
    return (
      <a
        className="font-medium text-primary underline-offset-2 hover:underline"
        href={href}
      >
        Download receipt
      </a>
    );
  }

  if (!unavailable) return null;

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
      <input name="paymentId" type="hidden" value={settlement.id} />
      <span className="text-muted-foreground">Receipt unavailable</span>
      {canRetry ? <SubmitButton label="Retry receipt" /> : null}
      <ActionMessage state={state} />
    </form>
  );
}

function ExpenseLines({ submission }: { submission: ExpenseSubmissionSummary }) {
  return <>
      {submission.lines && submission.lines.length > 0 ? (
        <div className="space-y-2 border-y border-border py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Expense lines
          </p>
          {submission.lines.map((line, index) => (
            <div
              className="grid gap-1 rounded-lg border border-border/80 p-3 sm:grid-cols-[1fr_auto]"
              key={line.submissionId}
            >
              <div>
                <p className="font-medium">{line.description}</p>
                <p className="text-xs text-muted-foreground">
                  {line.propertyLabel} · {line.unitLabel} · {line.categoryLabel ?? categoryLabel(line.category)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  IPS-held owner cash: {line.ownerCashAmount === null
                    ? "automatic at approval"
                    : formatMoneyDisplay(line.ownerCashAmount).primary}
                </p>
              </div>
              <div className="font-medium tabular-nums">
                <span className="sr-only">Line {index + 1}: </span>
                {formatMoneyDisplay(line.amount).primary}
              </div>
            </div>
          ))}
        </div>
      ) : null}
  </>;
}

function ExpenseDetails({
  originalExpense,
  replacementExpense,
  onViewRelated,
  canEdit,
  onEdit,
  onCancelExpense,
  canReview,
  canReverse,
  onApprove,
  onClose,
  onReject,
  onReverse,
  submission,
}: {
  originalExpense?: ExpenseSubmissionSummary;
  replacementExpense?: ExpenseSubmissionSummary;
  onViewRelated: (submission: ExpenseSubmissionSummary) => void;
  canEdit: boolean;
  onEdit: () => void;
  onCancelExpense: () => void;
  canReview: boolean;
  canReverse: boolean;
  onApprove: () => void;
  onClose: () => void;
  onReject: () => void;
  onReverse: () => void;
  submission: ExpenseSubmissionSummary;
}) {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">
            {submission.categoryLabel ?? categoryLabel(submission.category)}
          </p>
          <p className="text-sm text-muted-foreground">
            {submission.vendorLabel} · {submission.propertyLabel}
          </p>
        </div>
        <Badge tone={expenseStatusTone(submission.status)}>
          {submission.cancelledAt ? "Cancelled" : expenseStatusLabel(submission.status)}
        </Badge>
      </div>
      <DefinitionRows
        rows={[
          ["Paid date", formatDate(submission.date)],
          ["Unit", submission.unitLabel],
          [
            "Charged to",
            submission.responsibility === "owner"
              ? "Property owner"
              : "Tenant recharge",
          ],
          ["Paid from", expensePaymentSourceLabel(submission.fundingSourceLabel)],
          [
            "Amount paid",
            <Money amount={submission.internalCost} key="amount-paid" />,
          ],
          ...(submission.customerTotal !== submission.internalCost
            ? ([
                [
                  "Customer total",
                  <Money
                    amount={submission.customerTotal}
                    key="customer-total"
                  />,
                ],
              ] as [string, ReactNode][])
            : []),
          ...(submission.reference
            ? ([["Reference", submission.reference]] as [string, ReactNode][])
            : []),
        ]}
      />
      {submission.status === "submitted" && submission.reviewRequiresAnotherUser ? (
        <p className="text-sm text-muted-foreground" role="status">
          You submitted this expense. Ask another authorized reviewer to approve or reject it.
        </p>
      ) : null}
      <ExpenseLines submission={submission} />
      {submission.replacesTransactionId ? <p className="text-sm text-muted-foreground">Replacement for a previous expense. The original remains in history.</p> : null}
      {originalExpense ? <Button variant="outline" onClick={() => onViewRelated(originalExpense)}>View original expense</Button> : null}
      {replacementExpense ? <Button variant="outline" onClick={() => onViewRelated(replacementExpense)}>View replacement expense</Button> : null}
      {canEdit ? <div className="flex gap-2 border-t border-border pt-3">
        <Button onClick={onEdit} variant="outline">{submission.status === "approved" ? "Correct expense" : "Edit expense"}</Button>
        {submission.status === "submitted" ? <Button onClick={onCancelExpense} variant="ghost">Cancel expense</Button> : null}
      </div> : null}
      {submission.scopedSubtotal !== undefined ? <p className="text-sm">
        Scoped subtotal: {formatMoneyDisplay(submission.scopedSubtotal).primary}
        {submission.fullTransactionTotal !== undefined ? <> · Full transaction total: {formatMoneyDisplay(submission.fullTransactionTotal).primary}</> : null}
      </p> : null}
      {submission.transactionReviewBlocked ? <p className="text-sm text-muted-foreground">
        Part of an expense transaction. Review and reversal require the complete transaction in Bills &amp; Expenses.
      </p> : null}
      {submission.sourceType === "maintenance_task" &&
      submission.maintenanceTask ? (
        <div className="border-y border-border py-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Maintenance source
          </p>
          <Link
            className="mt-1 block font-medium text-primary underline-offset-2 hover:underline"
            href={submission.maintenanceTask.href}
          >
            {submission.maintenanceTask.title}
          </Link>
        </div>
      ) : null}
      {submission.evidence ? (
        <div className="text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Evidence
          </p>
          {submission.evidence.href ? (
            <a
              className="mt-1 inline-block font-medium text-primary underline-offset-2 hover:underline"
              href={submission.evidence.href}
              rel="noreferrer"
              target="_blank"
            >
              {submission.evidence.fileName}
            </a>
          ) : (
            <p className="mt-1 text-muted-foreground">
              {submission.evidence.fileName} · unavailable
            </p>
          )}
        </div>
      ) : null}
      {submission.reviewReason || submission.reversalReason ? (
        <p className="border-l-2 border-warning pl-3 text-sm text-muted-foreground">
          {submission.reversalReason ?? submission.reviewReason}
        </p>
      ) : null}
      {submission.status === "submitted" && canReview && !submission.transactionReviewBlocked && !submission.reviewRequiresAnotherUser ? (
        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          {!submission.selfApprovalOnly ? <section
            aria-label="Reject paid cost"
            className="flex flex-col items-start gap-3 rounded-xl border border-border p-3"
          >
            <p className="text-xs text-muted-foreground">
              Return this submission without posting financial entries.
            </p>
            <Button
              aria-label={`Reject ${submission.vendorLabel}`}
              onClick={onReject}
              variant="outline"
            >
              Reject
            </Button>
          </section> : null}
          <section
            aria-label="Approve paid cost"
            className="flex flex-col items-start gap-3 rounded-xl border border-border p-3"
          >
            <p className="text-xs text-muted-foreground">
              Confirm the paid-from account before posting the cost and balance
              effects.
            </p>
            <Button
              aria-label={`Approve ${submission.vendorLabel}`}
              onClick={onApprove}
            >
              Approve
            </Button>
          </section>
        </div>
      ) : (
        <FormFooter>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
          {submission.status === "approved" && canReverse && !submission.transactionReviewBlocked ? (
            <Button
              aria-label={`Reverse ${submission.vendorLabel}`}
              onClick={onReverse}
              variant="outline"
            >
              Reverse
            </Button>
          ) : null}
        </FormFooter>
      )}
      {submission.status === "submitted" && canReview && !submission.transactionReviewBlocked && !submission.reviewRequiresAnotherUser ? (
        <Button onClick={onClose} variant="ghost">
          Close
        </Button>
      ) : null}
    </div>
  );
}

function OwnerBalanceDetails({
  canRecordOwnerCash,
  onClose,
  onOwnerPayment,
  onWithdrawal,
  organizationName,
  position,
}: {
  canRecordOwnerCash: boolean;
  onClose: () => void;
  onOwnerPayment?: () => void;
  onWithdrawal: () => void;
  organizationName: string;
  position: PropertyFinancePosition;
}) {
  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="font-semibold">{position.ownerLabel}</p>
        <p className="text-sm text-muted-foreground">
          {position.propertyLabel}
        </p>
      </div>
      <DefinitionRows
        rows={[
          [
            `Cash collected by ${getOrganizationShortLabel(organizationName)}`,
            <Money amount={position.cashHeldByIps} key="cash-collected" />,
          ],
          [
            "Available to distribute",
            <Money
              amount={position.availableWithdrawal}
              key="available-to-distribute"
            />,
          ],
          [
            "Owner balance",
            <Money amount={position.runningBalance} key="owner-balance" />,
          ],
          [
            "Owner reimbursement due",
            <Money amount={position.ownerOwesIps} key="owner-reimbursement" />,
          ],
        ]}
      />
      <FormFooter>
        <Button onClick={onClose} variant="outline">
          Close
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <Link href={`/properties/${position.propertyId}/account`}>
              Open property account
            </Link>
          </Button>
          {canRecordOwnerCash && onOwnerPayment ? (
            <Button onClick={onOwnerPayment} variant="outline">
              Owner invoice payment
            </Button>
          ) : null}
          {canRecordOwnerCash &&
          position.ownerPersonId &&
          position.availableWithdrawal > 0 ? (
            <Button onClick={onWithdrawal}>Record owner distribution</Button>
          ) : null}
        </div>
      </FormFooter>
    </div>
  );
}

function PropertyAccountView({
  entries,
  onRecordWithdrawal,
  position,
}: {
  entries: FinanceOperationsData["accountEntries"];
  onRecordWithdrawal?: () => void;
  position: PropertyFinancePosition | null;
}) {
  if (!position)
    return (
      <EmptyState
        body="This property account is not available."
        className="h-full"
        kind="empty"
        title="Account unavailable"
      />
    );
  const orderedEntries = sortPropertyAccountEntriesNewestFirst(entries);
  return (
    <div className="flex min-w-0 flex-col gap-4 bg-background px-4 pb-6 pt-4 sm:px-6 2xl:px-8">
      <section
        aria-label="Account position"
        className="grid shrink-0 grid-cols-1 overflow-hidden rounded-xl border border-border/80 bg-card pb-5 pt-5 shadow-sm sm:grid-cols-2"
      >
        <AccountPositionItem
          description="Income minus owner costs and distributions"
          label="Owner balance"
          value={<Money amount={position.runningBalance} />}
        />
        <AccountPositionItem
          action={
            onRecordWithdrawal ? (
              <Button onClick={onRecordWithdrawal} size="sm" variant="outline">
                Record owner distribution
              </Button>
            ) : undefined
          }
          description="Cash held here and ready to distribute"
          label="Cash available"
          value={<Money amount={position.availableWithdrawal} />}
        />
      </section>
      {position.ownerOwesIps > 0 ? (
        <div
          aria-label="Owner amount due"
          className="mb-4 flex flex-wrap items-center justify-between gap-2 border-y border-warning/30 bg-warning-soft/20 px-3 py-2 text-sm"
          role="status"
        >
          <span className="font-medium text-warning">Owner amount due</span>
          <span className="font-semibold tabular-nums text-foreground">
            <Money amount={position.ownerOwesIps} />
          </span>
        </div>
      ) : null}
      {orderedEntries.length === 0 ? (
        <EmptyState
          body="Rent, fees, owner costs, and withdrawals will appear here."
          className="flex-1 rounded-xl border border-border/80 bg-card shadow-sm"
          kind="empty"
          title="No account activity"
        />
      ) : (
        <TableFrame className="p-0">
          <Table
            className="min-w-[760px]"
            scrollRegionLabel="Property account activity"
          >
            <thead className="bg-[var(--table-header-bg)]">
              <tr>
                <Th>Date</Th>
                <Th>Activity</Th>
                <Th align="right">Money in</Th>
                <Th align="right">Money out</Th>
                <Th align="right">Balance after</Th>
              </tr>
            </thead>
            <tbody>
              {orderedEntries.map((entry) => {
                const balanceEffect = getAccountEntryBalanceEffect(entry);
                return (
                  <tr
                    className="border-b border-border transition-colors hover:bg-muted/35"
                    key={`${entry.category}-${entry.id}`}
                  >
                    <Td className="text-muted-foreground">
                      {formatDate(entry.date)}
                    </Td>
                    <Td>
                      <p className="font-medium text-foreground">
                        {entry.label}
                      </p>
                      {entry.note ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {entry.note}
                        </p>
                      ) : null}
                    </Td>
                    <Td align="right">
                      {balanceEffect > 0 ? (
                        <Money
                          amount={balanceEffect}
                          className="text-success"
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      {balanceEffect < 0 ? (
                        <Money
                          amount={Math.abs(balanceEffect)}
                          className="text-destructive"
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      <Money amount={entry.runningBalance} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}

function getAccountEntryBalanceEffect(entry: PropertyAccountEntry) {
  return entry.category === "rent_income" ? entry.amount : -entry.amount;
}

function AccountPositionItem({
  action,
  description,
  label,
  value,
}: {
  action?: ReactNode;
  description: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-t border-border px-4 py-3 first:border-t-0 sm:flex sm:border-l sm:border-t-0 sm:px-5 sm:py-1 sm:first:border-l-0">
      <div className="min-w-0">
        <div className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs leading-4 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function BillingSetupForm({
  lease,
  onSuccess,
  operationalTimezone,
  organizationName,
  peopleOptions,
}: {
  lease: FinanceLease;
  onSuccess: (message: string) => void;
  operationalTimezone: string;
  organizationName: string;
  peopleOptions: FinanceOperationsData["peopleOptions"];
}) {
  const idempotencyKey = useStableActionId("billing");
  const [state, action] = useActionState(
    saveLeaseBillingAction,
    actionInitialState,
  );
  const defaults = toLeaseBillingRuleDefaults(lease, peopleOptions);
  useSuccess(state, onSuccess);
  return (
    <form action={action} className="space-y-4 p-4">
      <input name="leaseId" type="hidden" value={lease.id} />
      <input
        name="expectedCurrentBillingRuleId"
        type="hidden"
        value={lease.expectedCurrentBillingRuleId ?? ""}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />

      <DefinitionRows
        rows={[
          ["Property", lease.propertyLabel],
          ["Owner", lease.ownerLabel],
          ["Lease", `${lease.tenantLabel} · ${lease.unitLabel}`],
          ["Monthly rent", formatMoneyDisplay(lease.monthlyRent).primary],
        ]}
      />
      <p className="text-sm text-muted-foreground">
        {lease.billing
          ? "Repairs this lease-owned rule without changing generated invoices."
          : "Begins on the lease start date."}
      </p>
      <LeaseBillingRuleFields
        companyOptions={peopleOptions
          .filter((option) => option.partyType === "company")
          .map((option) => ({ id: option.id, label: option.label }))}
        defaults={defaults}
        operationalTimezone={operationalTimezone}
        organizationName={organizationName}
        rentSchedule={{
          currency: "USD",
          finalMonthRentAmount:
            lease.billingPreview?.finalMonthRent ?? lease.monthlyRent,
          firstMonthRentAmount:
            lease.billingPreview?.firstMonthRent ?? lease.monthlyRent,
          leaseEndDate: lease.billingPreview?.endDate ?? lease.endDate,
          leaseStartDate: lease.billingPreview?.startDate ?? lease.startDate,
          monthlyRentAmount: lease.monthlyRent,
        }}
        tenantRecipient={
          lease.tenantPersonId
            ? {
                id: lease.tenantPersonId,
                label: lease.tenantLabel,
                partyType:
                  peopleOptions.find(
                    (option) => option.id === lease.tenantPersonId,
                  )?.partyType === "company"
                    ? "company"
                    : "individual",
              }
            : null
        }
      />
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton label="Save billing rules" />
      </FormFooter>
    </form>
  );
}

function toLeaseBillingRuleDefaults(
  lease: FinanceLease,
  peopleOptions: FinanceOperationsData["peopleOptions"],
): LeaseBillingRule | null {
  const billing = lease.billing;
  if (!billing) return null;
  const tenantPartyType =
    peopleOptions.find((option) => option.id === lease.tenantPersonId)
      ?.partyType === "company"
      ? "company"
      : "individual";
  const billingRecipientKind =
    billing.billingRecipientKind ?? tenantPartyType;
  const billingRecipientPersonId =
    billing.billingRecipientPersonId ??
    (billingRecipientKind === tenantPartyType
      ? (lease.tenantPersonId ?? "")
      : "");
  return {
    ...billing,
    billingRecipientKind,
    billingRecipientLabel:
      peopleOptions.find(
        (option) => option.id === billingRecipientPersonId,
      )?.label ?? lease.tenantLabel,
    billingRecipientPersonId,
    collectionRoute: billing.collectionRoute ?? "through_ips",
    leaseEndProrationRule: billing.leaseEndProrationRule ?? "actual_days",
    leaseStartProrationRule: billing.leaseStartProrationRule ?? "actual_days",
    managementFeeMode: billing.managementFeeMode ?? "percentage",
    managementFeeValue: billing.managementFeeValue ?? 0,
    midPeriodRentChangeRule:
      billing.midPeriodRentChangeRule ?? "next_full_month",
    rentCalculationTimezone: billing.rentCalculationTimezone ?? "UTC",
    shortMonthDueDayRule:
      billing.shortMonthDueDayRule ?? "last_calendar_day",
    state: "current",
  };
}

function PaymentChooser({
  invoices,
  onChoose,
}: {
  invoices: TenantInvoiceSummary[];
  onChoose: (invoice: TenantInvoiceSummary) => void;
}) {
  return (
    <div className="max-h-[520px] overflow-y-auto p-2">
      {invoices.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          There are no open tenant invoices.
        </p>
      ) : (
        invoices.map((invoice) => (
          <Button
            className="h-auto w-full justify-between gap-4 px-3 py-3 text-left"
            key={invoice.id}
            onClick={() => onChoose(invoice)}
            type="button"
            variant="ghost"
          >
            <span>
              <span className="block text-sm font-medium">
                {invoice.recipientLabel}
              </span>
              <span className="block text-xs text-muted-foreground">
                {invoice.propertyLabel} · {invoice.invoiceNumber}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Money amount={invoice.balanceDue} />
              <ChevronRight className="text-muted-foreground" size={15} />
            </span>
          </Button>
        ))
      )}
    </div>
  );
}

type ExpenseFormProps = {
  replacement?: ExpenseSubmissionSummary;
  expenseAccounts: FinanceOperationsData["expenseAccounts"];
  fixedScope?: FinanceOperationsScreenProps["scope"];
  initialInvoiceId?: string;
  initialResponsibility?: "owner" | "tenant";
  invoices: TenantInvoiceSummary[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  canCreateVendor?: boolean;
  peopleOptions: FinanceOperationsData["peopleOptions"];
  positions: FinanceOperationsData["positions"];
  propertyOptions: FinanceOperationsData["propertyOptions"];
  payFromAccounts: FinanceOperationsData["payFromAccounts"];
  unitOptions: FinanceOperationsData["unitOptions"];
};

function ExpenseForm(props: ExpenseFormProps) {
  if ((props.initialResponsibility ?? "owner") === "owner") {
    return <OwnerExpenseTransactionForm {...props} />;
  }
  return (
    <SingleLineExpenseForm
      expenseAccounts={props.expenseAccounts}
      fixedScope={props.fixedScope}
      initialInvoiceId={props.initialInvoiceId}
      initialResponsibility={props.initialResponsibility}
      invoices={props.invoices}
      onClose={props.onClose}
      onSuccess={props.onSuccess}
      propertyOptions={props.propertyOptions}
      payFromAccounts={props.payFromAccounts}
      unitOptions={props.unitOptions}
    />
  );
}

type OwnerExpenseDraftLine = {
  internalMarkup?: string;
  amount: string;
  categoryAccountId: string;
  description: string;
  key: number;
  ownerCashAmount: string;
  propertyId: string;
  unitId: string;
};

function OwnerExpenseTransactionForm({
  replacement,
  canCreateVendor = false,
  expenseAccounts,
  fixedScope,
  onClose,
  onSuccess,
  peopleOptions,
  positions,
  propertyOptions,
  payFromAccounts,
  unitOptions,
}: ExpenseFormProps) {
  const activeCategories = expenseAccounts;
  const defaultPropertyId = fixedScope?.propertyId ?? "";
  const defaultUnitId = fixedScope?.kind === "unit" ? fixedScope.id : "";
  const nextLineKey = useRef((replacement?.lines?.length ?? 1) + 1);
  const allocationDetails = useRef(new Map<number, HTMLDetailsElement>());
  const idempotencyKey = useStableActionId("expense-transaction");
  const [state, action, pending] = useActionState(
    async (previousState: FinanceOperationsActionState, formData: FormData): Promise<FinanceOperationsActionState> => {
      if (formData.get("payeeMode") === "person" && !formData.get("payeePersonId")) {
        return { status: "error", fieldErrors: { payeePersonId: ["Choose a vendor or one-time payee."] } };
      }
      return submitExpenseAction(previousState, formData);
    },
    actionInitialState,
  );
  useEffect(() => {
    if (state.status === "error" && !pending) {
      for (const details of allocationDetails.current.values()) details.open = true;
    }
  }, [pending, state]);
  const [expenseDate, setExpenseDate] = useState(replacement?.date ?? getBusinessDateValue());
  const [externalPayeeLabel, setExternalPayeeLabel] = useState(replacement?.externalPayeeLabel ?? "");
  const [payeeValue, setPayeeValue] = useState(replacement ? replacement.payeePersonId ? `person:${replacement.payeePersonId}` : "external" : "");
  const [reference, setReference] = useState(replacement?.reference ?? "");
  const [lines, setLines] = useState<OwnerExpenseDraftLine[]>(replacement?.lines?.map((line, index) => ({
    amount: String(line.amount), internalMarkup: String(line.internalMarkup), categoryAccountId: line.categoryAccountId ?? "",
    description: line.description, key: index + 1,
    ownerCashAmount: line.ownerCashAmount === null ? "" : String(line.ownerCashAmount),
    propertyId: line.propertyId, unitId: line.unitId ?? "",
  })) ?? [
    {
      amount: "",
      categoryAccountId: defaultPropertyId ? activeCategories.find((account) => account.propertyId === null || account.propertyId === defaultPropertyId)?.id ?? "" : "",
      description: "",
      key: 1,
      ownerCashAmount: "",
      propertyId: defaultPropertyId,
      unitId: defaultUnitId,
    },
  ]);
  const distinctPropertyIds = [...new Set(lines.map((line) => line.propertyId).filter(Boolean))];
  const eligibleSources = payFromAccounts.filter(
    (source) =>
      lines.every((line) => Boolean(line.propertyId)) &&
      (source.propertyId == null ||
      (distinctPropertyIds.length === 1 && source.propertyId === distinctPropertyIds[0])),
  );
  const [payFromAccountId, setPayFromAccountId] = useState(
    replacement?.payFromAccountId ?? (defaultPropertyId
      ? findConfiguredAccountId(eligibleSources, "operating_bank", defaultPropertyId) ?? eligibleSources[0]?.id ?? ""
      : ""),
  );
  const effectivePayFromAccountId = eligibleSources.some(
    (source) => source.id === payFromAccountId,
  )
    ? payFromAccountId
    : replacement ? "" : findConfiguredAccountId(eligibleSources, "operating_bank", distinctPropertyIds.length === 1 ? distinctPropertyIds[0] : null) ?? eligibleSources[0]?.id ?? "";
  useSuccess(state, onSuccess);

  const orderedPayees = peopleOptions
    .filter((person) => person.roles?.includes("vendor"))
    .sort((left, right) => left.label.localeCompare(right.label));
  const payeePersonId = payeeValue.startsWith("person:")
    ? payeeValue.slice("person:".length)
    : "";
  const payeeMode = payeeValue === "external" ? "external" : "person";

  function updateLine(
    key: number,
    patch: Partial<OwnerExpenseDraftLine>,
  ) {
    setLines((current) =>
      current.map((line) => line.key === key ? { ...line, ...patch } : line),
    );
  }

  const linePayload = lines.map((line) => ({
    amount: line.amount,
    categoryAccountId: line.categoryAccountId,
    description: line.description,
    internalMarkupAmount: line.internalMarkup ?? "0",
    ownerCashAmount: line.ownerCashAmount || null,
    propertyId: line.propertyId,
    tenantInvoiceId: null,
    unitId: line.unitId || null,
  }));
  const total = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const chargedTotal = lines.reduce((sum, line) => sum + Number(line.amount || 0) + Number(line.internalMarkup || 0), 0);

  return (
    <RecordForm
      action={action}
      allowSaveWhenClean={false}
      ariaLabel="Record property expense form"
      onCancel={onClose}
      pending={pending}
      saveLabel={replacement ? replacement.status === "approved" ? "Reverse and submit correction" : "Save changes for review" : "Submit for review"}
      savingLabel="Submitting expense"
      state={state}
    >
      <input name="expenseDate" type="hidden" value={expenseDate} />
      <input name="externalPayeeLabel" type="hidden" value={externalPayeeLabel} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="lines" type="hidden" value={JSON.stringify(linePayload)} />
      <input name="payeeMode" type="hidden" value={payeeMode} />
      <input name="payeePersonId" type="hidden" value={payeePersonId} />
      <input
        name="payFromAccountId"
        type="hidden"
        value={effectivePayFromAccountId}
      />
      <input name="reference" type="hidden" value={reference} />
      <input name="responsibility" type="hidden" value="owner" />
      {replacement ? <>
        <input name="replacementTransactionId" type="hidden" value={replacement.transactionId ?? ""} />
        <input name="expectedStatus" type="hidden" value={replacement.status} />
        <p className="text-sm text-muted-foreground">{replacement.status === "approved"
          ? "The original expense will be reversed when you save. The replacement needs approval before it affects the owner balance."
          : "Your changes replace the pending submission. The previous version remains in history."}</p>
        {replacement.status === "approved" ? <Field label="Reversal date"><DatePickerField name="reversalDate" defaultValue={getBusinessDateValue()} required /></Field> : <input name="reversalDate" type="hidden" value={getBusinessDateValue()} />}
        <Field label="Reason for change"><Input name="replacementReason" minLength={3} maxLength={500} required /></Field>
        {replacement.evidence ? <p className="text-sm text-muted-foreground">Original receipt: {replacement.evidence.fileName}. Upload the receipt again for this replacement; the original attachment stays in history.</p> : null}
      </> : null}

      <FormSection
        indentContent={false}
        title="Expense"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField label="Paid to" name="payeePersonId" required error={payeeValue ? undefined : state.fieldErrors?.payeePersonId?.[0]}>
            <SelectControl
              ariaLabel="Paid to"
              onValueChange={setPayeeValue}
              options={[
                ...orderedPayees.map((person) => ({
                  label: `Vendor · ${person.label}`,
                  value: `person:${person.id}`,
                })),
                { label: "One-time external payee", value: "external" },
              ]}
              placeholder="Choose vendor or external payee"
              required
              value={payeeValue}
            />
            {canCreateVendor ? (
              <Link
                className="mt-2 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline"
                href="/vendors?action=create"
                target="_blank"
              >
                Create vendor
              </Link>
            ) : null}
          </RecordField>

          {payeeValue === "external" ? (
            <Field label="External payee name">
              <Input
                onChange={(event) => setExternalPayeeLabel(event.target.value)}
                placeholder="One-time payee"
                required
                value={externalPayeeLabel}
              />
            </Field>
          ) : null}
        </div>

        <div className="space-y-4">
          {lines.map((line, index) => {
            const heldCash = positions.find(
              (position) => position.propertyId === line.propertyId,
            )?.cashHeldByIps;
            return (
              <div className={lines.length > 1 ? "border-t border-border/70 pt-4" : ""} key={line.key}>
                {lines.length > 1 ? (
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Expense line {index + 1}</p>
                    <Button
                      aria-label={`Remove expense line ${index + 1}`}
                      onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Property">
                      <SelectControl
                        ariaLabel={index === 0 ? "Property" : `Expense line ${index + 1} property`}
                        placeholder="Choose property"
                        required
                        onValueChange={(propertyId) => updateLine(line.key, { propertyId, unitId: "", categoryAccountId: activeCategories.find((account) => account.propertyId === null || account.propertyId === propertyId)?.id ?? "" })}
                        options={propertyOptions.map((property) => ({ label: property.label, value: property.id }))}
                        value={line.propertyId}
                      />
                  </Field>
                  <Field label="Unit">
                      <SelectControl
                        ariaLabel={`Expense line ${index + 1} unit`}
                        onValueChange={(unitId) => updateLine(line.key, { unitId })}
                        options={[
                          { label: "No unit", value: "" },
                          ...unitOptions
                            .filter((unit) => unit.propertyId === line.propertyId)
                            .map((unit) => ({ label: unit.label, value: unit.id })),
                        ]}
                        value={line.unitId}
                      />
                  </Field>
                  <Field label="Category">
                    <SelectControl
                      ariaLabel={index === 0 ? "Category" : `Expense line ${index + 1} category`}
                      placeholder="Choose category"
                      onValueChange={(categoryAccountId) => updateLine(line.key, { categoryAccountId })}
                      options={activeCategories.filter((account) => account.propertyId === null || account.propertyId === line.propertyId).map((category) => ({
                        label: category.displayName,
                        value: category.id,
                      }))}
                      required
                      value={line.categoryAccountId}
                    />
                  </Field>
                  <Field label="Description">
                    <Input
                      aria-label="Expense description"
                      onChange={(event) => updateLine(line.key, { description: event.target.value })}
                      placeholder="What was purchased or completed?"
                      required
                      value={line.description}
                    />
                  </Field>
                  <Field label="Amount paid">
                    <NumberInput
                      aria-label="Line amount"
                      onChange={(event) => updateLine(line.key, { amount: event.target.value })}
                      className="h-10 text-lg font-semibold tabular-nums md:text-lg"
                      required
                      value={line.amount}
                    />
                  </Field>
                  <details
                    className="sm:col-span-2"
                    ref={(element) => {
                      if (element) allocationDetails.current.set(line.key, element);
                      else allocationDetails.current.delete(line.key);
                    }}
                  >
                    <summary className="cursor-pointer rounded-sm text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                      Owner cash · {line.ownerCashAmount === ""
                        ? "Automatic"
                        : formatMoneyDisplay(Number(line.ownerCashAmount)).primary}
                    </summary>
                    <div className="mt-3 sm:max-w-sm">
                      <Field label="Apply from IPS-held owner cash">
                        <NumberInput
                          aria-label="Apply from IPS-held owner cash"
                          max={line.amount || undefined}
                          min="0"
                          onChange={(event) => updateLine(line.key, { ownerCashAmount: event.target.value })}
                          placeholder="Automatic"
                          value={line.ownerCashAmount}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span>Automatic when left blank</span>
                          {heldCash === undefined
                            ? "."
                            : ` · ${formatMoneyDisplay(heldCash).primary} currently held.`}
                        </p>
                      </Field>
                    </div>
                  </details>
                </div>
              </div>
            );
          })}
          <Button
            disabled={lines.length >= 20}
            onClick={() => {
              const key = nextLineKey.current;
              nextLineKey.current += 1;
              setLines((current) => {
                const propertyId = current.at(-1)?.propertyId ?? defaultPropertyId;
                return [...current, {
                amount: "",
                categoryAccountId: activeCategories.find((account) => account.propertyId === null || account.propertyId === propertyId)?.id ?? "",
                description: "",
                key,
                ownerCashAmount: "",
                propertyId,
                unitId: "",
              }];
              });
            }}
            type="button"
            variant="outline"
          >
            <Plus size={14} /> Add line
          </Button>
        </div>
      </FormSection>

      <FormSection
        indentContent={false}
        title="Payment"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paid date">
            <Input
              onChange={(event) => setExpenseDate(event.target.value)}
              type="date"
              value={expenseDate}
            />
          </Field>
          <Field label="Pay from">
            <SelectControl
              ariaLabel="Pay from"
              onValueChange={setPayFromAccountId}
              options={eligibleSources.map((source) => ({ label: source.displayName, value: source.id }))}
              placeholder={distinctPropertyIds.length === 0 ? "Choose property first" : eligibleSources.length > 0 ? "Choose account" : "No common paid-from account"}
              required
              value={effectivePayFromAccountId}
            />
          </Field>
          {replacement && !effectivePayFromAccountId ? <p className="text-sm text-warning sm:col-span-2">Choose a paid-from account. The original account is unavailable for these properties.</p> : null}
          <Field label="Reference (optional)">
            <Input
              onChange={(event) => setReference(event.target.value)}
              placeholder="Receipt number or transfer note"
              value={reference}
            />
          </Field>
          <div className="sm:col-span-2">
            <ReceiptEvidenceField required={Boolean(replacement?.evidence)} />
          </div>

        </div>
      </FormSection>
      <section aria-label="Financial preview" className="space-y-2">
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt>Total paid</dt><dd className="text-xl font-semibold tabular-nums">{formatMoneyDisplay(total).primary}</dd>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>Cost charged to owner</dt><dd className="font-medium tabular-nums">{formatMoneyDisplay(chargedTotal).primary}</dd>
          </div>
        </dl>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1 focus-visible:outline-2 focus-visible:outline-ring">How owner cash is applied</summary>
          <p className="mt-1">Available owner cash is applied; the remainder is due from the owner.</p>
        </details>
      </section>
      <ActionMessage state={state} />
    </RecordForm>
  );
}

function SingleLineExpenseForm({
  expenseAccounts,
  fixedScope,
  initialInvoiceId,
  initialResponsibility,
  invoices,
  onClose,
  onSuccess,
  propertyOptions,
  payFromAccounts,
  unitOptions,
}: {
  expenseAccounts: FinanceOperationsData["expenseAccounts"];
  fixedScope?: FinanceOperationsScreenProps["scope"];
  initialInvoiceId?: string;
  initialResponsibility?: "owner" | "tenant";
  invoices: TenantInvoiceSummary[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  propertyOptions: FinanceOperationsData["propertyOptions"];
  payFromAccounts: FinanceOperationsData["payFromAccounts"];
  unitOptions: FinanceOperationsData["unitOptions"];
}) {
  const idempotencyKey = useStableActionId("expense");
  const effectiveResponsibility = initialResponsibility ?? "owner";
  const initialInvoice = invoices.find(
    (invoice) => invoice.id === initialInvoiceId,
  );
  const initialPropertyId = fixedScope?.propertyId ?? initialInvoice?.propertyId ?? "";
  const initialExpenseAccounts = expenseAccounts.filter(
    (account) =>
      Boolean(initialPropertyId) &&
      (account.propertyId === null || account.propertyId === initialPropertyId) &&
      (effectiveResponsibility === "owner" || account.useForLeaseCredits === true),
  );
  const initialPayFromAccounts = payFromAccounts.filter(
    (account) =>
      Boolean(initialPropertyId) &&
      (account.propertyId === null || account.propertyId === initialPropertyId),
  );
  const [state, action, pending] = useActionState(
    submitExpenseAction,
    actionInitialState,
  );
  const [propertyId, setPropertyId] = useState(
    initialPropertyId,
  );
  const [unitId, setUnitId] = useState(
    fixedScope?.kind === "unit"
      ? fixedScope.id
      : (initialInvoice?.unitId ?? ""),
  );
  const [categoryAccountId, setCategoryAccountId] = useState(
    initialExpenseAccounts[0]?.id ?? "",
  );
  const [vendor, setVendor] = useState("");
  const [cost, setCost] = useState("");
  const [markup, setMarkup] = useState("0");
  const [expenseDate, setExpenseDate] = useState(getBusinessDateValue());
  const [reference, setReference] = useState("");
  const [payFromAccountId, setPayFromAccountId] = useState(
    findConfiguredAccountId(initialPayFromAccounts, "operating_bank", initialPropertyId)
      ?? initialPayFromAccounts[0]?.id
      ?? "",
  );
  const [tenantInvoiceId, setTenantInvoiceId] = useState(
    initialInvoiceId ?? "",
  );
  const matchingInvoices = invoices.filter(
    (invoice) =>
      invoice.propertyId === propertyId &&
      invoice.balanceDue > 0 &&
      (!unitId || invoice.unitId === unitId),
  );
  const matchingPayFromAccounts = payFromAccounts.filter(
    (account) => account.propertyId == null || account.propertyId === propertyId,
  );
  const matchingExpenseAccounts = expenseAccounts.filter(
    (account) =>
      (account.propertyId === null || account.propertyId === propertyId) &&
      (effectiveResponsibility === "owner" || account.useForLeaseCredits === true),
  );
  const selectedPayFromAccount = matchingPayFromAccounts.find(
    (account) => account.id === payFromAccountId,
  );
  const effectiveMarkup = effectiveResponsibility === "tenant" ? markup : "0";
  const invoiceTotal = Number(cost || 0) + Number(effectiveMarkup || 0);
  const expenseAmount = Number(cost || 0);
  const expenseFormLabel =
    effectiveResponsibility === "tenant"
      ? "Record recoverable cost form"
      : "Record property expense form";
  useSuccess(state, onSuccess);
  return (
    <RecordForm
      action={action}
      allowSaveWhenClean={false}
      ariaLabel={expenseFormLabel}
      onCancel={onClose}
      onSave={
        effectiveResponsibility === "tenant" && !tenantInvoiceId
          ? (form) => {
              form
                .querySelector<HTMLElement>('[aria-label="Recharge invoice"]')
                ?.focus();
            }
          : undefined
      }
      pending={pending}
      saveLabel={
        effectiveResponsibility === "tenant" && !tenantInvoiceId
          ? "Choose invoice first"
          : "Submit for review"
      }
      savingLabel="Submitting expense"
      state={state}
    >
      <input name="propertyId" type="hidden" value={propertyId} />
      <input name="unitId" type="hidden" value={unitId} />
      <input name="categoryAccountId" type="hidden" value={categoryAccountId} />
      <input name="vendorLabel" type="hidden" value={vendor} />
      <input name="internalCost" type="hidden" value={cost} />
      <input name="internalMarkup" type="hidden" value={effectiveMarkup} />
      <input name="expenseDate" type="hidden" value={expenseDate} />
      <input name="reference" type="hidden" value={reference} />
      <input
        name="payFromAccountId"
        type="hidden"
        value={payFromAccountId}
      />
      <input
        name="responsibility"
        type="hidden"
        value={effectiveResponsibility}
      />
      <input
        name="tenantInvoiceId"
        type="hidden"
        value={effectiveResponsibility === "tenant" ? tenantInvoiceId : ""}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <FormSection
        indentContent={false}
        title="Expense"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property">
            {fixedScope ? (
              <div className="flex min-h-8 items-center border-b border-border px-1 text-sm font-medium">
                {fixedScope.propertyLabel}
              </div>
            ) : (
              <SelectControl
                ariaLabel="Property"
                onValueChange={(value) => {
                  setPropertyId(value);
                  setUnitId("");
                  setTenantInvoiceId("");
                  const propertyExpenseAccounts = expenseAccounts.filter(
                    (account) =>
                      (account.propertyId === null || account.propertyId === value) &&
                      (effectiveResponsibility === "owner" ||
                        account.useForLeaseCredits === true),
                  );
                  setCategoryAccountId(propertyExpenseAccounts[0]?.id ?? "");
                  const propertyAccounts = payFromAccounts.filter(
                    (account) => !account.propertyId || account.propertyId === value,
                  );
                  setPayFromAccountId(
                    findConfiguredAccountId(propertyAccounts, "operating_bank", value)
                      ?? propertyAccounts[0]?.id
                      ?? "",
                  );
                }}
                options={propertyOptions.map((option) => ({
                  label: option.label,
                  value: option.id,
                }))}
                placeholder="Choose property"
                required
                value={propertyId}
              />
            )}
          </Field>
          <Field label="Unit">
            {fixedScope?.kind === "unit" ? (
              <div className="flex min-h-8 items-center border-b border-border px-1 text-sm font-medium">
                {fixedScope.label}
              </div>
            ) : (
              <SelectControl
                onValueChange={(value) => {
                  setUnitId(value);
                  const selectedInvoice = invoices.find(
                    (invoice) => invoice.id === tenantInvoiceId,
                  );
                  if (selectedInvoice?.unitId !== (value || null)) {
                    setTenantInvoiceId("");
                  }
                }}
                options={[
                  { label: "No unit", value: "" },
                  ...unitOptions
                    .filter((option) => option.propertyId === propertyId)
                    .map((option) => ({
                      label: option.label,
                      value: option.id,
                    })),
                ]}
                value={unitId}
              />
            )}
          </Field>
          <Field label="Category">
            <SelectControl
              ariaLabel="Category"
              onValueChange={setCategoryAccountId}
              options={matchingExpenseAccounts.map((account) => ({
                label: account.displayName,
                value: account.id,
              }))}
              placeholder="Choose category"
              required
              value={categoryAccountId}
            />
          </Field>
          <Field label="Paid to">
            <Input
              onChange={(event) => setVendor(event.target.value)}
              placeholder="Vendor or payee"
              required
              value={vendor}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        indentContent={false}
        title="Payment"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount paid">
            <NumberInput
              onChange={(event) => setCost(event.target.value)}
              required
              value={cost}
            />
          </Field>
          <Field label="Paid date">
            <Input
              onChange={(event) => setExpenseDate(event.target.value)}
              type="date"
              value={expenseDate}
            />
          </Field>
          <Field label="Pay from">
            <SelectControl
              ariaLabel="Pay from"
              onValueChange={setPayFromAccountId}
              options={matchingPayFromAccounts.map((account) => ({
                label: account.displayName,
                value: account.id,
              }))}
              placeholder={
                propertyId
                  ? matchingPayFromAccounts.length > 0
                    ? "Choose paid-from account"
                    : "No paid-from account available"
                  : "Choose property first"
              }
              required
              value={payFromAccountId}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        indentContent={false}
        title="Tenant charge"
      >
        {effectiveResponsibility === "tenant" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recharge invoice">
              <SelectControl
                ariaLabel="Recharge invoice"
                onValueChange={(value) => {
                  setTenantInvoiceId(value);
                  const invoice = invoices.find((item) => item.id === value);
                  setUnitId(invoice?.unitId ?? "");
                }}
                options={matchingInvoices.map((invoice) => ({
                  label: `${invoice.recipientLabel} · ${invoice.invoiceNumber}`,
                  value: invoice.id,
                }))}
                placeholder={
                  !propertyId
                    ? "Choose property first"
                    : matchingInvoices.length > 0
                      ? "Choose invoice"
                      : "No open invoice"
                }
                required
                value={tenantInvoiceId}
              />
            </Field>
            <Field label="Service fee (optional)">
              <NumberInput
                onChange={(event) => setMarkup(event.target.value)}
                required
                value={markup}
              />
            </Field>
            <div className="sm:col-span-2">
              <DefinitionRows
                rows={[
                  [
                    "Company cost",
                    formatMoneyDisplay(expenseAmount).primary,
                  ],
                  [
                    "Service fee",
                    formatMoneyDisplay(Number(effectiveMarkup || 0)).primary,
                  ],
                  [
                    "Tenant invoice",
                    formatMoneyDisplay(invoiceTotal).primary,
                  ],
                  ["Owner P&L", "No impact"],
                ]}
              />
            </div>
            {!propertyId ? (
              <p className="text-xs text-muted-foreground sm:col-span-2">Choose a property to see its open invoices.</p>
            ) : matchingInvoices.length === 0 ? (
              <div className="space-y-1 text-sm sm:col-span-2">
                <p>No open invoice for this property and unit.</p>
                <Link className="font-medium text-primary underline-offset-2 hover:underline" href="/rent-income">
                  Open Rent &amp; collections
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-border/80">
            <DefinitionRows
              rows={[
                [
                  "Cost charged to owner",
                  formatMoneyDisplay(expenseAmount).primary,
                ],
                ["Payment made by", "Management company"],
                [
                  "Paid from account",
                  selectedPayFromAccount
                    ? selectedPayFromAccount.displayName
                    : "Choose paid-from account",
                ],
                [
                  "Owner account after approval",
                  `Owner balance increases by ${formatMoneyDisplay(expenseAmount).primary}`,
                ],
              ]}
            />
            <p className="px-3 pb-3 text-xs text-muted-foreground">
              After approval, available owner-held cash is applied
              automatically. Any remainder becomes an amount due from the
              owner.
            </p>
          </div>
        )}
      </FormSection>

      <FormSection
        indentContent={false}
        title="Receipt"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference (optional)">
            <Input
              onChange={(event) => setReference(event.target.value)}
              placeholder="Receipt number or transfer note"
              value={reference}
            />
          </Field>
          <div className="sm:col-span-2">
            <ReceiptEvidenceField />
          </div>
        </div>
      </FormSection>
      <ActionMessage state={state} />
    </RecordForm>
  );
}

function ExpenseReviewForm({
  decision,
  onSuccess,
  payFromAccounts,
  submission,
}: {
  decision: "approve" | "reject";
  onSuccess: (message: string) => void;
  payFromAccounts: FinanceOperationsData["payFromAccounts"];
  submission: ExpenseSubmissionSummary;
}) {
  const idempotencyKey = useStableActionId(`expense-${decision}`);
  const [state, action] = useActionState(
    reviewExpenseAction,
    actionInitialState,
  );
  const [reason, setReason] = useState("");
  const matchingAccounts = payFromAccounts.filter(
    (account) =>
      account.propertyId === null ||
      account.propertyId === undefined ||
      account.propertyId === submission.propertyId,
  );
  const [payFromAccountId, setPayFromAccountId] = useState(
    findConfiguredAccountId(matchingAccounts, "operating_bank", submission.propertyId)
      ?? "",
  );
  const [fundingSourceConfirmed, setFundingSourceConfirmed] = useState(false);
  const needsFundingSource =
    decision === "approve" && submission.sourceType === "maintenance_task" && !submission.transactionId;
  const approvalSourceLabel = needsFundingSource
    ? expensePaymentSourceLabel(
        matchingAccounts.find((account) => account.id === payFromAccountId)
          ?.displayName ?? "the selected paid-from account",
      )
    : expensePaymentSourceLabel(submission.fundingSourceLabel);
  useSuccess(state, onSuccess);

  return (
    <form action={action} className="space-y-4 p-4">
      <input name="decision" type="hidden" value={decision} />
      <ExpenseLines submission={submission} />
      <input name={submission.transactionId ? "transactionId" : "submissionId"} type="hidden" value={submission.transactionId ?? submission.id} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="reason" type="hidden" value={reason} />
      <DefinitionRows
        rows={[
          ["Vendor", submission.vendorLabel],
          ["Property", submission.propertyLabel],
          ...(submission.maintenanceTask
            ? ([
                [
                  "Maintenance task",
                  <Link
                    className="text-primary underline-offset-2 hover:underline"
                    href={submission.maintenanceTask.href}
                    key={submission.maintenanceTask.href}
                  >
                    {submission.maintenanceTask.title}
                  </Link>,
                ],
                [
                  "Work completed",
                  submission.maintenanceTask.description ??
                    "No work note recorded",
                ],
                [
                  "Task status",
                  maintenanceStatusLabel(submission.maintenanceTask.status),
                ],
              ] satisfies [string, ReactNode][])
            : []),
          [
            submission.adjustsSubmissionId ? "Additional paid" : "Paid",
            formatMoneyDisplay(submission.internalCost).primary,
          ],
          ...(submission.adjustsSubmissionId
            ? ([
                [
                  "Previously approved",
                  formatMoneyDisplay(submission.previouslyApproved ?? 0)
                    .primary,
                ],
                [
                  "Recorded total",
                  formatMoneyDisplay(
                    submission.recordedTotal ?? submission.internalCost,
                  ).primary,
                ],
              ] satisfies [string, ReactNode][])
            : []),
          ["Charged", formatMoneyDisplay(submission.customerTotal).primary],
          ["Reference", submission.reference ?? "None provided"],
          [
            "Evidence",
            submission.evidence ? (
              submission.evidence.href ? (
                <a
                  className="text-primary underline-offset-2 hover:underline"
                  href={submission.evidence.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {submission.evidence.fileName}
                </a>
              ) : (
                `${submission.evidence.fileName} (file unavailable)`
              )
            ) : (
              "No document attached"
            ),
          ],
          ...(submission.evidence
            ? ([
                [
                  "Evidence size",
                  formatEvidenceSize(submission.evidence.sizeBytes),
                ],
              ] satisfies [string, ReactNode][])
            : []),
          ["Paid from", expensePaymentSourceLabel(submission.fundingSourceLabel)],
        ]}
      />
      {submission.evidence ? (
        <AuditDetails
          entries={[
            {
              label: "Evidence fingerprint",
              value: submission.evidence.sha256,
            },
          ]}
        />
      ) : null}
      {needsFundingSource ? (
        <Field label="Paid from">
          <SelectControl
            ariaLabel="Paid from"
            name="payFromAccountId"
            onValueChange={(value) => {
              setPayFromAccountId(value);
              setFundingSourceConfirmed(false);
            }}
            options={matchingAccounts.map((account) => ({
              label: account.displayName,
              value: account.id,
            }))}
            placeholder="Choose the account used"
            required
            value={payFromAccountId}
          />
        </Field>
      ) : (
        <input name="payFromAccountId" type="hidden" value="" />
      )}
      {decision === "approve" ? (
        <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
          <input
            checked={fundingSourceConfirmed}
            className="mt-0.5 size-4 shrink-0"
            name="fundingSourceConfirmed"
            onChange={(event) =>
              setFundingSourceConfirmed(event.target.checked)
            }
            type="checkbox"
            value="true"
          />
          <span>
            I confirm {approvalSourceLabel} was the account used to pay this
            cost.
          </span>
        </label>
      ) : null}
      <Field label={decision === "reject" ? "Rejection reason" : "Review note"}>
        <Input
          onChange={(event) => setReason(event.target.value)}
          placeholder={decision === "reject" ? "Required" : "Optional"}
          required={decision === "reject"}
          value={reason}
        />
      </Field>
      {decision === "approve" ? (
        <p className="text-xs text-muted-foreground">
          Approval posts the paid cost, customer responsibility, and property
          balance effect together. This cannot be changed through rejection
          afterward.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Rejection returns the submission without posting financial entries.
        </p>
      )}
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={
            (decision === "reject" && reason.trim().length < 3) ||
            (decision === "approve" && !fundingSourceConfirmed) ||
            (needsFundingSource && !payFromAccountId)
          }
          label={
            decision === "approve" ? "Approve paid cost" : "Reject paid cost"
          }
        />
      </FormFooter>
    </form>
  );
}

function ExpenseCancellationForm({ submission, onSuccess }: { submission: ExpenseSubmissionSummary; onSuccess: (message: string) => void }) {
  const [state, action] = useActionState(cancelExpenseAction, actionInitialState);
  const idempotencyKey = useStableActionId("cancel-expense");
  useSuccess(state, onSuccess);
  return <form action={action} className="space-y-4 p-4">
    <input name="transactionId" type="hidden" value={submission.transactionId ?? ""} />
    <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
    <p className="text-sm">Cancel this pending expense? No balance changes will be posted. Its history will be kept.</p>
    <Field label="Reason"><Input name="reason" minLength={3} maxLength={500} required /></Field>
    <ActionMessage state={state} />
    <FormFooter><span /><SubmitButton label="Cancel expense" /></FormFooter>
  </form>;
}

function ExpenseReversalForm({
  onSuccess,
  submission,
}: {
  onSuccess: (message: string) => void;
  submission: ExpenseSubmissionSummary;
}) {
  const idempotencyKey = useStableActionId("expense-reversal");
  const [state, action] = useActionState(
    reverseExpenseAction,
    actionInitialState,
  );
  const [reason, setReason] = useState("");
  useSuccess(state, onSuccess);

  return (
    <form action={action} className="space-y-4 p-4">
      <input name={submission.transactionId ? "transactionId" : "submissionId"} type="hidden" value={submission.transactionId ?? submission.id} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="reason" type="hidden" value={reason} />
      <DefinitionRows
        rows={[
          ["Vendor", submission.vendorLabel],
          ["Property", submission.propertyLabel],
          ["Paid", formatMoneyDisplay(submission.internalCost).primary],
          ["Charged", formatMoneyDisplay(submission.customerTotal).primary],
        ]}
      />
      <Field label="Reversal date">
        <DatePickerField
          defaultValue={getBusinessDateValue()}
          name="reversalDate"
          required
        />
      </Field>
      <Field label="Reason">
        <Input
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required"
          required
          value={reason}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Reversal keeps the original record and adds an opposite cash, balance,
        and customer correction.
      </p>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={reason.trim().length < 3}
          label="Reverse paid cost"
        />
      </FormFooter>
    </form>
  );
}

function SettlementReversalForm({
  invoice,
  onSuccess,
}: {
  invoice: TenantInvoiceSummary;
  onSuccess: (message: string) => void;
}) {
  const settlements = invoice.settlements.filter(
    (settlement) => !settlement.isReversed,
  );
  const [settlementId, setSettlementId] = useState(settlements[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const idempotencyKey = useStableActionId("settlement-reversal");
  const action =
    invoice.collectionRoute === "through_ips"
      ? reverseTenantInvoicePaymentAction
      : reverseOwnerCollectionConfirmationAction;
  const [state, formAction] = useActionState(action, actionInitialState);
  useSuccess(state, onSuccess);

  if (settlements.length === 0) {
    return (
      <EmptyState
        body="Every recorded settlement for this invoice is already reversed."
        kind="empty"
        title="No settlement to correct"
      />
    );
  }

  return (
    <form action={formAction} className="space-y-4 p-4">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="reason" type="hidden" value={reason} />
      <DefinitionRows
        rows={[
          ["Invoice", invoice.invoiceNumber],
          ["Customer", invoice.recipientLabel],
          [
            "Collection route",
            invoice.collectionRoute === "through_ips"
              ? "Collected by IPS"
              : "Collected by owner",
          ],
        ]}
      />
      <Field label="Settlement">
        <SelectControl
          ariaLabel="Settlement"
          name="settlementId"
          onValueChange={setSettlementId}
          options={settlements.map((settlement) => ({
            label: settlementOptionLabel(settlement),
            value: settlement.id,
          }))}
          required
          value={settlementId}
        />
      </Field>
      <Field label="Reversal date">
        <DatePickerField
          defaultValue={getBusinessDateValue()}
          name="reversalDate"
          required
        />
      </Field>
      <Field label="Reason">
        <Input
          onChange={(event) => setReason(event.target.value)}
          placeholder="Explain the correction"
          required
          value={reason}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        The original stays in history. Nestory adds an equal opposite invoice,
        property-account, and Ledger event.
      </p>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={!settlementId || reason.trim().length < 3}
          label="Reverse settlement"
        />
      </FormFooter>
    </form>
  );
}

function settlementOptionLabel(settlement: TenantInvoiceSettlement) {
  const reference = settlement.reference?.trim();
  return [
    formatDate(settlement.date),
    formatMoneyDisplay(settlement.amount).primary,
    reference || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function OwnerPaymentForm({
  invoice,
  onSuccess,
}: {
  invoice: OwnerInvoiceSummary;
  onSuccess: (message: string) => void;
}) {
  const idempotencyKey = useStableActionId("owner-payment");
  const [state, action] = useActionState(
    recordOwnerPaymentAction,
    actionInitialState,
  );
  useSuccess(state, onSuccess);
  return (
    <form action={action} className="space-y-4 p-4">
      <DefinitionRows
        rows={[
          ["Owner", invoice.ownerLabel],
          ["Property", invoice.propertyLabel],
          ["Balance", formatMoneyDisplay(invoice.balanceDue).primary],
        ]}
      />
      <input name="ownerInvoiceId" type="hidden" value={invoice.id} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <NumberInput
            defaultValue={invoice.balanceDue}
            name="amount"
            required
          />
        </Field>
        <Field label="Received date">
          <DatePickerField
            defaultValue={getBusinessDateValue()}
            name="receivedDate"
            required
          />
        </Field>
        <Field label="Reference">
          <Input name="reference" placeholder="Optional" />
        </Field>
      </div>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton label="Record owner invoice payment" />
      </FormFooter>
    </form>
  );
}

function WithdrawalForm({
  onClose,
  onSuccess,
  position,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
  position: PropertyFinancePosition;
}) {
  const idempotencyKey = useStableActionId("withdrawal");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [withdrawalDate, setWithdrawalDate] = useState(getBusinessDateValue());
  const [state, action] = useActionState(
    recordWithdrawalAction,
    actionInitialState,
  );
  useSuccess(state, onSuccess);
  return (
    <form action={action} className="space-y-4 bg-muted/15 p-4">
      <DefinitionRows
        rows={[
          ["Property", position.propertyLabel],
          ["Owner", position.ownerLabel],
          [
            "Available now",
            formatMoneyDisplay(position.availableWithdrawal).primary,
          ],
        ]}
      />
      <input name="propertyId" type="hidden" value={position.propertyId} />
      <input
        name="ownerPersonId"
        type="hidden"
        value={position.ownerPersonId ?? ""}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <NumberInput
            max={position.availableWithdrawal}
            name="amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </Field>
        <Field label="Date">
          <DatePickerField
            defaultValue={withdrawalDate}
            name="withdrawalDate"
            onValueChange={setWithdrawalDate}
            aria-describedby="distribution-date-help"
            required
          />
          <p id="distribution-date-help" className="mt-1 text-xs text-muted-foreground">Available now is the current balance. The amount available on your selected date may differ; it is checked when you record the distribution.</p>
        </Field>
        <Field label="Reference">
          <Input
            name="reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Bank transfer or note"
            required
          />
        </Field>
      </div>
      <ActionMessage state={state} />
      <FormFooter>
        <Button onClick={onClose} type="button" variant="ghost">
          Cancel
        </Button>
        <SubmitButton label="Record owner distribution" />
      </FormFooter>
    </form>
  );
}

function ManualTenantChargeForm({
  leaseChargeAccounts,
  fixedLease,
  invoices,
  leases,
  onClose,
  onSuccess,
  scope,
}: {
  leaseChargeAccounts: FinanceOperationsData["leaseChargeAccounts"];
  fixedLease?: FinanceLease;
  invoices: TenantInvoiceSummary[];
  leases: FinanceLease[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  scope?: FinanceOperationsScreenProps["scope"];
}) {
  const availableLeases = leases.filter(
    (lease) => lease.status === "active" || lease.status === "notice_given",
  );
  const initialLease = fixedLease;
  const initialChargeAccounts = leaseChargeAccounts.filter(
    (account) =>
      account.propertyId === null || account.propertyId === initialLease?.propertyId,
  );
  const initialCategoryAccountId =
    findConfiguredAccountId(initialChargeAccounts, "rental_income", initialLease?.propertyId)
    ?? initialChargeAccounts[0]?.id
    ?? "";
  const [categoryAccountId, setCategoryAccountId] = useState(initialCategoryAccountId);
  const submittedCategoryAccountIdRef = useRef(initialCategoryAccountId);
  const [leaseId, setLeaseId] = useState(fixedLease?.id ?? "");
  const [billingPeriod, setBillingPeriod] = useState(getBusinessMonthValue());
  const idempotencyKey = useStableActionId("manual-tenant-charge");
  const [state, action] = useActionState(
    createManualTenantChargeAction,
    actionInitialState,
  );
  const selectedLease = fixedLease ?? leases.find((lease) => lease.id === leaseId);
  const matchingLeaseChargeAccounts = leaseChargeAccounts.filter(
    (account) =>
      account.propertyId === null || account.propertyId === selectedLease?.propertyId,
  );
  useSuccess(state, onSuccess);

  // A charge for a month that already has an invoice joins it and inherits its
  // due date, so the operator is shown that date instead of being asked for one.
  const existingInvoice = invoices.find(
    (invoice) =>
      invoice.leaseId === leaseId &&
      invoice.billingPeriodStart.slice(0, 7) === billingPeriod &&
      invoice.paymentStatus !== "voided",
  );

  return (
    <form
      action={action}
      className="space-y-4 p-4"
      onReset={(event) => {
        // React resets a form after its action; keep entries on a rejection.
        event.preventDefault();
        setCategoryAccountId(submittedCategoryAccountIdRef.current);
      }}
      onSubmit={() => {
        submittedCategoryAccountIdRef.current = categoryAccountId;
      }}
    >
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      {fixedLease ? (
        <>
          <input name="leaseId" type="hidden" value={fixedLease.id} />
          <div className="rounded-xl bg-card shadow-sm">
            <DefinitionRows
              rows={
                scope?.kind === "unit"
                  ? [["Tenant", fixedLease.tenantLabel]]
                  : scope?.kind === "property"
                    ? [
                        [
                          "Tenant",
                          `${fixedLease.tenantLabel} · ${fixedLease.unitLabel}`,
                        ],
                      ]
                    : [
                        ["Tenant", fixedLease.tenantLabel],
                        ["Property", fixedLease.propertyLabel],
                        ["Unit", fixedLease.unitLabel],
                      ]
              }
            />
          </div>
        </>
      ) : (
        <Field label="Lease">
          <SelectControl
            ariaLabel="Lease"
            name="leaseId"
            onValueChange={(value) => {
              setLeaseId(value);
              const nextLease = leases.find((lease) => lease.id === value);
              const nextAccounts = leaseChargeAccounts.filter(
                (account) =>
                  account.propertyId === null ||
                  account.propertyId === nextLease?.propertyId,
              );
              setCategoryAccountId(
                findConfiguredAccountId(nextAccounts, "rental_income", nextLease?.propertyId)
                  ?? nextAccounts[0]?.id
                  ?? "",
              );
            }}
            options={availableLeases.map((lease) => ({
              label: `${lease.tenantLabel} · ${lease.propertyLabel} · ${lease.unitLabel}`,
              value: lease.id,
            }))}
            placeholder="Choose Lease"
            required
            value={leaseId}
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <SelectControl
            ariaLabel="Category"
            name="categoryAccountId"
            onValueChange={setCategoryAccountId}
            options={matchingLeaseChargeAccounts.map((account) => ({
              label: account.displayName,
              value: account.id,
            }))}
            placeholder="Choose income account"
            required
            value={categoryAccountId}
          />
        </Field>
        <Field label="Billing month">
          <MonthPickerField
            ariaLabel="Billing month"
            defaultValue={billingPeriod}
            name="billingPeriod"
            onValueChange={setBillingPeriod}
            required
          />
        </Field>
        {existingInvoice ? (
          <Field label="Due date">
            <input
              name="dueDate"
              type="hidden"
              value={existingInvoice.dueDate}
            />
            <p className="flex h-8 items-center text-sm text-muted-foreground">
              {formatDate(existingInvoice.dueDate)} · joins{" "}
              {existingInvoice.invoiceNumber}
            </p>
          </Field>
        ) : (
          <Field label="Due date">
            <DatePickerField
              ariaLabel="Due date"
              defaultValue={getBusinessDateValue()}
              minValue={`${billingPeriod}-01`}
              name="dueDate"
              required
            />
          </Field>
        )}
        <Field label="Amount">
          <NumberInput
            aria-label="Amount"
            className="h-10 border-foreground/45 bg-background text-lg font-semibold tabular-nums"
            min={0.01}
            name="amount"
            placeholder="0.00"
            required
            step="0.01"
          />
        </Field>
      </div>

      <Field label="Description (optional)">
        <Input
          aria-label="Description"
          name="description"
          placeholder="Optional note"
        />
      </Field>
      <ActionMessage state={state} />
      <FormFooter>
        <Button onClick={onClose} type="button" variant="outline">
          Cancel
        </Button>
        <SubmitButton label="Bill tenant" />
      </FormFooter>
    </form>
  );
}

function getModalTitle(modal: ModalState) {
  if (modal.mode === "expense-cancel") return "Cancel expense";
  if (modal.mode === "manual-charge") return "Bill tenant";
  if (modal.mode === "rent-recovery") return "Generate missing rent";
  if (modal.mode === "invoice-details") return "Invoice details";
  if (modal.mode === "expense-details") return "Paid cost details";
  if (modal.mode === "owner-balance-details") return "Owner balance details";
  if (modal.mode === "payment") {
    if (!modal.invoice || modal.canChooseAnother) return "Record tenant payment";
    return modal.invoice.collectionRoute === "through_ips"
      ? "Record payment"
      : "Confirm owner collection";
  }
  if (modal.mode === "owner-payment") return "Owner invoice payment";
  if (modal.mode === "expense-review") {
    return modal.decision === "approve"
      ? "Approve paid cost"
      : "Reject paid cost";
  }
  if (modal.mode === "expense-reversal") return "Reverse paid cost";
  if (modal.mode === "settlement-reversal") return "Correct settlement";
  return "Record owner distribution";
}

function isFinanceDetailSurface(modal: ModalState): modal is Extract<
  ModalState,
  {
    mode: "expense-details" | "invoice-details" | "owner-balance-details";
  }
> {
  return (
    modal.mode === "invoice-details" ||
    modal.mode === "expense-details" ||
    modal.mode === "owner-balance-details"
  );
}

function canRenderFinanceModal(
  modal: ModalState,
  capabilities: Pick<
    FinanceOperationsScreenProps,
    | "canCorrectFinance"
    | "canConfigureRent"
    | "canRecordOwnerCash"
    | "canRecordPayments"
    | "canRecoverRent"
    | "canReviewExpense"
    | "canReverseExpense"
    | "canSubmitExpense"
    | "canApproveOwnExpense"
    | "currentUserId"
  >,
) {
  if (
    modal.mode === "invoice-details" ||
    modal.mode === "expense-details" ||
    modal.mode === "owner-balance-details"
  ) {
    return true;
  }
  if (modal.mode === "rent-recovery") return capabilities.canRecoverRent;
  if (modal.mode === "expense-cancel") return modal.submission.status === "submitted" && canReplaceExpense(modal.submission, capabilities);
  if (modal.mode === "manual-charge") return capabilities.canRecordPayments;
  if (modal.mode === "payment") return capabilities.canRecordPayments;
  if (modal.mode === "settlement-reversal") {
    return capabilities.canCorrectFinance;
  }
  if (modal.mode === "owner-payment" || modal.mode === "withdrawal") {
    return capabilities.canRecordOwnerCash;
  }

  if (modal.mode === "expense-review") {
    return capabilities.canReviewExpense && !modal.submission.transactionReviewBlocked && !modal.submission.reviewRequiresAnotherUser
      && !(modal.decision === "reject" && modal.submission.selfApprovalOnly);
  }

  return capabilities.canReverseExpense && !modal.submission.transactionReviewBlocked;
}

function getDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "billing") {
    return drawer.lease.billing
      ? "Repair lease billing"
      : "Set up lease billing";
  }
  if (drawer.replacement) return drawer.replacement.status === "approved" ? "Correct expense" : "Edit expense";
  return drawer.initialResponsibility === "tenant"
    ? "Record recoverable cost"
    : "Record property expense";
}

function canReplaceExpense(submission: ExpenseSubmissionSummary, capabilities: Pick<FinanceOperationsScreenProps, "canSubmitExpense" | "canReverseExpense" | "canApproveOwnExpense" | "currentUserId">) {
  if (!capabilities.canSubmitExpense || !submission.transactionId || submission.transactionReviewBlocked || submission.responsibility !== "owner" || !submission.lines?.length) return false;
  if (submission.status === "approved") return capabilities.canReverseExpense;
  return submission.status === "submitted" && Boolean(capabilities.canApproveOwnExpense || capabilities.currentUserId === submission.submittedByUserId);
}

function isLeaseBillingRuleComplete(
  billing: FinanceLease["billing"],
): boolean {
  return Boolean(
    billing?.billingRecipientKind &&
      billing.billingRecipientPersonId &&
      billing.collectionRoute &&
      billing.managementFeeMode &&
      billing.managementFeeValue !== null &&
      billing.leaseStartProrationRule &&
      billing.leaseEndProrationRule &&
      billing.midPeriodRentChangeRule &&
      billing.rentCalculationTimezone &&
      billing.shortMonthDueDayRule &&
      billing.chargeThroughLeaseEnd,
  );
}

function useSuccess(
  state: FinanceOperationsActionState,
  onSuccess: (message: string) => void,
) {
  useEffect(() => {
    if (state.status === "success" && state.message) onSuccess(state.message);
  }, [onSuccess, state.message, state.status]);
}
function useStableActionId(prefix: string) {
  const [id] = useState(() => stableId(prefix));
  return id;
}
function stableId(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
function expenseStatusLabel(status: ExpenseSubmissionSummary["status"]) {
  return expenseStatusPresentation(status).label;
}

function expenseStatusTone(
  status: ExpenseSubmissionSummary["status"],
): "danger" | "neutral" | "success" | "warning" {
  return expenseStatusPresentation(status).tone;
}

function formatLeaseMonth(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : leaseMonthFormatter.format(date);
}

function getPreviousBusinessMonthValue() {
  const [year, month] = getBusinessDateValue()
    .slice(0, 7)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

function getOrganizationShortLabel(organizationName: string) {
  return organizationName.trim().split(/\s+/)[0] || organizationName;
}

function CompactTotals({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <div
      aria-label="Finance summary"
      className={cn(
        "grid shrink-0 grid-cols-1 divide-y divide-border overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm sm:divide-x sm:divide-y-0",
        items.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3",
      )}
      role="region"
    >
      {items.map((item) => (
        <div className="min-w-0 px-3 py-2.5 sm:px-4" key={item.label}>
          <p className="text-xs font-medium text-muted-foreground">
            {item.label}
          </p>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
function TableFrame({
  borderless = false,
  children,
  className,
}: {
  borderless?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-label="Finance records"
      className={cn(
        "flex-1 overflow-x-auto",
        borderless
          ? "bg-transparent"
          : "rounded-xl border border-border/80 bg-card p-3 shadow-sm",
        className,
      )}
      data-slot="finance-table-frame"
      role="region"
    >
      {children}
    </div>
  );
}
function Th({
  align = "left",
  children,
}: {
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <TableHead
      className={cn(
        "border-b border-border bg-muted/65 px-3 py-2 text-xs font-semibold text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </TableHead>
  );
}
function Td({
  align = "left",
  children,
  className,
}: {
  align?: "left" | "right";
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableCell
      className={cn(
        "px-3 py-2.5 align-middle",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </TableCell>
  );
}
function Money({ amount, className }: { amount: number; className?: string }) {
  return (
    <MoneyDisplay
      align="right"
      className={className}
      value={formatMoneyDisplay(amount)}
    />
  );
}

function expensePaymentSourceLabel(label: string) {
  const withoutInternalCode = label.replace(
    /^IPS_[A-Z0-9_-]+\s*[·-]\s*/,
    "",
  );

  if (/^IPS collected funds$/i.test(withoutInternalCode)) {
    return "Company-collected funds";
  }

  return withoutInternalCode;
}

function StatusBadge({
  dueDate,
  settlements = [],
  status,
}: {
  dueDate?: string;
  settlements?: TenantInvoiceSummary["settlements"];
  status: string;
}) {
  const presentation = getInvoiceStatusPresentation({
    businessDate: getBusinessDateValue(),
    dueDate,
    settlements,
    status,
  });
  return <Badge tone={presentation.tone}>{presentation.label}</Badge>;
}
function ReceiptEvidenceField({ required = false }: { required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);
  return (
    <div className="space-y-2">
      <Field label={required ? "Replacement receipt" : "Receipt (optional)"}>
        <Input
          accept="application/pdf,image/jpeg,image/png,image/webp"
          name="evidenceFile"
          onChange={(event) => setHasFile(Boolean(event.currentTarget.files?.length))}
          ref={inputRef}
          required={required}
          type="file"
        />
      </Field>
      {hasFile ? (
        <Button
          onClick={() => {
            const input = inputRef.current;
            if (!input) return;
            input.value = "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            setHasFile(false);
            input.focus();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Remove receipt
        </Button>
      ) : null}
    </div>
  );
}
function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
function FormFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
      {children}
    </div>
  );
}
function SubmitButton({
  disabled,
  label,
}: {
  disabled?: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={disabled || pending} type="submit" variant="default">
      {pending ? "Saving…" : label}
    </Button>
  );
}
function ActionMessage({ state }: { state: FinanceOperationsActionState }) {
  return state.status === "error" && state.message ? (
    <p
      className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {state.message}
    </p>
  ) : null;
}
function DefinitionRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="overflow-hidden rounded-md border border-border">
      {rows.map(([label, value]) => (
        <div
          className="grid grid-cols-[minmax(120px,0.4fr)_1fr] gap-3 border-b border-border px-3 py-2 last:border-b-0"
          key={label}
        >
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

"use client";

import { FinancialForm, FinancialReportBoundary } from "@/lib/finance/financial-write-provider";

import { SearchCombo } from "@/components/ui/search-combo";
import { matchesSearchText } from "@/lib/search/text";

import dynamic from "next/dynamic";
import { useStableActionId, useSuccess, Field, FormFooter, SubmitButton, ActionMessage, DefinitionRows } from "./finance-form-primitives";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useOverlayDraftGuard, type OverlayDraftGuard } from "@/components/ui/overlay-dismissal-context";
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

import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { NumberInput } from "@/components/ui/number-input";

import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";
import { findConfiguredAccountId } from "@/features/finance-accounts/finance-account-selection";

import { getCalendarDateInTimeZone } from "@/features/leases/lease-billing-rule-state";
import { buildLeaseCurrentRentEditHref, buildLeasePaymentResolutionHref } from "@/features/leases/lease-detail-route";
import { financeReturnHref, financeTabHref, propertyFinanceReturnLinks } from "@/features/finance-operations/finance-tab-route";
import { workflowReturnHref } from "@/features/leases/workflow-return";

import { createManualTenantChargeAction, publishTenantInvoicePdfAction, recordOwnerPaymentAction, recordWithdrawalAction, recoverLeaseRentPeriodAction, recoverRentGenerationExceptionAction, reverseExpenseAction, reverseOwnerCollectionConfirmationAction, reverseTenantInvoicePaymentAction, retryTenantReceiptPdfAction, reviewExpenseAction, cancelExpenseAction } from "@/features/finance-operations/actions";
import { FinanceCategorySetupEntry } from "@/features/finance-operations/components/finance-category-manager";
import { TenantInvoiceVoidControl } from "@/features/finance-operations/components/tenant-invoice-void-control";
import { TenantInvoicePaymentForm, type TenantPaymentReceiptResult } from "@/features/finance-operations/components/tenant-invoice-payment-form";
import { getRentInvoiceView, isVisibleTenantInvoice, RentInvoiceFilterBar } from "@/features/finance-operations/components/rent-invoice-filters";
import type { CommercialDocumentLink, ExpenseSubmissionSummary, FinanceLease, FinanceOperationsActionState, FinanceOperationsData, OwnerInvoiceSummary, PropertyAccountEntry, PropertyFinancePosition, RentGenerationException, TenantInvoiceSettlement, TenantInvoiceSummary } from "@/features/finance-operations/finance-operations.types";
import { categoryLabel, expenseStatusPresentation, formatEvidenceSize, getInvoiceStatusPresentation, maintenanceStatusLabel } from "@/features/finance-operations/finance-operations-view-model";
import { OwnerContributionControl } from "@/features/owner-balances/components/owner-cash-controls";
import { TransactionWorkspace } from "./transaction-workspace";
import { TransactionRowActions } from "./transaction-row-actions";
import { AccountEntryActions } from "./account-entry-actions";
import { useManualChargeInvoiceContext } from "./use-manual-charge-invoice-context";
import { sortPropertyAccountEntriesNewestFirst } from "@/features/finance-operations/property-account";
import { useBusinessDate } from "@/lib/dates/business-date-provider";
import { ExpenseChangeHistory } from "./expense-change-history";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import { cn } from "@/lib/utils";

const ExpenseForm = dynamic(() => import("./finance-expense-form").then(module => module.ExpenseForm), { loading: () => <p className="p-4" role="status">Loading expense form...</p> });
const BillingSetupForm = dynamic(() => import("./finance-billing-setup-form").then(module => module.BillingSetupForm), { loading: () => <p className="p-4" role="status">Loading billing form...</p> });

export type FinanceOperationsView =
  "account" | "balances" | "expenses" | "rent" | "work" | "transactions";

type ModalState =
  | { mode: "expense-cancel"; submission: ExpenseSubmissionSummary }
  | { lease?: FinanceLease; mode: "manual-charge"; transactionScope?: FinanceOperationsScreenProps["scope"] }
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
      transactionScope?: FinanceOperationsScreenProps["scope"];
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
      fixedScope?: FinanceOperationsScreenProps["scope"];
      initialInvoiceId?: string;
      initialResponsibility?: "owner" | "tenant";
      mode: "expense";
      replacement?: ExpenseSubmissionSummary;
    };

export type FinanceOperationsScreenProps = FinanceOperationsData & {
  expenseMonth?: string;
  currentUserId?: string;
  canApproveOwnExpense?: boolean;
  canPostExpense?: boolean;
  canPostTenantExpense?: boolean;
  canCorrectExpense?: boolean;
  canCreateVendor?: boolean;
  canConfigureRent: boolean;
  canManageFinanceCategories?: boolean;
  canCorrectFinance: boolean;
  isSuperAdmin?: boolean;
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
  initialExpenseId?: string;
  initialInvoiceId?: string;
  initialExpenseIntent?: "owner" | "tenant";
  initialRentLeaseId?: string;
  openingAuthority?: ReactNode;
  organizationName: string;
  reportReturnHref?: string | null;
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
  const returnTo = useSearchParams().get("returnTo");
  const propertyReturnLinks = propertyFinanceReturnLinks(input.scope?.propertyId ?? "", returnTo);
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
  const [modal, setModal] = useState<ModalState | null>(() => {
    const submission = props.expenseSubmissions.find(item => item.id === props.initialExpenseId || item.lines?.some(line => line.submissionId === props.initialExpenseId));
    if (submission) return { mode: "expense-details", submission };
    const invoice = props.selectedTenantInvoice?.id === props.initialInvoiceId
      ? props.selectedTenantInvoice
      : props.tenantInvoices.find(item => item.id === props.initialInvoiceId);
    return invoice ? { mode: "invoice-details", invoice } : null;
  });
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
  // A route refresh may change page, property or payment balance while a dialog
  // is open. Resolve invoice dialogs from the current authorized response.
  const modalInvoice = modal && "invoice" in modal && modal.invoice;
  const currentModalInvoice = modalInvoice && modal.mode !== "owner-payment"
    ? [...props.tenantInvoices, ...(props.selectedTenantInvoice ? [props.selectedTenantInvoice] : [])].find(invoice => invoice.id === modalInvoice.id)
    : undefined;
  const currentModal = modalInvoice && modal?.mode !== "owner-payment"
    ? currentModalInvoice ? { ...modal, invoice: currentModalInvoice } as ModalState : null
    : modal;
  const visibleModal =
    currentModal && canRenderFinanceModal(currentModal, props) ? currentModal : null;
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
                        { href: propertyReturnLinks.propertiesHref, label: "Properties" },
                        {
                          href: propertyReturnLinks.propertyHref,
                          label: props.scope.label,
                        },
                      ]
                    : [
                        { href: propertyReturnLinks.propertiesHref, label: "Properties" },
                        {
                          href: propertyReturnLinks.propertyHref,
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
            className="px-4 py-3 sm:px-6 lg:py-3 2xl:px-8 [&_[data-slot=page-header-actions]]:ml-0 [&_[data-slot=page-header-actions]]:basis-full md:[&_[data-slot=page-header-actions]]:ml-auto md:[&_[data-slot=page-header-actions]]:basis-auto"
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
      headerClassName="px-4 py-3 sm:px-6 lg:py-3 2xl:px-8 [&_[data-slot=page-header-actions]]:ml-0 [&_[data-slot=page-header-actions]]:basis-full md:[&_[data-slot=page-header-actions]]:ml-auto md:[&_[data-slot=page-header-actions]]:basis-auto"
      localNav={
        props.scope ? (
          <ScopedFinanceNavigation key={`${props.scope.kind}:${props.scope.id}`} scope={props.scope} view={props.view} />
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
      <FinancialReportBoundary expectedGeneration={props.financialGeneration}>
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
                  canRetry={props.canRecordPayments && !receiptResult.requiresReview}
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
              canPostExpense={props.canPostExpense ?? Boolean(props.canSubmitExpense && props.canReviewExpense && props.canApproveOwnExpense)}
              canPostTenantExpense={props.canPostTenantExpense}
              expenseAccounts={props.expenseAccounts}
              replacement={visibleDrawer.replacement}
              fixedScope={visibleDrawer.fixedScope ?? props.scope}
              lockScope={Boolean(visibleDrawer.fixedScope)}
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
              canViewPropertyRecords={props.canViewPropertyRecords ?? true}
              businessDate={
                props.rentBusinessDate ??
                getCalendarDateInTimeZone(
                  new Date(),
                  props.operationalTimezone ?? "UTC",
                )
              }
              canCorrectFinance={props.canCorrectFinance}
              canRecordPayments={props.canRecordPayments}
              canViewLeases={props.canViewLeases ?? false}
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
              onVoidSuccess={onActionSuccess}
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
              payFromAccounts={props.payFromAccounts}
              reportReturnHref={props.reportReturnHref}
              originalExpense={visibleDetailDrawer.submission.replacesSubmissionId ? props.expenseSubmissions.find((item) => item.id === visibleDetailDrawer.submission.replacesSubmissionId) : visibleDetailDrawer.submission.replacesTransactionId ? props.expenseSubmissions.find((item) => item.transactionId === visibleDetailDrawer.submission.replacesTransactionId) : undefined}
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
              invoicesArePaginated={Boolean(props.tenantInvoicePage)}
              leaseChargeAccounts={props.leaseChargeAccounts}
              fixedLease={visibleActionModal.lease}
              invoices={props.tenantInvoices}
              leases={props.leases.filter(lease => !visibleActionModal.transactionScope || lease.propertyId === visibleActionModal.transactionScope.propertyId && (visibleActionModal.transactionScope.kind !== "unit" || lease.unitId === visibleActionModal.transactionScope.id))}
              onClose={closeModal}
              onSuccess={onActionSuccess}
              scope={visibleActionModal.transactionScope ?? props.scope}
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
                    ? () => setModal({ mode: "payment", transactionScope: visibleActionModal.transactionScope })
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
                  (invoice) => invoice.balanceDue > 0 && (!visibleActionModal.transactionScope || invoice.propertyId === visibleActionModal.transactionScope.propertyId && (visibleActionModal.transactionScope.kind !== "unit" || invoice.unitId === visibleActionModal.transactionScope.id)),
                )}
                onChoose={(invoice) =>
                  setModal({ canChooseAnother: true, invoice, mode: "payment", transactionScope: visibleActionModal.transactionScope })
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

      </FinancialReportBoundary>
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
  const query = useSearchParams().toString();
  const filters = financeTabHref(base, view, query, query).split("?")[1];
  const [saved, setSaved] = useState({ view, filters, queries: { [view]: filters } as Record<string, string> });
  const queries = { ...saved.queries, [view]: filters };
  if (saved.view !== view || saved.filters !== filters) {
    setSaved({ view, filters, queries });
  }
  const tabHref = (target: FinanceOperationsView) => financeTabHref(base, target, queries[target] ?? "", query);
  const leaseOrigin = financeReturnHref(new URLSearchParams(query).get("returnTo"));
  const items = [
    { active: view === "transactions", href: tabHref("transactions"), label: "Transactions" },
    {
      active: view === "rent",
      href: tabHref("rent"),
      label: "Rent & charges",
    },
    {
      active: view === "expenses",
      href: tabHref("expenses"),
      label: "Expenses",
    },
    scope.kind === "property"
      ? {
          active: view === "account",
          href: tabHref("account"),
          label: "Owner account",
        }
      : {
          active: false,
          href: financeTabHref(`/properties/${scope.propertyId}/finance`, "account", "", query),
          label: "Owner account (Property)",
        },
  ];

  return (
    <div className="min-w-0">
      {leaseOrigin?.startsWith("/leases/") ? (
        <div className="workspace-gutter-x py-1">
          <Button asChild variant="ghost" size="sm">
            <Link href={leaseOrigin}>Back to lease</Link>
          </Button>
        </div>
      ) : null}
      <LocalWorkspaceNav
        className="workspace-gutter-x py-1"
        items={items}
        label={`${scope.kind === "property" ? "Property" : "Unit"} finance`}
      />
    </div>
  );
}

function getScreen(
  props: FinanceOperationsScreenProps,
  openModal: (modal: ModalState) => void,
  openDrawer: (drawer: DrawerState) => void,
) {
  const canConfigureRent = props.canConfigureRent;

  if (props.view === "transactions" && props.scope) {
    const scope = props.scope;
    const position = props.positions.find(item => item.propertyId === scope.propertyId);
    return {
      activeRoute: "/finance" as const,
      actions: undefined,
      context: scope.label,
      contextHref: scope.kind === "unit" ? `/units/${scope.id}/finance` : `/properties/${scope.id}/finance`,
      title: "Transactions",
      toolbar: undefined,
      body: <TransactionWorkspace
        data={props}
        scope={{ propertyId: scope.propertyId, unitId: scope.kind === "unit" ? scope.id : undefined }}
        canReadReports={props.canReadFinanceReports ?? false}
        onOpenInvoice={invoice => openModal({ mode: "invoice-details", invoice })}
        onOpenExpense={submission => openModal({ mode: "expense-details", submission })}
        renderTransactionActions={row => <TransactionRowActions canCorrectIssuedRent={props.isSuperAdmin} row={row} canCorrect={props.canCorrectFinance} canViewLeases={props.canViewLeases ?? false}
          onEditExpense={row.source.kind === "expense" && canReplaceExpense(row.source.submission, props) ? () => { if (row.source.kind === "expense") openDrawer({ mode: "expense", replacement: row.source.submission }); } : undefined}
          onDeleteExpense={row.source.kind === "expense" && !row.source.submission.transactionReviewBlocked && (row.source.submission.status === "approved" ? props.canReverseExpense : row.source.submission.status === "submitted" && canReplaceExpense(row.source.submission, props)) ? () => { if (row.source.kind === "expense") openModal({ mode: row.source.submission.status === "approved" ? "expense-reversal" : "expense-cancel", submission: row.source.submission }); } : undefined}
        />}
        renderAccountActions={entry => <AccountEntryActions canRecoverOwnerDistribution={props.isSuperAdmin} entry={entry} propertyLabel={scope.propertyLabel} canCorrectFinance={props.canCorrectFinance && props.canRecordOwnerCash} sourceAction={entry.source?.kind === "lease" && props.canViewLeases ? { label: "Open lease", href: `/leases/${entry.source.id}` } : undefined} />}
        actions={effectiveScope => {
          const transactionScope: NonNullable<FinanceOperationsScreenProps["scope"]> = effectiveScope.unitId ? { ...scope, id: effectiveScope.unitId, kind: "unit", label: props.unitOptions.find(unit => unit.id === effectiveScope.unitId)?.label ?? scope.label } : scope;
          const leases = props.leases.filter(lease => lease.propertyId === effectiveScope.propertyId && (!effectiveScope.unitId || lease.unitId === effectiveScope.unitId) && ["active", "notice_given"].includes(lease.status));
          const openInvoices = props.tenantInvoices.filter(invoice => invoice.propertyId === effectiveScope.propertyId && (!effectiveScope.unitId || invoice.unitId === effectiveScope.unitId) && invoice.balanceDue > 0 && invoice.paymentStatus !== "voided");
          return <>
          {props.canRecordPayments ? <>
            <Button onClick={() => openModal({ mode: "manual-charge", transactionScope, lease: leases.length === 1 ? leases[0] : undefined })}>Add charge</Button>
            <Button variant="outline" disabled={!openInvoices.length} onClick={() => openModal({ mode: "payment", transactionScope, invoice: openInvoices.length === 1 ? openInvoices[0] : undefined, canChooseAnother: true })}>Receive payment</Button>
          </> : null}
          {props.canSubmitExpense ? <Button variant="outline" onClick={() => openDrawer({ mode: "expense", initialResponsibility: "owner", fixedScope: transactionScope })}>Add expense</Button> : null}
          {props.canRecordOwnerCash && position?.ownerPersonId ? <>
            <OwnerContributionControl units={props.unitOptions} unitId={effectiveScope.unitId} canRecordOwnerCash propertyId={position.propertyId} ownerPersonId={position.ownerPersonId} ownerLabel={position.ownerLabel} />
            {!effectiveScope.unitId ? <Button variant="outline" disabled={position.availableWithdrawal <= 0} onClick={() => openModal({ mode: "withdrawal", position })}>Owner distribution</Button> : null}
          </> : null}
        </>; }}
      />,
    };
  }

  if (props.view === "rent") {
    const focusedLease = props.initialRentLeaseId
      ? props.leases.find((lease) => lease.id === props.initialRentLeaseId)
      : undefined;
    const invoices = (
      props.initialRentLeaseId
        ? props.tenantInvoices.filter(
            (invoice) => invoice.leaseId === props.initialRentLeaseId,
          )
        : props.tenantInvoices
    ).filter(isVisibleTenantInvoice);
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
                  {props.tenantInvoicePage ? "No open invoices on this page" : "No open tenant invoices"}
                </span>
              ) : null}
            </div>
          </>
        ) : undefined,
      body: (
        <RentView
          page={props.tenantInvoicePage}
          positions={props.positions}
          invoices={invoices}
          openModal={openModal}
          organizationName={props.organizationName}
          scoped={props.scope !== undefined}
        />
      ),
      context: `${props.tenantInvoicePage?.pagination.totalCount ?? invoices.length} ${(props.tenantInvoicePage?.pagination.totalCount ?? invoices.length) === 1 ? "invoice" : "invoices"}`,
      contextHref: "/rent-income",
      title: focusedLease
        ? `Rent and charges · ${focusedLease.tenantLabel}`
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
          positions={props.positions}
          serverMonth={props.expenseMonth}
          scoped={Boolean(props.scope)}
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
          invoices={props.tenantInvoices.filter(isVisibleTenantInvoice)}
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
          activityIsRecent={props.accountActivityIsRecent}
          units={props.unitOptions}
          canRecoverOwnerDistribution={props.isSuperAdmin}
          entries={props.accountEntries}
          getSourceAction={(entry) => {
            const source = entry.source;
            if (!source) return undefined;
            if (source.kind === "rent") {
              const invoice = props.tenantInvoices.find((item) => item.id === source.id && item.propertyId === entry.propertyId);
              return invoice ? { label: "Open rent transaction", onSelect: () => openModal({ mode: "invoice-details", invoice }) } : undefined;
            }
            if (source.kind === "expense") {
              const submission = props.expenseSubmissions.find((item) => item.id === source.id || item.lines?.some((line) => line.submissionId === source.id && line.propertyId === entry.propertyId));
              return submission ? { label: "Open expense transaction", onSelect: () => openModal({ mode: "expense-details", submission }) } : undefined;
            }
            if (source.kind === "lease" && props.canViewLeases) {
              const lease = props.leases.find((item) => item.id === source.id && item.propertyId === entry.propertyId);
              return lease ? { label: "Open lease", href: `/leases/${lease.id}` } : undefined;
            }
            return undefined;
          }}
          canRecordOwnerCash={props.canRecordOwnerCash}
          canCorrectFinance={props.canCorrectFinance}
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
        tenantInvoices={props.tenantInvoices.filter(isVisibleTenantInvoice)}
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
  const { getBusinessDateValue } = useBusinessDate();
  const [workFilter, setWorkFilter] = useState<FinanceWorkFilter>("all");
  const [workGroup, setWorkGroup] = useState<FinanceWorkGroup>("urgency");
  const [workSort, setWorkSort] = useState<FinanceWorkSort>("priority");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessDate = getBusinessDateValue();
  const currentExpiredLeaseIds = new Set(rentGenerationExceptions
    .filter(exception => exception.expiredTermEndDate
      && exception.billingPeriodStart.slice(0, 7) === businessDate.slice(0, 7))
    .map(exception => exception.leaseId));
  const leasesNeedingSetup = leases.filter(
    (lease) =>
      (lease.status === "active" || lease.status === "notice_given") &&
      !isLeaseBillingRuleComplete(lease.billing) &&
      !currentExpiredLeaseIds.has(lease.id),
  );
  const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
  const tenantDue = tenantInvoices.filter((invoice) => invoice.balanceDue > 0);
  const ownerDue = ownerInvoices.filter((invoice) => invoice.balanceDue > 0);
  const workCount =
    leasesNeedingSetup.length +
    rentGenerationExceptions.length +
    tenantDue.length +
    ownerDue.length;
  const hasBillingRecords =
    leases.length > 0 || tenantInvoices.length > 0 || ownerInvoices.length > 0;
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
                ? hasBillingRecords
                  ? "No billing setup issues or unpaid invoices need review."
                  : "Lease billing setup and unpaid invoices will appear here when there is work to review."
                : "Choose another work type to continue."
            }
            className="flex-1"
            kind={workCount === 0 ? "empty" : "filtered"}
            title={workCount === 0 ? "No finance work" : "No matching work"}
          />
        ) : (
          <>
            <TableFrame borderless className="p-0">
              <Table scrollRegionLabel="Finance records" className="min-w-[860px]">
              <thead className="bg-[var(--table-header-bg)]">
                <tr>
                  <Th>Work</Th>
                  <Th>Property</Th>
                  <Th align="right">Amount</Th>
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
                          canViewLeases={canViewLeases}
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
                      <Td align="right">
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
                          variant="outline"
                        >
                          <Link
                            href={
                              item.invoice.collectionRoute === "through_ips" &&
                              canViewLeases
                                ? buildLeasePaymentResolutionHref({
                                    invoiceId: item.invoice.id,
                                    leaseId: item.invoice.leaseId,
                                    returnTo: workflowReturnHref(`${pathname}?${searchParams}`),
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
                      <Td align="right">
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
                          variant="outline"
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
  canViewLeases,
  exception,
  lease,
  primaryAction = false,
}: {
  canRecover: boolean;
  canViewLeases: boolean;
  exception: RentGenerationException;
  lease: FinanceLease | null;
  primaryAction?: boolean;
}) {
  const monthLabel = formatLeaseMonth(exception.billingPeriodStart);
  const retiredPolicyException = ["rent_policy_missing", "policy_not_effective"].includes(exception.code);
  const billingReady = isLeaseBillingRuleComplete(lease?.billing ?? null);
  const guidance = retiredPolicyException
    ? billingReady
      ? "Recheck this earlier exception against the current lease billing rules. The next attempt will validate whether rent can be generated."
      : "Set up the lease billing rules before rechecking this earlier exception. Review the lease rent dates, collection route and billing recipient."
    : exception.message;

  return (
    <tr className="border-b border-border">
      <Td>
        <p className="font-medium">{exception.expiredTermEndDate ? "Review lease renewal or move-out" : "Rent generation needs attention"}</p>
        <p className="text-xs text-muted-foreground">{exception.expiredTermEndDate
          ? `The recorded rent term ended ${formatDate(exception.expiredTermEndDate)}. No recorded rent term covers ${monthLabel}. Confirm renewal or move-out before generating rent; this exception does not establish that rent is owed.`
          : guidance}</p>
        {retiredPolicyException ? (
          <details className="mt-1 text-xs text-muted-foreground">
            <summary>Original exception</summary>
            <p>{exception.message}</p>
          </details>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {exception.attemptCount}{" "}
          {exception.attemptCount === 1 ? "attempt" : "attempts"}
        </p>
      </Td>
      <Td>{lease?.propertyLabel ?? "Property unavailable"}</Td>
      <Td>{lease && !exception.expiredTermEndDate ? <Money amount={lease.monthlyRent} /> : "—"}</Td>
      <Td>{monthLabel}</Td>
      <Td align="right">
        {exception.expiredTermEndDate ? (
          canViewLeases ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/leases/${exception.leaseId}`}>Review lease</Link>
            </Button>
          ) : <span className="text-xs text-muted-foreground">Ask a lease administrator to review</span>
        ) : retiredPolicyException ? (
          <div className="flex flex-wrap justify-end gap-2">
            {canViewLeases ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/leases/${exception.leaseId}?section=rent`}>Review lease billing</Link>
              </Button>
            ) : <span className="text-xs text-muted-foreground">Ask a lease administrator to review billing</span>}
            {canRecover && billingReady ? <RentGenerationRetry exceptionId={exception.id} monthLabel={monthLabel} primaryAction={primaryAction} recheck /> : null}
          </div>
        ) : canRecover ? (
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
  recheck = false,
}: {
  exceptionId: string;
  monthLabel: string;
  primaryAction: boolean;
  recheck?: boolean;
}) {
  const [state, action, pending] = useActionState(
    recoverRentGenerationExceptionAction,
    actionInitialState,
  );

  return (
    <FinancialForm action={action} className="space-y-1">
      <input name="exceptionId" type="hidden" value={exceptionId} />
      <Button
        aria-label={`${recheck ? "Recheck and generate" : "Generate"} missing rent for ${monthLabel}`}
        disabled={pending}
        size="sm"
        type="submit"
        variant={primaryAction ? "default" : "outline"}
      >
        {pending ? "Generating..." : recheck ? "Recheck and generate" : "Generate missing rent"}
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
    </FinancialForm>
  );
}

function HistoricalRentRecoveryForm({
  leases,
  onSuccess,
}: {
  leases: FinanceLease[];
  onSuccess: (message: string) => void;
}) {
  const { getBusinessMonthValue } = useBusinessDate();
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
    <FinancialForm action={action} className="space-y-4 p-4">
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
          defaultValue={getPreviousBusinessMonthValue(getBusinessMonthValue())}
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
    </FinancialForm>
  );
}

function RentView({
  page,
  positions,
  invoices,
  openModal,
  organizationName,
  scoped,
}: {
  page?: FinanceOperationsData["tenantInvoicePage"];
  positions: FinanceOperationsData["positions"];
  invoices: TenantInvoiceSummary[];
  openModal: (modal: ModalState) => void;
  organizationName: string;
  scoped: boolean;
}) {
  const { getBusinessDateValue } = useBusinessDate();
  const searchParams = useSearchParams();
  const filteredInvoices = page ? invoices : getRentInvoiceView(
    invoices,
    searchParams,
    getBusinessDateValue(),
    positions,
  ).filteredInvoices;
  const unpaid = page ? page.totalsByCurrency.reduce((sum, total) => sum + total.outstanding, 0) : filteredInvoices.reduce(
    (sum, invoice) => sum + invoice.balanceDue,
    0,
  );
  const collected = page ? page.totalsByCurrency.reduce((sum, total) => sum + total.collected, 0) : filteredInvoices.reduce(
    (sum, invoice) => sum + invoice.paidThroughIps + invoice.collectedByOwner,
    0,
  );
  return (
    <div className="workspace-gutter-x mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-4 py-4 sm:px-6 2xl:px-8">
      <CompactTotals
        items={[
          { label: "Collected", value: <Money amount={collected} /> },
          { label: "Outstanding", value: <Money amount={unpaid} /> },
          { label: "Invoices", value: page?.pagination.totalCount ?? filteredInvoices.length },
        ]}
      />
      <RentInvoiceFilterBar
        invoices={invoices}
        resultCount={page?.pagination.totalCount ?? filteredInvoices.length}
        totalCount={page?.totalVisibleCount}
        properties={page?.propertyOptions}
        scoped={scoped}
      />
      <section className="min-h-0 flex-1" data-slot="rent-invoices-surface">
        {filteredInvoices.length === 0 ? (
          <EmptyState
            body={
              (page?.totalVisibleCount ?? invoices.length) === 0
                ? "Rent charges are generated automatically from each active Lease."
                : "Clear or change the filters to see more invoices. Only tenant charges appear here; cash already recorded as income is in Transactions and cannot be received again."
            }
            className="flex-1 rounded-xl border border-border/80 bg-card shadow-sm"
            kind="empty"
            title={(page?.totalVisibleCount ?? invoices.length) === 0 ? "No rent invoices" : "No matching invoices"}
          />
        ) : (
          <TableFrame className="p-0">
            <Table scrollRegionLabel="Finance records"
              className={cn("table-fixed min-w-[1000px]", scoped && "lg:min-w-[960px]")}
            >
              <colgroup>
                <col className="w-[21%]" />
                <col className="w-[28%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead className="bg-[var(--table-header-bg)]">
                <tr>
                  <Th>Invoice</Th>
                  <Th>Tenant / property</Th>
                  <Th>Collected by</Th>
                  <Th align="right">Balance</Th>
                  <Th>Status</Th>
                  <Th align="right">Preview</Th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => (
                  <tr className="border-b border-border" key={invoice.id}>
                    <Td className="overflow-hidden">
                      <p className="whitespace-normal [overflow-wrap:anywhere] font-medium" title={invoice.invoiceNumber}>
                        {invoice.invoiceNumber}
                      </p>
                      <p
                        className="whitespace-normal [overflow-wrap:anywhere] text-xs text-foreground"
                        title={invoice.lines.map((line) => line.label).join(", ")}
                      >
                        {invoice.lines.map((line) => line.label).join(", ")}
                      </p>
                      <p className="whitespace-normal [overflow-wrap:anywhere] text-xs text-muted-foreground">
                        Due {formatDate(invoice.dueDate)}
                      </p>
                    </Td>
                    <Td className="overflow-hidden">
                      <p className="whitespace-normal [overflow-wrap:anywhere] font-medium" title={invoice.recipientLabel}>
                        {invoice.recipientLabel}
                      </p>
                      <p
                        className="whitespace-normal [overflow-wrap:anywhere] text-xs text-muted-foreground"
                        title={`${invoice.propertyLabel} · ${invoice.unitLabel}`}
                      >
                        {invoice.propertyLabel} · {invoice.unitLabel}
                      </p>
                    </Td>
                    <Td className="overflow-hidden">
                      {invoice.collectionRoute === "through_ips" ? (
                        <span
                          aria-label={organizationName}
                          className="block whitespace-normal [overflow-wrap:anywhere]"
                          title={organizationName}
                        >
                          {getOrganizationShortLabel(organizationName)}
                        </span>
                      ) : (
                        "Owner"
                      )}
                    </Td>
                    <Td align="right" className="overflow-hidden">
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
        {page ? <PaginationControls pagination={page.pagination} /> : null}
      </section>
    </div>
  );
}

function ExpensesView({
  scoped = false,
  positions,
  serverMonth,
  canReview,
  openModal,
  submissions,
}: {
  positions: FinanceOperationsData["positions"];
  canReview: boolean;
  openModal: (modal: ModalState) => void;
  submissions: FinanceOperationsData["expenseSubmissions"];
  serverMonth?: string;
  scoped?: boolean;
}) {
  const [status, setStatus] =
    useState<ExpenseSubmissionSummary["status"]>("submitted");

  const [localMonth, setLocalMonth] = useState("");
  const month = serverMonth ?? localMonth;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setMonth = (value: string) => {
    if (serverMonth === undefined) { setLocalMonth(value); return; }
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("expenseMonth", value); else params.delete("expenseMonth");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  };
  const [search, setSearch] = useState("");
  const filtered = submissions.filter((item) => (!month || item.date.startsWith(month)) &&
    matchesSearchText(search, [item.propertyLabel, item.unitLabel, positions.find(position => position.propertyId === item.propertyId)?.ownerLabel, ...(positions.find(position => position.propertyId === item.propertyId)?.ownerSearchLabels ?? []), item.vendorLabel, item.categoryLabel, item.reference, ...(item.lines ?? []).map(line => line.unitLabel)]));

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 px-4 py-4 sm:px-6 2xl:px-8">
      {serverMonth === "" && !scoped ? <p className="text-xs text-muted-foreground">Recent history. Choose a month to view older expenses.</p> : null}
      <div className="flex flex-wrap items-end gap-3" aria-label="Expense filters">
        <label className="grid gap-1 text-xs font-medium">Month
          <MonthPickerField key={month || "all"} ariaLabel="Expense month" name="expenseMonth" defaultValue={month} onValueChange={setMonth} className="w-44" />
        </label>
        <SearchCombo ariaLabel="Search expenses" className="basis-full sm:max-w-sm sm:basis-auto" placeholder="Search property, unit, owner, vendor or reference" query={search} onQueryChange={setSearch} onSubmit={event => event.preventDefault()} submitLabel="Search expenses" showSubmitButton={false} />
        {month || search ? <Button variant="ghost" onClick={() => { setMonth(""); setSearch(""); }}>Clear filters</Button> : null}
      </div>
      <Tabs
        className="space-y-3"
        onValueChange={(value) =>
          setStatus(value as ExpenseSubmissionSummary["status"])
        }
        value={status}
      >
        <TabsList
          aria-label="Paid cost status"
          className="group-data-horizontal/tabs:h-auto max-w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/50 p-1"
        >
          {(["submitted", "approved", "rejected", "reversed"] as const).map(
            (value) => (
              <TabsTrigger className="h-8 flex-none px-2.5" key={value} value={value}>
                {value === "rejected" ? "Cancelled / rejected" : expenseStatusLabel(value)} (
                {filtered.filter((item) => item.status === value).length})
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
                submissions={filtered.filter(
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
      <Table scrollRegionLabel="Finance records" className="table-fixed min-w-[960px]">
        <colgroup>
          <col className="w-[13%]" />
          <col className="w-[24%]" />
          <col className="w-[25%]" />
          <col className="w-[13%]" />
          <col className="w-[17%]" />
          <col className="w-[8%]" />
        </colgroup>
        <thead className="bg-[var(--table-header-bg)]">
          <tr>
            <Th>Date</Th>
            <Th>Paid cost</Th>
            <Th>Property / charged to</Th>
            <Th align="right">Amount</Th>
            <Th>Status</Th>
            <Th align="right">Action</Th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((submission) => (
            <tr className="border-b border-border" key={submission.id}>
              <Td className="whitespace-nowrap tabular-nums">{formatDate(submission.date)}</Td>
              <Td>
                <p className="whitespace-normal break-words font-medium">
                  {submission.categoryLabel ?? categoryLabel(submission.category)}
                </p>
                <p className="whitespace-normal [overflow-wrap:anywhere] text-xs text-muted-foreground" title={submission.vendorLabel}>
                  {submission.vendorLabel}
                </p>
              </Td>
              <Td>
                <p className="whitespace-normal break-words font-medium" title={submission.propertyLabel}>{submission.propertyLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {submission.responsibility === "owner"
                    ? "Property owner"
                    : "Tenant"}
                </p>
              </Td>
              <Td align="right">
                <Money amount={submission.internalCost} />
              </Td>
              <Td>
                  <Badge tone={expenseStatusTone(submission.status)}>
                    {submission.cancelledAt ? "Cancelled" : expenseStatusLabel(submission.status)}
                  </Badge>
              </Td>
              <Td align="right">
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
              <Table scrollRegionLabel="Finance records" className="table-fixed min-w-[680px]">
                <colgroup>
                  <col className="w-[40%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead className="bg-[var(--table-header-bg)]">
                  <tr>
                    <Th>Property / owner</Th>
                    <Th align="right">Cash collected</Th>
                    <Th align="right">Available</Th>
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
                        <Td align="right">
                          <Money amount={position.cashHeldByIps} />
                        </Td>
                        <Td align="right">
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
              <Table scrollRegionLabel="Finance records" className="min-w-[720px]">
                <thead className="bg-[var(--table-header-bg)]">
                  <tr>
                    <Th>Customer</Th>
                    <Th>Invoices</Th>
                    <Th align="right">Outstanding</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {tenantBalances.map((balance) => (
                    <tr className="border-b border-border" key={balance.label}>
                      <Td className="font-medium">{balance.label}</Td>
                      <Td>{balance.invoices}</Td>
                      <Td align="right">
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
  businessDate,
  canCorrectFinance,
  canRecordPayments,
  canViewLeases,
  canViewPropertyRecords,
  invoice,
  onCorrect,
  onPublicationClose,
  onPublicationSuccess,
  onPublishPdf,
  onRecordPayment,
  onVoidSuccess,
  organizationName,
  pdf,
  pdfResultHref,
  publicationOpen,
}: {
  businessDate: string;
  canCorrectFinance: boolean;
  canRecordPayments: boolean;
  canViewLeases: boolean;
  canViewPropertyRecords: boolean;
  invoice: TenantInvoiceSummary;
  onCorrect: () => void;
  onPublicationClose: () => void;
  onPublicationSuccess: (state: FinanceOperationsActionState) => void;
  onPublishPdf: (trigger: HTMLElement) => void;
  onRecordPayment: () => void;
  onVoidSuccess: (message: string) => void;
  organizationName: string;
  pdf: CommercialDocumentLink;
  pdfResultHref: string | null;
  publicationOpen: boolean;
}) {
  const canCorrect =
    canCorrectFinance &&
    invoice.settlements.some((settlement) => !settlement.isReversed);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const publishButtonRef = useRef<HTMLAnchorElement | null>(null);
  const pdfHref = pdf.href ?? pdfResultHref;
  const canPublishPdf =
    canRecordPayments && invoice.paymentStatus !== "voided" && !pdfHref;
  const canEditCurrentRent =
    canCorrectFinance &&
    canViewLeases &&
    invoice.generationSource === "lease_rules_v1" &&
    invoice.paymentStatus !== "voided" &&
    invoice.billingPeriodStart <= businessDate &&
    Boolean(invoice.billingPeriodEnd && invoice.billingPeriodEnd >= businessDate);

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
              {canViewPropertyRecords ? <Link
                className="text-primary underline-offset-2 hover:underline"
                href={`/properties/${invoice.propertyId}/finance?view=rent`}
              >
                Open Property finance
              </Link> : <span>Property and unit details require property access.</span>}
              {canViewPropertyRecords && invoice.unitId ? (
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
      <div className="space-y-3 border-t border-border pt-3">
        {pdfHref || canPublishPdf || (canRecordPayments && invoice.balanceDue > 0) ? (
        <div aria-label="Invoice payment and documents" role="group" className="flex flex-wrap justify-end gap-2">
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
            <Button type="button" onClick={onRecordPayment}>
              {invoice.collectionRoute === "through_ips"
                ? "Record payment"
                : "Confirm collected"}
            </Button>
          ) : null}
        </div>
        ) : null}
        {canEditCurrentRent || canCorrect || (canCorrectFinance && invoice.paymentStatus !== "voided") ? (
          <section aria-label="Invoice corrections" className="border-t border-border pt-3">
            <p className="mb-2 text-xs text-muted-foreground">Corrections retain the original records in history.</p>
            <div className="flex flex-wrap justify-end gap-2">
              {canEditCurrentRent ? (
                <Button asChild variant="outline">
                  <Link href={buildLeaseCurrentRentEditHref({ invoiceId: invoice.id, leaseId: invoice.leaseId,
                    returnTo: workflowReturnHref(`${pathname}?${searchParams}`) })}>
                    Edit this month&apos;s rent
                  </Link>
                </Button>
              ) : null}
              <TenantInvoiceVoidControl canCorrectFinance={canCorrectFinance} invoice={invoice} onSuccess={onVoidSuccess} />
              {canCorrect ? <Button type="button" onClick={onCorrect} variant="outline">Reverse payment record</Button> : null}
            </div>
          </section>
        ) : null}
      </div>
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
    <FinancialForm action={formAction} className="space-y-4 p-4" hidden={hidden}>
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
    </FinancialForm>
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
        Payment history
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
    <FinancialForm action={formAction} className="flex flex-wrap items-center justify-end gap-2">
      <input name="paymentId" type="hidden" value={settlement.id} />
      <span className="text-muted-foreground">Receipt unavailable</span>
      {canRetry && !state.receiptRequiresReview ? <SubmitButton label="Create receipt again" /> : null}
      <ActionMessage state={state} />
    </FinancialForm>
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
                  Owner funds held by management: {line.ownerCashAmount === null
                    ? "calculated on approval"
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
  payFromAccounts,
  reportReturnHref,
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
  reportReturnHref?: string | null;
  payFromAccounts: FinanceOperationsData["payFromAccounts"];
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
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);

  return (
    <div className="space-y-4 p-4">
      {reportReturnHref ? (
        <Link className="inline-flex font-medium underline underline-offset-4" href={reportReturnHref}>
          Return to report and recheck
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">
            {submission.categoryLabel ?? categoryLabel(submission.category)}
          </p>
          <p className="text-sm text-muted-foreground">
            {submission.vendorLabel} · {submission.propertyLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {submission.transactionId || submission.replacementTransactionId ? (
            <Button
              onClick={() => {
                historyHeadingRef.current?.focus();
                historyHeadingRef.current?.scrollIntoView({ block: "nearest" });
              }}
              size="sm"
              variant="outline"
            >
              History
            </Button>
          ) : null}
          <Badge tone={expenseStatusTone(submission.status)}>
            {submission.cancelledAt ? "Cancelled" : expenseStatusLabel(submission.status)}
          </Badge>
        </div>
      </div>
      <DefinitionRows
        rows={[
          ["Paid date", formatDate(submission.date)],
          ["Unit", submission.unitLabel],
          [
            "Charged to",
            submission.responsibility === "owner"
              ? "Property owner"
              : "Tenant",
          ],
          ["Paid from", expensePaymentSourceLabel(submission.fundingSourceLabel)],
          [
            "Amount paid",
            <Money amount={submission.internalCost} key="amount-paid" />,
          ],
          ...(submission.customerTotal !== submission.internalCost
            ? ([
                [
                  "Amount charged",
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
      {submission.transactionId || submission.replacementTransactionId ? <ExpenseChangeHistory headingRef={historyHeadingRef} key={submission.transactionId ?? submission.id} payFromAccounts={payFromAccounts} transactionId={submission.transactionId ?? submission.replacementTransactionId!} legacySubmissionId={submission.replacesSubmissionId ?? (!submission.transactionId ? submission.id : undefined)} /> : null}
      {submission.replacesTransactionId ? <p className="text-sm text-muted-foreground">Replacement for a previous expense. The original remains in history.</p> : null}
      {originalExpense ? <Button variant="outline" onClick={() => onViewRelated(originalExpense)}>View original expense</Button> : null}
      {replacementExpense ? <Button variant="outline" onClick={() => onViewRelated(replacementExpense)}>View replacement expense</Button> : null}
      {canEdit ? <div className="flex gap-2 border-t border-border pt-3">
        <Button onClick={onEdit} variant="outline">Edit expense</Button>
        {submission.status === "submitted" ? <Button onClick={onCancelExpense} variant="ghost">Cancel expense</Button> : null}
      </div> : null}
      {!canEdit ? <p className="text-sm text-muted-foreground">{submission.transactionReviewBlocked ? "Open the complete expense before requesting a correction." : submission.sourceType === "maintenance_task" ? "Maintenance costs retain their task history. Ask Finance to review the linked maintenance record." : ["reversed", "rejected"].includes(submission.status) ? "This historical version cannot be edited. Review its replacement or correction history." : !submission.transactionId && submission.status === "submitted" ? "This legacy submission must complete its existing review before a linked correction is available." : "Editing is unavailable for this record or your current access. Ask Finance to review its history."}</p> : null}
      {submission.scopedSubtotal !== undefined ? <p className="text-sm">
        Total shown: {formatMoneyDisplay(submission.scopedSubtotal).primary}
        {submission.fullTransactionTotal !== undefined ? <> · Whole expense: {formatMoneyDisplay(submission.fullTransactionTotal).primary}</> : null}
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
              aria-label={`Reverse expense for ${submission.vendorLabel}`}
              onClick={onReverse}
              variant="outline"
            >
              Reverse expense
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
  activityIsRecent,
  units,
  canRecoverOwnerDistribution,
  getSourceAction,
  canRecordOwnerCash,
  canCorrectFinance,
  entries,
  onRecordWithdrawal,
  position,
}: {
  activityIsRecent?: boolean;
  units: FinanceOperationsData["unitOptions"];
  getSourceAction: (entry: PropertyAccountEntry) => { label: string; onSelect?: () => void; href?: string } | undefined;
  canRecordOwnerCash: boolean;
  canCorrectFinance: boolean;
  canRecoverOwnerDistribution?: boolean;
  entries: FinanceOperationsData["accountEntries"];
  onRecordWithdrawal?: () => void;
  position: PropertyFinancePosition | null;
}) {
  const returnTo = useSearchParams().get("returnTo");
  const [showHistory, setShowHistory] = useState(false);
  if (!position)
    return (
      <EmptyState
        body="This property account is not available."
        className="h-full"
        kind="empty"
        title="Account unavailable"
      />
    );
  const orderedEntries = sortPropertyAccountEntriesNewestFirst(entries).filter(entry => showHistory || !(entry.source?.isReversed || ["property_withdrawal_reversal", "expense_customer_adjustment"].includes(entry.sourceType) || ["owner_contribution", "management_fee_occurrence"].includes(entry.sourceType) && entry.amount < 0));
  return (
    <div className="flex min-w-0 flex-col gap-4 bg-background px-4 pb-6 pt-4 sm:px-6 2xl:px-8">
      <section
        aria-label="Account position"
        className="grid shrink-0 grid-cols-1 overflow-hidden rounded-xl border border-border/80 bg-card pb-5 pt-5 shadow-sm sm:grid-cols-2"
      >
        <AccountPositionItem
          action={position.ownerPersonId ? <OwnerContributionControl units={units} canRecordOwnerCash={canRecordOwnerCash} propertyId={position.propertyId} ownerPersonId={position.ownerPersonId} ownerLabel={position.ownerLabel} /> : undefined}
          description="Income and contributions minus owner costs and distributions"
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
      {activityIsRecent ? <p className="text-sm text-muted-foreground">Latest 300 activity records. <Link className="font-medium text-primary underline" href={propertyFinanceReturnLinks(position.propertyId, returnTo).transactionsHref}>Open Transactions for earlier activity</Link>.</p> : null}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showHistory} onChange={event => setShowHistory(event.target.checked)} />Show correction history</label>
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
                {showHistory ? <Th align="right">Balance after</Th> : null}
                <Th align="right">Actions</Th>
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
                      {entry.unitId ? <p className="text-xs text-muted-foreground">{entry.unitLabel ?? units.find(unit => unit.id === entry.unitId)?.label ?? "Unit contribution"}</p> : null}
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
                    {showHistory ? <Td align="right"><Money amount={entry.runningBalance} /></Td> : null}
                    <Td align="right"><AccountEntryActions canRecoverOwnerDistribution={canRecoverOwnerDistribution} entry={entry} propertyLabel={position.propertyLabel} canCorrectFinance={canCorrectFinance && canRecordOwnerCash} sourceAction={getSourceAction(entry)} /></Td>
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
  return entry.balanceEffect ?? (entry.category === "rent_income" || entry.category === "owner_contribution" ? entry.amount : -entry.amount);
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
  const [state, action, pending] = useActionState(
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
  const [dirty, setDirty] = useState(false);
  useOverlayDraftGuard(useMemo<OverlayDraftGuard>(() => ({ status: pending ? "saving" : state.status === "success" ? "saved" : dirty || state.status === "error" ? "dirty" : "clean" }), [pending, dirty, state.status]));
  useSuccess(state, onSuccess);

  return (
    <FinancialForm action={action} className="space-y-4 p-4" onChangeCapture={() => setDirty(true)} onInputCapture={() => setDirty(true)}>
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
    </FinancialForm>
  );
}

function ExpenseCancellationForm({ submission, onSuccess }: { submission: ExpenseSubmissionSummary; onSuccess: (message: string) => void }) {
  const [state, action, pending] = useActionState(cancelExpenseAction, actionInitialState);
  const idempotencyKey = useStableActionId("cancel-expense");
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  useOverlayDraftGuard(useMemo<OverlayDraftGuard>(() => ({ status: pending ? "saving" : state.status === "success" ? "saved" : dirty || state.status === "error" ? "dirty" : "clean" }), [pending, dirty, state.status]));
  useSuccess(state, onSuccess);
  return <FinancialForm action={action} className="space-y-4 p-4" onChangeCapture={() => setDirty(true)} onInputCapture={() => setDirty(true)}>
    <input name="transactionId" type="hidden" value={submission.transactionId ?? ""} />
    <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
    <p className="text-sm">Cancel this pending expense? No balance changes will be posted. Its history will be kept.</p>
    <Field label="Reason"><Input name="reason" value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={500} required /></Field>
    <ActionMessage state={state} />
    <FormFooter><span /><SubmitButton label="Cancel expense" /></FormFooter>
  </FinancialForm>;
}

function ExpenseReversalForm({
  onSuccess,
  submission,
}: {
  onSuccess: (message: string) => void;
  submission: ExpenseSubmissionSummary;
}) {
  const idempotencyKey = useStableActionId("expense-reversal");
  const [state, action, pending] = useActionState(
    reverseExpenseAction,
    actionInitialState,
  );
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  useOverlayDraftGuard(useMemo<OverlayDraftGuard>(() => ({ status: pending ? "saving" : state.status === "success" ? "saved" : dirty || state.status === "error" ? "dirty" : "clean" }), [pending, dirty, state.status]));
  useSuccess(state, onSuccess);

  return (
    <FinancialForm action={action} className="space-y-4 p-4" onChangeCapture={() => setDirty(true)} onInputCapture={() => setDirty(true)}>
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
      <input name="reversalDate" type="hidden" value={submission.date} />
      <p className="text-sm">Transaction date: {formatDate(submission.date)}</p>
      <Field label="Reason">
        <Input
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required"
          required
          value={reason}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        This reverses the expense in current balances. The original stays in history. No money is refunded.
      </p>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={reason.trim().length < 3}
          label="Reverse expense"
        />
      </FormFooter>
    </FinancialForm>
  );
}

function SettlementReversalForm({
  invoice,
  onSuccess,
}: {
  invoice: TenantInvoiceSummary;
  onSuccess: (message: string) => void;
}) {
  const { getBusinessDateValue } = useBusinessDate();
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
        body="Every recorded payment for this invoice is already reversed."
        kind="empty"
        title="No payment to reverse"
      />
    );
  }

  return (
    <FinancialForm action={formAction} className="space-y-4 p-4">
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
      <Field label="Payment record">
        <SelectControl
          ariaLabel="Payment record"
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
        This reverses the recorded payment and adjusts related balances.
        The original stays in history. No money is refunded.
      </p>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={!settlementId || reason.trim().length < 3}
          label="Reverse payment record"
        />
      </FormFooter>
    </FinancialForm>
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
  const { getBusinessDateValue } = useBusinessDate();
  const idempotencyKey = useStableActionId("owner-payment");
  const [state, action] = useActionState(
    recordOwnerPaymentAction,
    actionInitialState,
  );
  useSuccess(state, onSuccess);
  return (
    <FinancialForm action={action} className="space-y-4 p-4">
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
          <NumberInput currencyPaste
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
    </FinancialForm>
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
  const { getBusinessDateValue } = useBusinessDate();
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
    <FinancialForm action={action} className="space-y-4 bg-muted/15 p-4">
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
        <div>
          <Field label="Amount">
            <NumberInput currencyPaste
              max={position.availableWithdrawal}
              name="amount"
              aria-describedby="distribution-amount-help"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </Field>
          <p id="distribution-amount-help" className="mt-1 text-xs text-muted-foreground">
            Partial payouts are allowed. The unpaid balance stays in the owner account.
          </p>
        </div>
        <div>
          <Field label="Payment date">
            <DatePickerField
              defaultValue={withdrawalDate}
              name="withdrawalDate"
              onValueChange={setWithdrawalDate}
              aria-describedby="distribution-date-help"
              required
            />
          </Field>
          <p id="distribution-date-help" className="mt-1 text-xs text-muted-foreground">
            Use the actual payment date, not the rent month. Available cash is checked on this date.
          </p>
        </div>
        <Field label="Reference">
          <Input
            name="reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="e.g. August rent payout"
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
    </FinancialForm>
  );
}

function ManualTenantChargeForm({
  invoicesArePaginated = false,
  leaseChargeAccounts,
  fixedLease,
  invoices,
  leases,
  onClose,
  onSuccess,
  scope,
}: {
  invoicesArePaginated?: boolean;
  leaseChargeAccounts: FinanceOperationsData["leaseChargeAccounts"];
  fixedLease?: FinanceLease;
  invoices: TenantInvoiceSummary[];
  leases: FinanceLease[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  scope?: FinanceOperationsScreenProps["scope"];
}) {
  const { getBusinessDateValue, getBusinessMonthValue } = useBusinessDate();
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
  const invoiceContext = useManualChargeInvoiceContext(invoicesArePaginated, leaseId, billingPeriod);
  const existingInvoice = invoicesArePaginated ? invoiceContext.invoice : invoices.find(
    (invoice) =>
      invoice.leaseId === leaseId &&
      invoice.billingPeriodStart.slice(0, 7) === billingPeriod &&
      invoice.paymentStatus !== "voided",
  );

  return (
    <FinancialForm
      action={action}
      className="space-y-4 p-4"
      onReset={(event) => {
        // React resets a form after its action; keep entries on a rejection.
        event.preventDefault();
        setCategoryAccountId(submittedCategoryAccountIdRef.current);
      }}
      onSubmit={(event) => {
        if (!invoiceContext.ready) { event.preventDefault(); return; }
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
        {!invoiceContext.ready ? <Field label="Due date">
          <p role="status" className="text-sm text-muted-foreground">{invoiceContext.error ?? (leaseId ? "Checking the billing month's invoice..." : "Choose a lease to check its invoice.")}</p>
          {invoiceContext.error ? <Button type="button" variant="outline" onClick={invoiceContext.retry}>Retry invoice check</Button> : null}
        </Field> : existingInvoice ? (
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
          <NumberInput currencyPaste
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
        <SubmitButton label="Bill tenant" disabled={!invoiceContext.ready} />
      </FormFooter>
    </FinancialForm>
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
  if (modal.mode === "expense-reversal") return "Reverse expense";
  if (modal.mode === "settlement-reversal") return "Reverse payment record";
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
  if (drawer.replacement) return "Edit expense";
  return drawer.initialResponsibility === "tenant"
    ? "Record recoverable cost"
    : "Record property expense";
}

function canReplaceExpense(submission: ExpenseSubmissionSummary, capabilities: Pick<FinanceOperationsScreenProps, "canSubmitExpense" | "canReverseExpense" | "canCorrectExpense" | "canApproveOwnExpense" | "currentUserId">) {
  if (!capabilities.canSubmitExpense || submission.transactionReviewBlocked || !submission.lines?.length) return false;
  if (!submission.transactionId && (submission.status !== "approved" || submission.sourceType !== "general" || submission.adjustsSubmissionId || submission.replacementTransactionId)) return false;
  if (submission.responsibility === "tenant" && !submission.lines.every((line) => line.tenantInvoiceId)) return false;
  if (submission.status === "approved") return capabilities.canCorrectExpense ?? capabilities.canReverseExpense;
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

function getPreviousBusinessMonthValue(businessMonth: string) {
  const [year, month] = businessMonth
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
        "grid shrink-0 grid-cols-1 divide-y divide-border border-y border-border bg-background sm:divide-x sm:divide-y-0",
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
      className={cn(
        "min-w-0 flex-1",
        borderless
          ? "bg-transparent"
          : "rounded-lg border border-border bg-card",
        className,
      )}
      data-slot="finance-table-frame"
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
        "h-9 border-b border-border bg-[var(--table-header-bg)] px-3 py-2 text-[11px] font-medium text-muted-foreground",
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
        "px-3 py-2.5 align-middle text-[13px] leading-5",
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
  const { getBusinessDateValue } = useBusinessDate();
  const presentation = getInvoiceStatusPresentation({
    businessDate: getBusinessDateValue(),
    dueDate,
    settlements,
    status,
  });
  return <Badge tone={presentation.tone}>{presentation.label}</Badge>;
}

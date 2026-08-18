"use client";

import Link from "next/link";
import {
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
import { RecordForm } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";
import {
  confirmOwnerCollectionAction,
  createManualTenantChargeAction,
  recordOwnerPaymentAction,
  recordTenantInvoicePaymentAction,
  recordWithdrawalAction,
  recoverLeaseRentPeriodAction,
  recoverRentGenerationExceptionAction,
  reverseExpenseAction,
  reverseOwnerCollectionConfirmationAction,
  reverseTenantInvoicePaymentAction,
  reviewExpenseAction,
  saveLeaseBillingAction,
  submitExpenseAction,
} from "@/features/finance-operations/actions";
import type {
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
    };

type FinanceOperationsScreenProps = FinanceOperationsData & {
  canConfigureRent: boolean;
  canCorrectFinance: boolean;
  canRecordOwnerCash: boolean;
  canRecordPayments: boolean;
  canReadFinanceReports?: boolean;
  canRecoverRent: boolean;
  canReviewExpense: boolean;
  canReverseExpense: boolean;
  canRetryCurrentRent: boolean;
  canSubmitExpense: boolean;
  initialBillingLeaseId?: string;
  initialExpenseIntent?: boolean;
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

export function FinanceOperationsScreen(props: FinanceOperationsScreenProps) {
  const organizationName = props.organizationName.trim() || "our company";
  const initialBillingLease = props.initialBillingLeaseId
    ? props.leases.find((lease) => lease.id === props.initialBillingLeaseId)
    : undefined;
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    initialBillingLease
      ? { lease: initialBillingLease, mode: "billing" }
      : props.initialExpenseIntent && props.canSubmitExpense
        ? { mode: "expense" }
        : null,
  );
  const [modal, setModal] = useState<ModalState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const closeDrawer = () => setDrawer(null);
  const closeModal = () => setModal(null);
  const openDrawer = (next: DrawerState) => {
    setStatusMessage(null);
    setModal(null);
    setDrawer(next);
  };
  const openModal = (next: ModalState) => {
    setStatusMessage(null);
    setDrawer(null);
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
      : props.canSubmitExpense)
      ? drawer
      : null;
  const visibleModal =
    modal && canRenderFinanceModal(modal, props) ? modal : null;

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
                  props.scope.kind === "property"
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
            canReadFinanceReports={props.canReadFinanceReports ?? false}
          />
        )
      }
      title={props.scope ? undefined : screen.title}
      toolbar={screen.toolbar}
    >
      <div className="flex min-w-0 flex-col">
        {statusMessage ? (
          <div className="shrink-0 border-b border-border bg-card px-4 py-2 sm:px-6">
            <p className="text-sm" role="status">
              {statusMessage}
            </p>
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
              organizationName={organizationName}
              peopleOptions={props.peopleOptions}
            />
          ) : (
            <ExpenseForm
              fixedScope={props.scope}
              initialInvoiceId={visibleDrawer.initialInvoiceId}
              initialResponsibility={visibleDrawer.initialResponsibility}
              invoices={props.tenantInvoices}
              onClose={closeDrawer}
              onSuccess={onActionSuccess}
              propertyOptions={props.propertyOptions}
              reconciliationSources={props.reconciliationSources}
              unitOptions={props.unitOptions}
            />
          )}
        </SideDrawer>
      ) : null}

      {visibleModal ? (
        <Modal onClose={closeModal} open title={getModalTitle(visibleModal)}>
          {visibleModal.mode === "manual-charge" ? (
            <ManualTenantChargeForm
              fixedLease={visibleModal.lease}
              invoices={props.tenantInvoices}
              leases={props.leases}
              onSuccess={onActionSuccess}
              scope={props.scope}
            />
          ) : visibleModal.mode === "rent-recovery" ? (
            <HistoricalRentRecoveryForm
              leases={props.leases}
              onSuccess={onActionSuccess}
            />
          ) : visibleModal.mode === "invoice-details" ? (
            <InvoiceDetails
              canCorrectFinance={props.canCorrectFinance}
              canRecordPayments={props.canRecordPayments}
              invoice={visibleModal.invoice}
              onClose={closeModal}
              onCorrect={() =>
                setModal({
                  invoice: visibleModal.invoice,
                  mode: "settlement-reversal",
                })
              }
              onRecordPayment={() =>
                setModal({ invoice: visibleModal.invoice, mode: "payment" })
              }
              organizationName={organizationName}
            />
          ) : visibleModal.mode === "expense-details" ? (
            <ExpenseDetails
              canReview={props.canReviewExpense}
              canReverse={props.canReverseExpense}
              onApprove={() =>
                setModal({
                  decision: "approve",
                  mode: "expense-review",
                  submission: visibleModal.submission,
                })
              }
              onClose={closeModal}
              onReject={() =>
                setModal({
                  decision: "reject",
                  mode: "expense-review",
                  submission: visibleModal.submission,
                })
              }
              onReverse={() =>
                setModal({
                  mode: "expense-reversal",
                  submission: visibleModal.submission,
                })
              }
              submission={visibleModal.submission}
            />
          ) : visibleModal.mode === "owner-balance-details" ? (
            <OwnerBalanceDetails
              canRecordOwnerCash={props.canRecordOwnerCash}
              onClose={closeModal}
              onOwnerPayment={
                visibleModal.ownerInvoice
                  ? () =>
                      setModal({
                        invoice: visibleModal.ownerInvoice!,
                        mode: "owner-payment",
                      })
                  : undefined
              }
              onWithdrawal={() =>
                setModal({
                  mode: "withdrawal",
                  position: visibleModal.position,
                })
              }
              organizationName={organizationName}
              position={visibleModal.position}
            />
          ) : visibleModal.mode === "payment" ? (
            visibleModal.invoice ? (
              <SettleInvoiceForm
                invoice={visibleModal.invoice}
                onChooseAnother={
                  visibleModal.canChooseAnother
                    ? () => setModal({ mode: "payment" })
                    : undefined
                }
                onSuccess={onActionSuccess}
                reconciliationSources={props.reconciliationSources}
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
          ) : visibleModal.mode === "owner-payment" ? (
            <OwnerPaymentForm
              invoice={visibleModal.invoice}
              onSuccess={onActionSuccess}
            />
          ) : visibleModal.mode === "expense-review" ? (
            <ExpenseReviewForm
              decision={visibleModal.decision}
              onSuccess={onActionSuccess}
              reconciliationSources={props.reconciliationSources}
              submission={visibleModal.submission}
            />
          ) : visibleModal.mode === "expense-reversal" ? (
            <ExpenseReversalForm
              onSuccess={onActionSuccess}
              submission={visibleModal.submission}
            />
          ) : visibleModal.mode === "settlement-reversal" ? (
            <SettlementReversalForm
              invoice={visibleModal.invoice}
              onSuccess={onActionSuccess}
            />
          ) : (
            <WithdrawalForm
              onClose={closeModal}
              onSuccess={onActionSuccess}
              position={visibleModal.position}
            />
          )}
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
  const canRecoverRent = props.canRecoverRent;

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
    const canRecordScopedPayment =
      props.canRecordPayments &&
      invoices.some((invoice) => invoice.balanceDue > 0);
    const focusedPayableInvoice = props.initialRentLeaseId
      ? invoices.find((invoice) => invoice.balanceDue > 0)
      : undefined;
    return {
      activeRoute: "/rent-income" as const,
      actions:
        canRecordScopedPayment || canConfigureRent || canRecoverRent ? (
          <>
            {canRecoverRent && !props.initialRentLeaseId ? (
              <Button
                onClick={() => openModal({ mode: "rent-recovery" })}
                variant="ghost"
              >
                Recover missed month
              </Button>
            ) : null}
            {canRecordScopedPayment ? (
              <Button
                onClick={() =>
                  openModal(
                    focusedPayableInvoice
                      ? { invoice: focusedPayableInvoice, mode: "payment" }
                      : { mode: "payment" },
                  )
                }
                variant="outline"
              >
                <WalletCards size={15} /> Record payment
              </Button>
            ) : null}
            {canConfigureRent && !props.initialRentLeaseId ? (
              <Button
                onClick={() =>
                  openModal({
                    lease: props.initialRentLeaseId
                      ? props.leases.find(
                          (lease) => lease.id === props.initialRentLeaseId,
                        )
                      : scopedLease,
                    mode: "manual-charge",
                  })
                }
              >
                <Plus size={15} /> Add tenant charge
              </Button>
            ) : null}
          </>
        ) : undefined,
      body: (
        <RentView
          invoices={invoices}
          openModal={openModal}
          organizationName={props.organizationName}
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
    return {
      activeRoute: "/bills-expenses" as const,
      actions: props.canSubmitExpense ? (
        <Button
          onClick={() => openDrawer({ mode: "expense" })}
          variant="default"
        >
          <Plus size={15} /> Record expense
        </Button>
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
              items={[
                { href: "/properties", label: "Properties" },
                {
                  href: `/properties/${position.propertyId}`,
                  label: position.propertyLabel,
                },
              ]}
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
    actions: props.canRecordPayments ? (
      <Button onClick={() => openModal({ mode: "payment" })} variant="default">
        <WalletCards size={15} /> Record payment
      </Button>
    ) : undefined,
    body: (
      <FinanceWorkView
        canConfigureRent={canConfigureRent}
        canRecordOwnerCash={props.canRecordOwnerCash}
        canRecordPayments={props.canRecordPayments}
        canRetryCurrentRent={props.canRetryCurrentRent}
        leases={props.leases}
        openDrawer={openDrawer}
        openModal={openModal}
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

function FinanceWorkView({
  canConfigureRent,
  canRecordOwnerCash,
  canRecordPayments,
  canRetryCurrentRent,
  leases,
  openDrawer,
  openModal,
  ownerInvoices,
  rentGenerationExceptions,
  tenantInvoices,
}: {
  canConfigureRent: boolean;
  canRecordOwnerCash: boolean;
  canRecordPayments: boolean;
  canRetryCurrentRent: boolean;
  leases: FinanceLease[];
  openDrawer: (drawer: DrawerState) => void;
  openModal: (modal: ModalState) => void;
  ownerInvoices: OwnerInvoiceSummary[];
  rentGenerationExceptions: RentGenerationException[];
  tenantInvoices: TenantInvoiceSummary[];
}) {
  const [workFilter, setWorkFilter] = useState<
    "all" | "setup" | "tenant" | "owner"
  >("all");
  const leasesNeedingSetup = leases.filter(
    (lease) =>
      (lease.status === "active" || lease.status === "notice_given") &&
      !lease.billing,
  );
  const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
  const tenantDue = tenantInvoices.filter((invoice) => invoice.balanceDue > 0);
  const ownerDue = ownerInvoices.filter((invoice) => invoice.balanceDue > 0);
  const paymentWork = [
    ...tenantDue.map((invoice) => ({ invoice, kind: "tenant" as const })),
    ...ownerDue.map((invoice) => ({ invoice, kind: "owner" as const })),
  ].sort((left, right) =>
    left.invoice.dueDate.localeCompare(right.invoice.dueDate),
  );
  const workCount =
    leasesNeedingSetup.length +
    rentGenerationExceptions.length +
    tenantDue.length +
    ownerDue.length;
  const visibleLeases =
    workFilter === "all" || workFilter === "setup" ? leasesNeedingSetup : [];
  const visibleExceptions =
    workFilter === "all" || workFilter === "setup"
      ? rentGenerationExceptions
      : [];
  const visiblePaymentWork = paymentWork.filter(
    (item) =>
      workFilter === "all" ||
      (workFilter === "tenant" && item.kind === "tenant") ||
      (workFilter === "owner" && item.kind === "owner"),
  );
  const visibleWorkCount =
    visibleLeases.length + visibleExceptions.length + visiblePaymentWork.length;

  return (
    <div className="workspace-gutter-x mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-4 py-4 sm:px-6 2xl:px-8">
      <CompactTotals
        items={[
          { label: "Open work", value: workCount },
          { label: "Tenant payments", value: tenantDue.length },
          { label: "Owner invoice payments", value: ownerDue.length },
        ]}
      />
      <section
        className="min-h-0 flex-1 border-t border-border"
        data-slot="finance-work-surface"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border py-2">
          <h2 className="text-sm font-semibold">Finance work</h2>
          <SelectControl
            ariaLabel="Filter work queue"
            className="h-8 w-44"
            onValueChange={(value) =>
              setWorkFilter(value as "all" | "setup" | "tenant" | "owner")
            }
            options={[
              { label: "All work", value: "all" },
              { label: "Setup & exceptions", value: "setup" },
              { label: "Tenant payments", value: "tenant" },
              { label: "Owner invoice payments", value: "owner" },
            ]}
            value={workFilter}
          />
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
          <TableFrame className="p-0">
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
                {visibleLeases.map((lease) => (
                  <tr
                    className="border-b border-border"
                    key={`setup-${lease.id}`}
                  >
                    <Td>
                      <p className="font-medium">Set up lease billing</p>
                      <p className="text-xs text-muted-foreground">
                        {lease.tenantLabel} · {lease.unitLabel}
                      </p>
                    </Td>
                    <Td>{lease.propertyLabel}</Td>
                    <Td>—</Td>
                    <Td>Before invoicing</Td>
                    <Td align="right">
                      {canConfigureRent ? (
                        <Button
                          onClick={() => openDrawer({ lease, mode: "billing" })}
                        >
                          Set up
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Super Admin setup
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
                {visibleExceptions.map((exception) => (
                  <RentGenerationExceptionRow
                    canRecover={canRetryCurrentRent}
                    exception={exception}
                    key={`rent-exception-${exception.id}`}
                    lease={leaseById.get(exception.leaseId) ?? null}
                  />
                ))}
                {visiblePaymentWork.map(({ invoice, kind }) =>
                  kind === "tenant" ? (
                    <tr
                      className="border-b border-border"
                      key={`tenant-${invoice.id}`}
                    >
                      <Td>
                        <p className="font-medium">
                          {invoice.collectionRoute === "through_ips"
                            ? "Tenant payment"
                            : "Confirm owner collection"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {invoice.recipientLabel} · {invoice.invoiceNumber}
                        </p>
                      </Td>
                      <Td>{invoice.propertyLabel}</Td>
                      <Td>
                        <Money amount={invoice.balanceDue} />
                      </Td>
                      <Td>{formatDate(invoice.dueDate)}</Td>
                      <Td align="right">
                        {canRecordPayments ? (
                          <Button
                            onClick={() =>
                              openModal({ invoice, mode: "payment" })
                            }
                          >
                            {invoice.collectionRoute === "through_ips"
                              ? "Record"
                              : "Confirm"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Read only
                          </span>
                        )}
                      </Td>
                    </tr>
                  ) : (
                    <tr
                      className="border-b border-border"
                      key={`owner-${invoice.id}`}
                    >
                      <Td>
                        <p className="font-medium">Owner invoice payment</p>
                        <p className="text-xs text-muted-foreground">
                          {invoice.ownerLabel} · {invoice.invoiceNumber}
                        </p>
                      </Td>
                      <Td>{invoice.propertyLabel}</Td>
                      <Td>
                        <Money amount={invoice.balanceDue} />
                      </Td>
                      <Td>{formatDate(invoice.dueDate)}</Td>
                      <Td align="right">
                        {canRecordOwnerCash ? (
                          <Button
                            onClick={() =>
                              openModal({ invoice, mode: "owner-payment" })
                            }
                          >
                            Record
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Read only
                          </span>
                        )}
                      </Td>
                    </tr>
                  ),
                )}
              </tbody>
            </Table>
          </TableFrame>
        )}
      </section>
    </div>
  );
}

function RentGenerationExceptionRow({
  canRecover,
  exception,
  lease,
}: {
  canRecover: boolean;
  exception: RentGenerationException;
  lease: FinanceLease | null;
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
}: {
  exceptionId: string;
  monthLabel: string;
}) {
  const [state, action, pending] = useActionState(
    recoverRentGenerationExceptionAction,
    actionInitialState,
  );

  return (
    <form action={action} className="space-y-1">
      <input name="exceptionId" type="hidden" value={exceptionId} />
      <Button
        aria-label={`Retry rent for ${monthLabel}`}
        disabled={pending}
        type="submit"
      >
        {pending ? "Retrying..." : "Retry"}
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
}: {
  invoices: TenantInvoiceSummary[];
  openModal: (modal: ModalState) => void;
  organizationName: string;
}) {
  const unpaid = invoices.reduce((sum, invoice) => sum + invoice.balanceDue, 0);
  const collected = invoices.reduce(
    (sum, invoice) => sum + invoice.paidThroughIps + invoice.collectedByOwner,
    0,
  );
  return (
    <div className="workspace-gutter-x mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-4 py-4 sm:px-6 2xl:px-8">
      <CompactTotals
        items={[
          { label: "Collected", value: <Money amount={collected} /> },
          { label: "Outstanding", value: <Money amount={unpaid} /> },
          { label: "Invoices", value: invoices.length },
        ]}
      />
      <section className="min-h-0 flex-1" data-slot="rent-invoices-surface">
        {invoices.length === 0 ? (
          <EmptyState
            body="Rent charges are generated automatically from each active Lease."
            className="flex-1 rounded-xl border border-border/80 bg-card shadow-sm"
            kind="empty"
            title="No rent invoices"
          />
        ) : (
          <TableFrame className="p-0">
            <Table className="table-fixed min-w-[720px]">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[34%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[6%]" />
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
                {invoices.map((invoice) => (
                  <tr className="border-b border-border" key={invoice.id}>
                    <Td>
                      <p className="font-medium">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {formatDate(invoice.dueDate)}
                      </p>
                    </Td>
                    <Td>
                      <p className="font-medium">{invoice.recipientLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.propertyLabel}
                      </p>
                    </Td>
                    <Td>
                      {invoice.collectionRoute === "through_ips" ? (
                        <span
                          aria-label={organizationName}
                          title={organizationName}
                        >
                          {getOrganizationShortLabel(organizationName)}
                        </span>
                      ) : (
                        "Owner"
                      )}
                    </Td>
                    <Td>
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
                    <Td>
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
                {expenseStatusLabel(value)} (
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
                  {categoryLabel(submission.category)}
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
                    : "Tenant or company"}
                </p>
              </Td>
              <Td>
                <Money amount={submission.internalCost} />
              </Td>
              <Td>
                <div className="flex flex-col items-start gap-2">
                  <Badge tone={expenseStatusTone(submission.status)}>
                    {expenseStatusLabel(submission.status)}
                  </Badge>
                  <Button
                    aria-label={`${submission.status === "submitted" && canReview ? "Review" : "View"} ${submission.vendorLabel}`}
                    onClick={() =>
                      openModal({ mode: "expense-details", submission })
                    }
                    size="sm"
                    variant="outline"
                  >
                    {submission.status === "submitted" && canReview
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
  onClose,
  onCorrect,
  onRecordPayment,
  organizationName,
}: {
  canCorrectFinance: boolean;
  canRecordPayments: boolean;
  invoice: TenantInvoiceSummary;
  onClose: () => void;
  onCorrect: () => void;
  onRecordPayment: () => void;
  organizationName: string;
}) {
  const canCorrect =
    canCorrectFinance &&
    invoice.settlements.some((settlement) => !settlement.isReversed);

  return (
    <div className="space-y-4 p-4">
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
            "Invoice total",
            <Money amount={invoice.totalAmount} key="invoice-total" />,
          ],
          ["Balance", <Money amount={invoice.balanceDue} key="balance" />],
        ]}
      />
      {invoice.isProrated ? <Badge tone="accent">Prorated</Badge> : null}
      <FormFooter>
        <Button onClick={onClose} variant="outline">
          Close
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <Link href={`/properties/${invoice.propertyId}/finance?view=rent`}>
              Open Property finance
            </Link>
          </Button>
          {invoice.unitId ? (
            <Button asChild variant="outline">
              <Link href={`/units/${invoice.unitId}/finance?view=rent`}>
                Open Unit finance
              </Link>
            </Button>
          ) : null}
          {canCorrect ? (
            <Button onClick={onCorrect} variant="outline">
              Correct settlement
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
  );
}

function ExpenseDetails({
  canReview,
  canReverse,
  onApprove,
  onClose,
  onReject,
  onReverse,
  submission,
}: {
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
          <p className="font-semibold">{categoryLabel(submission.category)}</p>
          <p className="text-sm text-muted-foreground">
            {submission.vendorLabel} · {submission.propertyLabel}
          </p>
        </div>
        <Badge tone={expenseStatusTone(submission.status)}>
          {expenseStatusLabel(submission.status)}
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
              : "Tenant or company",
          ],
          ["Paid from", submission.fundingSourceLabel],
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
      <FormFooter>
        <Button onClick={onClose} variant="outline">
          Close
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          {submission.status === "submitted" && canReview ? (
            <>
              <Button
                aria-label={`Reject ${submission.vendorLabel}`}
                onClick={onReject}
                variant="outline"
              >
                Reject
              </Button>
              <Button
                aria-label={`Approve ${submission.vendorLabel}`}
                onClick={onApprove}
              >
                Approve
              </Button>
            </>
          ) : submission.status === "approved" && canReverse ? (
            <Button
              aria-label={`Reverse ${submission.vendorLabel}`}
              onClick={onReverse}
              variant="outline"
            >
              Reverse
            </Button>
          ) : null}
        </div>
      </FormFooter>
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
  organizationName,
  peopleOptions,
}: {
  lease: FinanceLease;
  onSuccess: (message: string) => void;
  organizationName: string;
  peopleOptions: FinanceOperationsData["peopleOptions"];
}) {
  const idempotencyKey = useStableActionId("billing");
  const [state, action] = useActionState(
    saveLeaseBillingAction,
    actionInitialState,
  );
  const [recipientKind, setRecipientKind] = useState<
    "" | "company" | "individual"
  >(
    lease.billing?.billingRecipientKind ??
      (lease.tenantPersonId ? "individual" : ""),
  );
  const [recipientId, setRecipientId] = useState(
    lease.billing?.billingRecipientPersonId ?? lease.tenantPersonId ?? "",
  );
  const [effectiveFrom, setEffectiveFrom] = useState(
    lease.billing?.effectiveFrom ?? lease.startDate,
  );
  const [firstProrata, setFirstProrata] = useState(
    lease.billing?.firstPeriodProratedAmount?.toString() ?? "",
  );
  const [finalProrata, setFinalProrata] = useState(
    lease.billing?.finalPeriodProratedAmount?.toString() ?? "",
  );
  const [route, setRoute] = useState<"" | "direct_to_owner" | "through_ips">(
    lease.billing?.collectionRoute ?? "through_ips",
  );
  const [feeMode, setFeeMode] = useState<"" | "flat" | "percentage">(
    lease.billing?.managementFeeMode ?? "percentage",
  );
  const [feeValue, setFeeValue] = useState(
    lease.billing?.managementFeeValue?.toString() ?? "0",
  );
  const [chargeFee, setChargeFee] = useState<"" | "no" | "yes">(
    lease.billing
      ? lease.billing.chargeManagementFeeWhenActive
        ? "yes"
        : "no"
      : "no",
  );
  const [fullFeeDuringProration, setFullFeeDuringProration] = useState<
    "" | "no" | "yes"
  >(
    lease.billing
      ? lease.billing.fullManagementFeeDuringProration
        ? "yes"
        : "no"
      : "no",
  );
  const recipientOptions =
    recipientKind === "individual" && lease.tenantPersonId
      ? [{ id: lease.tenantPersonId, label: lease.tenantLabel }]
      : peopleOptions;
  useSuccess(state, onSuccess);
  return (
    <form action={action} className="space-y-4 p-4">
      <input name="leaseId" type="hidden" value={lease.id} />
      <input name="effectiveFrom" type="hidden" value={effectiveFrom} />
      <input name="billingRecipientKind" type="hidden" value={recipientKind} />
      <input
        name="billingRecipientPersonId"
        type="hidden"
        value={recipientId}
      />
      <input
        name="firstPeriodProratedAmount"
        type="hidden"
        value={firstProrata}
      />
      <input
        name="finalPeriodProratedAmount"
        type="hidden"
        value={finalProrata}
      />
      <input name="collectionRoute" type="hidden" value={route} />
      <input name="managementFeeMode" type="hidden" value={feeMode} />
      <input name="managementFeeValue" type="hidden" value={feeValue} />
      <input
        name="chargeManagementFeeWhenActive"
        type="hidden"
        value={chargeFee}
      />
      <input
        name="fullManagementFeeDuringProration"
        type="hidden"
        value={fullFeeDuringProration}
      />
      <input
        name="supersedesBillingTermId"
        type="hidden"
        value={lease.billing?.id ?? ""}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bill to">
          <SelectControl
            onValueChange={(value) => {
              const nextKind = value as "company" | "individual";
              setRecipientKind(nextKind);
              setRecipientId(
                nextKind === "individual" ? (lease.tenantPersonId ?? "") : "",
              );
            }}
            options={[
              { label: "Individual tenant", value: "individual" },
              { label: "Company", value: "company" },
            ]}
            value={recipientKind}
          />
        </Field>
        <Field label={recipientKind === "company" ? "Company" : "Recipient"}>
          <SelectControl
            onValueChange={setRecipientId}
            options={recipientOptions.map((option) => ({
              label: option.label,
              value: option.id,
            }))}
            placeholder="Choose a recipient"
            value={recipientId}
          />
        </Field>
        <Field label="Billing effective date">
          <Input
            aria-label="Billing effective date"
            onChange={(event) => setEffectiveFrom(event.target.value)}
            required
            type="date"
            value={effectiveFrom}
          />
        </Field>
        <Field label="Who collects rent?">
          <SelectControl
            onValueChange={(value) => setRoute(value as typeof route)}
            options={[
              {
                label: `Collected by ${organizationName}`,
                value: "through_ips",
              },
              { label: "Collected by owner", value: "direct_to_owner" },
            ]}
            value={route}
          />
        </Field>
      </div>

      <details className="border-y border-border py-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Proration and fee options
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Management fee">
            <SelectControl
              onValueChange={(value) => setFeeMode(value as typeof feeMode)}
              options={[
                { label: "Percentage", value: "percentage" },
                { label: "Flat amount", value: "flat" },
              ]}
              value={feeMode}
            />
          </Field>
          <Field
            label={feeMode === "percentage" ? "Fee percentage" : "Fee amount"}
          >
            <NumberInput
              onChange={(event) => setFeeValue(event.target.value)}
              required
              value={feeValue}
            />
          </Field>
          <Field label="First month amount (optional)">
            <NumberInput
              onChange={(event) => setFirstProrata(event.target.value)}
              placeholder="Use full rent"
              value={firstProrata}
            />
          </Field>
          <Field label="Final month amount (optional)">
            <NumberInput
              onChange={(event) => setFinalProrata(event.target.value)}
              placeholder="Use full rent"
              value={finalProrata}
            />
          </Field>
          <Field label="Charge fee while lease is active?">
            <SelectControl
              onValueChange={(value) => setChargeFee(value as typeof chargeFee)}
              options={[
                { label: "Yes", value: "yes" },
                { label: "No", value: "no" },
              ]}
              value={chargeFee}
            />
          </Field>
          <Field label="Keep full fee in pro-rata months?">
            <SelectControl
              onValueChange={(value) =>
                setFullFeeDuringProration(
                  value as typeof fullFeeDuringProration,
                )
              }
              options={[
                { label: "Yes", value: "yes" },
                { label: "No", value: "no" },
              ]}
              value={fullFeeDuringProration}
            />
          </Field>
        </div>
      </details>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={
            !recipientKind ||
            !recipientId ||
            !effectiveFrom ||
            !route ||
            !feeMode ||
            feeValue === "" ||
            !chargeFee ||
            !fullFeeDuringProration
          }
          label="Activate billing"
        />
      </FormFooter>
    </form>
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

function SettleInvoiceForm({
  invoice,
  onChooseAnother,
  onSuccess,
  reconciliationSources,
}: {
  invoice: TenantInvoiceSummary;
  onChooseAnother?: () => void;
  onSuccess: (message: string) => void;
  reconciliationSources: FinanceOperationsData["reconciliationSources"];
}) {
  const idempotencyKey = useStableActionId(
    invoice.collectionRoute === "through_ips" ? "payment" : "owner-confirm",
  );
  const action =
    invoice.collectionRoute === "through_ips"
      ? recordTenantInvoicePaymentAction
      : confirmOwnerCollectionAction;
  const [state, formAction] = useActionState(action, actionInitialState);
  const sources = reconciliationSources.filter(
    (source) => !source.propertyId || source.propertyId === invoice.propertyId,
  );
  useSuccess(state, onSuccess);
  return (
    <form action={formAction} className="space-y-4 p-4">
      <DefinitionRows
        rows={[
          ["Invoice", invoice.invoiceNumber],
          ["Customer", invoice.recipientLabel],
          ["Balance", formatMoneyDisplay(invoice.balanceDue).primary],
        ]}
      />
      <input name="invoiceId" type="hidden" value={invoice.id} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <NumberInput
            defaultValue={invoice.balanceDue}
            name="amount"
            required
          />
        </Field>
        <Field
          label={
            invoice.collectionRoute === "through_ips"
              ? "Received date"
              : "Confirmed date"
          }
        >
          <DatePickerField
            defaultValue={getBusinessDateValue()}
            name="settlementDate"
            required
          />
        </Field>
        {invoice.collectionRoute === "through_ips" ? (
          <Field label="Received in">
            <SelectControl
              name="reconciliationSourceId"
              options={sources.map((source) => ({
                label: source.label,
                value: source.id,
              }))}
              required
            />
          </Field>
        ) : null}
        <Field label="Reference">
          <Input name="reference" placeholder="Optional" />
        </Field>
      </div>
      {invoice.lines.length > 1 ? (
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            Change how payment is applied
          </summary>
          <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
            {invoice.lines
              .filter((line) => line.balanceDue > 0)
              .map((line) => (
                <Field
                  key={line.id}
                  label={`${line.label} · ${formatMoneyDisplay(line.balanceDue).primary}`}
                >
                  <NumberInput
                    name={`allocation:${line.id}`}
                    placeholder="Leave blank for Rent first"
                  />
                </Field>
              ))}
          </div>
        </details>
      ) : null}
      {invoice.collectionRoute === "direct_to_owner" ? (
        <p className="text-xs text-muted-foreground">
          This marks the invoice “Collected by owner” and does not add cash to
          the property account.
        </p>
      ) : null}
      <ActionMessage state={state} />
      <FormFooter>
        {onChooseAnother ? (
          <Button onClick={onChooseAnother}>Choose another</Button>
        ) : (
          <span />
        )}
        <SubmitButton
          label={
            invoice.collectionRoute === "through_ips"
              ? "Record payment"
              : "Confirm collected"
          }
        />
      </FormFooter>
    </form>
  );
}

function ExpenseForm({
  fixedScope,
  initialInvoiceId,
  initialResponsibility,
  invoices,
  onClose,
  onSuccess,
  propertyOptions,
  reconciliationSources,
  unitOptions,
}: {
  fixedScope?: FinanceOperationsScreenProps["scope"];
  initialInvoiceId?: string;
  initialResponsibility?: "owner" | "tenant";
  invoices: TenantInvoiceSummary[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  propertyOptions: FinanceOperationsData["propertyOptions"];
  reconciliationSources: FinanceOperationsData["reconciliationSources"];
  unitOptions: FinanceOperationsData["unitOptions"];
}) {
  const idempotencyKey = useStableActionId("expense");
  const initialInvoice = invoices.find(
    (invoice) => invoice.id === initialInvoiceId,
  );
  const [state, action, pending] = useActionState(
    submitExpenseAction,
    actionInitialState,
  );
  const [propertyId, setPropertyId] = useState(
    fixedScope?.propertyId ??
      initialInvoice?.propertyId ??
      propertyOptions[0]?.id ??
      "",
  );
  const [unitId, setUnitId] = useState(
    fixedScope?.kind === "unit"
      ? fixedScope.id
      : (initialInvoice?.unitId ?? ""),
  );
  const [category, setCategory] = useState("cleaning");
  const [vendor, setVendor] = useState("");
  const [cost, setCost] = useState("");
  const [markup, setMarkup] = useState("0");
  const [expenseDate, setExpenseDate] = useState(getBusinessDateValue());
  const [reference, setReference] = useState("");
  const [reconciliationSourceId, setReconciliationSourceId] = useState(
    reconciliationSources.find(
      (source) =>
        source.propertyId == null ||
        source.propertyId === initialInvoice?.propertyId,
    )?.id ?? "",
  );
  const [responsibility, setResponsibility] = useState<"owner" | "tenant">(
    initialResponsibility ?? "owner",
  );
  const [tenantInvoiceId, setTenantInvoiceId] = useState(
    initialInvoiceId ?? "",
  );
  const effectiveResponsibility =
    responsibility === "tenant" ? "tenant" : "owner";
  const matchingInvoices = invoices.filter(
    (invoice) =>
      invoice.propertyId === propertyId &&
      invoice.balanceDue > 0 &&
      (!unitId || invoice.unitId === unitId),
  );
  const matchingSources = reconciliationSources.filter(
    (source) => source.propertyId == null || source.propertyId === propertyId,
  );
  const effectiveMarkup = effectiveResponsibility === "tenant" ? markup : "0";
  const invoiceTotal = Number(cost || 0) + Number(effectiveMarkup || 0);
  useSuccess(state, onSuccess);
  return (
    <RecordForm
      action={action}
      allowSaveWhenClean={false}
      ariaLabel="Record expense form"
      onCancel={onClose}
      pending={pending}
      saveLabel="Submit for review"
      savingLabel="Submitting expense"
      state={state}
    >
      <input name="propertyId" type="hidden" value={propertyId} />
      <input name="unitId" type="hidden" value={unitId} />
      <input name="category" type="hidden" value={category} />
      <input name="vendorLabel" type="hidden" value={vendor} />
      <input name="internalCost" type="hidden" value={cost} />
      <input name="internalMarkup" type="hidden" value={effectiveMarkup} />
      <input name="expenseDate" type="hidden" value={expenseDate} />
      <input name="reference" type="hidden" value={reference} />
      <input
        name="reconciliationSourceId"
        type="hidden"
        value={reconciliationSourceId}
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
        className="rounded-xl border border-border/80 bg-card p-4 shadow-sm last:border-b last:pb-4"
        indentContent={false}
        step="01"
        title="Cost record"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property">
            {fixedScope ? (
              <div className="flex min-h-8 items-center border-b border-border px-1 text-sm font-medium">
                {fixedScope.propertyLabel}
              </div>
            ) : (
              <SelectControl
                onValueChange={(value) => {
                  setPropertyId(value);
                  setUnitId("");
                  setTenantInvoiceId("");
                  setReconciliationSourceId(
                    reconciliationSources.find(
                      (source) =>
                        source.propertyId == null ||
                        source.propertyId === value,
                    )?.id ?? "",
                  );
                }}
                options={propertyOptions.map((option) => ({
                  label: option.label,
                  value: option.id,
                }))}
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
          <Field label="Paid-cost category">
            <SelectControl
              ariaLabel="Paid-cost category"
              onValueChange={setCategory}
              options={[
                { label: "Cleaning", value: "cleaning" },
                { label: "Utility", value: "utility" },
                {
                  label: "Repairs and maintenance",
                  value: "repairs_maintenance",
                },
                { label: "Other", value: "other" },
              ]}
              value={category}
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
        className="rounded-xl border border-border/80 bg-card p-4 shadow-sm last:border-b last:pb-4"
        indentContent={false}
        step="02"
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
        </div>
      </FormSection>

      <FormSection
        className="rounded-xl border border-border/80 bg-card p-4 shadow-sm last:border-b last:pb-4"
        indentContent={false}
        step="03"
        title="Responsibility"
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Charge this to</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              aria-pressed={effectiveResponsibility === "owner"}
              className={cn(
                "h-auto justify-start px-3 py-3 text-left",
                effectiveResponsibility === "owner"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => setResponsibility("owner")}
              type="button"
              variant="outline"
            >
              Property owner
            </Button>
            <Button
              aria-pressed={effectiveResponsibility === "tenant"}
              className={cn(
                "h-auto justify-start px-3 py-3 text-left",
                effectiveResponsibility === "tenant"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => setResponsibility("tenant")}
              type="button"
              variant="outline"
            >
              Tenant or company
            </Button>
          </div>
        </fieldset>

        {effectiveResponsibility === "tenant" ? (
          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <Field label="Invoice">
              <SelectControl
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
                  matchingInvoices.length > 0
                    ? "Choose invoice"
                    : "No open invoice"
                }
                value={tenantInvoiceId}
              />
            </Field>
            <Field label="Service fee">
              <NumberInput
                onChange={(event) => setMarkup(event.target.value)}
                required
                value={markup}
              />
            </Field>
            <div className="flex items-center justify-between gap-4 border-t border-border pt-3 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Invoice line</span>
              <span className="font-semibold">
                {categoryLabel(category)} ·{" "}
                {formatMoneyDisplay(invoiceTotal).primary}
              </span>
            </div>
          </div>
        ) : null}
      </FormSection>

      <FormSection
        className="rounded-xl border border-border/80 bg-card p-4 shadow-sm last:border-b last:pb-4"
        indentContent={false}
        step="04"
        title="Receipt and reconciliation"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paid from">
            <SelectControl
              ariaLabel="Paid from"
              onValueChange={setReconciliationSourceId}
              options={matchingSources.map((source) => ({
                label: source.label,
                value: source.id,
              }))}
              placeholder={
                matchingSources.length > 0
                  ? "Choose funding source"
                  : "No funding source"
              }
              value={reconciliationSourceId}
            />
          </Field>
          <Field label="Receipt or payment reference">
            <Input
              onChange={(event) => setReference(event.target.value)}
              placeholder="Receipt number or transfer note"
              required
              value={reference}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Receipt evidence">
              <Input
                accept="application/pdf,image/jpeg,image/png,image/webp"
                name="evidenceFile"
                required
                type="file"
              />
            </Field>
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
  reconciliationSources,
  submission,
}: {
  decision: "approve" | "reject";
  onSuccess: (message: string) => void;
  reconciliationSources: FinanceOperationsData["reconciliationSources"];
  submission: ExpenseSubmissionSummary;
}) {
  const idempotencyKey = useStableActionId(`expense-${decision}`);
  const [state, action] = useActionState(
    reviewExpenseAction,
    actionInitialState,
  );
  const [reason, setReason] = useState("");
  const [reconciliationSourceId, setReconciliationSourceId] = useState("");
  const needsFundingSource =
    decision === "approve" && submission.sourceType === "maintenance_task";
  const matchingSources = reconciliationSources.filter(
    (source) =>
      source.propertyId === null ||
      source.propertyId === undefined ||
      source.propertyId === submission.propertyId,
  );
  useSuccess(state, onSuccess);

  return (
    <form action={action} className="space-y-4 p-4">
      <input name="decision" type="hidden" value={decision} />
      <input name="submissionId" type="hidden" value={submission.id} />
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
          ["Paid from", submission.fundingSourceLabel],
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
            name="reconciliationSourceId"
            onValueChange={setReconciliationSourceId}
            options={matchingSources.map((source) => ({
              label: source.label,
              value: source.id,
            }))}
            placeholder="Choose the account used"
            required
            value={reconciliationSourceId}
          />
        </Field>
      ) : (
        <input name="reconciliationSourceId" type="hidden" value="" />
      )}
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
          Approval records the paid cost, customer responsibility, and property
          balance effect together.
        </p>
      ) : null}
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={
            (decision === "reject" && reason.trim().length < 3) ||
            (needsFundingSource && !reconciliationSourceId)
          }
          label={
            decision === "approve" ? "Approve paid cost" : "Reject paid cost"
          }
        />
      </FormFooter>
    </form>
  );
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
      <input name="submissionId" type="hidden" value={submission.id} />
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
            "Available",
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
            required
          />
        </Field>
        <Field label="Date">
          <DatePickerField
            defaultValue={getBusinessDateValue()}
            name="withdrawalDate"
            required
          />
        </Field>
        <Field label="Reference">
          <Input
            name="reference"
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
  fixedLease,
  invoices,
  leases,
  onSuccess,
  scope,
}: {
  fixedLease?: FinanceLease;
  invoices: TenantInvoiceSummary[];
  leases: FinanceLease[];
  onSuccess: (message: string) => void;
  scope?: FinanceOperationsScreenProps["scope"];
}) {
  const availableLeases = leases.filter(
    (lease) => lease.status === "active" || lease.status === "notice_given",
  );
  const [chargeType, setChargeType] = useState("utilities");
  const submittedChargeTypeRef = useRef("utilities");
  const [leaseId, setLeaseId] = useState(fixedLease?.id ?? "");
  const [billingPeriod, setBillingPeriod] = useState(getBusinessMonthValue());
  const idempotencyKey = useStableActionId("manual-tenant-charge");
  const [state, action] = useActionState(
    createManualTenantChargeAction,
    actionInitialState,
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
        setChargeType(submittedChargeTypeRef.current);
      }}
      onSubmit={() => {
        submittedChargeTypeRef.current = chargeType;
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
            onValueChange={setLeaseId}
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
        <Field label="Charge type">
          <SelectControl
            ariaLabel="Charge type"
            name="chargeType"
            onValueChange={setChargeType}
            options={[
              { label: "Manual rent", value: "manual_rent" },
              { label: "Utilities", value: "utilities" },
              { label: "Cleaning", value: "cleaning" },
              {
                label: "Repairs and maintenance",
                value: "repairs_maintenance",
              },
              { label: "Other", value: "other" },
            ]}
            value={chargeType}
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

      <Field
        label={
          chargeType === "other" ? "Description" : "Description (optional)"
        }
      >
        <Input
          aria-label="Description"
          name="description"
          placeholder={
            chargeType === "other"
              ? "What is this charge for?"
              : "Optional note"
          }
          required={chargeType === "other"}
        />
      </Field>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton label="Add tenant charge" />
      </FormFooter>
    </form>
  );
}

function getModalTitle(modal: ModalState) {
  if (modal.mode === "manual-charge") return "Add tenant charge";
  if (modal.mode === "rent-recovery") return "Recover missed rent";
  if (modal.mode === "invoice-details") return "Invoice details";
  if (modal.mode === "expense-details") return "Paid cost details";
  if (modal.mode === "owner-balance-details") return "Owner balance details";
  if (modal.mode === "payment")
    return !modal.invoice || modal.invoice.collectionRoute === "through_ips"
      ? "Record payment"
      : "Confirm owner collection";
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
  if (modal.mode === "manual-charge") return capabilities.canConfigureRent;
  if (modal.mode === "payment") return capabilities.canRecordPayments;
  if (modal.mode === "settlement-reversal") {
    return capabilities.canCorrectFinance;
  }
  if (modal.mode === "owner-payment" || modal.mode === "withdrawal") {
    return capabilities.canRecordOwnerCash;
  }

  if (modal.mode === "expense-review") {
    return capabilities.canReviewExpense;
  }

  return capabilities.canReverseExpense;
}

function getDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "billing") return "Set up lease billing";
  return "Record expense";
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
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-label="Finance records"
      className={cn(
        "flex-1 overflow-x-auto rounded-xl border border-border/80 bg-card p-3 shadow-sm",
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
